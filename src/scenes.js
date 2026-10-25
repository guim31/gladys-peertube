// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+).
//
// `read_latest`: read PeerTube now and give a sentence for a message or a
// voice announcement (the lives on air, the latest videos of all the followed
// channels or of one), and the details separately for the conditions and the
// next actions of the scene. Read only.
// -----------------------------------------------------------------------------

import { RECENT_SIZE } from './hub.js';

export const LATEST_COUNTS = ['1', '3', '5'];
export const DEFAULT_LATEST_COUNT = '3';

export const SCENE_ACTIONS = {
  async read_latest(hub, { fields = {} }) {
    hub.ensureInstance();
    // Read now: the sentence says what is true at the time of the scene.
    await hub.refresh();
    const raw = String(fields.count ?? DEFAULT_LATEST_COUNT);
    const count = Math.min(
      Number(LATEST_COUNTS.includes(raw) ? raw : DEFAULT_LATEST_COUNT),
      RECENT_SIZE,
    );
    const channel = typeof fields.channel === 'string' && fields.channel ? fields.channel : null;
    const reachable = Boolean(hub.instance.reachable);
    const last = reachable ? hub.recent(channel)[0] : null;
    const lives = reachable
      ? hub.lives().filter((live) => !channel || hub.liveChannel(live.uuid) === channel)
      : [];
    return {
      summary: hub.summary(count, channel),
      live: lives.length > 0,
      live_title: lives[0]?.title ?? '',
      last_title: last?.title ?? '',
      last_channel: last?.channel ?? '',
      last_url: last?.url ?? '',
    };
  },
};
