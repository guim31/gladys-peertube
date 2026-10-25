// -----------------------------------------------------------------------------
// The client on the real answers of framatube.org (PeerTube 8.3.1) and of a
// PeerTube 7.3.0 in Docker: the fields it reads are there in both versions.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PeertubeClient } from '../src/peertube/client.js';

const fixture = (name) =>
  readFileSync(new URL(`./fixtures/peertube/${name}.json`, import.meta.url));

/** A request seam answering one fixture per path. */
function replay(version) {
  const routes = [
    [/^\/api\/v1\/config$/, 'config'],
    [/^\/api\/v1\/server\/stats$/, 'stats'],
    [/^\/api\/v1\/video-channels\/[^/]+$/, 'channel'],
    [/videos\?.*isLive=true/, 'lives'],
    [/videos\?.*isLive=false/, 'videos'],
  ];
  return async (url) => {
    const { pathname, search } = new URL(url);
    const route = routes.find(([pattern]) => pattern.test(`${pathname}${search}`));
    return route
      ? { status: 200, headers: {}, body: fixture(`${version}-${route[1]}`) }
      : { status: 404, headers: {}, body: Buffer.from('{}') };
  };
}

test('framatube.org, PeerTube 8.3.1', async () => {
  const client = new PeertubeClient({ url: 'https://framatube.org', request: replay('v8') });
  assert.deepEqual(await client.config(), { version: '8.3.1', name: 'Framatube' });
  const stats = await client.stats();
  assert.ok(stats.localVideos > 0 && stats.users > 0 && stats.following > 0);
  const channel = await client.channel('joinpeertube');
  assert.equal(`${channel.name}@${channel.host}`, 'joinpeertube@framatube.org');
  assert.ok(channel.followers > 0);
  const { total, videos } = await client.videos('joinpeertube');
  assert.ok(total >= videos.length && videos.length > 0);
  const [video] = videos;
  assert.match(video.uuid, /^[0-9a-f-]{36}$/);
  assert.match(video.url, /^https:\/\/framatube\.org\/videos\/watch\//);
  assert.match(video.thumbnailPath, /^\/lazy-static\/thumbnails\//);
  assert.ok(Date.parse(video.publishedAt) > 0);
  assert.equal(video.isLive, false);
  assert.equal(video.channel, 'A propos de PeerTube');
  assert.deepEqual((await client.videos('joinpeertube', { live: true })).videos, []);
});

test('PeerTube 7.3.0: a live on air', async () => {
  const request = async (url) => {
    const { search } = new URL(url);
    return {
      status: 200,
      headers: {},
      body: fixture(search.includes('isLive=true') ? 'v7-live-lives' : 'v7-videos'),
    };
  };
  const client = new PeertubeClient({ url: 'http://192.0.2.30:9000', request });
  const { videos } = await client.videos('gladys_test', { live: true });
  assert.equal(videos.length, 1);
  assert.equal(videos[0].isLive, true);
  assert.equal(videos[0].viewers, 0);
  assert.equal(videos[0].channel, 'Gladys Test');
});

test('errors: not PeerTube, not found, 429, redirect, unreachable, TLS', async () => {
  const answer =
    (status, body = '{}', headers = {}) =>
    async () => ({
      status,
      headers,
      body: Buffer.from(body),
    });
  const kind = async (request, call) => {
    const client = new PeertubeClient({ url: 'https://tube.example.org', request });
    try {
      await call(client);
    } catch (err) {
      return err.kind;
    }
    return 'none';
  };
  assert.equal(await kind(answer(200, '<html>'), (c) => c.config()), 'not_peertube');
  assert.equal(await kind(answer(200, '{"a":1}'), (c) => c.config()), 'not_peertube');
  assert.equal(await kind(answer(404), (c) => c.config()), 'not_peertube');
  assert.equal(await kind(answer(404), (c) => c.channel('x')), 'not_found');
  assert.equal(await kind(answer(429), (c) => c.stats()), 'rate_limited');
  assert.equal(await kind(answer(301), (c) => c.stats()), 'redirect');
  assert.equal(await kind(answer(502), (c) => c.stats()), 'http');
  const fail = (code) => async () => {
    const error = new Error(code);
    error.code = code;
    throw error;
  };
  assert.equal(await kind(fail('ECONNREFUSED'), (c) => c.stats()), 'unreachable');
  assert.equal(await kind(fail('DEPTH_ZERO_SELF_SIGNED_CERT'), (c) => c.stats()), 'tls');
});
