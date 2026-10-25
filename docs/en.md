# PeerTube

[PeerTube](https://joinpeertube.org/) is the free and federated video platform
developed by Framasoft. This integration follows an instance (yours, or any
public one) and the channels you choose in Gladys: the new videos, the lives on
air, the figures of the instance and, with your account, your unread
notifications. It only reads: it never publishes, comments or changes anything
on PeerTube.

Tested for real against PeerTube 7.3.0 (in Docker, with an account, a channel,
uploads and an RTMP live) and against framatube.org (PeerTube 8.3.1).

## What you need

- Gladys Assistant 5.1.0 or later.
- The address of a PeerTube instance: yours on your network
  (`http://192.168.1.20:9000`), or a public one (`https://framatube.org`).
- The handles of the channels to follow. A handle is the end of the address of
  the channel page: `https://framatube.org/c/joinpeertube` gives
  `joinpeertube`. A channel of another instance is written `name@host`
  (`blender_channel@video.blender.org`): the instance you configured must know
  it (federation), which is always the case for a channel it follows or that one
  of its users follows.
- Optional: the user name and password of your account on this instance.

## Set up

1. In Gladys, open **Integrations**, install **PeerTube**, then open its
   **Configuration** tab.
2. **Instance address**: the address of the PeerTube site, as in your browser.
   A bare address is understood: `framatube.org` (HTTPS), `192.168.1.20:9000`
   (HTTP on your network).
3. **Channels to follow**: the handles, separated by commas (20 at most). The
   address of a channel page is accepted too.
4. **Account (optional)**: your **User name** and **Password**. Leave them
   empty to read the public pages only.
5. **Refresh interval**: 1, 2 (default), 5 or 10 minutes. Each reading makes two
   light requests per channel, and one or two for the account. A live is seen at
   most this late.
6. **Language of the names**: the language of the feature names (set when a
   device is added), of the dates and of the sentence of the scene action.
7. Save, then use **Test the connection**: it answers with the name and version
   of the instance, the channels found and the account.
8. Open the **Discover** tab and add the devices you want.

## The devices

All the devices are read only. Gladys never polls them: the integration reads
PeerTube on its own timer, at the refresh interval.

### The instance

**PeerTube** followed by the name of the instance:

- **Online**: the instance answers.
- **Local videos**: the videos published on the instance itself.
- **Views of the local videos**: their views, all together.
- **Users**: the accounts of the instance.
- **Instances followed**: the other instances it follows.

PeerTube computes these figures every few minutes: they move by steps.

### The channels

One device per channel, named like the channel:

- **Live on air**: the channel is live right now.
- **Live viewers**: the viewers of its live (0 without a live).
- **Last video**: the title of its latest video.
- **Last video published on**: its date and time.
- **Followers**: the followers of the channel.
- **Videos**: its videos (lives on air excluded).

### The account

With an account, **PeerTube** followed by your handle (`name@host`):

- **Unread notifications**: what the bell of PeerTube shows (new comments,
  new followers, videos of your subscriptions, and so on).
- **Followers**: the followers of all your channels together.

## Dashboard

The **PeerTube videos** widget shows, from top to bottom: your unread
notifications (with an account), one line per live on air (channel, title,
viewers), then the six latest videos of the followed channels as a poster grid
(thumbnail, title, channel, date). Tap a video to open its details; on an
instance in HTTPS, a **Watch** link opens it on PeerTube. The thumbnails are
served by the integration: your browser never loads anything from the instance.

## Scenes

### Triggers

- **New PeerTube video**: a followed channel has published a new video. Filter:
  the channel (empty: any). Variables: the channel, its handle, the title, the
  address of the video, its duration (minutes) and its publication date.
- **PeerTube live started**: a followed channel is live. Filter: the channel.
  Variables: the channel, its handle, the title and the address of the live.
- **PeerTube live ended**: a live of a followed channel is over. Filter: the
  channel. Variables: the channel, its handle, the title, the address, the
  duration (minutes, counted from the first reading that saw it) and the peak of
  viewers.

Nothing is announced for what was already there: the first reading of a channel
only learns its videos, and what has been seen is kept across restarts.

### Actions

- **Read the latest PeerTube videos**: reads PeerTube now and gives a sentence
  for a message or a voice announcement ("PeerTube: live now: …; latest videos:
  …"), for all the channels or for one, with 1, 3 or 5 videos named. Outputs:
  the sentence, whether a live is on air, the title of the live, the title,
  channel and address of the last video.

### Scene ideas

- **New PeerTube video** on your favourite channel → send yourself a message
  with `{{triggerEvent.data.title}}` and `{{triggerEvent.data.url}}`.
- **PeerTube live started** → dim the living room lights and announce "The live
  of {{triggerEvent.data.channel_name}} has started" on the speaker.
- Every evening at 7 pm → **Read the latest PeerTube videos**, then send the
  sentence by message.
- **Unread notifications** greater than 0 → turn a light blue.

## Troubleshooting

- **PeerTube does not answer**: check the address and the port (9000 for a
  plain Docker install, none behind a reverse proxy). The container of the
  integration must reach that address.
- **No PeerTube at this address**: the address is the one of the site, not of
  a page of an embed or of an object storage.
- **Channel … not found**: check the handle on the page of the channel. A
  remote channel must be known by the instance: open its page once from the
  instance (search `name@host`), or follow it.
- **The instance limits the requests**: choose a longer interval or fewer
  channels. Public instances limit the API per address.
- **Login refused**: check the user name and the password in the web
  interface of the same instance. Accounts with two-factor authentication, and
  logins through OpenID Connect or SAML, are not supported: leave the account
  empty and use the public part.
- For anything else, set `LOG_LEVEL=debug` and open an issue:
  https://github.com/guim31/gladys-peertube/issues

## Limits

- Read only: no upload, no comment, no subscription from Gladys.
- A live is seen at the next reading, and its duration starts there. A live
  that stops and resumes between two readings is not seen as ended.
- At most 5 new videos of a channel are announced per reading (the latest
  ones): a bigger batch published at once is counted, not all announced.
- A video's thumbnail and link come from the instance configured: a remote
  channel is shown as that instance knows it.
- No webhook: the sandbox of Gladys has no inbound port, so PeerTube is read
  periodically.
- Not affiliated with Framasoft or the PeerTube project.
