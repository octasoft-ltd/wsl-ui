# WSL developments review — breaking-change exposure for WSL-UI (OCT-1476)

*Date: 2026-09-03. Researched against microsoft/WSL releases, Microsoft devblogs, and Build 2026 material, then correlated with a full inventory of WSL-UI's wsl.exe/registry/config surface area.*

## Verdict

**No shipped breaking changes to `wsl.exe`, the `Lxss` registry schema, or `.wslconfig`/`wsl.conf` as of WSL 2.7.x (stable) / 2.9.x (pre-release).** Everything Microsoft has landed since our release is additive. However, Microsoft has publicly stated intent to flip two defaults (virtiofs filesystem, "consomme" networking) for standard WSL distros "in the future", and two pieces of our own handling would misbehave when users adopt the new opt-in features today. Details and recommended actions below, ranked.

## State of WSL (Sept 2026)

| Development | Status |
|---|---|
| WSL open-sourced (MIT), v2.6.0 | Shipped May 2025 — no interface changes |
| Stable line | 2.7.x (2.7.12, VHD-ownership fixes, security backports) |
| Pre-release line | 2.9.x — carries **WSL Containers (wslc)** public preview; requires WSL 2.8+ |
| WSL Containers (`wslc.exe`) | Separate CLI + SDK; containers do **not** go through `wsl.exe`; virtiofs + consomme networking are default *for containers only* |
| virtiofs for standard distros | **Opt-in**: `[wsl2] virtiofs=true` in `.wslconfig`; Microsoft "working towards enabling by default in the future" |
| Kernel | Jumped 6.6 LTS → 6.18 LTS |
| Windows 10 | Still supported (build 19041+), incl. wslc — no minimum-OS break |
| `wsl.exe` output encoding | Still UTF-16LE by default; `WSL_UTF8=1` env var switches it to UTF-8 (supported since WSL 0.64.0) |
| Machine-readable output | Still none — `--json` request (microsoft/WSL#6235) remains open; registry is still the only structured source |

## Findings mapped to our code

### 1. Our `.wslconfig` writer destroys new/unknown keys — worst practical exposure (HIGH)

`settings.rs:436-489` rewrites the whole file as a single `[wsl2]` section containing only the 16 keys we model, dropping comments, unknown keys, and the entire `[experimental]` section. A user who sets `virtiofs=true` (the headline opt-in of 2026), `defaultVhdSize`, or any `[experimental]` key loses it silently the first time they save settings in WSL-UI. This also already conflicts with our own RDP check (`commands.rs:533-566`) which looks for the experimental `instanceIdleTimeout`. As Microsoft adds keys faster post-open-sourcing, this bug class compounds. **Action: make the writer round-trip-preserving (merge known keys into existing file instead of regenerating it).**

### 2. Adopt `WSL_UTF8=1` in the executor (HIGH, hardening)

All our UTF-16LE detection heuristics (`crates/wsl-core/src/parser.rs:87-171`, OCT-1066/GH #99 lineage) exist because `wsl.exe` emits UTF-16LE. Setting `WSL_UTF8=1` on every spawned `wsl.exe` (one line in `wsl_command/real.rs:80-164`) makes output deterministically UTF-8, permanently retiring the mojibake bug class. Keep the existing decoder as fallback for old WSL (< 0.64.0, 2022) only. VS Code hit the inverse bug in Nov 2025 (microsoft/vscode#276253) — the ecosystem is standardizing on this env var.

### 3. virtiofs opt-in has user-visible quirks today (MEDIUM)

With `virtiofs=true`: automount of fixed drives is silently skipped (microsoft/WSL#40773) and Windows-side file-ownership anomalies exist (#40719). Our mounted-disk discovery only recognizes `^/dev/sd[a-z]+` in `mount` output (`wsl/core.rs:1022-1055`), so virtiofs-backed mounts (and NVMe-style nodes) are invisible in WSL-UI. When Microsoft flips the default, this breaks for everyone. **Action: broaden mount parsing beyond `/dev/sd*`; add a TROUBLESHOOTING entry for the automount quirk (done in this branch).**

### 4. Fragile positional/English parsers — unchanged risk, now higher churn rate (MEDIUM)

Nothing broke yet, but WSL now releases much faster (open source, two active lines):
- `parse_wsl_list_output` (`crates/wsl-core/src/parser.rs:12-78`): positional columns, English `running/stopped/installing` literals.
- `parse_wsl_version_output` (`wsl/info.rs:64-102`): strictly positional 7-field layout — a single added component line (plausible with wslc components shipping in the same package) shifts every field. **Action: key fields by label prefix (WSL/Kernel/WSLg/…) instead of position.**
- `--list --online` header sniffing (`wsl/install.rs:16-42`), English substring matching for preflight/status errors (`wsl_command/real.rs:499-579`).

### 5. Networking mode rename: VirtioProxy → "consomme" (LOW)

WSL 2.9.3 renamed the VirtioProxy networking mode to Consomme (container side). We treat `networkingMode` as an opaque string (good), but round-trip tests and any UI mode list enumerate `virtioproxy` (`settings.rs:867-880`). Watch for the string surfacing for standard distros and update choices then.

### 6. WSL Containers (wslc) — product opportunity, minor watch item (LOW)

`wslc` is a separate CLI so nothing breaks. Two notes: (a) wslc keeps a "default wslc session" with configurable storage — verify it never surfaces as a phantom distro in `--list`/`Lxss` once users run it; (b) a "WSL Containers" management panel would be a natural WSL-UI feature (wslc has Docker-style subcommands and JSON output already).

### Non-issues confirmed

- `Lxss` registry schema (`DistributionName`, `BasePath`, `ShortcutPath`, `TerminalProfilePath`) — unchanged; still the sanctioned GUID/location source.
- `ext4.vhdx` convention, `--manage --move/--resize/--set-sparse`, `--import/--export` — unchanged; 2.7.x even fixed VHD-ownership bugs in `--manage --move`.
- `.wsl` file distro format / tar-based architecture — already handled via our `--distribution-id` ≥ 2.4.4 gate.
- Windows 10 support, `\\wsl$` UNC prefix — still functional (`\\wsl.localhost` preferred but not forced).

## Recommended follow-up issues (in priority order)

1. Preserve unknown keys/sections/comments when writing `.wslconfig` and `/etc/wsl.conf` (fixes `virtiofs=true` + `[experimental]` destruction).
2. Set `WSL_UTF8=1` on all `wsl.exe` invocations; demote UTF-16 heuristics to fallback.
3. Broaden mounted-disk discovery beyond `/dev/sd*` (NVMe/virtiofs-ready).
4. Label-keyed `--version` parsing instead of positional fields.
5. (Feature) Evaluate a wslc container management panel.

## Sources

- https://github.com/microsoft/WSL/releases (2.6.0–2.9.9)
- https://devblogs.microsoft.com/commandline/wsl-container-is-now-available-for-public-preview/
- https://github.com/microsoft/Build26-DEM346-whats-new-in-windows-subsystem-for-linux
- https://github.com/microsoft/WSL/issues/40773, /issues/40719 (virtiofs quirks)
- https://github.com/microsoft/vscode/issues/276253 (WSL_UTF8 ecosystem handling)
- https://github.com/microsoft/WSL/issues/6235 (no JSON output yet)
- https://learn.microsoft.com/en-us/windows/wsl/wsl-config
