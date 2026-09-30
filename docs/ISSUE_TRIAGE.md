# Issue triage — 30 September 2026

Reviewed all 39 issues open at the start of this audit in `octasoft-ltd/wsl-ui`, starting with reports from accounts other than `octasoft-ltd`. GitHub issues now have high, medium, or low priority labels. “In this PR” means implemented here; the issue stays open until the PR is merged.

## Community reports first

| Issue | Disposition | Result / next step |
| --- | --- | --- |
| [#172](https://github.com/octasoft-ltd/wsl-ui/issues/172) — root access | Closed | Reporter explicitly confirmed it was fixed on 27 September. |
| [#171](https://github.com/octasoft-ltd/wsl-ui/issues/171) — GNOME headless RDP | Low; integration feature | Requires GNOME session setup, TLS and credential handling; scope below. |
| [#154](https://github.com/octasoft-ltd/wsl-ui/issues/154) — empty Quick Install | In this PR | Refresh on opening/retrying; show native WSL errors; ignore stale requests. The screenshots show WSL itself can list distributions, so a blocked network was not established as the cause. |
| [#145](https://github.com/octasoft-ltd/wsl-ui/issues/145) — unknown download size | In this PR | Emit byte progress and final progress without Content-Length. |
| [#112](https://github.com/octasoft-ltd/wsl-ui/issues/112) — bare disk mount | In this PR | Earlier patches fixed disk-path validation and decoding; this patch retains bare attachments and makes them visible and unmountable. |

## High priority: data integrity and core reliability

| Issue | Disposition | Result / next step |
| --- | --- | --- |
| [#108](https://github.com/octasoft-ltd/wsl-ui/issues/108) — configuration loss | In this PR | Merge modeled fields into existing files; retain other sections, keys and comments; refuse to overwrite unreadable/invalid files. |
| [#151](https://github.com/octasoft-ltd/wsl-ui/issues/151) — hard timeout kills disk operations | In this PR | Install, import, export, conversion, move, resize and sparse operations run to completion without a kill deadline. Ordinary queries remain bounded. |
| [#109](https://github.com/octasoft-ltd/wsl-ui/issues/109) — colliding temporary files | In this PR | Catalog downloads now use the existing per-operation unique tag; other install and clone paths already use it. |
| [#114](https://github.com/octasoft-ltd/wsl-ui/issues/114) — OCI whiteouts lose files | In this PR | Apply deletions to lower layers; retain opaque directories and files supplied by the current layer regardless of archive order. |
| [#110](https://github.com/octasoft-ltd/wsl-ui/issues/110) — missing publisher checksums | In this PR | Resolve all five built-ins against trusted publisher checksum manifests, bound to the exact catalog URL. Fail if verification metadata cannot be obtained; preserve explicit custom hashes. |
| [#152](https://github.com/octasoft-ltd/wsl-ui/issues/152) — tray blocks UI | In this PR | Reuse the distribution poll result; run fallback queries and tray shutdown off the UI thread. |

## Medium priority: feature correctness

| Issue | Disposition | Result / next step |
| --- | --- | --- |
| [#104](https://github.com/octasoft-ltd/wsl-ui/issues/104) | In this PR | Select the host's Linux OCI architecture; validate the selected image configuration. |
| [#107](https://github.com/octasoft-ltd/wsl-ui/issues/107) | In this PR | Transport action scripts without corrupting quotes, backslashes or Unicode across Windows/Bash parsing. |
| [#121](https://github.com/octasoft-ltd/wsl-ui/issues/121) | In this PR | Quote distribution and executable arguments in action terminals. |
| [#124](https://github.com/octasoft-ltd/wsl-ui/issues/124) | In this PR | Allow interior spaces in distribution names while retaining unsafe-character validation. |
| [#137](https://github.com/octasoft-ltd/wsl-ui/issues/137) | In this PR | Parse quoted terminal templates without splitting paths or placeholder values. |
| [#105](https://github.com/octasoft-ltd/wsl-ui/issues/105) | In this PR | Normalize automount option quotes so repeated saves do not accumulate them. |
| [#126](https://github.com/octasoft-ltd/wsl-ui/issues/126) | In this PR | Read/write autoMemoryReclaim in `[experimental]`; migrate the legacy location. |
| [#133](https://github.com/octasoft-ltd/wsl-ui/issues/133) | In this PR | Preserve unresolved or unmatched environment references instead of dropping path segments. |
| [#134](https://github.com/octasoft-ltd/wsl-ui/issues/134) | In this PR | Preserve the source's WSL version during clone, including mock execution. |
| [#131](https://github.com/octasoft-ltd/wsl-ui/issues/131) | In this PR | Decode OCI zstd layers using a maintained Rust decoder. |
| [#130](https://github.com/octasoft-ltd/wsl-ui/issues/130) | In this PR | Empty filesystem discovery no longer erases bare-mount tracking; successful shutdown clears it. |
| [#116](https://github.com/octasoft-ltd/wsl-ui/issues/116) | In this PR | Preserve name, filesystem and mount options when a partition is selected. |
| [#165](https://github.com/octasoft-ltd/wsl-ui/issues/165) | In this PR | Discover device mounts beyond `/dev/sd*` and supported direct `/mnt/wsl` virtiofs mounts; decode escaped mount paths. |
| [#164](https://github.com/octasoft-ltd/wsl-ui/issues/164) | In this PR | Request UTF-8 on WSL launch paths while retaining legacy UTF-16 decoding. |
| [#125](https://github.com/octasoft-ltd/wsl-ui/issues/125) | In this PR | Verify the exact parsed distribution name and successful list result. |
| [#119](https://github.com/octasoft-ltd/wsl-ui/issues/119) | In this PR | Route terminal startup actions correctly; tell users to run password-requiring background actions through Quick Actions. |
| [#128](https://github.com/octasoft-ltd/wsl-ui/issues/128) | In this PR | Replace assumed-state sparse toggle with explicit enable/disable commands; enabling always keeps its warning. |
| [#144](https://github.com/octasoft-ltd/wsl-ui/issues/144) | In this PR | Show failed custom actions even when output is hidden, including confirmation and sudo paths. |
| [#132](https://github.com/octasoft-ltd/wsl-ui/issues/132) | In this PR | Surface generic RDP failures in the application error state. |
| [#139](https://github.com/octasoft-ltd/wsl-ui/issues/139) | In this PR | Discard GPU, toolkit and settings responses from earlier selections. |
| [#127](https://github.com/octasoft-ltd/wsl-ui/issues/127) | In this PR | Translate absolute Windows home paths on any drive letter. |
| [#143](https://github.com/octasoft-ltd/wsl-ui/issues/143) | Open; needs VM lifecycle evidence | Confirmed incorrect client-process timestamp. Do not replace it with service lifetime or arbitrary wslhost lifetime; details below. |

## Low priority: hardening, integrations and desktop tests

| Issue | Disposition | Result / next step |
| --- | --- | --- |
| [#166](https://github.com/octasoft-ltd/wsl-ui/issues/166) | In this PR | Parse known version labels without shifting fields when components are omitted or added. |
| [#140](https://github.com/octasoft-ltd/wsl-ui/issues/140) | In this PR | Rename matching Terminal profile names in JSONC while preserving comments and surrounding text. |
| [#117](https://github.com/octasoft-ltd/wsl-ui/issues/117) | In this PR | Key LXC cache validity by mirror, unstable-release filter, architecture and cache duration. |
| [#79](https://github.com/octasoft-ltd/wsl-ui/issues/79) | In this PR | Reenable the desktop install-button test with a controlled pending IPC response; verify disabled state and recovery without a backend install. Scoped desktop test passed. |
| [#78](https://github.com/octasoft-ltd/wsl-ui/issues/78) | In this PR | Share one canonical mock executor, await settings saves during setup, fix stale selectors and wait for rendered notification text. All nine reenabled settings/update desktop tests passed. |
| [#170](https://github.com/octasoft-ltd/wsl-ui/issues/170) | Open; separate feature | Evaluate an isolated wslc executor/store/panel and session lifecycle; do not conflate WSL Containers with Docker/Podman image export. |

## Remaining integration requirements

### GNOME native RDP (#171)

The current implementation detects xrdp. Supporting an already-running GNOME listener and provisioning a GNOME headless session are separate changes. The requested feature needs distro/version detection, a user session service, TLS key/certificate setup, credentials supplied through stdin, reliable listener/port conflict detection, and rollback/error reporting. Passwords must not be placed in process arguments or logs. Validate Ubuntu 26.04/GNOME 50 using an actual headless session and Windows mstsc before advertising support.

[GNOME's configuration documentation](https://github.com/GNOME/gnome-remote-desktop/blob/main/docs/configuration.md) distinguishes headless single-user operation from system remote login. Its `gnome-remote-desktop-headless.service` setup alone does not establish that the reporter's `gnome-headless-session@<user>.service` session lifecycle works under WSL.

### Restart-required detection (#143)

WSL's VM is created through HCS and can outlive individual clients and distribution processes. On this audit machine, `vmmemWSL` exists but PowerShell exposes no StartTime for it; wslhost instances have different start dates. The issue's proposed broad process-name substitution therefore does not establish VM boot time. Next work should obtain a reliable VM boot/config generation without starting a stopped distro, preserve an unknown state when access fails, and test config edits across idle VM lifetime, client churn and shutdown/restart.

Reference: [Microsoft's WSL boot-process documentation](https://github.com/microsoft/WSL/blob/master/doc/docs/technical-documentation/boot-process.md).

### WSL Containers (#170)

The local `wslc.exe` is available and its help exposes session/list commands. No containers were started, stopped or modified during triage. Use an explicit experimental integration and validate distribution visibility, registry/session effects, privileges and cancellation independently. Reference: [Microsoft's public-preview announcement](https://devblogs.microsoft.com/commandline/wsl-container-is-now-available-for-public-preview/).

## Validation boundaries

Regression tests cover the corrected parsing, configuration merging, archive handling, asynchronous UI state and command construction. Terminal script semantics were exercised in an isolated Ubuntu container, with Windows argument parsing checked separately. The install-button desktop regression passed in WSL mock mode with an isolated application profile. No production distribution was imported, converted, moved or shut down for this audit. Physical disks and GNOME RDP still require dedicated integration validation.
