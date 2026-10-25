// -----------------------------------------------------------------------------
// The hub against the fake PeerTube: what each reading publishes, the scene
// events (once, and never for what was there before), a restart, the account
// (login, refresh, refused, 2FA), the failures, the container's own timer, the
// scene action and "Test the connection".
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICE_TRANSPORTS } from '@gladysassistant/integration-sdk';
import { HUB_TIMINGS } from '../src/hub.js';
import {
  CONFIG,
  HOST,
  accountIds,
  channelIds,
  createClock,
  createWorld,
  defaultPeertube,
  instanceIds,
} from './helpers/world.js';

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const LOCAL = `gladys_test@${HOST}`;
const REMOTE = 'blender@video.example.net';
const ACCOUNT = { ...CONFIG, username: 'root', password: 'secret-password' };

async function scene(w, key, fields) {
  const ack = await w.fake.sceneAction(key, fields);
  if (!ack.success) {
    throw new Error(ack.error);
  }
  return ack.data.outputs;
}

async function testConnection(w) {
  const ack = await w.fake.action('test_connection', {});
  return ack.data.message;
}

const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);
const channelState = (w, handle, key) =>
  w.fake.lastState(channelIds(w.gladys, handle).feature(key));
const instanceState = (w, key) => w.fake.lastState(instanceIds(w.gladys).feature(key));

test('the first reading publishes the devices and the figures, and announces nothing', async (t) => {
  const w = await world(t);
  assert.deepEqual(w.fake.sceneEvents, []);
  const devices = w.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((device) => device.name),
    ['PeerTube 192.0.2.30:9000', 'Gladys Test', 'Blender'],
  );
  assert.equal(instanceState(w, 'online'), 1);
  assert.equal(instanceState(w, 'local_videos'), 2);
  assert.equal(channelState(w, LOCAL, 'videos'), 2);
  assert.equal(channelState(w, LOCAL, 'followers'), 4);
  assert.equal(channelState(w, LOCAL, 'live'), 0);
  assert.equal(channelState(w, LOCAL, 'last_video'), 'Gladys test clip');
  assert.equal(channelState(w, LOCAL, 'last_video_date'), '25/10/2026, 00:00');
  assert.equal(channelState(w, REMOTE, 'followers'), 1200);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  // A local address: the badge says local.
  assert.ok(
    w.fake.transports.every((item) => item.transport === DEVICE_TRANSPORTS.LOCAL),
    JSON.stringify(w.fake.transports),
  );
  assert.deepEqual(
    w.hub.recent().map((video) => video.title),
    ['Gladys test clip', 'Sprite Fright', 'Older clip'],
  );
});

test('a new video fires new_video once, with its details', async (t) => {
  const w = await world(t);
  w.clock.advance(120_000);
  const video = w.publish('gladys_test', 'Fresh upload', { duration: 330 });
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'new_video'), [
    {
      key: 'new_video',
      data: {
        channel: channelIds(w.gladys, LOCAL).device,
        channel_name: 'Gladys Test',
        handle: LOCAL,
        title: 'Fresh upload',
        url: video.url,
        duration_minutes: 6,
        published_at: video.publishedAt,
      },
    },
  ]);
  assert.equal(channelState(w, LOCAL, 'last_video'), 'Fresh upload');
  assert.equal(channelState(w, LOCAL, 'videos'), 3);
  assert.ok(w.fake.widgetRefreshes.includes('latest_videos'));
});

test('an older video surfacing after a deletion is not news', async (t) => {
  const clock = createClock();
  const peertube = defaultPeertube(clock);
  const channel = peertube.channels.get('gladys_test');
  // Twelve videos: the listing (10) misses the two oldest.
  for (let index = 0; index < 10; index += 1) {
    peertube.addVideo(channel, `Clip ${index}`, {
      publishedAt: new Date(clock.time - (100 - index) * 60_000).toISOString(),
    });
  }
  const w = await world(t, { clock, peertube });
  peertube.deleteVideo(channel, channel.videos.at(-1));
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'new_video'), []);
});

test('a live fires live_started, then live_ended with its length and peak', async (t) => {
  const w = await world(t);
  w.clock.advance(60_000);
  const live = w.peertube.startLive(w.channel('gladys_test'), 'Sunday stream', { viewers: 3 });
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'live_started'), [
    {
      key: 'live_started',
      data: {
        channel: channelIds(w.gladys, LOCAL).device,
        channel_name: 'Gladys Test',
        handle: LOCAL,
        title: 'Sunday stream',
        url: live.url,
      },
    },
  ]);
  assert.equal(channelState(w, LOCAL, 'live'), 1);
  assert.equal(channelState(w, LOCAL, 'live_viewers'), 3);
  assert.deepEqual(events(w, 'new_video'), [], 'a live is not a new video');

  w.clock.advance(20 * 60_000);
  live.viewers = 12;
  await w.hub.pollAll();
  assert.equal(channelState(w, LOCAL, 'live_viewers'), 12);
  w.clock.advance(25 * 60_000);
  live.viewers = 5;
  await w.hub.pollAll();
  w.peertube.endLive(w.channel('gladys_test'), live);
  w.clock.advance(2 * 60_000);
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'live_ended'), [
    {
      key: 'live_ended',
      data: {
        channel: channelIds(w.gladys, LOCAL).device,
        channel_name: 'Gladys Test',
        handle: LOCAL,
        title: 'Sunday stream',
        url: live.url,
        duration_minutes: 47,
        peak_viewers: 12,
      },
    },
  ]);
  assert.equal(channelState(w, LOCAL, 'live'), 0);
  assert.equal(channelState(w, LOCAL, 'live_viewers'), 0);
});

test('a live already on air at the first reading is not announced', async (t) => {
  const clock = createClock();
  const peertube = defaultPeertube(clock);
  peertube.startLive(peertube.channels.get('gladys_test'), 'Already on air');
  const w = await world(t, { clock, peertube });
  assert.deepEqual(w.fake.sceneEvents, []);
  assert.equal(channelState(w, LOCAL, 'live'), 1);
});

test('a restart announces nothing twice, and still sees a live end', async (t) => {
  const clock = createClock();
  const peertube = defaultPeertube(clock);
  const first = await createWorld({ clock, peertube });
  clock.advance(60_000);
  first.publish('gladys_test', 'Before the restart');
  const live = peertube.startLive(peertube.channels.get('gladys_test'), 'Long live');
  await first.hub.pollAll();
  assert.equal(events(first, 'new_video').length, 1);
  assert.equal(events(first, 'live_started').length, 1);
  await first.app.stop();

  clock.advance(10 * 60_000);
  peertube.endLive(peertube.channels.get('gladys_test'), live);
  const second = await world(t, { clock, peertube, dataDir: first.dataDir });
  assert.deepEqual(events(second, 'new_video'), []);
  assert.deepEqual(events(second, 'live_started'), []);
  assert.equal(events(second, 'live_ended').length, 1);
  assert.equal(events(second, 'live_ended')[0].data.duration_minutes, 10);
});

test('another instance starts from scratch: its videos are not news', async (t) => {
  const w = await world(t);
  const other = defaultPeertube(w.clock);
  other.addVideo(other.channels.get('gladys_test'), 'Elsewhere', {
    publishedAt: new Date(w.clock.time).toISOString(),
  });
  w.network.servers['http://192.0.2.31:9000'] = other;
  await w.fake.configUpdated({ ...CONFIG, url: '192.0.2.31:9000' });
  await w.hub.pollAll();
  assert.deepEqual(events(w, 'new_video'), []);
  assert.equal(w.hub.recent()[0].title, 'Elsewhere');
});

test('the account: login through the advertised host name, unread notifications, followers', async (t) => {
  const w = await world(t, { config: ACCOUNT });
  w.peertube.unread = 3;
  await w.hub.pollAll();
  const ids = accountIds(w.gladys);
  assert.ok(w.fake.discoveredDevices.some((device) => device.external_id === ids.device));
  assert.equal(w.fake.lastState(ids.feature('unread_notifications')), 3);
  assert.equal(w.fake.lastState(ids.feature('followers')), 4);
  // The first ask of the OAuth client was refused (an IP), the second carried the host name.
  const asks = w.peertube.requests.filter((r) => r.path === '/api/v1/oauth-clients/local');
  assert.deepEqual(
    asks.map((r) => r.headers.host),
    [undefined, HOST],
  );
  // The password never goes in a URL.
  assert.ok(w.peertube.requests.every((r) => !r.query.includes('secret-password')));
});

test('the access token is refreshed, then a revoked refresh token logs in again', async (t) => {
  const w = await world(t, { config: ACCOUNT });
  const logins = () => w.peertube.requests.filter((r) => r.path === '/api/v1/users/token').length;
  assert.equal(logins(), 1);
  await w.hub.pollAll();
  assert.equal(logins(), 1, 'the token is reused');
  w.clock.advance(86_400_000);
  await w.hub.pollAll();
  assert.equal(logins(), 2, 'refreshed');
  w.peertube.refreshTokens.clear();
  w.peertube.accessTokens.clear();
  await w.hub.pollAll();
  assert.equal(logins(), 3, 'a refused token: a login with the password');
  assert.equal(w.hub.account.error, null);
});

test('a refused password is reported, and not retried at every reading', async (t) => {
  const w = await world(t, { config: { ...ACCOUNT, password: 'wrong' } });
  assert.equal(w.hub.account.error, 'auth');
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /refused the user name or the password/);
  const logins = () => w.peertube.requests.filter((r) => r.path === '/api/v1/users/token').length;
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.equal(logins(), 1);
  w.clock.advance(HUB_TIMINGS.loginRetryMs);
  await w.hub.pollAll();
  assert.equal(logins(), 2);
  // The public part keeps working.
  assert.equal(channelState(w, LOCAL, 'followers'), 4);
});

test('an account with two-factor authentication is reported as such', async (t) => {
  const clock = createClock();
  const peertube = defaultPeertube(clock);
  peertube.twoFactor = true;
  const w = await world(t, { clock, peertube, config: ACCOUNT });
  assert.equal(w.hub.account.error, 'two_factor');
  assert.match(w.fake.connectionStatus.message.fr, /double authentification/);
});

test('a channel the instance does not know is reported, the others are read', async (t) => {
  const w = await world(t, { config: { ...CONFIG, channels: 'gladys_test, nobody_here' } });
  assert.deepEqual(w.fake.connectionStatus, {
    connected: false,
    message: {
      en: 'Channel nobody_here not found on this instance: check its handle.',
      fr: 'Chaîne nobody_here introuvable sur cette instance : vérifiez son identifiant.',
      de: 'Kanal nobody_here auf dieser Instanz nicht gefunden: Prüfe seine Kennung.',
      es: 'Canal nobody_here no encontrado en esta instancia: compruebe su identificador.',
    },
  });
  assert.equal(channelState(w, LOCAL, 'videos'), 2);
  assert.equal(w.fake.discoveredDevices.length, 2);
});

test('PeerTube down: unreachable badge, frozen figures, then back', async (t) => {
  const w = await world(t);
  w.peertube.down = true;
  await w.hub.pollAll();
  assert.equal(instanceState(w, 'online'), 0);
  const last = w.fake.transports.slice(-3).map((item) => item.transport);
  assert.deepEqual(last, Array(3).fill(DEVICE_TRANSPORTS.UNREACHABLE));
  assert.deepEqual(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /does not answer/);
  // The figures of the channels are not republished as fresh while down.
  assert.equal(
    w.fake.states.filter((state) => state.device_feature_external_id.endsWith(':followers')).length,
    2,
  );
  w.peertube.down = false;
  await w.hub.pollAll();
  assert.equal(instanceState(w, 'online'), 1);
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
  assert.equal(w.fake.transports.at(-1).transport, DEVICE_TRANSPORTS.LOCAL);
});

test('a 429 stops the reading and is explained', async (t) => {
  const w = await world(t);
  w.peertube.rateLimited = true;
  await w.hub.pollAll();
  assert.match(w.fake.connectionStatus.message.en, /limits the requests/);
  w.peertube.rateLimited = false;
  await w.hub.pollAll();
  assert.deepEqual(w.fake.connectionStatus, { connected: true });
});

test('a public instance gets the cloud badge', async (t) => {
  const clock = createClock();
  const peertube = defaultPeertube(clock);
  peertube.base = 'https://tube.example.org';
  const w = await createWorld({
    clock,
    connect: false,
    config: { ...CONFIG, url: 'tube.example.org' },
  });
  t.after(() => w.app.stop());
  w.network.servers['https://tube.example.org'] = peertube;
  await w.gladys.connect();
  await w.app.ready;
  assert.ok(w.fake.transports.length > 0);
  assert.ok(w.fake.transports.every((item) => item.transport === DEVICE_TRANSPORTS.CLOUD));
});

test('adding a device publishes all its states again and refreshes the widget', async (t) => {
  const w = await world(t);
  const device = w.fake.discoveredDevices.find((item) => item.name === 'Gladys Test');
  const count = w.fake.widgetRefreshes.length;
  const published = [];
  const original = w.gladys.publishStates.bind(w.gladys);
  w.gladys.publishStates = async (states) => {
    published.push(...states);
    return original(states);
  };
  await w.fake.deviceCreated(device);
  const keys = published.map((state) => state.device_feature_external_id);
  for (const feature of device.features) {
    assert.ok(keys.includes(feature.external_id), feature.external_id);
  }
  assert.ok(w.fake.widgetRefreshes.length > count);
});

test('the container polls on its own timer (Gladys never polls these devices)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const w = await world(t, { timers: true, config: { ...CONFIG, poll_interval: '60' } });
  const reads = () => w.peertube.requests.filter((r) => r.path === '/api/v1/server/stats').length;
  const before = reads();
  w.publish('gladys_test', 'Timer video');
  t.mock.timers.tick(60_000);
  await w.hub.polling;
  assert.equal(reads(), before + 1);
  assert.equal(events(w, 'new_video').length, 1);
  assert.ok(w.fake.discoveredDevices.every((device) => device.should_poll === false));
});

test('read_latest: a sentence and the details, for all channels or one', async (t) => {
  const w = await world(t);
  w.peertube.startLive(w.channel('gladys_test'), 'Sunday stream');
  const all = await scene(w, 'read_latest', { count: '3' });
  assert.deepEqual(all, {
    summary:
      'PeerTube: live now: “Sunday stream” (Gladys Test); latest videos: “Gladys test clip” (Gladys Test), “Sprite Fright” (Blender), “Older clip” (Gladys Test).',
    live: true,
    live_title: 'Sunday stream',
    last_title: 'Gladys test clip',
    last_channel: 'Gladys Test',
    last_url: w.hub.recent()[0].url,
  });
  const one = await scene(w, 'read_latest', {
    channel: channelIds(w.gladys, REMOTE).device,
    count: '1',
  });
  assert.equal(one.summary, 'PeerTube: latest videos: “Sprite Fright” (Blender).');
  assert.equal(one.live, false);
  assert.equal(one.last_channel, 'Blender');
});

test('read_latest in French, and while PeerTube is down', async (t) => {
  const w = await world(t, { config: { ...CONFIG, language: 'fr' } });
  const result = await scene(w, 'read_latest', { count: '1' });
  assert.equal(result.summary, 'PeerTube : dernières vidéos : « Gladys test clip » (Gladys Test).');
  w.peertube.down = true;
  const down = await scene(w, 'read_latest', {});
  assert.equal(down.summary, 'PeerTube ne répond pas.');
  assert.equal(down.live, false);
});

test('Test the connection reports the instance, the channels and the account', async (t) => {
  const w = await world(t, { config: ACCOUNT });
  const report = await testConnection(w);
  assert.equal(
    report.en,
    `OK, PeerTube (PeerTube 7.3.0), 2/2 channel(s) found, account root@${HOST} connected`,
  );
  assert.equal(
    report.fr,
    `OK, PeerTube (PeerTube 7.3.0), 2/2 chaîne(s) trouvée(s), compte root@${HOST} connecté`,
  );
  w.peertube.down = true;
  const down = await testConnection(w);
  assert.match(down.en, /does not answer/);
});

test('without an address: no device, a clear status', async (t) => {
  const w = await world(t, { config: { url: '', language: 'en' } });
  assert.deepEqual(w.fake.discoveredDevices, []);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /Enter the address/);
  await assert.rejects(scene(w, 'read_latest', {}), /Enter the address/);
});
