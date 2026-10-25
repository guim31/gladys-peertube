// -----------------------------------------------------------------------------
// An in-memory PeerTube, answering the requests of src/peertube/client.js with
// the shapes of the real answers (test/fixtures/peertube: PeerTube 7.3.0 in
// Docker, 8.3.1 on framatube.org). Channels, videos, lives on air, one
// account; switches for the failures (down, 429, refused login, 2FA, the
// 403 of /oauth-clients/local on an address that is not the host name).
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/peertube/${name}.json`, import.meta.url), 'utf8'));

export const FIXTURES = {
  config: fixture('v7-config'),
  stats: fixture('v7-stats'),
  channel: fixture('v7-channel'),
  video: fixture('v7-videos').data[0],
  live: fixture('v7-live-lives').data[0],
  me: fixture('v7-me'),
  nodeinfo: fixture('v7-nodeinfo'),
  missing: fixture('v7-missing'),
};

const json = (status, data, headers = {}) => ({
  status,
  headers: { 'content-type': 'application/json', ...headers },
  body: Buffer.from(JSON.stringify(data)),
});

let sequence = 0;

export class FakePeertube {
  /**
   * @param {object} [options]
   * @param {string} [options.base] the address the integration uses
   * @param {string} [options.host] the host name PeerTube was configured with
   * @param {string} [options.version]
   */
  constructor({
    base = 'http://192.0.2.30:9000',
    host = 'peertube.example.org:9000',
    version = '7.3.0',
  } = {}) {
    this.base = base;
    this.host = host;
    this.version = version;
    this.channels = new Map();
    this.down = false;
    this.rateLimited = false;
    this.twoFactor = false;
    this.password = 'secret-password';
    this.username = 'root';
    this.unread = 0;
    this.accessTokens = new Set();
    this.refreshTokens = new Set();
    this.requests = [];
    this.stats = { ...FIXTURES.stats };
  }

  addChannel(name, { displayName = name, host = this.host, followers = 0 } = {}) {
    const channel = { name, host, displayName, followers, videos: [], lives: [] };
    this.channels.set(`${name}@${host}`, channel);
    if (host === this.host) {
      this.channels.set(name, channel);
    }
    return channel;
  }

  /** A video published now (or at `publishedAt`), newest first in the listing. */
  addVideo(channel, title, { publishedAt = new Date().toISOString(), duration = 125 } = {}) {
    sequence += 1;
    const uuid = `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`;
    const video = {
      ...FIXTURES.video,
      id: sequence,
      uuid,
      name: title,
      duration,
      publishedAt,
      url: `http://${this.host}/videos/watch/${uuid}`,
      thumbnailPath: `/lazy-static/thumbnails/thumb-${sequence}.jpg`,
      channel: {
        ...FIXTURES.video.channel,
        name: channel.name,
        displayName: channel.displayName,
        host: channel.host,
      },
    };
    channel.videos.push(video);
    return video;
  }

  startLive(channel, title, { viewers = 0 } = {}) {
    sequence += 1;
    const uuid = `00000000-0000-4000-9000-${String(sequence).padStart(12, '0')}`;
    const live = {
      ...FIXTURES.live,
      id: sequence,
      uuid,
      name: title,
      viewers,
      url: `http://${this.host}/videos/watch/${uuid}`,
      channel: {
        ...FIXTURES.live.channel,
        name: channel.name,
        displayName: channel.displayName,
        host: channel.host,
      },
    };
    channel.lives.push(live);
    return live;
  }

  endLive(channel, live) {
    channel.lives = channel.lives.filter((item) => item !== live);
  }

  deleteVideo(channel, video) {
    channel.videos = channel.videos.filter((item) => item !== video);
  }

  async handle(url, { method = 'GET', headers = {}, body } = {}) {
    const target = new URL(url);
    const path = target.pathname.slice(new URL(this.base).pathname.replace(/\/$/, '').length);
    this.requests.push({ method, path, query: target.search, headers });
    if (this.down) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    if (this.rateLimited) {
      return json(429, { status: 429, detail: 'Too many requests' });
    }
    if (path === '/api/v1/config') {
      return json(200, { ...FIXTURES.config, serverVersion: this.version });
    }
    if (path === '/api/v1/server/stats') {
      return json(200, this.stats);
    }
    if (path === '/.well-known/nodeinfo') {
      return json(200, {
        links: [
          { rel: FIXTURES.nodeinfo.links[0].rel, href: `http://${this.host}/nodeinfo/2.0.json` },
        ],
      });
    }
    if (path === '/api/v1/oauth-clients/local') {
      const asked = headers.host ?? target.host;
      if (asked !== this.host) {
        return json(403, {
          status: 403,
          detail: `Getting client tokens for host ${asked} is forbidden`,
        });
      }
      return json(200, { client_id: 'client-id', client_secret: 'client-secret' });
    }
    if (path === '/api/v1/users/token' && method === 'POST') {
      return this.token(new URLSearchParams(body));
    }
    if (path.startsWith('/api/v1/users/me')) {
      const token = (headers.authorization ?? '').replace(/^Bearer /, '');
      if (!this.accessTokens.has(token)) {
        return json(401, { status: 401, detail: 'Token is invalid' });
      }
      if (path === '/api/v1/users/me') {
        return json(200, {
          ...FIXTURES.me,
          username: this.username,
          account: { ...FIXTURES.me.account, name: this.username, host: this.host },
          videoChannels: [...new Set(this.channels.values())]
            .filter((channel) => channel.host === this.host)
            .map((channel) => ({ name: channel.name, followersCount: channel.followers })),
        });
      }
      if (path === '/api/v1/users/me/notifications') {
        return json(200, { total: this.unread, data: [] });
      }
    }
    const channelPath = /^\/api\/v1\/video-channels\/([^/]+)(\/videos)?$/.exec(path);
    if (channelPath) {
      const channel = this.channels.get(decodeURIComponent(channelPath[1]));
      if (!channel) {
        return json(404, FIXTURES.missing);
      }
      if (!channelPath[2]) {
        return json(200, {
          ...FIXTURES.channel,
          name: channel.name,
          host: channel.host,
          displayName: channel.displayName,
          followersCount: channel.followers,
          url: `http://${channel.host}/video-channels/${channel.name}`,
        });
      }
      const live = target.searchParams.get('isLive') === 'true';
      const countParam = Number(target.searchParams.get('count') ?? 15);
      const list = [...(live ? channel.lives : channel.videos)].sort(
        (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
      );
      return json(200, { total: list.length, data: list.slice(0, countParam) });
    }
    if (path.startsWith('/lazy-static/thumbnails/')) {
      return {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
        body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, ...Buffer.from(path)]),
      };
    }
    return json(404, { status: 404 });
  }

  token(form) {
    if (form.get('client_id') !== 'client-id' || form.get('client_secret') !== 'client-secret') {
      return json(400, { code: 'invalid_client' });
    }
    const grant = form.get('grant_type');
    if (grant === 'refresh_token') {
      if (!this.refreshTokens.has(form.get('refresh_token'))) {
        return json(400, { code: 'invalid_grant' });
      }
    } else if (grant === 'password') {
      if (form.get('username') !== this.username || form.get('password') !== this.password) {
        return json(400, {
          code: 'invalid_grant',
          detail: 'Invalid grant: user credentials are invalid',
        });
      }
      if (this.twoFactor) {
        return json(401, { code: 'missing_two_factor' }, { 'x-peertube-otp': 'required; app' });
      }
    } else {
      return json(400, { code: 'unsupported_grant_type' });
    }
    sequence += 1;
    const access = `access-${sequence}`;
    const refresh = `refresh-${sequence}`;
    this.accessTokens.add(access);
    this.refreshTokens.add(refresh);
    return json(200, {
      token_type: 'Bearer',
      access_token: access,
      refresh_token: refresh,
      expires_in: 86399,
      refresh_token_expires_in: 1209599,
    });
  }
}

/** Routes requests by origin to fake instances; anything else is unreachable. */
export function createNetwork(servers = {}) {
  return {
    servers,
    async request(url, options) {
      const origin = new URL(url).origin;
      const server = Object.entries(servers).find(([base]) => new URL(base).origin === origin);
      if (!server) {
        const error = new Error('connect EHOSTUNREACH');
        error.code = 'EHOSTUNREACH';
        throw error;
      }
      return server[1].handle(url, options);
    },
  };
}
