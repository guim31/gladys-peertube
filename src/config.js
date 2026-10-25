// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// One PeerTube instance (yours, or any public one), the channels followed on
// it (local ones, or remote ones the instance knows: `name@host`), an
// optional account (user name and password: unread notifications and the
// followers of your channels), the refresh interval and the language of the
// feature names and sentences.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Refresh intervals offered in the configuration, in seconds.
export const POLL_INTERVALS = ['60', '120', '300', '600'];

// Channels followed at most: two requests per channel and per reading.
export const MAX_CHANNELS = 20;

export const DEFAULT_CONFIG = {
  url: '',
  channels: '',
  username: '',
  password: '',
  poll_interval: '120',
  language: 'fr',
};

const PRIVATE_HOST =
  /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[(::1\]|f[cd]))/;

/** True for an address of the local network (no TLS expected, no cloud). */
export function isLocalHost(hostname) {
  const host = hostname.toLowerCase();
  return PRIVATE_HOST.test(host) || !host.includes('.') || host.endsWith('.local');
}

/**
 * Parse the address typed by the user into a base URL: a bare host
 * (`framatube.org`, HTTPS; `192.0.2.10:9000`, HTTP on the local network) or
 * the URL copied from the browser, with the base path of an instance behind a
 * reverse proxy. A page of the interface, the query, the fragment and a
 * trailing slash are dropped.
 * @param {unknown} raw
 * @returns {string|null} `http(s)://host[:port][/base]`, null when unusable
 */
export function parseInstanceUrl(raw) {
  if (typeof raw !== 'string') {
    return null;
  }
  const text = raw.trim();
  if (!text) {
    return null;
  }
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(text);
  let url;
  try {
    url = new URL(hasScheme ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) {
    return null;
  }
  // Credentials in the address would end up in the logs and the device params.
  if (url.username || url.password) {
    return null;
  }
  // A bare local address (an IP, a port): PeerTube on the network, plain HTTP.
  if (!hasScheme && (url.port || isLocalHost(url.hostname))) {
    url.protocol = 'http:';
  }
  // A page of the interface copied from the browser (/c/…, /w/…, /videos/…).
  const path = url.pathname
    .replace(
      /\/(a|c|w|p|videos|video-channels|accounts|my-account|my-library|about|admin|home|search|login|signup)(\/.*)?$/i,
      '',
    )
    .replace(/\/+$/, '');
  return `${url.origin}${path}`;
}

/** Host part shown to the user (no scheme). */
export const hostOf = (url) => url.replace(/^https?:\/\//, '');

// A channel name: letters, digits, `_`, `-`, `.` (PeerTube's actor names).
const NAME = /^[a-z0-9_.-]{1,50}$/i;
// A host, with a port when it is not the default one.
const HOST = /^[a-z0-9.-]+(:\d{1,5})?$/i;

/**
 * One channel of the configuration: `name`, `@name`, `name@host`,
 * `@name@host`, or the address of its page (`https://host/c/name/videos`,
 * `/video-channels/name`). The handle PeerTube expects is `name` for a
 * channel of the instance, `name@host` for a remote one.
 * @param {string} raw
 * @param {string} instanceHost host[:port] of the instance (lower case)
 * @returns {string|null} the handle, lower case, null when unusable
 */
export function parseChannel(raw, instanceHost) {
  let text = raw.trim();
  const page = /^https?:\/\/([^/]+)\/(?:c|video-channels)\/([^/?#]+)/i.exec(text);
  if (page) {
    const name = decodeURIComponent(page[2]);
    // A remote channel seen from an instance: /c/name@host is its handle already.
    text = name.includes('@') ? name : `${name}@${page[1]}`;
  }
  text = text.replace(/^@/, '');
  const [name, host, ...rest] = text.split('@');
  if (rest.length || !NAME.test(name ?? '') || (host !== undefined && !HOST.test(host))) {
    return null;
  }
  const lowerHost = host?.toLowerCase();
  // `name@<the instance itself>` is a local channel: same handle as `name`.
  if (!lowerHost || lowerHost === instanceHost) {
    return name.toLowerCase();
  }
  return `${name.toLowerCase()}@${lowerHost}`;
}

/**
 * The channels of the configuration, comma, space or line separated.
 * @returns {{ channels: string[], invalid: string[] }}
 */
export function parseChannels(raw, instanceHost) {
  const channels = [];
  const invalid = [];
  const parts = typeof raw === 'string' ? raw.split(/[\s,;]+/).filter(Boolean) : [];
  for (const part of parts) {
    const handle = parseChannel(part, instanceHost);
    if (!handle) {
      invalid.push(part.slice(0, 60));
    } else if (!channels.includes(handle)) {
      channels.push(handle);
    }
  }
  return { channels: channels.slice(0, MAX_CHANNELS), invalid };
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const text = (key) => (typeof source[key] === 'string' ? source[key].trim() : '');
  const typed = text('url');
  const url = parseInstanceUrl(typed);
  const instanceHost = url ? new URL(url).host.toLowerCase() : '';
  const { channels, invalid } = url
    ? parseChannels(source.channels, instanceHost)
    : { channels: [], invalid: [] };
  const interval =
    source.poll_interval === undefined || source.poll_interval === null
      ? ''
      : String(source.poll_interval);
  const username = text('username');
  // A password may start or end with a space: kept as typed.
  const password = typeof source.password === 'string' ? source.password : '';
  return {
    url,
    invalidUrl: Boolean(typed) && !url,
    channels,
    invalidChannels: invalid,
    username: username && password ? username : '',
    password: username && password ? password : '',
    pollIntervalMs:
      Number(POLL_INTERVALS.includes(interval) ? interval : DEFAULT_CONFIG.poll_interval) * 1000,
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
