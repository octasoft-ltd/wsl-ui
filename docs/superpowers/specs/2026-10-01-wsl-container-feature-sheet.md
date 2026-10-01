# WSL UI container view: feature sheet

Date: 2026-10-01
Status: target feature set; management preview implemented with recovery gates
Full rationale: [design and integration pathway](2026-10-01-wsl-container-views-design.md)

Market reference: [WSL Container Desktop feature inventory and roadmap comparison](2026-10-01-wsl-container-desktop-comparison.md), reviewed at v2.0.1.

The preview provides container management, inspection, logs and terminal workflows. Native complete backup, restore and configuration recreation remain unavailable because effective configuration coverage cannot be established from WSLc inspection. See [current behavior and limits](../../wsl-containers.md); the table below remains the intended first-release scope.

## Product promise

**Manage your Linux distributions and everyday WSL containers in one familiar application.**

Switch between **WSL distributions** and **WSL containers**. Create a service, start or stop it, open its terminal, read its logs and recover supported containers and data from backup.

## First release

| Feature | User experience | Boundary / acceptance |
| --- | --- | --- |
| Two views | Persistent switch; separate list/filter state | Switching never stops workloads |
| Availability | Clear setup, outdated-version and policy states | Container target: stable WSL 3.0.1+; distro support remains as before |
| Connect | One explicit connection to the default user session | Opening distributions does not start a container VM |
| Discover containers | All running/stopped containers in the selected default session | Includes CLI-created and other-client containers; no app-label filter |
| Create | Image + name, start after create | Pull progress and recoverable partial failure |
| Start / stop / restart | Familiar card actions | Graceful stop first; explicit force action |
| Remove | Clearly named destructive action | Retain named volumes and images by default |
| Ports | Structured local-to-container port rows | Localhost default; network exposure explicit |
| Data | Named volumes or Windows folders | Inspect image-declared data paths; explicit access mode |
| Environment | Masked key/value editor | Values excluded from logs and normal preferences |
| Simple configuration | Review changes and recreate when required | Only supported fields round-trip; unsupported external configurations remain read-only |
| Logs | Recent tail, follow/pause, copy/save | Bounded memory; follower stops with viewer |
| Terminal | Open preferred external terminal | Running container and installed shell required |
| Details | Image, state, health, ports, mounts and exit code | Unknown/missing information is explicit |
| Basic metrics | CPU/memory when supported | Container/session figures labelled separately |
| Backup | Coverage review, graceful stop, filesystem/config and supported named volumes | Only verified cases get a complete-backup claim |
| Restore | New name and new volumes; conflict review | Checksums/schema validated; no overwrite; explicit start |
| Outside changes | Refresh state after actions and on a bounded schedule | Session loss produces a disconnected/stale state |
| Shared app experience | Themes, language, notifications and window settings | Errors and operations retain workspace identity |

### Visibility boundary

`wslc container list --all --format json --no-trunc` is analogous to `wsl --list`, but scoped to one WSLc session. Containers started in another elevated/custom session may be elsewhere. Docker and Podman containers do not automatically join this inventory.

### Backup boundary

First-release complete backups support stopped, reproducible container configurations with no data mounts or verified local named volumes. Windows folder mounts, external volume drivers and unsupported configuration are identified before capture. Exporting a filesystem alone is separately labelled and never sold as complete data protection. Restore is a release requirement, not a later promise.

Backups may contain secrets in files and configuration. The first version does not promise encryption. An environment-value omission is recorded and requires values on restore.

## Later, if demand supports it

| Area | Candidate addition |
| --- | --- |
| Images and storage | Browse/remove unused images, volume inspection and careful cleanup |
| Sessions | Switch among accessible sessions; explicit session-level management |
| Templates | A few maintained service recipes with data/port defaults |
| Events and tray | Event-driven refresh and grouped quick actions |
| Backup expansion | Additional data sources, scheduled backups, application-aware dumps and encryption |
| Developer workflows | Image builds, registry login UI and native Compose integration |

## Outside the initial scope

Kubernetes; replacement of Docker or Podman Desktop; a general multi-engine dashboard; a Dockerfile editor; a custom Compose orchestrator; embedded terminal emulation; automatic image updates; host-wide container discovery; automatic distro-to-container conversion.

## First-release completion checklist

- A container created in a terminal appears in WSL UI and can be managed there.
- A container created in WSL UI remains visible to the CLI and survives closing the app.
- A simple service runs with a localhost port and persistent named data.
- Logs and terminal explain failures without requiring knowledge of WSLc internals.
- A supported backup restores the service and its data under a new name after the test original is removed.
- Old or disabled WSLc does not break the distribution view.
- Existing distro regression coverage passes, and stable WSLc scenarios pass on a real runtime.

## Delivery order

**Stable-runtime feasibility -> views and inventory -> lifecycle/logs/terminal -> creation/configuration -> backup/restore -> release integration.**

Intermediate builds can be previews. The complete requested release includes the backup/restore slice.
