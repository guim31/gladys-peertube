// -----------------------------------------------------------------------------
// What the integration writes at the default level (info): the lifecycle
// only (a new video or a live goes to debug, like any reading). A normal
// reading writes nothing, a failure that repeats is logged once, and its end
// once. Never the password nor a token.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG, createWorld } from './helpers/world.js';

const ACCOUNT = { ...CONFIG, username: 'root', password: 'secret-password' };

/** Capture the lines of the SDK logger at LOG_LEVEL=info. */
function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  const lines = [];
  const record =
    (stream) =>
    (...args) =>
      lines.push({
        stream,
        text: args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '),
      });
  t.mock.method(console, 'log', record('out'));
  t.mock.method(console, 'error', record('err'));
  return {
    lines,
    clear: () => lines.splice(0),
    texts: () => lines.map((line) => line.text),
  };
}

async function world(t, options = {}) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

test('a normal reading cycle writes nothing at info', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t, { config: ACCOUNT });
  assert.ok(
    logs.texts().some((text) => text.includes('connected')),
    'the start is logged',
  );
  logs.clear();
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(20 * 60_000);
    w.peertube.unread = i;
    await w.hub.pollAll();
  }
  assert.deepEqual(logs.texts(), []);
});

test('a new video and a live are one line each at debug', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t);
  logs.clear();
  w.clock.advance(60_000);
  w.publish('gladys_test', 'Fresh one');
  w.peertube.startLive(w.channel('gladys_test'), 'On air');
  await w.hub.pollAll();
  const news = logs.texts().filter((text) => /PeerTube: (new video|live)/.test(text));
  assert.equal(news.length, 2, logs.texts().join('\n'));
  assert.match(news[0], /\[DEBUG\].*new video "Fresh one"/);
  assert.match(news[1], /\[DEBUG\].*live started "On air"/);
});

test('an instance that stays down is logged once, and once when it is back', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.peertube.down = true;
  for (let i = 0; i < 6; i += 1) {
    w.clock.advance(60_000);
    await w.hub.pollAll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.equal(logs.lines[0].stream, 'err');
  logs.clear();
  w.peertube.down = false;
  await w.hub.pollAll();
  await w.hub.pollAll();
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /connection restored/);
});

test('a refused password is logged once, never the password', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t, { config: { ...ACCOUNT, password: 'wrong-pass-42' } });
  for (let i = 0; i < 5; i += 1) {
    w.clock.advance(60 * 60_000);
    await w.hub.pollAll();
  }
  const warnings = logs.lines.filter((line) => line.stream === 'err');
  assert.equal(warnings.length, 1, logs.texts().join('\n'));
  assert.match(warnings[0].text, /login refused/);
  assert.ok(!logs.texts().join('\n').includes('wrong-pass-42'), 'never the password');
});

test('a channel that fails is logged once, the rest keeps working', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  const original = w.peertube.handle.bind(w.peertube);
  w.peertube.handle = (url, options) =>
    url.includes('/video-channels/gladys_test/videos')
      ? { status: 500, headers: {}, body: Buffer.from('') }
      : original(url, options);
  for (let i = 0; i < 4; i += 1) {
    await w.hub.pollAll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /PeerTube channel gladys_test: .*HTTP 500/);
  assert.equal(w.hub.error, null);
  w.peertube.handle = original;
  await w.hub.pollAll();
  assert.match(logs.texts().at(-1), /read again/);
});

test('Gladys refusing the states is logged once', async (t) => {
  const logs = captureLogs(t);
  const w = await world(t);
  logs.clear();
  w.gladys.publishStates = async () => {
    throw new Error('HTTP 500');
  };
  for (let i = 0; i < 4; i += 1) {
    w.clock.advance(60_000);
    w.publish('gladys_test', `Clip ${i}`);
    await w.hub.pollAll();
  }
  assert.equal(logs.lines.length, 1, logs.texts().join('\n'));
  assert.match(logs.lines[0].text, /States refused/);
});

test('LOG_LEVEL=debug shows each reading problem; never the password nor a token', async (t) => {
  const logs = captureLogs(t, 'debug');
  const w = await world(t, { config: ACCOUNT });
  w.peertube.down = true;
  await w.hub.pollAll();
  await w.hub.pollAll();
  const text = logs.texts().join('\n');
  assert.match(text, /\[DEBUG\].*again/);
  assert.ok(!text.includes('secret-password'), 'never the password');
  assert.ok(!/access-\d|refresh-\d|client-secret/.test(text), 'nor a token');
});
