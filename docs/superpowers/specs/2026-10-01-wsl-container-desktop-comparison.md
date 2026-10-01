# WSL Container Desktop: comparison and roadmap decisions

Reviewed: 2026-10-01
Competitor: [mhackermsft/wslcontainerdesktop](https://github.com/mhackermsft/wslcontainerdesktop)
Release: [v2.0.1](https://github.com/mhackermsft/wslcontainerdesktop/releases/tag/v2.0.1), published 2026-10-01
Pinned revision: `4f697370237a33cf535ddbb4667c81e7b75f5446`
Our proposal: [two-view design](2026-10-01-wsl-container-views-design.md), [feature sheet](2026-10-01-wsl-container-feature-sheet.md)

## Assessment

WSL Container Desktop already has a substantial container-focused interface. A small WSLc dashboard by itself would have little differentiation. WSL UI's proposed value is bringing everyday container workflows beside its existing distribution management, with a deliberately small initial interface and a tested recovery workflow.

This is a documentation and source-interface review, not a hands-on product test. “Documented” below means the project advertises the feature and the reviewed material describes it. It does not certify runtime quality, performance or completeness. The release matches the pinned revision, so the comparison is not silently mixing unreleased main-branch work with the release.

## Feature inventory and proposed treatment

**MVP** = requested first release, subject to its acceptance criteria. **Next** = useful follow-up after reliability. **Defer** = a separate product investment requiring demonstrated demand.

| Area | WSL Container Desktop's documented capabilities | WSL UI decision |
| --- | --- | --- |
| Overview | Counts, engine state and a live resource table | MVP: scoped counts and state; Next: larger overview |
| Inventory | Running/stopped containers, health, writable size and details | MVP: all default-session containers, including external |
| Creation | Image/name, ports, env, mounts, network, command and advanced flags | MVP: small form; expand advanced flags only when needed |
| Lifecycle | Start, stop, restart, kill, remove and stopped-container prune | MVP: single-container lifecycle; Next: bulk/prune |
| Terminal | Exec shell and attach to the main process | MVP: exec; Next: attach with clear consequences |
| Logs | Follow, timestamps, search/filter, highlighting and export | MVP: bounded tail/follow/copy/save; Next: rich search |
| Inspect | Structured details and raw JSON | MVP: details; Next: redacted raw inspector |
| Metrics | CPU, memory, network/block I/O and process counts | MVP: basic scoped metrics; Next: charts/I/O |
| Ports | Per-container links and a combined endpoints page | MVP: correct per-container local links; Next: combined page |
| File tools | Browse, preview, transfer and modify container files | Next: explicit copy; Defer: full file manager |
| Filesystem changes | Comparison against an image to show added/changed/deleted files | Defer |
| Images | List, pull, build, tag, push, inspect, remove and prune | MVP: pull/use image for creation; Next: image library; Defer: build/push UI |
| Image archives | Save/load images and import/export filesystem archives | Next: image archive tools; MVP backup uses a defined recovery contract |
| Image updates | Registry digest comparison and pull-update badges | Next: check on demand; Defer: automated replacement |
| Reusable launches | Saved run profiles | Next: saved recipes without silently persisting secrets |
| Volumes | Create/inspect/remove/prune; ownership/usage information | MVP: create/select and backup required named volumes; Next: management page |
| Networks | Create/inspect/remove/prune; attach/detach and advanced options | MVP: ordinary default network; Next: network management |
| Events | Live activity feed, filters and persisted recent history | MVP: operation outcomes; Next: activity history/events |
| Bulk operations | Selection and bulk start/stop/remove across resource lists | Next; current-session stop-all may be a bounded MVP action |
| Storage cleanup | Resource usage, reclaim estimates and prune controls | Next, after reliable usage and ownership checks |
| Registries | Public/private entries, login and Azure registry integration | MVP: use runtime credentials and explain failures; Next: login UI; Defer: Azure wizard |
| Enterprise policy | Feature-disable and approved-registry handling | MVP: honour runtime policy and report denial; Next: richer policy display |
| Templates | Services, databases, developer sandboxes and multi-service recipes | Next: a few reviewed single-container recipes |
| Compose | Import and operate a documented subset, dependency handling and scaling | Defer; assess Microsoft's native Compose when available |
| Health supervision | Engine health plus desktop-owned probes and auto-heal | MVP: observe native health; Defer: an app-owned supervisor |
| Dev containers | Workspace workflows with explicit host-command handling | Defer; links to existing editor workflows are sufficient initially |
| Kubernetes | Install/manage k3s, resources, YAML, metrics and forwarding | Defer |
| Runtime controls | WSL update/recovery, session settings and storage location | MVP: version diagnostics; reuse existing updates carefully; Next: settings UI |
| Distribution visibility | Installed distribution list on the engine page | WSL UI already has broader distro operations; preserve that workflow |
| AI | Optional diagnostics/assistant, multiple providers and local model setup | Defer |
| Desktop integration | Tray, notifications, themes, refresh settings and app updates | Reuse WSL UI infrastructure; add container actions in a bounded way |

Inventory sources: [versioned feature tour](https://github.com/mhackermsft/wslcontainerdesktop/blob/4f697370237a33cf535ddbb4667c81e7b75f5446/README.md#feature-tour), [architecture and services](https://github.com/mhackermsft/wslcontainerdesktop/blob/4f697370237a33cf535ddbb4667c81e7b75f5446/docs/ARCHITECTURE.md), [service interface](https://github.com/mhackermsft/wslcontainerdesktop/blob/4f697370237a33cf535ddbb4667c81e7b75f5446/src/WslContainerDesktop/Services/IWslcService.cs), and [release changes](https://github.com/mhackermsft/wslcontainerdesktop/blob/4f697370237a33cf535ddbb4667c81e7b75f5446/CHANGELOG.md).

## Important limits behind the feature names

### Compose is a significant subsystem

The project implements its own parser, project state, dependency handling, reconciliation and supervision above WSLc. Its docs distinguish supported, approximated, ignored and blocked configuration. Desktop-owned restart policies and auto-heal depend on the application remaining open. Configuration conformance tests are explicitly not runtime certification.

For WSL UI, a “small Compose tab” would therefore add much more than a tab. Wait for native support, evaluate its contracts and adopt it only if users need project-level orchestration. Source: [Compose compatibility review](https://github.com/mhackermsft/wslcontainerdesktop/blob/4f697370237a33cf535ddbb4667c81e7b75f5446/docs/COMPOSE-COMPATIBILITY.md) and [documented Compose model](https://github.com/mhackermsft/wslcontainerdesktop/blob/4f697370237a33cf535ddbb4667c81e7b75f5446/README.md#docker-compose-compatibility).

### Export is not automatically backup

The project clearly distinguishes saved images from exported filesystem contents. A saved image retains image configuration/layers; importing exported files does not recover the original startup configuration automatically. I did not find a documented single workflow that bundles a container's effective configuration and persistent volume data, then restores them together. That is a bounded observation about the reviewed docs/interface, not proof that no such capability exists elsewhere.

A verified backup/restore workflow could make WSL UI useful, but it should be earned through real restoration tests rather than a “Backup” label over export. Our proposed support matrix is intentionally explicit.

### Storage path change is not migration

The competitor documents that changing default-session storage location points at a new location and leaves old data behind. WSL UI should reserve “Move” or “Migrate” for an actual transfer and verification workflow. Until implemented, show the current location and explain any change of location accurately. Source: [runtime/storage architecture](https://github.com/mhackermsft/wslcontainerdesktop/blob/4f697370237a33cf535ddbb4667c81e7b75f5446/docs/ARCHITECTURE.md#wsl-container-system-info-and-settings-file).

### File features have different prerequisites

The competitor uses native copy for transfers, including stopped/shell-less cases, while browsing and filesystem comparison require additional in-container tools. If WSL UI adds file tools, separate these capabilities rather than showing one generic “Files supported” flag. This is another reason to defer a full file manager.

## Revised MVP boundary

The competitor comparison supports the user's requested list with the following ordering:

1. **Find and control:** default-session inventory, external containers, clear states, start/stop/restart/remove.
2. **Create a useful service:** image/name, local ports, persistent data, environment, supported configuration and visible failures.
3. **Understand it:** details, health, logs and terminal.
4. **Recover it:** validated backup and restoration of the supported filesystem/configuration/volume set.
5. **Fit the existing app:** two views, shared preferences, scoped notifications and no regression to distro operations.

Keep optional custom health probes, GPU presets, app-owned restart policies, arbitrary networks and persistent dashboards out of the initial simple flow. The first release does not need a left navigation rail containing a dozen resource types.

## Roadmap after MVP

### Next: convenience with limited new operational responsibility

- Saved run profiles, a small reviewed template set and port overview.
- Image and volume lists, ownership-aware cleanup and explicit archive import/export.
- Better log search, native copy-in/out and optional activity history.
- Registry sign-in UI using the runtime's credential storage.
- Event refresh/tray enhancements if they do not unexpectedly keep idle sessions alive.

### Later: broader runtime management

- Accessible custom-session selection with explicit user/token scope.
- Container settings editor with actual restart impact and verified storage migration.
- Wider backup coverage, scheduled recovery points and application-aware dumps.
- Native Compose integration after its release and a compatibility evaluation.

### Separate decisions, not implied commitments

Image builds/publishing, Kubernetes, multi-engine Docker/Podman management, AI administration, an app-owned watchdog and a full container file manager. Each changes maintenance scope and deserves its own demand assessment.

## Evidence quality and product claims

Do not claim WSL UI is smaller, faster, safer or more reliable than this competitor without measurement. The differentiation proposed here is workflow and scope: existing distribution management alongside a compact container view and a specified recovery flow. The competitor already exposes some WSL platform/distribution information, so “the only combined WSL app” would be unjustified.

The competitor was not installed or launched during this review. Its repository license is recorded as GPL-3.0; this exercise compares behaviour and architecture and copies no product implementation.
