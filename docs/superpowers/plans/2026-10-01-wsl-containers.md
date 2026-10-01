# WSL Containers Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development to implement these tasks with test-first changes and independent review.

**Goal:** Add the approved distribution/container workspaces and useful WSLc lifecycle, creation, configuration, logs, terminal and recovery workflows.

**Architecture:** Separate typed Rust WSLc adapter and frontend service/store. Share the existing app shell without putting container objects into distribution stores. CLI operations target a session name, with captured numeric identity checked before and after dispatch.

**Tech Stack:** Existing Rust/Tauri, React/TypeScript/Zustand, Vitest and WebdriverIO. Reuse existing dependencies.

**Spec:** ../specs/2026-10-01-wsl-container-views-design.md

## Global constraints

- Target stable WSL 3.0.1+; older WSL remains supported for distributions.
- No runtime update, shutdown or existing workload mutation without user approval. Use WSL_MOCK for automated desktop tests.
- No implicit container session creation from application startup or refresh before Connect.
- Full container IDs plus captured session identity, with stale-session rejection.
- Use direct executable argument vectors; never evaluate user strings in a shell.
- No new dependencies unless existing dependencies cannot provide the required functionality.
- Backup must not advertise unsupported coverage; recovery requires configuration, root filesystem and supported persistent data. Bind mounts and unsupported configurations fail closed.
- Existing user files and the community-issues PR remain untouched. Worktree: .cache/wslc-implementation, branch feat/wsl-containers.

## Review focus

1. A default session disappears and is replaced during an operation: reject an already stale connection before dispatch, discard stale reads, and report uncertain mutation outcomes after dispatch without automatic retry or replacement-session cleanup. The name-only CLI cannot provide atomic session isolation; a captured COM session handle is future work.
2. External containers use unsupported configuration: inspect and lifecycle remain usable; recreate/complete backup must refuse to discard fields.
3. Container output is malformed or excessive: bounded parsing rejects incomplete inventories and does not leak environment secrets.
4. New names, image references and Windows paths contain option-like values or shell metacharacters: use validated argv, including terminal launch.
5. Recovery fails midway: existing data remains intact, partial output never looks complete, and cleanup targets only resources created by that attempt.

## Task 1: WSLc runtime adapter and typed commands

**Files:** Create src-tauri/src/containers/{mod,types,executor,inventory,lifecycle,tests}.rs and src-tauri/src/container_commands.rs; modify src-tauri/src/main.rs; create src/types/containers.ts as the authoritative frontend contract.

**Interfaces:** Publish matching Rust camelCase and TypeScript models before UI work. Commands: container_probe, container_connect, container_list, container_inspect, container_action, container_create, container_recreate, container_logs, container_terminal. Every command after connect accepts a captured connection. Action accepts an allowlisted action and full ID. Creation is a typed specification, never a command string. Errors carry code/message. Backup will consume the same executor and inspect models.

- [x] Write tests for stable NDJSON/inspect/system-info fixtures, unsupported versions, malformed lines, external inventory, session loss, exact argv and validation before production implementation. Run cargo test containers and observe failures.
- [x] Implement direct Microsoft executable resolution, bounded stdout/stderr capture and timeouts; redact sensitive diagnostics. Probe must not list/create sessions. Explicit Connect resolves the default session using verified source contracts; later calls require its name and runtime ID to match.
- [x] Implement list/inspect normalization, full IDs, origin labels, state/health, mounted data and published ports. Keep unknown values and fail malformed inventory.
- [x] Implement allowlisted lifecycle operations, pull/create/start with partial-start failure recovery, supported recreation under a new name retaining the original, bounded recent logs, external terminal launch, operation serialization and safe cancellation if supported.
- [x] Add a stateful mock executor for desktop tests. Exercise commands through the same service logic, not a separate fake UI.
- [x] Run Rust tests and existing suite; record observed commands/results. Independent task review follows.

## Task 2: Two-view shell and container workflows

**Files:** Create src/services/containerService.ts, src/store/containerStore.ts, src/components/containers/* and corresponding tests; modify src/App.tsx, Header.tsx, settings/ContainerRuntimeSettings.tsx and i18n resources where needed. Task 1 owns src/types/containers.ts; consume its published contract.

**Interfaces:** containerService wraps only the typed Task 1 commands. The store owns connection, inventory, loading/error/busy state and refresh lifecycle. ContainerWorkspace receives visibility and retains state while navigating. It must not probe/list before the container workspace is chosen, or connect without the Connect action.

- [x] Add failing tests proving distro startup performs no container calls, switching preserves workspace state, old/missing WSLc gives a useful state, explicit connect includes external containers, stale results cannot replace newer connection state, and failed actions retain rows/errors.
- [x] Add persistent Distributions/Containers switch with separate toolbars/status. Keep existing distro navigation, settings and tests intact. Clarify the old image-source selector label.
- [x] Implement bounded list/detail UI with search/filter, lifecycle confirmation, logs follow/pause/copy/save, terminal, create form for ports/data/environment and supported configuration recreation. Escape all displayed output. Keep menus/panels inside the window and support keyboard navigation.
- [x] Add backup/restore affordances wired to Task 3 contracts, with explicit unsupported coverage/release gate explanations rather than simulated success.
- [x] Run targeted tests, TypeScript build and full Vitest suite. Independent task review follows.

## Task 3: Recovery implementation and release gates

**Files:** Create src-tauri/src/containers/backup.rs and tests; extend container_commands.rs/types.rs and src/types/containers.ts in coordination with Task 1. Create docs/wsl-containers.md. Add src/test/e2e/specs/containers.spec.ts after UI integration.

**Interfaces:** Typed backup coverage/preflight, backup to user-selected path, and restore from selected bundle under a new name. Reuse connection/executor from Task 1. UI must render coverage and capability reports and never label rootfs-only export a complete backup.

- [x] Write failing archive tests for unsupported mounts/configuration, traversal, duplicate manifests, checksum mismatch, size limits, incomplete bundle, conflicting names and failure cleanup.
- [x] Implement versioned .wslcbackup bundle and manifest with atomic completion, safe archive member handling, configuration capture and new-identity restore. Preserve Linux metadata by treating inner Linux archives as opaque. Named-volume helper support requires verified CLI and pinned helper evidence; retain a clear unavailable gate if live verification cannot be performed safely.
- [x] Add real runtime smoke/restore procedure and sanitised source-backed fixtures. Run only on approved test-owned resources after stable runtime is available. Record all unverified gates honestly.
- [x] Add desktop tests covering Connect, external inventory, create, stop/start, logs, remove confirmation, unsupported backup and restoration where supported; run the existing distribution regression suite.
- [x] Run build/Rust/frontend/E2E verification, independent whole-branch review and fix important findings before reporting completion. Do not merge or push the existing PR.

## Execution record

Progress and runtime evidence live in .cache/wslc-work/progress.md. Test output is stored there to avoid flooding the session. Source references are pinned in the design. Changes that cannot satisfy a real recovery gate remain visibly unavailable and are reported as limitations, never as passed tests.

Final acceptance details are recorded in docs/wsl-containers-validation.md. Native management passed on WSL 3.0.1 after the authorized upgrade; complete native backup/restore/recreation remain explicitly gated. The full desktop run had one test-input failure, cleared by a focused suite rerun.
