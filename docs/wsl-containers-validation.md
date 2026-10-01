# WSL container preview validation

Date: 2026-10-01. The app was tested in an isolated checkout on Windows 11 x64. Desktop tests used separate application identifiers and settings directories; the installed Store app was left running.

## Automated application checks

| Check | Result |
| --- | --- |
| Frontend unit/component suite | 48 files, 822 tests passed |
| Rust suite | 491 passed, 1 subprocess helper ignored by the normal runner |
| TypeScript/Vite and debug desktop builds | Passed |
| Independent code review | Reported correctness/privacy findings addressed and rechecked |
| Optional E2E TypeScript check | 28 existing errors, also present in the unchanged base checkout; none added by the new container spec |

The container desktop tests exercise the real Rust command/service path with its stateful mock executor: explicit connection, external inventory, creation with multiline arguments, start/stop, logs, removal confirmation, view state, contained layout at 800 CSS pixels, a named-volume recovery gate and archive roundtrip.

The initial complete desktop run found nine failing checks across six suites. Corrections addressed an obsolete ARIA assertion, a nonexistent store field in readiness checks, animation/input timing, retained native-popup markup and an error assertion that disagreed with its injected message. Focused reruns cleared those failures, including all 17 compact-disk tests and all eight container tests. The subsequent complete run covered 32 suites and 663 cases: 660 passed, one failed and two were skipped. Its sole failure was a keyboard-input test that entered `duplicate-testUbuntu` instead of `Ubuntu`; the failure screenshot established that duplicate validation was never exercised. The test now uses keyboard replacement and asserts the entered value. All 30 installation cases passed on the corrected rerun. After the native restart fix, the container suite was rerun on the rebuilt desktop app. This exposed a stale-element read in the removal assertion after the app had successfully removed the target; reading the visible card texts in one DOM snapshot resolved that test race. The final container rerun passed all eight cases. These are complete-run plus focused-rerun results, not a claim that a single final full run passed.

## Before upgrading: WSL 2.9.9

The native desktop build ran with `WSL_MOCK` absent. The test asserted that mock mode was disabled before invoking any native command.

- Rust IPC returned all five real distributions: DevBox, Ubuntu, podman-machine-default, Ubuntu-26.04 and UbuntuOld2.
- The Containers view reported the WSL 3.0.1 requirement and offered no Connect action.
- DevBox, Ubuntu and podman-machine-default passed read-only shell, process-filesystem and root-filesystem checks. Their kernel reported `6.18.40.1-microsoft-standard-WSL2`.
- Ubuntu-26.04 and UbuntuOld2 remained stopped.
- The existing Podman workload inventory was captured for comparison after the update.

The user authorized upgrading WSL after these baseline checks, followed by testing again.

## After upgrading: WSL 3.0.1

The authorized updater completed successfully. The installed package reports `3.0.1.0`; the kernel remains `6.18.40.1-microsoft-standard-WSL2`.

The update stopped the previously running distributions. DevBox, Ubuntu and podman-machine-default passed shell, process-filesystem and root-filesystem checks when relaunched. DevBox and Ubuntu subsequently returned to stopped state after their test shells exited. The originally stopped distributions were not started. The existing Podman machine and the recorded `k9s-audit-control-plane` container were restarted and confirmed running; the other previously stopped Podman container remained stopped. Podman reported that its optional Docker API forwarding proxy could not start, although its CLI connection and existing workload worked. The installed WSL UI Store app was left running throughout.

The isolated native desktop test explicitly asserted that mock mode was disabled. It passed:

- Distribution inventory through Rust IPC before and after container operations, with the same five distribution names.
- Explicit default-session connection, image pull, container creation/start and effective command/environment inspection. A literal environment value containing `$()` survived unchanged.
- Discovery and UI display of a second container created directly with the WSLc CLI, identified as external.
- Native logs and resource statistics.
- Stop, start and restart. This found and fixed an adapter bug: restart accepts `--timeout`, while stop accepts `--time`. A failing regression test reproduced the incorrect arguments before the fix; the full Rust suite then passed.
- Terminal launch with a command that wrote a marker inside the container; a separate CLI exec verified that marker.
- Refusal of complete backup when configuration coverage is incomplete.
- Removal of both test-owned containers. A separate final CLI inventory confirmed no containers remained in the initially empty test session.

First-run telemetry dialog handling was corrected in the smoke script. Failed preliminary runs cleaned up their recorded container IDs. The successful final native run exercised the rebuilt application. Native backup/restore fidelity, ports/bind-mount traffic and Linux metadata recovery are not established by these checks.

Screenshots were inspected for the real connected workspace and the detail view at 800 CSS pixels; the detail panel and tabs remained within the app window.
## Developer tool gallery

The Add container gallery includes ten bundled recipes with local logos, category/search filters, required service credentials, editable ports/storage and the custom-image route. The frontend suite passed 817 tests across 48 files after these changes, including a regression for duplicate environment variables. Independent review found that a duplicate recipe variable could disappear from the editor; duplicate rows now remain editable and submission rejects duplicate keys.

The rebuilt desktop app passed all ten container E2E cases, including local-logo loading, filtered gallery layout at 800 CSS pixels and PostgreSQL recipe creation through Rust IPC. The gallery screenshot was visually checked. This was a focused container rerun; the previous complete desktop run is recorded above.

All ten recipes passed native acceptance through the real desktop Rust IPC on WSL 3.0.1: image pull/create/start, database or cache writes where applicable, Windows localhost HTTP for the six web interfaces, and restart persistence for every configured volume. The first run passed eight recipes; a MariaDB readiness-probe correction and the Grafana tag correction passed focused reruns. Recorded test containers and volumes were removed, and the original container inventory was preserved. See [catalog details and native run boundaries](container-catalog.md).
## Running-container removal regression

User testing exposed a missing lifecycle step: the UI allowed removal of a running container, but ordinary WSLc removal rejects that state with `WSLC_E_CONTAINER_IS_RUNNING`. Earlier native checks explicitly stopped containers before removal, and the existing desktop removal case used a stopped container.

Confirmed removal now inspects the captured container, stops it when running, verifies a stopped state, then removes it. Each stage retains the full container ID and session checks. Stop failure or an uncertain session aborts removal; internal recovery cleanup retains its original stopped-only removal behavior. The confirmation explains the stop and retained named volumes, and the error dismiss button is separated from its message.

- Full frontend suite: 818 tests across 48 files passed.
- Full Rust suite: 491 passed, 1 subprocess helper ignored by the normal runner.
- Container desktop suite: all 11 cases passed, including removal of a running container.
- Native WSL 3.0.1 desktop UI: running PostgreSQL removal and already-stopped PostgreSQL removal passed. Recreating a test container with its retained named volume recovered the written marker. The existing user's PostgreSQL container kept the same full ID and running state; all test-owned containers and volumes were cleaned up.
- A preliminary native harness run timed out waiting for the refresh button and cleaned up its test resources. The final run handles first-run dialogs before clicking and passed.
- Independent review found no important defects. Debug desktop builds and the diff whitespace check passed.
## Background refresh stability

The five-second container poll previously toggled the global loading flag, disabling and dimming workspace controls on each refresh. Inventory refresh now retains existing content and leaves controls available; initial connection still reports loading. Starting an operation invalidates earlier inventory/detail refresh responses, including errors, and allows a fresh post-operation read.

Four regressions reproduced the disabled controls and blocked actions before the fix. The full frontend suite then passed 822 tests across 48 files. All 12 container desktop cases passed, including two observed polling cycles with zero disabled-attribute changes. A separate real WSLc desktop run observed three completed refresh cycles with zero disabled-state changes; its initially empty inventory remained empty and no workload mutations were performed. Debug builds and the diff check passed. Independent review found no important concurrency defects.
## Release boundaries

Passing simulated recovery tests does not establish native archive fidelity. Native complete backup, restore and configuration recreation remain unavailable because WSLc inspection omits effective settings. Named-volume recovery additionally needs a pinned helper and Linux metadata/data roundtrip evidence.

The name-only CLI cannot atomically bind a mutation to a captured session. The app checks identity before and after dispatch, rejects already stale requests and reports uncertain mutation outcomes without retrying or cleaning up in a replacement session. Retaining a native session handle is future work.

ARM64, elevated/custom-session behavior and arbitrary interactive terminal input are outside this machine's acceptance coverage. See [container behavior and recovery procedure](wsl-containers.md).
