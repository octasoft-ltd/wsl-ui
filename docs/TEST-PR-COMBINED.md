# Combined PR Test Walkthrough (OCT-1000)

Branch: `test/combine-prs` (local only — not pushed)
Base: `origin/main` @ `741d8da`

## What's in this branch

All 9 open PRs merged on top of `main`. Order of merges and any resolutions:

| PR | Branch | Scope | Conflict? |
|---|---|---|---|
| #87 | `OCT-997-discord-user-asked` | docs: toolbar buttons in USER-GUIDE.md | clean |
| #88 | `OCT-941-...-small-display` | `NewDistroDialog` scales on small viewports | clean |
| #89 | `OCT-998-look-at-pr-raised-by-user` | font-family CSS vars + improved non-English fallback | clean |
| #91 | `OCT-549-...-dnstunneling-and-firewall` | `dnsTunneling`/`firewall` toggles in Global WSL settings | clean |
| #93 | `OCT-548-...-virtioproxy-and-none` | networking mode dropdown adds `virtioproxy`, `none`, deprecated `bridged` | resolved: i18n settings.json keys + `types/settings.ts` networkingMode comment merged with #91 |
| #94 | `OCT-445-periodically-refresh-distro-disksize` | periodic disk size refresh in distroStore | clean |
| #85 | `fix/adapt-system-font-fallback` (floatingrain) | font fallback simplification | resolved: kept #89's broader CJK fallback (#89 supersedes #85) |
| #90 | `OCT-799-...-error_path_not_found` | create parent dirs before `wsl --import` | resolved: TROUBLESHOOTING.md entry renumbered to Issue #15 (HEAD already had #12-14) |
| #92 | `OCT-551-...-custom-wsl-distribution-sources` | Settings panel to manage HKLM `DistributionListUrl` | resolved: main.rs command list merged with GPU commands, wslService.ts imports merged, i18n keys merged |

Verification on the combined branch:

- `npm run build` (tsc + vite) — clean
- `cd src-tauri && cargo check` — clean (one pre-existing `unused import` warning)

## Build for testing

```powershell
# Frontend + debug Tauri build (no installer bundle, fast)
npm run tauri:build:debug
# Built EXE: src-tauri\target\debug\wsl-ui.exe
```

Or for a normal dev session: `npm run tauri:dev`.

---

## Walkthrough — one section per PR

### ☐ PR #87 — Docs: toolbar buttons (OCT-997)

1. Open `docs/USER-GUIDE.md`.
2. Confirm new section documents the toolbar buttons (Sync, etc.).
   - **Pass** if the section reads clearly and matches the current toolbar.

### ☐ PR #88 — Install dialog scales on small displays (OCT-941)

1. Launch the app.
2. Resize the window so the content area is < ~525 px tall (very short).
3. Click **New** to open the install / new-distribution dialog.
4. Check:
   - The close (✕) button is visible at the top.
   - **Cancel** and **Install** action buttons are visible/reachable at the bottom (scroll if needed).
   - The dialog never extends beyond the viewport.
   - **Pass** if all controls are reachable at every reasonable window height.
5. Restore window to a normal size, confirm the dialog still looks fine.

### ☐ PR #89 — Font CSS variable consolidation + non-English fallback (OCT-998 / GitHub #84)

1. Inspect `src/index.css` and confirm `--font-mono` and `--font-ui` now include CJK fallbacks (`Noto Sans CJK SC`, `Source Han Sans`, etc.).
2. In the app, go to **Settings → Application → Language**, switch to `简体中文` (zh-CN).
3. Confirm Chinese characters render correctly (no missing glyphs / tofu boxes) across:
   - Main distro list
   - Settings page
   - Help dialog (open it from the toolbar)
4. Repeat with `日本語` (ja) and `한국어` (ko) — quick spot-check.
   - **Pass** if no missing-glyph boxes and the font feels consistent across pages.

### ☐ PR #85 — External font-fallback PR (floatingrain)

This PR was superseded by #89 — we kept #89's broader CJK fallback. No separate test needed beyond the #89 checks above. Worth a quick note in the PR thread that #89 supersedes it.

### ☐ PR #90 — Create parent dirs before `wsl --import` (OCT-799 / GitHub #86)

1. Pick or create a target install path with **missing parent directories**, for example:
   `D:\wsl-test\does\not\exist\arch-test`
   (Make sure `D:\wsl-test\does\not\exist` does NOT exist beforehand.)
2. Use the install/new-distribution flow to install any small distro (Alpine works well) into that path.
3. Check:
   - Installation completes without `Wsl/ERROR_PATH_NOT_FOUND` / `WSL_E_NO_FILE` error.
   - The missing parent dirs were created on disk.
   - The distro shows up in WSL (`wsl -l -v`).
4. `docs/TROUBLESHOOTING.md` now contains "Issue #15: Installation fails with `Wsl/ERROR_PATH_NOT_FOUND`...".
   - **Pass** if the install succeeds and parent dirs are created.

### ☐ PR #91 — `dnsTunneling` + `firewall` toggles (OCT-549 / GitHub #81)

1. Go to **Settings → Global WSL Settings → Networking**.
2. Confirm two new toggles are visible:
   - **DNS Tunneling**
   - **Windows Firewall**
3. Confirm the helper line "DNS Tunneling and Windows Firewall require Windows 11 22H2 or later" is shown.
4. Toggle each on/off, click **Save**.
5. Inspect `%USERPROFILE%\.wslconfig` — confirm `dnsTunneling=true|false` and `firewall=true|false` are written under `[wsl2]`.
6. Toggle back off, save, confirm `.wslconfig` updates again.
   - **Pass** if both toggles round-trip correctly to `.wslconfig`.

### ☐ PR #93 — Networking mode dropdown (OCT-548 / GitHub #80)

1. Go to **Settings → Global WSL Settings → Networking → Networking Mode**.
2. Open the dropdown. Confirm these options are present:
   - NAT (default)
   - Mirrored
   - virtioproxy
   - None
   - Bridged (deprecated) — should show the deprecation warning when selected.
3. Select **Bridged (deprecated)** — confirm the deprecation warning copy appears.
4. Try each non-deprecated option, **Save**, and check `.wslconfig` reflects the chosen `networkingMode=...` value.
   - **Pass** if all options are selectable, the deprecation warning shows, and `.wslconfig` reflects the selection.

> Cross-check with #91: both PRs touched the same locale files. After resolution, all networking translations should be present in EN at minimum (spot-check `src/i18n/locales/en/settings.json` lines around "networkingMode").

### ☐ PR #94 — Periodic disk size refresh (OCT-445)

1. Launch app with at least one distro installed and running.
2. Watch the **Disk size** column on the distro list.
3. Inside the WSL distro, create a large file: `dd if=/dev/zero of=/tmp/big bs=1M count=512`.
4. Wait for the next refresh tick (see `distroStore.test.ts` for cadence — should be on the order of seconds/tens of seconds, not require manual refresh).
5. Disk size should increase without you clicking **Refresh**.
6. Delete the file: `rm /tmp/big`. Confirm the disk size decreases on the next tick.
   - **Pass** if disk size auto-updates without manual refresh.

### ☐ PR #92 — Manage custom WSL distribution sources (OCT-551 / GitHub #83)

1. Go to **Settings**. There should be a new section: **WSL Distribution Sources** (or similar).
2. Confirm the current source is read from HKLM (or shows "Default / Microsoft" if none set).
3. **Preview manifest**: paste a custom distribution list URL, click **Preview**. Confirm the manifest content is shown without errors.
4. **Apply**: click **Apply**. Confirm:
   - HKLM `Software\Microsoft\Windows\CurrentVersion\Lxss\DistributionListUrl` is updated. (Check via `reg query`.)
   - The distro install list in the app reflects entries from the new source.
5. **Clear**: click **Clear**. Confirm the HKLM key is removed and the app falls back to the default list.
   - **Pass** if Preview / Apply / Clear all work and the registry round-trips correctly.

---

## Tear-down / cleanup after testing

```powershell
# Drop the test branch when done
git checkout main
git branch -D test/combine-prs
git branch -D pr-85-floatingrain     # local-only branch fetched from refs/pull/85
```

## Notes for landing the PRs

The combined branch is **local-only**. To get any individual PR ready to merge:

- For PRs that just needed a main rebase (#87, #88, #89, #91, #94): merge `origin/main` into the PR branch and push.
- For PRs that needed conflict resolution against another PR (#93 vs #91, #85 vs #89): land them in an order that picks the right winner — #91 before #93, #89 before #85 (or close #85 as superseded by #89).
- For PRs that needed conflict resolution against `main` (#90, #92): you can re-apply the same fix on each PR branch:
  - **#90**: in `docs/TROUBLESHOOTING.md`, renumber the new entry from `## Issue #12` to the next unused issue number after merging `main` (currently `#15`).
  - **#92**: in `src-tauri/src/main.rs`, place the new "Distribution sources" imports/handlers alongside the existing GPU commands; in `src/services/wslService.ts`, combine the type import line so it includes `GpuStatus, NvidiaContainerToolkitStatus` *and* the new `DistroSource, ManifestPreview` imports; in `src/i18n/locales/*/settings.json`, ensure both #91's and #93's keys remain (this branch already shows the merged JSON).
