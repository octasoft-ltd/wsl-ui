# Add container catalog

Add container opens a searchable collection of developer services, with local logos and category filters. Selecting a service opens the existing creation form with editable settings. Custom image retains the blank creation form. Browsing does not download images or create containers; Create pulls the selected image through WSLc.

## Included recipes

Ports bind to `127.0.0.1` by default. Values below are editable defaults, written as host → container.

| Service | Image on docker.io | Ports | Named-volume paths |
| --- | --- | --- | --- |
| PostgreSQL | `library/postgres:18` | 5432 → 5432 | `/var/lib/postgresql` |
| MariaDB | `library/mariadb:11.8` | 3306 → 3306 | `/var/lib/mysql` |
| Redis | `library/redis:8` | 6379 → 6379 | `/data` |
| Valkey | `valkey/valkey:8` | 6380 → 6379 | `/data` |
| RabbitMQ | `library/rabbitmq:4-management` | 5672 → 5672, 15672 → 15672 | `/var/lib/rabbitmq` |
| Mailpit | `axllent/mailpit:v1` | 8025 → 8025, 1025 → 1025 | `/data` |
| Adminer | `library/adminer:5` | 8081 → 8080 | None |
| Nginx | `library/nginx:stable-alpine` | 8080 → 80 | None |
| Caddy | `library/caddy:2` | 8082 → 80 | `/data`, `/config` |
| Grafana | `grafana/grafana:12.4` | 3000 → 3000 | `/var/lib/grafana` |

PostgreSQL, MariaDB, RabbitMQ and Grafana prompt for credentials. Passwords have no shared default. PostgreSQL and MariaDB also expose the initial database and application user. These variables initialize new data; changing them does not reset users in an existing volume. Additional environment variables remain editable, with duplicate names rejected before dispatch.

Redis and Valkey enable append-only persistence and have no default password. Keep their published ports local unless authentication is configured. RabbitMQ uses a stable node name so its data directory does not change on a future replacement. Mailpit stores messages in its named volume. Caddy starts with its welcome page; custom sites and HTTPS require configuration and appropriate ports. Grafana requires a data source after login. Adminer requires the address of a database reachable from its container.

New setups receive a free suggested container name and unique named-volume names. Those volume names stay visible and editable in the creation form. Removing a container retains its named volumes; selecting the same recipe again starts with fresh volumes unless the user explicitly chooses existing ones. Native complete backup and restore remain subject to the existing coverage gates described in [WSL containers](wsl-containers.md).

## Sources and maintenance

The catalog is bundled with the app. It does not fetch or automatically import third-party templates. Each recipe links to its project's container documentation; the URLs and image references live in `src/data/containerRecipes.ts`. The reviewed sources include [PostgreSQL](https://hub.docker.com/_/postgres), [MariaDB](https://hub.docker.com/_/mariadb), [Redis](https://hub.docker.com/_/redis), [Valkey](https://valkey.io/topics/installation/), [RabbitMQ](https://www.rabbitmq.com/docs/download), [Mailpit](https://mailpit.axllent.org/docs/install/docker/), [Adminer](https://hub.docker.com/_/adminer), [Nginx](https://hub.docker.com/_/nginx), [Caddy](https://hub.docker.com/_/caddy) and [Grafana](https://grafana.com/docs/grafana/latest/setup-grafana/installation/docker/).

The image tags follow selected stable release families or channels. Patch content may change upstream; creation resolves the pulled image to its immutable runtime ID. Before changing a recipe's release family, recheck required variables, image-declared volume paths and startup behavior. PostgreSQL 18's parent data path and Grafana's minor-release tag are intentional.

The ten bundled logos come from Homarr Labs Dashboard Icons at revision `f1d048d9885b97a7319e0a51e508217459f212df`. Attribution and the bundled Apache-2.0 license are recorded in [CREDITS](../CREDITS.md). No new project dependencies were added.

Live Docker Hub search, remote template feeds and Compose stacks are future work. The current catalog runs individual services through the existing WSLc adapter.

## Native acceptance, 2026-10-01

All ten recipes passed on Windows x64 with WSL 3.0.1. The test used the real desktop Rust IPC path, asserted mock mode was off, assigned temporary local ports and generated test credentials. It verified:

- Image pull, creation and startup for every recipe.
- PostgreSQL and MariaDB table writes, then reads after restart.
- Redis and Valkey key writes, then reads after restart.
- Windows localhost HTTP access for RabbitMQ, Mailpit, Adminer, Nginx, Caddy and Grafana.
- A marker in every configured volume surviving container restart.
- Cleanup of the recorded test containers and volumes, with the original container inventory preserved.

The first run passed eight recipes. MariaDB's initial probe connected to its temporary initialization server; the corrected probe used TCP. Grafana's `12` alias was absent; the recipe now uses the verified `12.4` tag. Both passed focused native reruns. These checks establish startup, basic connectivity and restart persistence, not application-level backup or full coverage of every service feature. Images remain cached for reuse; the test containers and volumes were removed. ARM64 is not covered by this machine.
