# Manual Test Plan — issue backlog burn-down (2026-09-03)

Human verification steps for the fixes landed in the 2026-09-03 backlog pass
(OCT-1475). Every fix has automated unit coverage; the steps below cover the
parts that need a real WSL installation, real hardware, or visual judgement.

Build under test: a debug or release build containing the merged PRs
#146–#149, #100, and the OCT-1475 batch branch.

For each item: tick when verified, note build + result. Items marked
**[needs hardware/locale]** cannot be verified on a stock dev machine.

## 1. Default distro no longer auto-starts (GH #157)

1. `wsl --shutdown` from a terminal; confirm all distros Stopped (`wsl -l -v`).
2. Launch WSL UI. Wait 30 s on the dashboard.
3. `wsl -l -v` in a terminal: the default distro must still be **Stopped**.
4. In the app: go to Settings, return to the dashboard, repeat 3×. Alt-Tab
   away and back. The default distro must still be Stopped.
5. Start a *non-default* distro from the app, wait ~15 s: the default distro
   must remain Stopped (IP/system queries must target the running one).
6. Regression: with a distro running, the status bar should still show the
   WSL IP address within one poll cycle (~10 s).

## 2. Startup with Google Fonts blocked (GH #158) **[needs network block]**

1. Block `fonts.googleapis.com` and `fonts.gstatic.com` (hosts file →
   `0.0.0.0`, or a firewall rule).
2. Launch the app. The UI must render in ≤ ~2 s with correct typography
   (JetBrains Mono for monospace, Outfit for UI text — compare against an
   unblocked machine).
3. DevTools (debug build) → Network: there must be **no** request to
   `fonts.googleapis.com` / `fonts.gstatic.com` at all.

## 3. Sudo password never in logs (GH #150)

1. Settings → enable Debug Logging.
2. Create a custom action with "Requires sudo" (e.g. `apt-get update`),
   run it from Quick Actions, enter a recognisable dummy password
   (e.g. `CANARY-hunter2`).
3. Open the log file (`%LOCALAPPDATA%\wsl-ui\logs\` or equivalent Folder
   target) and search for `CANARY`. It must appear **nowhere**; the logged
   command must show `echo '***' | sudo -S ...`.

## 4. Physical disk mount (GH #112) **[needs a spare physical disk; admin]**

1. Status bar → Mount disk → Physical disk tab, pick a non-system disk.
2. Bare mount: must no longer fail with "Invalid path"; after mounting,
   `wsl -d <distro> -- lsblk` shows the new device.
3. Repeat with a partition + filesystem type: mount succeeds and appears
   under `/mnt/wsl/`.
4. Unmount from the app; `lsblk` confirms removal.
   (Note: bare mounts do not appear in the app's mounted list — that is
   GH #130, still open.)

## 5. Mounted VHD shows the VHD icon (GH #113)

1. Mount a VHDX from the app (Mount disk → VHD tab, not bare).
2. The Mounted Disks panel must show the VHD glyph (◉), not the physical
   disk glyph (●). Mount a physical disk to compare (●).

## 6. Polling backoff recovers after a transient timeout (GH #115)

1. With the app open, force a WSL stall: `wsl --shutdown` while several
   distros are running, or briefly suspend `wslservice.exe` (Process
   Explorer) during a poll so one poll times out.
2. The status bar may show "Auto-refresh slowed".
3. Once WSL responds again, within 1–2 poll cycles the banner must clear
   on its own and the refresh interval return to normal — without pressing
   Reset backoff and without restarting the app.

## 7. .wslconfig Processors input (GH #118)

1. Settings → WSL Global. Type `-1` into Processors: the field clears
   (treated as unset); the spinner cannot go below 1.
2. Enter memory `4GB` and processors `-1`, then save: the save must succeed
   and the memory value must persist (previously the whole save failed).

## 8. LXC release ordering (GH #122)

1. New distribution → LXC catalog → Alpine.
2. Releases must be ordered newest-first numerically: 3.21, 3.20, …, 3.10,
   3.9 (previously 3.9 sorted above 3.10/3.20).

## 9. Custom rootfs URL validation (GH #136)

1. New distribution → custom URL field → type `not a url` → "Use URL".
2. A validation error must appear ("… is not a valid URL"); the dialog must
   remain usable (no dead button). A valid URL must proceed to the install
   config as before.

## 10. Editing a disabled source keeps it disabled (GH #120)

1. Settings → Distribution sources → add a custom download source, then
   toggle it off.
2. Edit it (change the description), save.
3. The source must still be **disabled** and must not appear in the New
   distribution picker. Same check for a custom container image.

## 11. Fresh-install settings input (GH #138)

1. Back up then delete `%LOCALAPPDATA%\wsl-ui\settings.json` (or rename).
2. Launch the app → Settings → Paths: the "Default install base path"
   input renders as an empty editable field; the debug console (debug
   build) shows no React "uncontrolled → controlled" warning.

## 12. Merged PR spot-checks (#146–#149, #100)

- **#129 / PR 146:** put `vmIdleTimeout=-1` in `.wslconfig`, change any
  unrelated WSL Global setting, save → `-1` must survive in the file.
- **#123 / PR 147:** with a distro running, trigger Resize → "Shutdown &
  Continue" while WSL refuses to stop (e.g. suspend wslservice): the
  destructive dialog must NOT proceed to a still-running VM.
- **#106 / PR 149:** install from a container image (e.g.
  `docker.io/library/alpine:latest`): import succeeds; a corrupted layer
  (unplug network mid-pull) must produce a "digest/size mismatch" error,
  not a corrupt distro.
- **#111 / PR 148:** save wsl.conf fields containing quotes/newlines via
  Settings → per-distro; `/etc/wsl.conf` must stay a valid INI.
- **#99 / PR 100:** on a zh-CN/ja-JP Windows locale (or VM), WSL error
  panels must render readable localized text, no mojibake.
  **[needs locale]**

## 13. Still open, known-not-fixed (do not fail the pass on these)

- GH #130: bare mounts invisible in the mounted list / tracking wiped on
  empty refresh.
- GH #154: quick-install catalog can be empty when catalog endpoints are
  unreachable (needs reporter follow-up).
- GH #155/PR 156: Quick Actions clipping — fix under review from an
  external contributor.
- Remaining audit-filed backlog (#101–#145 subset) tracked individually.
