# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

The integration stores under `/data` only the address of the instance read
last and, per channel followed, its name, its counts, the ids of the videos
already seen, the lives on air and the titles, dates, addresses and thumbnail
paths of its latest videos: all public data. The user name and password of the
account stay in the configuration of Gladys: the password is sent to the
configured instance only, in the body of its token request (prefer HTTPS for a
public instance), and never written to the logs nor to `/data`. The access and
refresh tokens stay in memory. The integration only reads the REST API of the
instance configured (GET requests, plus the token requests), and the
thumbnails it shows in the widget; no inbound port, no other service.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and PeerTube itself.
