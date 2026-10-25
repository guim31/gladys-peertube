// -----------------------------------------------------------------------------
// The `latest_videos` widget: content valid for the core (budget, vocabulary),
// in every language, with lives on air and the account, the thumbnails it
// serves, and its messages.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { CONFIG, createWorld } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const get = async (w, language = 'en') => {
  const ack = await w.fake.widgetGet('latest_videos', { settings: {}, language });
  assert.equal(ack.success, true, ack.error);
  assert.deepEqual(validateWidgetContent(ack.data.content), [], JSON.stringify(ack.data));
  return ack.data.content.components;
};

test('the widget shows the lives, the notifications and the latest videos, in every language', async (t) => {
  const w = await world(t, {
    config: { ...CONFIG, username: 'root', password: 'secret-password' },
  });
  w.clock.advance(60_000);
  w.publish('gladys_test', 'x'.repeat(80));
  w.peertube.startLive(w.channel('gladys_test'), 'Sunday stream', { viewers: 1 });
  w.peertube.unread = 2;
  await w.hub.pollAll();
  for (const language of ['en', 'fr', 'de', 'es']) {
    const components = await get(w, language);
    assert.deepEqual(
      components.map((component) => component.type),
      ['value', 'status', 'card-list'],
    );
    assert.equal(components[0].value, 2);
    assert.equal(components[1].items[0].label, 'Gladys Test · Sunday stream');
    const grid = components[2];
    assert.equal(grid.display, 'grid');
    assert.equal(grid.items.length, 4);
    assert.equal(grid.items[0].title.length, 60);
    assert.equal(grid.items[0].subtitle, 'Gladys Test');
    assert.match(grid.items[0].image, /^thumb-[0-9a-f]{24}$/);
    // A local instance in HTTP: no link (the core keeps https only).
    assert.equal(grid.items[0].links, undefined);
  }
  const [, status] = await get(w, 'fr');
  assert.equal(status.items[0].value, 'En direct · 1 spectateur');
});

test('the thumbnails are served by the integration, from the instance', async (t) => {
  const w = await world(t);
  const [grid] = await get(w);
  const key = grid.items[0].image;
  const ack = await w.fake.widgetGetImage(key);
  assert.equal(ack.success, true, ack.error);
  const bytes = Buffer.from(ack.data.image, 'base64');
  assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff]);
  const reads = w.peertube.requests.filter((r) => r.path.startsWith('/lazy-static/')).length;
  await w.fake.widgetGetImage(key);
  assert.equal(
    w.peertube.requests.filter((r) => r.path.startsWith('/lazy-static/')).length,
    reads,
    'kept in memory',
  );
  const unknown = await w.fake.widgetGetImage('thumb-000000000000000000000000');
  assert.equal(unknown.success, false);
});

test('an https instance links each video', async (t) => {
  const w = await createWorld({ connect: false, config: { ...CONFIG, url: 'tube.example.org' } });
  t.after(() => w.app.stop());
  const peertube = w.peertube;
  peertube.base = 'https://tube.example.org';
  for (const channel of new Set(peertube.channels.values())) {
    for (const video of channel.videos) {
      video.url = video.url.replace(/^http:\/\/[^/]+/, 'https://tube.example.org');
    }
  }
  w.network.servers['https://tube.example.org'] = peertube;
  await w.gladys.connect();
  await w.app.ready;
  const [grid] = await get(w, 'de');
  assert.deepEqual(grid.items[0].links, [{ url: grid.items[0].links[0].url, label: 'Ansehen' }]);
  assert.match(grid.items[0].links[0].url, /^https:\/\/tube\.example\.org\/videos\/watch\//);
});

test('the messages: no address, no channel, PeerTube down', async (t) => {
  const empty = await world(t, { config: { url: '', language: 'en' } });
  const [pick] = await get(empty);
  assert.match(pick.text, /Enter the address/);

  const none = await world(t, { config: { ...CONFIG, channels: '' } });
  const [noChannel] = await get(none, 'fr');
  assert.match(noChannel.text, /Ajoutez les chaînes/);

  const w = await world(t);
  w.peertube.down = true;
  await w.hub.pollAll();
  const [status, text] = await get(w, 'es');
  assert.equal(status.items[0].value, 'Sin conexión');
  assert.match(text.text, /PeerTube no responde/);
});
