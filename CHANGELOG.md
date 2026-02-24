# Changelog

All notable changes to WSL UI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.18.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.17.0...v0.18.0) (2026-02-24)


### Features

* Add Russian, Polish and Turkish language support ([10621d3](https://github.com/octasoft-ltd/wsl-ui/commit/10621d36067c85adf023fc96cf5bbf9f5793bac3))


### Bug Fixes

* Update Chocolatey VERIFICATION.txt license to GPL v3 ([3165c24](https://github.com/octasoft-ltd/wsl-ui/commit/3165c249266726c7fe3bfd893a45c8a792b77f96))
* Update Chocolatey VERIFICATION.txt license to GPL v3 ([ddb5dfe](https://github.com/octasoft-ltd/wsl-ui/commit/ddb5dfefdcf96c61e22b879a821be1bbc5cb3259))

## [0.17.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.16.2...v0.17.0) (2026-02-23)


### Features

* Add "request a language" link in language settings ([7f972dc](https://github.com/octasoft-ltd/wsl-ui/commit/7f972dcf1a59dccb9d152426cf0381e321deefe4))
* Add i18n support with 11 languages ([277f84b](https://github.com/octasoft-ltd/wsl-ui/commit/277f84b4fd2865eca101d181c3c7a48cd17eaa20))
* Add i18n support with 11 languages + troubleshooting links ([573130b](https://github.com/octasoft-ltd/wsl-ui/commit/573130be567379985eecd3f131868abc66b7c18b))
* Add Troubleshooting links. ([a634734](https://github.com/octasoft-ltd/wsl-ui/commit/a6347343101121e8690a7d843c34a9854a84b2eb))
* Battle tested WSL GUI setup scripts. ([3f4e686](https://github.com/octasoft-ltd/wsl-ui/commit/3f4e686bb0728087effe228042ba5595d32ae3eb))
* Switch to GPL v3 license ([76c7ec6](https://github.com/octasoft-ltd/wsl-ui/commit/76c7ec67edb2a0a7f6ad4181b74753695a73391f))


### Bug Fixes

* Complete i18n coverage - translate all remaining hardcoded strings ([6e87410](https://github.com/octasoft-ltd/wsl-ui/commit/6e874109b8f659a414b643583c9127bd86bbf3db))
* Fix 5 e2e test failures across 3 spec files ([c2f93a8](https://github.com/octasoft-ltd/wsl-ui/commit/c2f93a8d8a0b7016cc2755a2964c30902fc41ea3))
* Fix language auto-detection for zh-TW and regional variants ([c32e68d](https://github.com/octasoft-ltd/wsl-ui/commit/c32e68df868417eb0ed51a30ec5b562347356eb8))
* Native-speaker quality review of all translations ([fd5fb16](https://github.com/octasoft-ltd/wsl-ui/commit/fd5fb16cd42d4c98fc51d5d270fec471c004184b))
* Translate theme descriptions in all locales ([3de1d63](https://github.com/octasoft-ltd/wsl-ui/commit/3de1d63743c244611c3303c0ed7dbb0990d7567c))

## [0.16.2](https://github.com/octasoft-ltd/wsl-ui/compare/v0.16.1...v0.16.2) (2026-02-09)


### Bug Fixes

* Hide terminal when checking wslconfig update status. ([5d1204b](https://github.com/octasoft-ltd/wsl-ui/commit/5d1204bf0774cd539a09682e36223e6ba4a2b783))
* Hide terminal when checking wslconfig update status. ([9eddd49](https://github.com/octasoft-ltd/wsl-ui/commit/9eddd498b0e444028099563144dc30ecd7067445))

## [0.16.1](https://github.com/octasoft-ltd/wsl-ui/compare/v0.16.0...v0.16.1) (2026-02-08)


### Bug Fixes

* remove defunct generate-store-icons step from release pipelines ([43b0dc2](https://github.com/octasoft-ltd/wsl-ui/commit/43b0dc2b5c90c8461c446f3da871084b042bcf06))
* remove defunct generate-store-icons step from release pipelines ([bcce14f](https://github.com/octasoft-ltd/wsl-ui/commit/bcce14f9a43c6b3b94bbfd6a89feefdf0d06e3f2))

## [0.16.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.15.0...v0.16.0) (2026-02-07)


### Features

* add Microsoft Store review prompt after first install ([6a812f5](https://github.com/octasoft-ltd/wsl-ui/commit/6a812f566c9d476c79b69c87aa636e2102f37da5))
* Detect pending wslconfig changes, ([761e878](https://github.com/octasoft-ltd/wsl-ui/commit/761e87819554dcc401b5c399a1cf2107321cc2fb))
* xrdp detection and quick rdp connection button on distro card. Opens terminal to keep alive if timeout settings not configured in wsl. ([938089f](https://github.com/octasoft-ltd/wsl-ui/commit/938089f4e0ef6eaf49dadb6cc8005744270f9dd2))


### Bug Fixes

* add shell:allow-open permission for Store URL ([3150cdc](https://github.com/octasoft-ltd/wsl-ui/commit/3150cdcaf1b058e1c92e83489d16d9e1178281c2))
* Fix microsoft store icons to be correct size - ([9db2048](https://github.com/octasoft-ltd/wsl-ui/commit/9db204803b1382d41754c485fbffff7b6b4fe51b))
* Fix microsoft store icons to be correct size - remove unused variants. ([18f3cc5](https://github.com/octasoft-ltd/wsl-ui/commit/18f3cc51354c95141783c2d3f97da1c4bb153ffc))
* tidy up icons. Use single canonical svg for generation ([d512564](https://github.com/octasoft-ltd/wsl-ui/commit/d5125644567112064f4da3bd40f4ec5db8646e9b))
* use custom Tauri command to open Store URL ([bb4abb1](https://github.com/octasoft-ltd/wsl-ui/commit/bb4abb15ecc084d749aa635b27bb7c09378e9f71))
* wait for settings to load before checking review prompt ([498c300](https://github.com/octasoft-ltd/wsl-ui/commit/498c3007b449850c0cf00703e1ec4014f112a63c))

## [0.15.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.14.0...v0.15.0) (2026-01-18)


### Features

* Compact vhdx support - invokes UAC as elevated permission required. ([a5601a0](https://github.com/octasoft-ltd/wsl-ui/commit/a5601a0486e28f0d0af54f4f2c2ddac2184d0ed0))
* Remove some functions from WSL 1 distros as not supported (clone, compact, sparse mode, resize) ([1b81015](https://github.com/octasoft-ltd/wsl-ui/commit/1b81015c3340ee1d130d6dcf53048e2787061139))


### Bug Fixes

* Closing app and then clicking off close dialog should take user back to UI - not minimise app to tray. ([0ab99b4](https://github.com/octasoft-ltd/wsl-ui/commit/0ab99b4d88d537d49dbc10e09785434daefdb7e8))

## [0.14.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.13.0...v0.14.0) (2026-01-12)


### Features

* New app screenshots ([bea0170](https://github.com/octasoft-ltd/wsl-ui/commit/bea01701ef4b6d32c1d09bc6b91398d2dc6c5aa0))

## [0.13.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.12.0...v0.13.0) (2026-01-12)


### Features

* Add version to tracking info ([2ccbf10](https://github.com/octasoft-ltd/wsl-ui/commit/2ccbf10e167650c3c2cc75011fe6c010f05d369a))

## [0.12.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.11.0...v0.12.0) (2026-01-12)


### Features

* Add force stop when stopping distro is taking too long. ([206ec06](https://github.com/octasoft-ltd/wsl-ui/commit/206ec06a515b7b036496f2cacc04d37a1603f4c9))
* Fix editing of fields halfway through pinging user to end of the line after single keypress. ([25b4346](https://github.com/octasoft-ltd/wsl-ui/commit/25b4346080b80d595413465add8c308d66a64cc7))
* New video at 1280 x 720 ([93e1da8](https://github.com/octasoft-ltd/wsl-ui/commit/93e1da8cc204e15c1edead27ed2ba9ada2a6348e))
* Reduce vertical spacing to fit 1280 x 720 ([93e1da8](https://github.com/octasoft-ltd/wsl-ui/commit/93e1da8cc204e15c1edead27ed2ba9ada2a6348e))
* Remove startup actions and replace with custom actions that run on startup ([93e1da8](https://github.com/octasoft-ltd/wsl-ui/commit/93e1da8cc204e15c1edead27ed2ba9ada2a6348e))
* Start app in 1280 x 720 ([93e1da8](https://github.com/octasoft-ltd/wsl-ui/commit/93e1da8cc204e15c1edead27ed2ba9ada2a6348e))

## [0.11.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.10.0...v0.11.0) (2026-01-12)


### Features

* add demo video ([db05022](https://github.com/octasoft-ltd/wsl-ui/commit/db05022eecc1a26ab8996b6374db86b0a9e6ea4d))
* add video to readme ([af1b6cd](https://github.com/octasoft-ltd/wsl-ui/commit/af1b6cd1b7ed25c13951a3f2fd72060b8a71e04a))
* add video to readme ([58f5ead](https://github.com/octasoft-ltd/wsl-ui/commit/58f5ead8e77730d875b0d7376234770cf9eee9cb))
* improve tracking to include source types ([b7d19a5](https://github.com/octasoft-ltd/wsl-ui/commit/b7d19a518f537c012dc626a7304783d9883c93dc))

## [0.10.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.9.0...v0.10.0) (2026-01-12)


### Features

* fix tracking ([8019317](https://github.com/octasoft-ltd/wsl-ui/commit/80193173df42a4b7c03f36627fb60b554d477f7f))
* fix tracking ([6253a27](https://github.com/octasoft-ltd/wsl-ui/commit/6253a2712a8e875a97c793a0c5ae2d6555701446))

## [0.9.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.8.0...v0.9.0) (2026-01-12)


### Features

* Use frontend tracking only. Fix e2e tests ([d548bb7](https://github.com/octasoft-ltd/wsl-ui/commit/d548bb7a5fbd5e50c945656817285eef58124174))

## [0.8.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.7.0...v0.8.0) (2026-01-12)


### Features

* add lightweight tracking and update privacy policy ([1c49cc2](https://github.com/octasoft-ltd/wsl-ui/commit/1c49cc29d5032ea327305e37625000577b3e9dd9))
* add lightweight tracking and update privacy policy ([7e5903f](https://github.com/octasoft-ltd/wsl-ui/commit/7e5903f5493478faf54c7aa20226b9ada5c39804))

## [0.7.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.6.0...v0.7.0) (2026-01-11)


### Features

* Add 300x300 icon for Microsoft Store ([6c7fc55](https://github.com/octasoft-ltd/wsl-ui/commit/6c7fc556be8f9ca11b4dc5e01667a407246e66fd))
* screenshots for distros ([225cc13](https://github.com/octasoft-ltd/wsl-ui/commit/225cc132b1efca353cdbeb0aeabf9820e5816c2b))
* screenshots for distros ([3220832](https://github.com/octasoft-ltd/wsl-ui/commit/32208326f5558601478ba3a9909bc1ceb74e0f27))

## [0.6.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.5.0...v0.6.0) (2026-01-11)


### Features

* Add support for arm64 ([687e721](https://github.com/octasoft-ltd/wsl-ui/commit/687e72161e6f938a3e4f1f1d55685be8c70f605b))


### Bug Fixes

* msi installer image justified to left ([7f21e99](https://github.com/octasoft-ltd/wsl-ui/commit/7f21e99671966d95244d72a09684d0e6806c7cea))

## [0.5.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.4.0...v0.5.0) (2026-01-11)


### Features

* Accessibility and high contrast theme ([5310b2f](https://github.com/octasoft-ltd/wsl-ui/commit/5310b2f55f5fc28389b81d6a923b8a6687637177))
* Accessibility and high contrast theme ([c5c3a4c](https://github.com/octasoft-ltd/wsl-ui/commit/c5c3a4c717d50be8837e560e777cee7f135bb9d7))
* tidy rust warnings ([13b1ffe](https://github.com/octasoft-ltd/wsl-ui/commit/13b1ffec499a0410529e8f5f3dce98fb710c235d))

## [0.4.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.3.0...v0.4.0) (2026-01-10)


### Features

* Smaller installers and portable exe in releases ([e799e54](https://github.com/octasoft-ltd/wsl-ui/commit/e799e54d69d61b5a92505f4e72b27716c6f440f3))


### Bug Fixes

* Consistent naming for MSIX output file ([db36688](https://github.com/octasoft-ltd/wsl-ui/commit/db36688d09ab0a5d6969967c17c38d549d8a3bc5))

## [0.3.0](https://github.com/octasoft-ltd/wsl-ui/compare/v0.2.1...v0.3.0) (2026-01-10)


### Features

* fix release ([56cb9de](https://github.com/octasoft-ltd/wsl-ui/commit/56cb9decd9b35a382eb7466de07c1f5f488d69c2))
* fix release ([c1823ed](https://github.com/octasoft-ltd/wsl-ui/commit/c1823ed181af999baf219d2e02c5ff3b7919c453))


### Bug Fixes

* Clean tag format and robust version parsing ([23849bf](https://github.com/octasoft-ltd/wsl-ui/commit/23849bf1a46c674493446dacca850f95d7a8b247))
* Correct MSIX build paths and executable name ([d92831d](https://github.com/octasoft-ltd/wsl-ui/commit/d92831dd56bc8b9bc652dfa439f1aab5ae500b1c))

## [0.2.1](https://github.com/octasoft-ltd/wsl-ui/compare/wsl-ui-v0.2.0...wsl-ui-v0.2.1) (2026-01-10)


### Bug Fixes

* Correct MSIX build paths and executable name ([d92831d](https://github.com/octasoft-ltd/wsl-ui/commit/d92831dd56bc8b9bc652dfa439f1aab5ae500b1c))

## [0.2.0](https://github.com/octasoft-ltd/wsl-ui/compare/wsl-ui-v0.1.0...wsl-ui-v0.2.0) (2026-01-10)


### Features

* fix release ([56cb9de](https://github.com/octasoft-ltd/wsl-ui/commit/56cb9decd9b35a382eb7466de07c1f5f488d69c2))
* fix release ([c1823ed](https://github.com/octasoft-ltd/wsl-ui/commit/c1823ed181af999baf219d2e02c5ff3b7919c453))

## [0.1.0] - 2025-01-10

### Added

#### Distribution Management
- Dashboard view with real-time status monitoring
- Start, stop, restart, and force stop distributions
- Set default distribution
- Shutdown all running instances
- Rename distributions with Windows Terminal and Start Menu updates
- Move distributions to different drives
- Resize virtual disk size
- Set default user per distribution
- Convert between WSL 1 and WSL 2
- Toggle sparse mode for disk space reclamation

#### Backup & Portability
- Export distributions to `.tar` archives
- Import distributions from `.tar` files
- Clone distributions with lineage tracking

#### Installation Sources
- Quick install from Microsoft Store catalog
- Create from Docker container images
- Create from Podman container images
- Built-in OCI implementation (no Docker/Podman required)
- Direct download from rootfs URLs with checksum validation
- Community catalog from Linux Containers (LXC) image server

#### Automation
- Quick actions menu (terminal, file explorer, IDE, restart, export, clone)
- Custom actions with variable substitution
- Startup actions for automatic command sequences

#### Configuration
- WSL global settings (.wslconfig) editor
- Per-distribution settings (wsl.conf) editor
- Configurable polling intervals with smart backoff
- Adjustable operation timeouts
- Custom executable paths

#### Theming
- 15 built-in themes (dark, light, and middle-ground options)
- Custom theme editor with 29 color variables
- Live preview

#### Integrations
- Windows Terminal, Command Prompt, and custom terminals
- VS Code, Cursor, and custom IDE support
- Windows File Explorer integration
- System tray mode with configurable close behavior
- VHD and physical disk mounting

#### Monitoring
- Real-time CPU, memory, and disk usage per distribution
- WSL health checks and preflight verification
- Status bar with running count, memory usage, and WSL IP

### Technical
- Built with Tauri 2.5 (Rust) and React 19 (TypeScript)
- ~15MB installer size
- Comprehensive unit and E2E test coverage
