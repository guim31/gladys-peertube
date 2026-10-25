# PeerTube for Gladys Assistant

[PeerTube](https://joinpeertube.org/) (the free and federated video platform of
Framasoft) in [Gladys Assistant](https://gladysassistant.com): the new videos
and the lives of the channels you follow, the figures of the instance and, with
your account, your unread notifications. Read only.

Tested for real against PeerTube 7.3.0 (Docker: account, channel, uploads, RTMP
live) and the public instance framatube.org (PeerTube 8.3.1).

## What it does

- **Devices** (read only, in the Discover tab):
  - the instance: online, local videos, views of the local videos, users,
    instances followed;
  - one per channel followed (local, or `name@host` of another instance): live
    on air, live viewers, last video, its date, followers, videos;
  - with an account: unread notifications, followers of your channels.
- **Scene triggers**: new video, live started, live ended (with its duration and
  peak of viewers), each filterable on a channel.
- **Scene action**: read the latest videos (a ready-made sentence and the
  details), for all channels or one.
- **Dashboard widget**: lives on air, unread notifications, and the latest
  videos as a poster grid with their thumbnails.

## Requirements

- Gladys Assistant 5.1.0 or later.
- A PeerTube instance reachable from Gladys: yours on the network, or a public
  one (HTTPS).
- Optional: an account on that instance (user name and password; no two-factor
  authentication, no OpenID Connect or SAML login).

## Installation

In Gladys: **Integrations → Install from GitHub**, then enter
`https://github.com/guim31/gladys-peertube`. Fill in the configuration (address
of the instance, channels, optional account), then add the devices from the
Discover tab. The full guide: [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)).

## How it works

The integration reads the REST API of PeerTube (`/api/v1`) on its own timer (1,
2, 5 or 10 minutes): the counters of the instance, then per channel its latest
videos and its lives on air (two requests), its page every 15 minutes. With an
account it logs in like the web interface (OAuth 2 password grant, the local
client of the instance), keeps the token in memory only and refreshes it. A
local instance reached by its IP address is handled: PeerTube only gives its
OAuth client to its own host name, which the integration reads in
`/.well-known/nodeinfo`.

What was seen (videos, lives on air) is kept under `/data`, so a restart
announces nothing twice, and the first reading of a channel announces nothing.

## Limits

- Read only: no upload, comment or subscription from Gladys.
- A live is seen at the next reading; one that stops and resumes between two
  readings is not seen as ended.
- At most 5 new videos per channel are announced per reading.
- A remote channel must be known by the instance configured (federation).
- No webhook (the sandbox has no inbound port): PeerTube is read periodically.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests run against the fake Gladys of the SDK and an in-memory PeerTube that
answers with the shapes of real answers (`test/fixtures/peertube/`, captured
from PeerTube 7.3.0 in Docker and framatube.org, 8.3.1). See
[`CLAUDE.md`](CLAUDE.md) for the architecture and the pitfalls.

## Credits

- [PeerTube](https://github.com/Chocobozzz/PeerTube) by Framasoft and its
  contributors (AGPL-3.0). The logo of the cover is the official one
  ([`client/src/assets/images/logo.svg`](https://github.com/Chocobozzz/PeerTube/blob/develop/client/src/assets/images/logo.svg),
  public domain on
  [Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Logo_de_PeerTube.svg)).
  No code of PeerTube is copied: the integration only uses its public REST API.
- Built on the official
  [integration template](https://github.com/GladysAssistant/integration-template-js)
  and SDK of Gladys Assistant.

Not affiliated with Framasoft or the PeerTube project. Licensed under the
[Apache License 2.0](LICENSE).
