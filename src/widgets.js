// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `latest_videos`.
//
// The use case: what the followed channels published, at a glance on the wall
// tablet. The lives on air first (one status row per live, with its viewers),
// the unread notifications of the account when there is one, then the latest
// videos as a poster grid (thumbnail, title, channel, date; a tap opens the
// detail panel with a link to the video when the instance is in HTTPS). Read
// only: no button.
//
// The thumbnails are served by the integration (`onWidgetGetImage`): the
// browser never loads a third-party address. Their key derives from their
// path, which changes with the image, so the one-hour cache of the core is
// right.
// -----------------------------------------------------------------------------

import { createHash } from 'node:crypto';
import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { ERROR_KINDS, WIDGET_KEY } from './hub.js';
import { ERROR_TEXT, pick } from './texts.js';

// Posters of the grid (the core accepts 12; 6 stay readable on a tablet).
const GRID_SIZE = 6;
// The core refuses an image over 300 KB decoded.
const MAX_IMAGE_BYTES = 300 * 1024;
// Thumbnails kept in memory (bytes), the oldest dropped first.
const IMAGE_CACHE_SIZE = 24;

export const TEXT = {
  pick: {
    en: 'Enter the address of a PeerTube instance in the configuration of the integration.',
    fr: "Saisissez l'adresse d'une instance PeerTube dans la configuration de l'intégration.",
    de: 'Gib die Adresse einer PeerTube-Instanz in der Konfiguration der Integration ein.',
    es: 'Introduzca la dirección de una instancia PeerTube en la configuración de la integración.',
  },
  waiting: {
    en: 'Waiting for the first reading of PeerTube…',
    fr: 'En attente de la première lecture de PeerTube…',
    de: 'Warte auf die erste Abfrage von PeerTube…',
    es: 'Esperando la primera lectura de PeerTube…',
  },
  noChannel: {
    en: 'Add the channels to follow in the configuration of the integration.',
    fr: "Ajoutez les chaînes à suivre dans la configuration de l'intégration.",
    de: 'Füge die zu folgenden Kanäle in der Konfiguration der Integration hinzu.',
    es: 'Añada los canales que desea seguir en la configuración de la integración.',
  },
  none: {
    en: 'No video yet on the followed channels.',
    fr: 'Aucune vidéo pour le moment sur les chaînes suivies.',
    de: 'Noch kein Video auf den gefolgten Kanälen.',
    es: 'Todavía no hay vídeos en los canales seguidos.',
  },
  live: { en: 'Live', fr: 'En direct', de: 'Live', es: 'En directo' },
  viewers: {
    en: (count) => `Live · ${count} viewer${count === 1 ? '' : 's'}`,
    fr: (count) => `En direct · ${count} spectateur${count > 1 ? 's' : ''}`,
    de: (count) => `Live · ${count} Zuschauer`,
    es: (count) => `En directo · ${count} espectador${count === 1 ? '' : 'es'}`,
  },
  unread: {
    en: 'Notifications',
    fr: 'Notifications',
    de: 'Benachrichtigungen',
    es: 'Notificaciones',
  },
  watch: { en: 'Watch', fr: 'Regarder', de: 'Ansehen', es: 'Ver' },
  offline: { en: 'Offline', fr: 'Hors ligne', de: 'Offline', es: 'Sin conexión' },
  problem: { en: 'Error', fr: 'Erreur', de: 'Fehler', es: 'Error' },
};

const t = (text, language) => pick(text, language);
const fit = (text, max) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);

function message(text, language) {
  return {
    ttl_seconds: 300,
    components: [{ type: 'text', variant: 'body', text: fit(t(text, language), 300) }],
  };
}

/** The key of a thumbnail: stable for one path, new when the image changes. */
export const imageKey = (path) =>
  `thumb-${createHash('sha256').update(path).digest('hex').slice(0, 24)}`;

/** The thumbnails a content refers to, by key (filled by `get`). */
const imagePaths = new Map();
/** Their bytes, read once from the instance. */
const imageCache = new Map();

/** One poster of the grid. */
export function videoItem(video, language) {
  const item = { title: fit(video.title || '…', 60), subtitle: fit(video.channel || '', 60) };
  const date = new Date(video.publishedAt);
  if (Number.isFinite(date.getTime())) {
    item.date = date.toISOString();
  }
  if (video.thumbnailPath) {
    item.image = imageKey(video.thumbnailPath);
    imagePaths.set(item.image, video.thumbnailPath);
  }
  // The core keeps https links only.
  if (/^https:\/\//.test(video.url ?? '')) {
    item.links = [{ url: video.url, label: t(TEXT.watch, language) }];
  }
  if (!item.subtitle) {
    delete item.subtitle;
  }
  return item;
}

async function get(hub, { language = 'en' } = {}) {
  if (!hub.client) {
    return message(TEXT.pick, language);
  }
  if (hub.error) {
    const unreachable = hub.error.kind === ERROR_KINDS.UNREACHABLE;
    return {
      ttl_seconds: 120,
      components: [
        {
          type: 'status',
          items: [
            {
              label: 'PeerTube',
              icon: 'alert-triangle',
              value: fit(t(unreachable ? TEXT.offline : TEXT.problem, language), 40),
              color: WIDGET_COLORS.DANGER,
            },
          ],
        },
        { type: 'text', variant: 'body', text: fit(t(ERROR_TEXT[hub.error.kind], language), 300) },
      ],
    };
  }
  if (!hub.instance.reachable) {
    return message(TEXT.waiting, language);
  }
  if (hub.config.channels.length === 0 && !hub.client.hasAccount) {
    return message(TEXT.noChannel, language);
  }
  const components = [];
  if (hub.client.hasAccount && hub.account.unread !== null) {
    components.push({
      type: 'value',
      value: hub.account.unread,
      label: t(TEXT.unread, language),
      icon: 'bell',
      color: hub.account.unread ? WIDGET_COLORS.INFO : WIDGET_COLORS.NEUTRAL,
    });
  }
  const lives = hub.lives().slice(0, 10);
  if (lives.length) {
    const viewers = pick(TEXT.viewers, language);
    components.push({
      type: 'status',
      items: lives.map((live) => ({
        label: fit(`${live.channel} · ${live.title}`, 40),
        icon: 'radio',
        value: fit(viewers(live.viewers), 40),
        color: WIDGET_COLORS.DANGER,
      })),
    });
  }
  const videos = hub.recent().slice(0, GRID_SIZE);
  components.push(
    videos.length
      ? {
          type: 'card-list',
          display: 'grid',
          items: videos.map((video) => videoItem(video, language)),
        }
      : { type: 'text', variant: 'body', text: t(TEXT.none, language) },
  );
  return { ttl_seconds: 300, components };
}

async function action(hub, { actionKey }) {
  // No button: nothing to run.
  throw new Error(`Unknown action ${actionKey}`);
}

/** `onWidgetGetImage`: the raw base64 of a thumbnail of the grid. */
export async function getImage(hub, key) {
  if (imageCache.has(key)) {
    return imageCache.get(key);
  }
  const path = imagePaths.get(key);
  if (!path || !hub.client) {
    throw new Error(`Unknown image ${key}`);
  }
  const bytes = await hub.client.image(path);
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) {
    throw new Error(`Image ${key}: ${bytes.length} bytes`);
  }
  const base64 = bytes.toString('base64');
  imageCache.set(key, base64);
  while (imageCache.size > IMAGE_CACHE_SIZE) {
    imageCache.delete(imageCache.keys().next().value);
  }
  while (imagePaths.size > 4 * IMAGE_CACHE_SIZE) {
    imagePaths.delete(imagePaths.keys().next().value);
  }
  return base64;
}

export const WIDGETS = {
  [WIDGET_KEY]: { get, action },
};
