// -----------------------------------------------------------------------------
// Configuration: the address of the instance, the channel handles in every
// form a user may paste, the account and the defaults.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_CONFIG,
  MAX_CHANNELS,
  isLocalHost,
  normalizeConfig,
  parseChannel,
  parseInstanceUrl,
} from '../src/config.js';

test('the instance address: public in HTTPS, local in HTTP, pages and slashes dropped', () => {
  assert.equal(parseInstanceUrl('framatube.org'), 'https://framatube.org');
  assert.equal(parseInstanceUrl(' https://framatube.org/ '), 'https://framatube.org');
  assert.equal(
    parseInstanceUrl('https://framatube.org/w/9dRFC6Ya11NCVeYKn8ZhiD'),
    'https://framatube.org',
  );
  assert.equal(
    parseInstanceUrl('https://framatube.org/c/joinpeertube/videos'),
    'https://framatube.org',
  );
  assert.equal(parseInstanceUrl('192.0.2.30:9000'), 'http://192.0.2.30:9000');
  assert.equal(parseInstanceUrl('192.168.1.20'), 'http://192.168.1.20');
  assert.equal(parseInstanceUrl('peertube.local'), 'http://peertube.local');
  assert.equal(
    parseInstanceUrl('https://example.org/tube/videos/local'),
    'https://example.org/tube',
  );
  assert.equal(parseInstanceUrl('ftp://example.org'), null);
  assert.equal(parseInstanceUrl('https://user:pass@example.org'), null);
  assert.equal(parseInstanceUrl(''), null);
});

test('local hosts', () => {
  assert.equal(isLocalHost('192.168.1.2'), true);
  assert.equal(isLocalHost('peertube'), true);
  assert.equal(isLocalHost('[fd00::1]'), true);
  assert.equal(isLocalHost('framatube.org'), false);
  assert.equal(isLocalHost('fdroid.example.org'), false);
  assert.equal(isLocalHost('172.32.0.1'), false);
});

test('channel handles in every form', () => {
  const host = 'framatube.org';
  assert.equal(parseChannel('joinpeertube', host), 'joinpeertube');
  assert.equal(parseChannel('@JoinPeerTube', host), 'joinpeertube');
  assert.equal(parseChannel('joinpeertube@framatube.org', host), 'joinpeertube');
  assert.equal(
    parseChannel('blender_channel@video.blender.org', host),
    'blender_channel@video.blender.org',
  );
  assert.equal(parseChannel('@mooc.chatons.1@framatube.org', host), 'mooc.chatons.1');
  assert.equal(parseChannel('https://framatube.org/c/framaconf/videos', host), 'framaconf');
  assert.equal(
    parseChannel('https://video.blender.org/video-channels/blender_channel', host),
    'blender_channel@video.blender.org',
  );
  assert.equal(parseChannel('name@local.example:9000', 'other'), 'name@local.example:9000');
  assert.equal(parseChannel('not a handle!', host), null);
  assert.equal(parseChannel('a@b@c', host), null);
});

test('normalizeConfig: defaults, channels, account', () => {
  const config = normalizeConfig({
    url: 'framatube.org',
    channels: 'joinpeertube, framaconf\n@joinpeertube  bad!handle',
    username: 'alice',
    password: ' pass ',
    poll_interval: '300',
  });
  assert.deepEqual(config.channels, ['joinpeertube', 'framaconf']);
  assert.deepEqual(config.invalidChannels, ['bad!handle']);
  assert.equal(config.password, ' pass ');
  assert.equal(config.pollIntervalMs, 300_000);
  assert.equal(config.language, DEFAULT_CONFIG.language);
  // A user name without a password is no account.
  assert.equal(normalizeConfig({ url: 'x.org', username: 'alice' }).username, '');
  assert.equal(normalizeConfig({ url: 'x.org', poll_interval: 7 }).pollIntervalMs, 120_000);
  const many = Array.from({ length: 30 }, (_, index) => `c${index}`).join(',');
  assert.equal(normalizeConfig({ url: 'x.org', channels: many }).channels.length, MAX_CHANNELS);
  assert.equal(normalizeConfig({ url: 'nope://' }).invalidUrl, true);
});
