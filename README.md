# WSL UI

A lightweight desktop application to manage Windows Subsystem for Linux (WSL)
distributions.

Built with [Tauri](https://tauri.app/) (Rust) and [React](https://react.dev/)
(TypeScript).

**Developed by [Octasoft Ltd](https://www.octasoft.co.uk)**

![Main Dashboard](docs/screenshots/main-distro-list.png)

## Features

- **Dashboard** - View all distributions with real-time status, CPU, memory, and disk usage
- **Quick Actions** - Terminal, file explorer, IDE, restart, export, clone
- **Install from Anywhere** - Microsoft Store, Docker/Podman images, LXC catalog, custom URLs
- **Backup & Restore** - Export, import, and clone distributions
- **Custom Actions** - Define reusable commands with variable substitution
- **WSL Settings** - Edit `.wslconfig` and `wsl.conf` from a visual interface
- **15 Themes** - Dark, light, and custom themes with live preview
- **System Tray** - Minimize to tray for quick access
- **Disk Mounting** - Mount VHD files and physical disks into WSL

See the [User Guide](docs/USER-GUIDE.md) for detailed features and screenshots.

## Installation

### From Microsoft Store

Coming soon.

### From Releases

Download the latest installer from the
[Releases](https://github.com/octasoft-ltd/wsl-ui/releases) page.

### From Source

**Prerequisites:** [Node.js](https://nodejs.org/) v18+,
[Rust](https://rustup.rs/), Windows (not WSL)

```bash
git clone https://github.com/octasoft-ltd/wsl-ui.git
cd wsl-ui
npm install
npm run tauri dev
```

## Documentation

- [User Guide](docs/USER-GUIDE.md) - Features, screenshots, and how-to guides
- [Troubleshooting](docs/TROUBLESHOOTING.md) - Solutions to common issues
- [Privacy Policy](docs/PRIVACY.md) - How we handle your data (we don't collect any)
- [Contributing](CONTRIBUTING.md) - How to contribute to the project

## Development

### Project Structure

```
wsl-ui/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── services/           # Tauri API wrappers
│   ├── store/              # Zustand state management
│   └── test/e2e/           # WebDriverIO E2E tests
├── src-tauri/              # Rust backend
│   └── src/                # Tauri commands and WSL logic
└── crates/wsl-core/        # Shared WSL parsing library
```

### Tech Stack

| Layer    | Technology        | Purpose                      |
|----------|-------------------|------------------------------|
| Desktop  | Tauri 2.x         | Native window, system access |
| Frontend | React 19 + Vite   | UI components                |
| Styling  | Tailwind CSS      | Utility-first CSS            |
| Backend  | Rust              | WSL command execution        |
| State    | Zustand           | State management             |

### Scripts

```bash
npm run tauri dev       # Development mode
npm run tauri build     # Production build
npm run test:run        # Unit tests
npm run test:e2e:dev    # E2E tests (mock mode)
```

## License

This project is licensed under the Business Source License 1.1 (BUSL-1.1) -
see the [LICENSE](LICENSE) file for details.

- **Free for personal use** and organizations with less than $1M annual revenue
- **Converts to Apache 2.0** four years after each version is published
- **Commercial licensing** available: wsl-ui@octasoft.co.uk

### Trademark Notice

"WSL UI" and "Octasoft" are trademarks of Octasoft Ltd. See the
[TRADEMARK](TRADEMARK) file for usage requirements for forks and derivative works.

## Links

- [Report Issues](https://github.com/octasoft-ltd/wsl-ui/issues)
- [Security Policy](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Credits](CREDITS.md)
