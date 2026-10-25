// -----------------------------------------------------------------------------
// The hub: reads PeerTube on a timer of the container (the interval chosen in
// the configuration), publishes the states of the devices when they change,
// fires the scene events, and answers the scene action, the widget and "Test
// the connection".
//
// Each reading: the counters of the instance (/server/stats, its name and
// version once), then per channel its latest videos and its lives on air (two
// requests), its page (followers) every 15 minutes; with an account, the
// unread notifications, and the followers of its channels every 15 minutes.
// A 429 of the instance stops the reading: the next one starts again.
//
// Gladys never polls these devices (should_poll: false): the scene events
// must fire even when the devices were not added, and a device created
// without should_poll is never polled by Gladys 5.2 anyway.
//
// Scene events:
//   - new_video: a video never seen before is among the latest ones of a
//     channel, and it is newer than the oldest of the previous reading (an
//     older video that surfaces because a newer one was deleted is no news);
//   - live_started: a live of the channel is on air and was not before;
//   - live_ended: a live on air at the previous reading is not any more.
// What was seen is kept under /data, so a restart announces nothing twice; the
// first reading of a channel (or of a new instance) announces nothing.
// No webhook: the sandbox has no inbound port.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { isLocalHost } from './config.js';
import { ERROR_KINDS, PeertubeClient, VIDEOS_PER_READ } from './peertube/client.js';
import {
  DEVICE_TYPES,
  FEATURE_KEYS,
  buildAccount,
  buildChannel,
  buildInstance,
  deviceIds,
  featureValues,
} from './devices.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  REPORT_TEXT,
  SUMMARY_TEXT,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'peertube-hub' });

export const WIDGET_KEY = 'latest_videos';

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  NEW_VIDEO: 'new_video',
  LIVE_STARTED: 'live_started',
  LIVE_ENDED: 'live_ended',
});

export const HUB_TIMINGS = {
  // The page of a channel (followers) and the account are read this often.
  detailMs: 15 * 60_000,
  // After a refused login, the next try waits this long (login rate limit).
  loginRetryMs: 30 * 60_000,
  // At most this many new videos announced per channel and per reading.
  maxEventsPerRead: 5,
  // Republish an unchanged value this often (Gladys flags a value older than 48 h).
  heartbeatMs: 12 * 60 * 60_000,
};

// Videos remembered per channel (uuids already seen), and kept for the widget.
const KNOWN_PER_CHANNEL = 100;
const RECENT_PER_CHANNEL = 6;
export const RECENT_SIZE = 12;

const DATE_LOCALES = { en: 'en-GB', fr: 'fr-FR', de: 'de-DE', es: 'es-ES' };

/** A date for a text feature, in the language and the TZ of Gladys. */
export function formatDate(iso, language) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) {
    return null;
  }
  return new Intl.DateTimeFormat(DATE_LOCALES[language] ?? 'en-GB', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
}

const time = (iso) => Date.parse(iso ?? '') || 0;
const strings = (list) => (Array.isArray(list) ? list.filter((id) => typeof id === 'string') : []);
const minutes = (ms) => Math.max(0, Math.round(ms / 60_000));

/** The video fields kept under /data (widget, last video, sentence). */
const keep = (video) => ({
  uuid: video.uuid,
  title: video.title,
  duration: video.duration,
  publishedAt: video.publishedAt,
  url: video.url,
  thumbnailPath: video.thumbnailPath,
});

export class CommandError extends Error {}

export class PeertubeHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/peertube/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.host = null;
    this.signature = null;
    this.instance = this.emptyInstance();
    this.error = null;
    /** Error kind per channel handle (not found, rate limited…). */
    this.channelErrors = new Map();
    this.account = this.emptyAccount();
    this.devicesKey = null;
    /** Last value published per feature external id: { value, at }. */
    this.published = new Map();
    /** Last transport published per device external id. */
    this.transports = new Map();
    this.connection = null;
    this.saved = this.emptySaved(null);
    this.pollTimer = null;
    this.polling = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  emptyInstance() {
    return { reachable: null, version: null, name: null, stats: null };
  }

  emptyAccount() {
    return { unread: null, followers: null, readAt: 0, error: null, retryAt: 0 };
  }

  emptySaved(url) {
    return { url, channels: {}, account: null };
  }

  // --- Logs ------------------------------------------------------------------

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    const channels = {};
    for (const [handle, entry] of Object.entries(saved.channels ?? {})) {
      if (!entry || typeof entry !== 'object') {
        continue;
      }
      const lives = {};
      for (const [uuid, live] of Object.entries(entry.lives ?? {})) {
        if (live && typeof live.title === 'string' && Number.isFinite(live.startedAt)) {
          lives[uuid] = {
            title: live.title,
            url: typeof live.url === 'string' ? live.url : '',
            startedAt: live.startedAt,
            viewers: Number.isInteger(live.viewers) ? live.viewers : 0,
            peak: Number.isInteger(live.peak) ? live.peak : 0,
          };
        }
      }
      const window = entry.window;
      channels[handle] = {
        id: typeof entry.id === 'string' ? entry.id : null,
        displayName: typeof entry.displayName === 'string' ? entry.displayName : handle,
        followers: Number.isInteger(entry.followers) ? entry.followers : null,
        followersAt: 0,
        total: Number.isInteger(entry.total) ? entry.total : null,
        known: strings(entry.known),
        window:
          window && typeof window.oldest === 'string' && typeof window.full === 'boolean'
            ? { oldest: window.oldest, full: window.full }
            : null,
        recent: Array.isArray(entry.recent)
          ? entry.recent
              .filter((video) => video && typeof video.uuid === 'string')
              .slice(0, RECENT_PER_CHANNEL)
          : [],
        lives,
      };
    }
    this.saved = {
      url: typeof saved.url === 'string' ? saved.url : null,
      channels,
      account:
        saved.account && typeof saved.account.handle === 'string'
          ? { handle: saved.account.handle }
          : null,
    };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transports.clear();
    this.connection = null;
    this.devicesKey = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    const signature = JSON.stringify([config.url, config.username, config.password]);
    if (signature !== this.signature) {
      this.signature = signature;
      this.client = config.url
        ? new PeertubeClient({
            url: config.url,
            username: config.username,
            password: config.password,
            request: this.request,
            now: this.now,
          })
        : null;
      this.host = config.url ? new URL(config.url).host.toLowerCase() : null;
      this.error = null;
      this.instance = this.emptyInstance();
      this.account = this.emptyAccount();
      if (config.url && this.saved.url !== config.url) {
        // Another instance: its videos are new, not news.
        this.saved = this.emptySaved(config.url);
      }
      if (!config.username) {
        this.saved.account = null;
      }
    }
    // Channels removed from the configuration are forgotten.
    for (const handle of Object.keys(this.saved.channels)) {
      if (!config.channels.includes(handle)) {
        delete this.saved.channels[handle];
        this.channelErrors.delete(handle);
      }
    }
    if (config.url) {
      this.store.save(this.saved);
    }
    this.devicesKey = null; // the language may have changed
    try {
      await this.refresh();
    } finally {
      this.schedulePoll();
    }
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    await this.store.flush();
  }

  schedulePoll() {
    clearTimeout(this.pollTimer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.pollTimer = setTimeout(async () => {
      try {
        await this.pollAll();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Poll failed', err, 'error');
      }
      this.schedulePoll();
    }, this.config.pollIntervalMs);
  }

  // --- Devices ---------------------------------------------------------------

  /** The channels resolved at least once, in the order of the configuration. */
  resolvedChannels() {
    return this.config.channels
      .map((handle) => ({ handle, entry: this.saved.channels[handle] }))
      .filter(({ entry }) => entry?.id);
  }

  instanceIds() {
    return deviceIds(this.gladys, DEVICE_TYPES.INSTANCE, this.host);
  }

  channelIds(entry) {
    return deviceIds(this.gladys, DEVICE_TYPES.CHANNEL, entry.id);
  }

  accountIds() {
    return deviceIds(this.gladys, DEVICE_TYPES.ACCOUNT, this.saved.account.handle);
  }

  devices() {
    if (!this.client) {
      return [];
    }
    const devices = [buildInstance(this.gladys, this.config, this.host, this.instance.name)];
    for (const { entry } of this.resolvedChannels()) {
      devices.push(buildChannel(this.gladys, this.config, entry.id, entry.displayName));
    }
    if (this.client.hasAccount && this.saved.account) {
      devices.push(buildAccount(this.gladys, this.config, this.saved.account.handle));
    }
    return devices;
  }

  /** Publish the devices when they changed (names, language, channels). */
  async publishDevices({ force = false } = {}) {
    const devices = this.devices();
    const key = JSON.stringify(devices);
    if (!force && key === this.devicesKey) {
      return;
    }
    try {
      // Even an empty list: the Discovery tab then shows no stale device.
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesKey = key;
      this.resolved('discovery');
    } catch (err) {
      this.problem('discovery', `Devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: read PeerTube, publish the devices again. */
  async rediscover() {
    await this.refresh();
    await this.publishDevices({ force: true });
  }

  /** The user added a device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (!this.client || !this.devices().some((own) => own.external_id === device.external_id)) {
      return;
    }
    await this.publishStates({ force: true });
    this.transports.delete(device.external_id);
    await this.publishTransports();
    this.gladys.requestWidgetRefresh(WIDGET_KEY);
  }

  // --- Reading PeerTube ------------------------------------------------------

  /** Read PeerTube and apply what changed. Concurrent calls share the read. */
  pollAll() {
    this.polling ??= this.readAll().finally(() => {
      this.polling = null;
    });
    return this.polling;
  }

  /** A reading that starts after this call (a scene action wants fresh figures). */
  async refresh() {
    if (this.polling) {
      await this.polling.catch(() => {});
    }
    return this.pollAll();
  }

  /** Gladys asks for a refresh (onPoll): read PeerTube now. */
  async pollDevice(device) {
    if (this.client && this.devices().some((own) => own.external_id === device.external_id)) {
      await this.pollAll();
    }
  }

  async readAll() {
    if (!this.client) {
      await this.publishDevices();
      await this.publishConnectionStatus();
      return;
    }
    const client = this.client;
    const before = this.widgetView();
    const events = [];
    try {
      await this.readInstance(client);
      if (client !== this.client) {
        return; // reconfigured meanwhile
      }
      await this.readChannels(client, events);
      if (client !== this.client) {
        return;
      }
      await this.readAccount(client);
    } catch (err) {
      if (!err.kind) {
        throw err;
      }
      if (client !== this.client) {
        return;
      }
      this.applyFailure(err);
    }
    // On disk before the events: a crash in between announces nothing twice.
    this.store.save(this.saved);
    await this.store.flush();
    if (client !== this.client) {
      return;
    }
    for (const [key, data] of events) {
      await this.fire(key, data);
    }
    await this.publishDevices();
    await this.publishStates();
    await this.publishTransports();
    await this.publishConnectionStatus();
    if (this.widgetView() !== before) {
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    }
  }

  async readInstance(client) {
    if (!this.instance.version) {
      const { version, name } = await client.config();
      this.instance.version = version;
      this.instance.name = name;
    }
    const stats = await client.stats();
    if (this.error) {
      logger.info(`PeerTube ${this.config.url}: connection restored`);
    } else if (this.instance.reachable === null) {
      logger.info(
        `PeerTube ${this.config.url}: connected, version ${this.instance.version}, ${this.config.channels.length} channel(s) followed`,
      );
    }
    this.error = null;
    this.instance = { ...this.instance, reachable: true, stats };
  }

  async readChannels(client, events) {
    for (const handle of this.config.channels) {
      try {
        await this.readChannel(client, handle, events);
        if (this.channelErrors.delete(handle)) {
          this.resolved(`channel:${handle}`, `PeerTube channel ${handle}: read again`);
        }
      } catch (err) {
        if (!err.kind || client !== this.client) {
          throw err;
        }
        if (
          [ERROR_KINDS.UNREACHABLE, ERROR_KINDS.TLS, ERROR_KINDS.RATE_LIMITED].includes(err.kind)
        ) {
          // The whole instance is concerned: stop this reading.
          throw err;
        }
        this.channelErrors.set(handle, err.kind);
        this.problem(`channel:${handle}`, `PeerTube channel ${handle}: ${err.message}`);
      }
    }
  }

  async readChannel(client, handle, events) {
    const now = this.now();
    let entry = this.saved.channels[handle];
    if (!entry?.id || now - entry.followersAt >= this.timings.detailMs) {
      const channel = await client.channel(handle);
      entry ??= {
        id: null,
        displayName: channel.displayName,
        followers: null,
        followersAt: 0,
        total: null,
        known: [],
        window: null,
        recent: [],
        lives: {},
      };
      entry.id = `${channel.name}@${channel.host}`.toLowerCase();
      entry.displayName = channel.displayName;
      entry.followers = channel.followers;
      entry.followersAt = now;
      this.saved.channels[handle] = entry;
    }
    const [{ total, videos }, { videos: lives }] = [
      await client.videos(handle),
      await client.videos(handle, { live: true }),
    ];
    if (client !== this.client) {
      return;
    }
    const firstRead = entry.window === null;
    const base = () => ({
      channel: this.channelIds(entry).device,
      channel_name: entry.displayName,
      handle: entry.id,
    });

    // New videos: unseen, and inside the window of the previous reading.
    if (!firstRead) {
      const known = new Set(entry.known);
      const oldest = time(entry.window.oldest);
      const fresh = videos
        .filter((video) => !known.has(video.uuid))
        .filter((video) => !entry.window.full || time(video.publishedAt) >= oldest)
        .slice(0, this.timings.maxEventsPerRead)
        .reverse(); // oldest first, the order they were published in
      for (const video of fresh) {
        logger.debug(`PeerTube: new video "${video.title}" (${entry.id})`);
        events.push([
          TRIGGERS.NEW_VIDEO,
          {
            ...base(),
            title: video.title,
            url: video.url,
            duration_minutes: minutes(video.duration * 1000),
            published_at: video.publishedAt,
          },
        ]);
      }
    }
    entry.known = [...new Set([...videos.map((video) => video.uuid), ...entry.known])].slice(
      0,
      KNOWN_PER_CHANNEL,
    );
    if (videos.length) {
      entry.window = {
        oldest: videos[videos.length - 1].publishedAt,
        full: videos.length >= VIDEOS_PER_READ,
      };
    } else {
      entry.window = { oldest: new Date(0).toISOString(), full: false };
    }
    entry.total = total;
    entry.recent = videos.slice(0, RECENT_PER_CHANNEL).map(keep);

    // Lives: started, still on air (viewers, peak), ended.
    const onAir = new Set();
    for (const live of lives) {
      onAir.add(live.uuid);
      const known = entry.lives[live.uuid];
      if (known) {
        known.title = live.title;
        known.viewers = live.viewers;
        known.peak = Math.max(known.peak, live.viewers);
        continue;
      }
      entry.lives[live.uuid] = {
        title: live.title,
        url: live.url,
        startedAt: now,
        viewers: live.viewers,
        peak: live.viewers,
      };
      if (!firstRead) {
        logger.debug(`PeerTube: live started "${live.title}" (${entry.id})`);
        events.push([TRIGGERS.LIVE_STARTED, { ...base(), title: live.title, url: live.url }]);
      }
    }
    for (const [uuid, live] of Object.entries(entry.lives)) {
      if (onAir.has(uuid)) {
        continue;
      }
      delete entry.lives[uuid];
      logger.debug(`PeerTube: live ended "${live.title}" (${entry.id})`);
      events.push([
        TRIGGERS.LIVE_ENDED,
        {
          ...base(),
          title: live.title,
          url: live.url,
          duration_minutes: minutes(now - live.startedAt),
          peak_viewers: live.peak,
        },
      ]);
    }
  }

  async readAccount(client) {
    if (!client.hasAccount) {
      return;
    }
    const now = this.now();
    if (this.account.error && now < this.account.retryAt) {
      return; // a refused login: no new try before retryAt
    }
    try {
      if (!this.saved.account || now - this.account.readAt >= this.timings.detailMs) {
        const me = await client.me();
        const handle = `${me.name}@${me.host || this.host}`.toLowerCase();
        this.saved.account = { handle };
        this.account.followers = me.followers;
        this.account.readAt = now;
      }
      this.account.unread = await client.unreadNotifications();
      if (this.account.error) {
        logger.info(`PeerTube account ${this.config.username}: connected again`);
      }
      this.account.error = null;
      this.resolved('account');
    } catch (err) {
      if (!err.kind || [ERROR_KINDS.UNREACHABLE, ERROR_KINDS.TLS].includes(err.kind)) {
        throw err;
      }
      const refused = [ERROR_KINDS.AUTH, ERROR_KINDS.TWO_FACTOR].includes(err.kind);
      this.account.error = err.kind;
      this.account.retryAt = refused ? now + this.timings.loginRetryMs : 0;
      this.problem('account', `PeerTube account ${this.config.username}: ${err.message}`);
    }
  }

  applyFailure(err) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    this.instance = { ...this.instance, reachable: false };
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`PeerTube ${this.config.url}: ${err.message}`);
    } else {
      logger.debug(`PeerTube ${this.config.url}: ${err.message} (again)`);
    }
  }

  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Figures ---------------------------------------------------------------

  /** The lives on air of the followed channels. */
  lives() {
    const lives = [];
    for (const { entry } of this.resolvedChannels()) {
      for (const [uuid, live] of Object.entries(entry.lives)) {
        lives.push({ uuid, channel: entry.displayName, ...live });
      }
    }
    return lives.sort((a, b) => a.startedAt - b.startedAt);
  }

  /** The external id of the channel device a live on air belongs to. */
  liveChannel(uuid) {
    const found = this.resolvedChannels().find(({ entry }) => entry.lives[uuid]);
    return found ? this.channelIds(found.entry).device : null;
  }

  /** The latest videos of the followed channels (all of them, or one), newest first. */
  recent(channelExternalId = null) {
    const videos = [];
    for (const { entry } of this.resolvedChannels()) {
      if (channelExternalId && this.channelIds(entry).device !== channelExternalId) {
        continue;
      }
      for (const video of entry.recent) {
        videos.push({ ...video, channel: entry.displayName });
      }
    }
    return videos.sort((a, b) => time(b.publishedAt) - time(a.publishedAt)).slice(0, RECENT_SIZE);
  }

  /** What the widget shows: a change asks Gladys to reload it. */
  widgetView() {
    return JSON.stringify([
      this.instance.reachable,
      this.error?.kind ?? null,
      this.lives().map((live) => [live.uuid, live.viewers]),
      this.recent().map((video) => video.uuid),
      this.account.unread,
    ]);
  }

  // --- Publishing to Gladys --------------------------------------------------

  /** Every device of the hub with the values of its features. */
  snapshots() {
    const list = [];
    const down = this.instance.reachable === false;
    const stats = this.instance.stats;
    list.push({
      ids: this.instanceIds(),
      type: DEVICE_TYPES.INSTANCE,
      stale: down,
      snapshot: { reachable: this.instance.reachable, ...(stats ?? {}) },
    });
    for (const { handle, entry } of this.resolvedChannels()) {
      const lives = Object.values(entry.lives);
      const last = entry.recent[0];
      list.push({
        ids: this.channelIds(entry),
        type: DEVICE_TYPES.CHANNEL,
        stale: down || this.channelErrors.has(handle),
        snapshot: {
          live: entry.window ? lives.length > 0 : null,
          liveViewers: entry.window ? lives.reduce((sum, live) => sum + live.viewers, 0) : null,
          lastVideo: last ? last.title.slice(0, 250) : null,
          lastVideoDate: last ? formatDate(last.publishedAt, this.config.language) : null,
          followers: entry.followers,
          videos: entry.total,
        },
      });
    }
    if (this.client.hasAccount && this.saved.account) {
      list.push({
        ids: this.accountIds(),
        type: DEVICE_TYPES.ACCOUNT,
        stale: down || Boolean(this.account.error),
        snapshot: { unread: this.account.unread, followers: this.account.followers },
      });
    }
    return list;
  }

  async publishStates({ force = false } = {}) {
    if (!this.client) {
      return;
    }
    const now = this.now();
    const states = [];
    for (const { ids, type, stale, snapshot } of this.snapshots()) {
      for (const { key, externalId, value, text } of featureValues(ids, type, snapshot)) {
        if (value === null) {
          continue;
        }
        const last = this.published.get(externalId);
        // While PeerTube is down, the last figures are not republished as fresh.
        const frozen = stale && key !== FEATURE_KEYS.ONLINE;
        if (frozen && !force && last) {
          continue;
        }
        const fresh = last && last.value === value && now - last.at < this.timings.heartbeatMs;
        if (!force && fresh) {
          continue;
        }
        states.push(
          text
            ? { device_feature_external_id: externalId, text: String(value) }
            : { device_feature_external_id: externalId, state: value },
        );
      }
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states);
      for (const state of states) {
        this.published.set(state.device_feature_external_id, {
          value: state.text ?? state.state,
          at: now,
        });
      }
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async publishTransports() {
    if (!this.client || this.instance.reachable === null) {
      return;
    }
    // An address of the network (or plain HTTP) is local, a public instance the cloud.
    const address = new URL(this.config.url);
    const online =
      address.protocol === 'http:' || isLocalHost(address.hostname)
        ? DEVICE_TRANSPORTS.LOCAL
        : DEVICE_TRANSPORTS.CLOUD;
    const changes = [];
    for (const { ids, stale } of this.snapshots()) {
      const value = this.instance.reachable && !stale ? online : DEVICE_TRANSPORTS.UNREACHABLE;
      if (this.transports.get(ids.device) !== value) {
        changes.push({ external_id: ids.device, transport: value });
      }
    }
    if (changes.length === 0) {
      return;
    }
    try {
      await this.gladys.publishTransports(changes);
      for (const change of changes) {
        this.transports.set(change.external_id, change.transport);
      }
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config.url) {
      return {
        connected: false,
        message: this.config.invalidUrl ? CONNECTION_TEXT.invalid : CONNECTION_TEXT.noInstance,
      };
    }
    if (this.error) {
      return { connected: false, message: ERROR_TEXT[this.error.kind] };
    }
    if (this.account.error) {
      return { connected: false, message: ERROR_TEXT[this.account.error] };
    }
    const missing = this.config.channels.find(
      (handle) => this.channelErrors.get(handle) === ERROR_KINDS.NOT_FOUND,
    );
    if (missing) {
      return { connected: false, message: CONNECTION_TEXT.channelNotFound(missing) };
    }
    if (this.config.invalidChannels.length) {
      return {
        connected: false,
        message: CONNECTION_TEXT.invalidChannel(this.config.invalidChannels[0]),
      };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Reports -----------------------------------------------------------------

  ensureInstance() {
    if (!this.client) {
      throw new CommandError(pick(ACTION_TEXT.noInstance, this.config?.language));
    }
  }

  /** The sentence of the scene action: lives on air, the latest videos. */
  summary(count = 3, channelExternalId = null) {
    this.ensureInstance();
    const text = SUMMARY_TEXT[this.config.language] ?? SUMMARY_TEXT.en;
    if (!this.instance.reachable) {
      return text.down;
    }
    const lives = this.lives().filter(
      (live) => !channelExternalId || this.liveChannel(live.uuid) === channelExternalId,
    );
    const latest = this.recent(channelExternalId).slice(0, count);
    const parts = [];
    if (lives.length) {
      parts.push(
        `${text.live}${text.colon}${lives.map((live) => text.video(live.title, live.channel)).join(', ')}`,
      );
    }
    parts.push(
      latest.length
        ? `${text.latest}${text.colon}${latest.map((video) => text.video(video.title, video.channel)).join(', ')}`
        : text.none,
    );
    const sentence = `PeerTube${text.colon}${parts.join(text.semicolon)}.`;
    return sentence.length > 1000 ? `${sentence.slice(0, 999)}…` : sentence;
  }

  /** "Test the connection": read PeerTube now, one report. */
  async testConnection() {
    await this.refresh();
    const message = {};
    for (const [language, text] of Object.entries(REPORT_TEXT)) {
      if (!this.client || this.error) {
        message[language] = pick(this.connectionStatus().message, language);
        continue;
      }
      const parts = [
        text.ok(this.instance.name ?? this.host, this.instance.version),
        text.channels(this.resolvedChannels().length, this.config.channels.length),
      ];
      if (this.client.hasAccount) {
        parts.push(
          this.account.error
            ? pick(ERROR_TEXT[this.account.error], language)
            : text.account(this.saved.account?.handle ?? this.config.username),
        );
      }
      const status = this.connectionStatus();
      if (!status.connected && !this.account.error) {
        parts.push(pick(status.message, language));
      }
      message[language] = parts.join(', ');
    }
    return message;
  }
}

export { ERROR_KINDS };
