// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake PeerTube on a fake
// network, a temporary /data and a manual clock, with the integration wired on
// top through registerHandlers. No timer runs unless `timers: true`: the tests
// read PeerTube with `world.hub.pollAll()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { FakePeertube, createNetwork } from './fakePeertube.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/Paris';

export const PEERTUBE_URL = 'http://192.0.2.30:9000';
export const HOST = 'peertube.example.org:9000';

/** A manual clock (local time, Europe/Paris). */
export function createClock(start = Date.parse('2026-10-25T10:00:00+02:00')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = {
  url: '192.0.2.30:9000',
  channels: 'gladys_test, blender@video.example.net',
  language: 'en',
};

/** An instance with a local channel (two videos) and a remote one (one video). */
export function defaultPeertube(clock = createClock()) {
  const peertube = new FakePeertube();
  const at = (minutesAgo) => new Date(clock.time - minutesAgo * 60_000).toISOString();
  const local = peertube.addChannel('gladys_test', { displayName: 'Gladys Test', followers: 4 });
  peertube.addVideo(local, 'Older clip', { publishedAt: at(3000) });
  peertube.addVideo(local, 'Gladys test clip', { publishedAt: at(600) });
  const remote = peertube.addChannel('blender', {
    displayName: 'Blender',
    host: 'video.example.net',
    followers: 1200,
  });
  peertube.addVideo(remote, 'Sprite Fright', { publishedAt: at(1440), duration: 629 });
  return peertube;
}

/**
 * @param {object} [options]
 * @param {FakePeertube} [options.peertube]
 * @param {object} [options.config] raw integration config
 */
export async function createWorld({
  clock = createClock(),
  peertube = defaultPeertube(clock),
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-peertube-')),
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork({ [PEERTUBE_URL]: peertube });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  const channel = (handle) => peertube.channels.get(handle);
  const publish = (handle, title, options = {}) =>
    peertube.addVideo(channel(handle), title, {
      publishedAt: new Date(clock.time).toISOString(),
      ...options,
    });
  return {
    gladys,
    fake: gladys.fake,
    network,
    peertube,
    app,
    hub: app.hub,
    clock,
    dataDir,
    channel,
    publish,
  };
}

const platform = (value) => value.toLowerCase().replace(/:/g, '-');
export const instanceIds = (gladys) => gladys.externalIds('instance', '192.0.2.30-9000');
export const channelIds = (gladys, handle) => gladys.externalIds('channel', platform(handle));
export const accountIds = (gladys, handle = `root@${HOST}`) =>
  gladys.externalIds('account', platform(handle));

export { FakePeertube };
