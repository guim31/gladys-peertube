// -----------------------------------------------------------------------------
// PeerTube client (REST API /api/v1), read only.
//
// Without an account, everything comes from the public API: the instance
// (/config, /server/stats), a channel (/video-channels/<handle>) and its
// videos (/video-channels/<handle>/videos, newest first, lives apart).
//
// With an account, the client logs in like the web interface does (OAuth 2
// "password" grant: the instance gives its local client id at
// /oauth-clients/local, then /users/token), keeps the access token in memory
// only, refreshes it with the refresh token, and logs in again when that one
// expired too. The password goes in the body of the token request: never in
// a URL, never in the logs. Two-factor authentication and external logins
// (OpenID Connect, SAML) cannot work this way: they are reported as such.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  NOT_PEERTUBE: 'not_peertube', // something answers, not the PeerTube API
  REDIRECT: 'redirect', // the address redirects (HTTP to HTTPS, another host)
  RATE_LIMITED: 'rate_limited', // 429: the instance limits the requests
  HTTP: 'http', // any other HTTP error
  NOT_FOUND: 'not_found', // a channel the instance does not know (404)
  AUTH: 'auth', // user name or password refused
  TWO_FACTOR: 'two_factor', // the account has two-factor authentication
});

export class PeertubeError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'PeertubeError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// Videos read per channel and per reading (newest first).
export const VIDEOS_PER_READ = 10;
// Lives read per channel: the ones on air right now.
const LIVES_PER_READ = 5;
// The access token is renewed this long before it expires.
const TOKEN_MARGIN_MS = 60_000;

const text = (value) => (typeof value === 'string' ? value : '');
const count = (value) => (Number.isFinite(value) && value >= 0 ? Math.round(value) : 0);

/** The fields of a video the integration uses. */
export function toVideo(raw, base) {
  const channel = raw.channel ?? {};
  const path = text(raw.thumbnailPath) || text(raw.previewPath);
  return {
    uuid: text(raw.uuid),
    title: text(raw.name).trim() || '…',
    duration: count(raw.duration),
    views: count(raw.views),
    viewers: count(raw.viewers),
    isLive: raw.isLive === true,
    publishedAt: text(raw.publishedAt),
    url: text(raw.url) || (raw.uuid ? `${base}/w/${raw.uuid}` : ''),
    thumbnailPath: path.startsWith('/') ? path : '',
    channel: text(channel.displayName) || text(channel.name),
  };
}

export class PeertubeClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL of the instance, base path included
   * @param {string} [options.username] empty: no account
   * @param {string} [options.password]
   * @param {Function} [options.request] HTTP seam (src/peertube/http.js)
   * @param {() => number} [options.now]
   */
  constructor({ url, username = '', password = '', request = httpRequest, now }) {
    this.url = url;
    this.username = username;
    this.password = password;
    this.request = request;
    this.now = now ?? (() => Date.now());
    /** { access, refresh, expiresAt, refreshExpiresAt } */
    this.token = null;
    this.oauthClient = null;
  }

  get hasAccount() {
    return Boolean(this.username);
  }

  /** One request; network errors become PeertubeError. */
  async send(path, { method = 'GET', headers = {}, body } = {}) {
    try {
      return await this.request(`${this.url}${path}`, {
        method,
        headers: { accept: 'application/json', ...headers },
        body,
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new PeertubeError(ERROR_KINDS.TLS, `certificate refused (${err.code})`);
      }
      throw new PeertubeError(
        ERROR_KINDS.UNREACHABLE,
        `no answer (${err.code ?? err.message ?? 'error'})`,
      );
    }
  }

  /** The error of a non-2xx answer. */
  failure(path, answer) {
    const { status } = answer;
    if (status >= 300 && status < 400) {
      return new PeertubeError(ERROR_KINDS.REDIRECT, `${path} redirects (HTTP ${status})`, {
        status,
      });
    }
    if (status === 429) {
      return new PeertubeError(ERROR_KINDS.RATE_LIMITED, `${path}: too many requests (HTTP 429)`, {
        status,
      });
    }
    return new PeertubeError(ERROR_KINDS.HTTP, `${path} answered HTTP ${status}`, { status });
  }

  /** GET (or POST) JSON; `notFound` names the kind of a 404. */
  async json(path, { notFound = ERROR_KINDS.NOT_PEERTUBE, ...options } = {}) {
    const answer = await this.send(path, options);
    if (answer.status === 404) {
      throw new PeertubeError(notFound, `${path} not found (HTTP 404)`, { status: 404 });
    }
    if (answer.status < 200 || answer.status >= 300) {
      throw this.failure(path, answer);
    }
    try {
      return JSON.parse(answer.body.toString('utf8'));
    } catch {
      throw new PeertubeError(ERROR_KINDS.NOT_PEERTUBE, `${path} is not JSON`);
    }
  }

  // --- Public API --------------------------------------------------------------

  /** The instance: name and version. Throws NOT_PEERTUBE for anything else. */
  async config() {
    const data = await this.json('/api/v1/config');
    if (typeof data?.serverVersion !== 'string') {
      throw new PeertubeError(ERROR_KINDS.NOT_PEERTUBE, '/api/v1/config has no serverVersion');
    }
    return {
      version: data.serverVersion,
      name: text(data.instance?.name) || null,
    };
  }

  /** The counters of the instance (cached a few minutes by PeerTube). */
  async stats() {
    const data = await this.json('/api/v1/server/stats');
    return {
      localVideos: count(data?.totalLocalVideos),
      localViews: count(data?.totalLocalVideoViews),
      users: count(data?.totalUsers),
      following: count(data?.totalInstanceFollowing),
      followers: count(data?.totalInstanceFollowers),
    };
  }

  /** A channel, by handle (`name` or `name@host`). */
  async channel(handle) {
    const data = await this.json(`/api/v1/video-channels/${encodeURIComponent(handle)}`, {
      notFound: ERROR_KINDS.NOT_FOUND,
    });
    if (typeof data?.name !== 'string' || typeof data?.host !== 'string') {
      throw new PeertubeError(ERROR_KINDS.NOT_PEERTUBE, `channel ${handle}: unexpected answer`);
    }
    return {
      name: data.name,
      host: data.host,
      displayName: text(data.displayName) || data.name,
      followers: count(data.followersCount),
      url: text(data.url),
    };
  }

  /**
   * The latest videos of a channel, newest first, and their total; `live`
   * true: the lives on air (a waiting or ended live is not listed).
   */
  async videos(handle, { live = false } = {}) {
    const query = new URLSearchParams({
      sort: '-publishedAt',
      count: String(live ? LIVES_PER_READ : VIDEOS_PER_READ),
      isLive: String(live),
    });
    const data = await this.json(
      `/api/v1/video-channels/${encodeURIComponent(handle)}/videos?${query}`,
      { notFound: ERROR_KINDS.NOT_FOUND },
    );
    if (!Array.isArray(data?.data)) {
      throw new PeertubeError(ERROR_KINDS.NOT_PEERTUBE, `videos of ${handle}: unexpected answer`);
    }
    return {
      total: count(data.total),
      videos: data.data
        .filter((item) => item && typeof item.uuid === 'string')
        .map((item) => toVideo(item, this.url)),
    };
  }

  /** The bytes of a thumbnail (`/lazy-static/thumbnails/…`). */
  async image(path) {
    const answer = await this.send(path, { headers: { accept: 'image/*' } });
    if (answer.status !== 200) {
      throw this.failure(path, answer);
    }
    return answer.body;
  }

  // --- Account -----------------------------------------------------------------

  /**
   * The OAuth client of the web interface. PeerTube gives it only to a
   * request addressed to its own host name (403 otherwise): an instance
   * reached by its IP is asked again with the host it advertises in
   * /.well-known/nodeinfo.
   */
  async localClient() {
    const path = '/api/v1/oauth-clients/local';
    let answer = await this.send(path);
    if (answer.status === 403) {
      const host = await this.advertisedHost();
      if (host && host !== new URL(this.url).host) {
        answer = await this.send(path, { headers: { host } });
      }
    }
    if (answer.status !== 200) {
      throw answer.status === 404
        ? new PeertubeError(ERROR_KINDS.NOT_PEERTUBE, `${path} not found`)
        : this.failure(path, answer);
    }
    try {
      return JSON.parse(answer.body.toString('utf8'));
    } catch {
      throw new PeertubeError(ERROR_KINDS.NOT_PEERTUBE, `${path} is not JSON`);
    }
  }

  /** The host[:port] PeerTube was configured with (webserver.hostname). */
  async advertisedHost() {
    try {
      const data = await this.json('/.well-known/nodeinfo');
      const href = Array.isArray(data?.links) ? data.links[0]?.href : null;
      return typeof href === 'string' ? new URL(href).host : null;
    } catch {
      return null;
    }
  }

  /** Log in (password grant) or refresh the access token. */
  async authenticate() {
    const now = this.now();
    if (this.token && now < this.token.expiresAt - TOKEN_MARGIN_MS) {
      return this.token.access;
    }
    this.oauthClient ??= await this.localClient();
    const { client_id: clientId, client_secret: clientSecret } = this.oauthClient ?? {};
    if (typeof clientId !== 'string' || typeof clientSecret !== 'string') {
      this.oauthClient = null;
      throw new PeertubeError(ERROR_KINDS.NOT_PEERTUBE, 'no local OAuth client');
    }
    const canRefresh = this.token?.refresh && now < this.token.refreshExpiresAt - TOKEN_MARGIN_MS;
    const form = new URLSearchParams({ client_id: clientId, client_secret: clientSecret });
    if (canRefresh) {
      form.set('grant_type', 'refresh_token');
      form.set('refresh_token', this.token.refresh);
    } else {
      form.set('grant_type', 'password');
      form.set('response_type', 'code');
      form.set('username', this.username);
      form.set('password', this.password);
    }
    this.token = null;
    const answer = await this.send('/api/v1/users/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });
    if (answer.status === 401 && /required/i.test(answer.headers?.['x-peertube-otp'] ?? '')) {
      throw new PeertubeError(ERROR_KINDS.TWO_FACTOR, 'two-factor authentication required', {
        status: 401,
      });
    }
    if (answer.status === 400 || answer.status === 401 || answer.status === 403) {
      if (canRefresh) {
        // The refresh token was revoked: one login with the password.
        return this.authenticate();
      }
      throw new PeertubeError(ERROR_KINDS.AUTH, `login refused (HTTP ${answer.status})`, {
        status: answer.status,
      });
    }
    if (answer.status !== 200) {
      throw this.failure('/api/v1/users/token', answer);
    }
    let data;
    try {
      data = JSON.parse(answer.body.toString('utf8'));
    } catch {
      throw new PeertubeError(ERROR_KINDS.NOT_PEERTUBE, '/api/v1/users/token is not JSON');
    }
    if (typeof data?.access_token !== 'string') {
      throw new PeertubeError(ERROR_KINDS.NOT_PEERTUBE, '/api/v1/users/token: no access token');
    }
    const seconds = (value, fallback) => (Number.isFinite(value) && value > 0 ? value : fallback);
    this.token = {
      access: data.access_token,
      refresh: typeof data.refresh_token === 'string' ? data.refresh_token : null,
      expiresAt: now + seconds(data.expires_in, 3600) * 1000,
      refreshExpiresAt: now + seconds(data.refresh_token_expires_in, 0) * 1000,
    };
    return this.token.access;
  }

  /** GET JSON as the user; a refused token is renewed once. */
  async authed(path, retry = true) {
    const access = await this.authenticate();
    const answer = await this.send(path, { headers: { authorization: `Bearer ${access}` } });
    if (answer.status === 401 && retry) {
      this.token = null;
      return this.authed(path, false);
    }
    if (answer.status < 200 || answer.status >= 300) {
      throw answer.status === 401 || answer.status === 403
        ? new PeertubeError(ERROR_KINDS.AUTH, `${path} refused (HTTP ${answer.status})`, {
            status: answer.status,
          })
        : this.failure(path, answer);
    }
    try {
      return JSON.parse(answer.body.toString('utf8'));
    } catch {
      throw new PeertubeError(ERROR_KINDS.NOT_PEERTUBE, `${path} is not JSON`);
    }
  }

  /** The account: its handle and the followers of its channels. */
  async me() {
    const data = await this.authed('/api/v1/users/me');
    const account = data?.account ?? {};
    const channels = Array.isArray(data?.videoChannels) ? data.videoChannels : [];
    return {
      name: text(account.name) || text(data?.username) || this.username,
      host: text(account.host),
      displayName: text(account.displayName) || text(account.name) || this.username,
      followers: channels.reduce((sum, channel) => sum + count(channel?.followersCount), 0),
    };
  }

  /** The number of unread notifications. */
  async unreadNotifications() {
    const data = await this.authed('/api/v1/users/me/notifications?unread=true&count=1');
    return count(data?.total);
  }
}
