# Changelog

All notable changes to WSL UI will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
