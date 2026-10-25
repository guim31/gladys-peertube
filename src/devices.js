// -----------------------------------------------------------------------------
// The Gladys devices:
//   - the instance (`instance:<host>`): online, local videos, views of the
//     local videos, users, instances followed;
//   - one per channel followed (`channel:<name>@<host>`, the handle PeerTube
//     gives): live on air, live viewers, last video, its date, followers,
//     videos;
//   - with an account (`account:<name>@<host>`): unread notifications, and
//     the followers of the account's channels.
//
// Feature category/type couples come from the core table (see
// test/gladys-rules.test.js). should_poll: false: the hub reads PeerTube on
// its own timer (src/hub.js), at the interval chosen in the configuration.
// -----------------------------------------------------------------------------

import { DEVICE_FEATURE_CATEGORIES, DEVICE_FEATURE_TYPES } from '@gladysassistant/integration-sdk';

export const DEVICE_TYPES = Object.freeze({
  INSTANCE: 'instance',
  CHANNEL: 'channel',
  ACCOUNT: 'account',
});

export const URL_PARAM = 'PEERTUBE_URL';
export const HANDLE_PARAM = 'PEERTUBE_HANDLE';

// Suffixes of the feature external ids: permanent once published.
export const FEATURE_KEYS = Object.freeze({
  ONLINE: 'online',
  LOCAL_VIDEOS: 'local_videos',
  LOCAL_VIEWS: 'local_views',
  USERS: 'users',
  FOLLOWING: 'following',
  LIVE: 'live',
  LIVE_VIEWERS: 'live_viewers',
  LAST_VIDEO: 'last_video',
  LAST_VIDEO_DATE: 'last_video_date',
  FOLLOWERS: 'followers',
  VIDEOS: 'videos',
  UNREAD_NOTIFICATIONS: 'unread_notifications',
});

const K = FEATURE_KEYS;

// Feature names per language (Gladys does not tell a device integration the
// user's language). Frozen at creation in Gladys.
export const NAMES = {
  en: {
    [K.ONLINE]: 'Online',
    [K.LOCAL_VIDEOS]: 'Local videos',
    [K.LOCAL_VIEWS]: 'Views of the local videos',
    [K.USERS]: 'Users',
    [K.FOLLOWING]: 'Instances followed',
    [K.LIVE]: 'Live on air',
    [K.LIVE_VIEWERS]: 'Live viewers',
    [K.LAST_VIDEO]: 'Last video',
    [K.LAST_VIDEO_DATE]: 'Last video published on',
    [K.FOLLOWERS]: 'Followers',
    [K.VIDEOS]: 'Videos',
    [K.UNREAD_NOTIFICATIONS]: 'Unread notifications',
  },
  fr: {
    [K.ONLINE]: 'En ligne',
    [K.LOCAL_VIDEOS]: 'Vidéos locales',
    [K.LOCAL_VIEWS]: 'Vues des vidéos locales',
    [K.USERS]: 'Utilisateurs',
    [K.FOLLOWING]: 'Instances suivies',
    [K.LIVE]: 'Direct en cours',
    [K.LIVE_VIEWERS]: 'Spectateurs du direct',
    [K.LAST_VIDEO]: 'Dernière vidéo',
    [K.LAST_VIDEO_DATE]: 'Dernière vidéo publiée le',
    [K.FOLLOWERS]: 'Abonnés',
    [K.VIDEOS]: 'Vidéos',
    [K.UNREAD_NOTIFICATIONS]: 'Notifications non lues',
  },
  de: {
    [K.ONLINE]: 'Online',
    [K.LOCAL_VIDEOS]: 'Lokale Videos',
    [K.LOCAL_VIEWS]: 'Aufrufe der lokalen Videos',
    [K.USERS]: 'Benutzer',
    [K.FOLLOWING]: 'Gefolgte Instanzen',
    [K.LIVE]: 'Live auf Sendung',
    [K.LIVE_VIEWERS]: 'Zuschauer des Livestreams',
    [K.LAST_VIDEO]: 'Letztes Video',
    [K.LAST_VIDEO_DATE]: 'Letztes Video veröffentlicht am',
    [K.FOLLOWERS]: 'Abonnenten',
    [K.VIDEOS]: 'Videos',
    [K.UNREAD_NOTIFICATIONS]: 'Ungelesene Benachrichtigungen',
  },
  es: {
    [K.ONLINE]: 'En línea',
    [K.LOCAL_VIDEOS]: 'Vídeos locales',
    [K.LOCAL_VIEWS]: 'Vistas de los vídeos locales',
    [K.USERS]: 'Usuarios',
    [K.FOLLOWING]: 'Instancias seguidas',
    [K.LIVE]: 'Directo en emisión',
    [K.LIVE_VIEWERS]: 'Espectadores del directo',
    [K.LAST_VIDEO]: 'Último vídeo',
    [K.LAST_VIDEO_DATE]: 'Último vídeo publicado el',
    [K.FOLLOWERS]: 'Suscriptores',
    [K.VIDEOS]: 'Vídeos',
    [K.UNREAD_NOTIFICATIONS]: 'Notificaciones no leídas',
  },
};

// Display bounds (the core never applies them on write).
const COUNTER_MAX = 1_000_000_000;

const sensor = (category, type, extra = {}) => ({
  category,
  type,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

const DEFINITIONS = {
  binary: sensor(DEVICE_FEATURE_CATEGORIES.INPUT, DEVICE_FEATURE_TYPES.SENSOR.BINARY, {
    min: 0,
    max: 1,
  }),
  counter: sensor(DEVICE_FEATURE_CATEGORIES.COUNTER_SENSOR, DEVICE_FEATURE_TYPES.SENSOR.INTEGER, {
    min: 0,
    max: COUNTER_MAX,
  }),
  text: sensor(DEVICE_FEATURE_CATEGORIES.TEXT, DEVICE_FEATURE_TYPES.TEXT.TEXT, {
    keep_history: false,
    min: 0,
    max: 0,
  }),
};

// Order = display order in Gladys. `value` reads the snapshot of the hub.
const FEATURES = {
  [DEVICE_TYPES.INSTANCE]: [
    { key: K.ONLINE, definition: 'binary', value: (s) => bit(s.reachable) },
    { key: K.LOCAL_VIDEOS, definition: 'counter', value: (s) => s.localVideos },
    { key: K.LOCAL_VIEWS, definition: 'counter', value: (s) => s.localViews },
    { key: K.USERS, definition: 'counter', value: (s) => s.users },
    { key: K.FOLLOWING, definition: 'counter', value: (s) => s.following },
  ],
  [DEVICE_TYPES.CHANNEL]: [
    { key: K.LIVE, definition: 'binary', value: (s) => bit(s.live) },
    { key: K.LIVE_VIEWERS, definition: 'counter', value: (s) => s.liveViewers },
    { key: K.LAST_VIDEO, definition: 'text', value: (s) => s.lastVideo || null },
    { key: K.LAST_VIDEO_DATE, definition: 'text', value: (s) => s.lastVideoDate || null },
    { key: K.FOLLOWERS, definition: 'counter', value: (s) => s.followers },
    { key: K.VIDEOS, definition: 'counter', value: (s) => s.videos },
  ],
  [DEVICE_TYPES.ACCOUNT]: [
    { key: K.UNREAD_NOTIFICATIONS, definition: 'counter', value: (s) => s.unread },
    { key: K.FOLLOWERS, definition: 'counter', value: (s) => s.followers },
  ],
};

function bit(value) {
  if (value === null || value === undefined) {
    return null;
  }
  return value ? 1 : 0;
}

// The platform id of a device: the host (and port) of PeerTube, or the
// handle `name@host`; lower case, the `:` of a port would split the id.
export const platformId = (value) => value.toLowerCase().replace(/:/g, '-');

export const deviceIds = (gladys, type, id) => gladys.externalIds(type, platformId(id));

const names = (config) => NAMES[config.language] ?? NAMES.en;

function build(gladys, config, type, id, name, params) {
  const ids = deviceIds(gladys, type, id);
  const labels = names(config);
  return {
    name: name.slice(0, 60),
    external_id: ids.device,
    should_poll: false,
    params,
    features: FEATURES[type].map(({ key, definition }) => ({
      ...DEFINITIONS[definition],
      name: labels[key],
      external_id: ids.feature(key),
    })),
  };
}

/** The instance device; `host` is the host[:port] of the configured address. */
export function buildInstance(gladys, config, host, instanceName) {
  return build(
    gladys,
    config,
    DEVICE_TYPES.INSTANCE,
    host,
    // A fresh instance keeps the default name "PeerTube": the host tells more.
    instanceName && instanceName !== 'PeerTube' ? `PeerTube ${instanceName}` : `PeerTube ${host}`,
    [{ name: URL_PARAM, value: config.url }],
  );
}

/** The device of a channel; `handle` is its full `name@host`. */
export function buildChannel(gladys, config, handle, displayName) {
  return build(gladys, config, DEVICE_TYPES.CHANNEL, handle, displayName || handle, [
    { name: HANDLE_PARAM, value: handle },
  ]);
}

/** The device of the account; `handle` is its full `name@host`. */
export function buildAccount(gladys, config, handle) {
  return build(gladys, config, DEVICE_TYPES.ACCOUNT, handle, `PeerTube ${handle}`, [
    { name: HANDLE_PARAM, value: handle },
  ]);
}

/**
 * The value of every feature of a device (null: nothing to publish).
 * @returns {Array<{ key: string, externalId: string, value: number|string|null, text: boolean }>}
 */
export function featureValues(ids, type, snapshot) {
  return FEATURES[type].map(({ key, definition, value }) => {
    const read = value(snapshot);
    return {
      key,
      externalId: ids.feature(key),
      value: read === undefined ? null : read,
      text: definition === 'text',
    };
  });
}
