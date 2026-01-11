# Changelog

All notable changes to WSL UI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
