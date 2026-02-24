# WSL UI User Guide

A complete guide to managing your WSL distributions with WSL UI.

## Table of Contents

- [Dashboard Overview](#dashboard-overview)
- [Managing Distributions](#managing-distributions)
- [Quick Actions](#quick-actions)
- [Installing New Distributions](#installing-new-distributions)
- [Linux Desktop Setup Scripts](#linux-desktop-setup-scripts)
- [Backup and Restore](#backup-and-restore)
- [Custom Actions](#custom-actions)
- [Language](#language)
- [Settings](#settings)
- [Themes](#themes)
- [Keyboard Shortcuts & Accessibility](#keyboard-shortcuts--accessibility)

---

## Dashboard Overview

The main dashboard shows all your WSL distributions at a glance.

![Main Dashboard](screenshots/main-distro-list.png)

Each distribution card displays:
- **Name** and Linux distribution info
- **Status badge** - Running (green) or Stopped (gray)
- **WSL version** - WSL 1 or WSL 2
- **Resource usage** - CPU, memory, and disk when running
- **Source badge** - How the distribution was installed (Store, Container, Import, etc.)

### Filtering Distributions

Use the filter bar to find specific distributions:

![Distribution Filters](screenshots/main-distro-filters.png)

- **Status** - Show only running or stopped distributions
- **Source** - Filter by installation method
- **WSL Version** - Show only WSL 1 or WSL 2

### Status Bar

The status bar at the bottom of the dashboard shows:
- Health status indicator
- WSL version with update button
- Mounted disks count
- Distribution count (instances/active)
- Total memory usage
- Default distribution name

---

## Managing Distributions

### Quick Actions Menu

Right-click any distribution or use the menu button to access quick actions:

![Quick Actions Menu](screenshots/menu-quick-actions.png)

- **Open Terminal** - Launch a terminal session
- **Open File Explorer** - Browse files in Windows Explorer
- **Open in IDE** - Open in VS Code or your configured IDE
- **Restart** - Stop and start the distribution
- **Export** - Save to a .tar backup file
- **Clone** - Create a duplicate
- **Set as Default** - Make this the default distribution

### Manage Submenu

Advanced management options are in the Manage submenu:

![Manage Submenu](screenshots/menu-manage-submenu.png)

- **Move** - Relocate to a different drive
- **Resize Disk** - Expand the virtual disk
- **Compact Disk** - Reclaim unused space from the virtual disk
- **Set Default User** - Change the login user
- **Rename** - Change the distribution name
- **Sparse Mode** - Enable automatic disk reclamation
- **Set WSL Version** - Convert between WSL 1 and 2

### Compact Disk

Reclaim unused disk space from a distribution's virtual disk (VHDX):

![Compact Disk Dialog](screenshots/dialog-compact-disk.png)

This operation performs three steps automatically:
1. **fstrim** - Zeros unused blocks inside the Linux filesystem
2. **WSL Shutdown** - Fully shuts down WSL to release file locks
3. **VHDX Compact** - Shrinks the virtual disk file on Windows

**Important notes:**
- Requires administrator privileges (UAC prompt will appear)
- WSL will be completely shut down during this operation
- Do not close the app or shut down your computer while compacting
- The operation typically takes 1-2 minutes depending on disk size

After completion, a notification shows how much space was reclaimed.

### Distribution Info

View detailed information about any distribution:

![Distribution Info](screenshots/dialog-distro-info.png)

Shows installation location, creation date, disk size, and more.

---

## Installing New Distributions

Click **New Distribution** in the header to install from multiple sources.

### Microsoft Store

One-click installation of official distributions like Ubuntu, Debian, and Kali Linux.

### Container Images

Create distributions from Docker or Podman images. WSL UI includes a built-in OCI implementation - no Docker installation required.

### Community Catalog (LXC)

Browse hundreds of distributions from the Linux Containers image server.

### Custom Sources

Add your own rootfs download URLs with optional checksum verification.

---

## Linux Desktop Setup Scripts

If you start from a vanilla distro install and want a full Linux desktop over RDP, use the distro-specific scripts in `scripts/`.

| Distro | Script | Matching Blog Guide |
|---|---|---|
| Ubuntu | `scripts/wsl2-ubuntu-desktop-xrdp.sh` | [wsl2-ubuntu-desktop-xrdp](https://wsl-ui.octasoft.co.uk/blog/wsl2-ubuntu-desktop-xrdp) |
| Fedora | `scripts/wsl2-fedora-desktop-xrdp.sh` | [wsl2-fedora-desktop-xrdp](https://wsl-ui.octasoft.co.uk/blog/wsl2-fedora-desktop-xrdp) |
| Kali | `scripts/wsl2-kali-desktop-winkex.sh` | [wsl2-kali-desktop-winkex](https://wsl-ui.octasoft.co.uk/blog/wsl2-kali-desktop-winkex) |
| Arch | `scripts/wsl2-arch-desktop-xrdp.sh` | [wsl2-arch-desktop-xrdp](https://wsl-ui.octasoft.co.uk/blog/wsl2-arch-desktop-xrdp) |
| openSUSE | `scripts/wsl2-opensuse-desktop-xrdp.sh` | [wsl2-opensuse-desktop-xrdp](https://wsl-ui.octasoft.co.uk/blog/wsl2-opensuse-desktop-xrdp) |

Run the script inside the target distro shell as your normal Linux user:

```bash
bash /path/to/wsl2-ui/scripts/wsl2-ubuntu-desktop-xrdp.sh
```

Each script includes:
- End-to-end desktop + XRDP/Win-KeX install flow for that distro
- Automatic `/tmp/.X11-unix` repair for the common WSLg/XRDP socket conflict
- XRDP port conflict handling (defaults to 3390, auto-shifts if already used)
- Service startup validation and troubleshooting hints
- Reminder for `.wslconfig` idle-timeout settings needed for stable RDP sessions

For common fixes after setup (black screen, auth failures, port conflicts), see:
- [WSL2 Desktop Troubleshooting](https://wsl-ui.octasoft.co.uk/blog/wsl2-gui-troubleshooting)

---
## Backup and Restore

### Export

Export any distribution to a `.tar` archive for backup or sharing:

1. Open the Quick Actions menu
2. Select **Export to File**
3. Choose a save location

### Import

Restore a distribution from a backup:

![Import Dialog](screenshots/dialog-import.png)

1. Click **Import** in the header
2. Select your `.tar` file
3. Choose a name and installation location

### Clone

Duplicate an existing distribution:

![Clone Dialog](screenshots/dialog-clone.png)

---

## Custom Actions

Create reusable commands that run inside your distributions.

![Custom Actions Settings](screenshots/settings-custom-actions.png)

### Creating Actions

Each action has:
- **Name** and **Icon** for display
- **Command** with variable substitution
- **Target** - All distributions, specific names, or regex patterns
- **Options** - Run in terminal, require sudo, show output

### Variables

Use these variables in your commands:
- `${DISTRO_NAME}` - Distribution name
- `${HOME}` - Linux home directory
- `${USER}` - Default user
- `${WINDOWS_HOME}` - Windows home in WSL path format

---

## Language

WSL UI supports multiple languages and automatically detects your system language on first launch.

### Changing Language

1. Open **Settings** from the gear icon in the header
2. Select the **Language** tab
3. Choose your preferred language from the list

The change takes effect immediately - no restart required.

### Auto-Detection

On first launch, WSL UI matches your Windows display language to the closest supported language. For example, `fr-CA` (French Canadian) will resolve to French, and `zh-TW` will resolve to Traditional Chinese.

If your language isn't detected correctly, you can always switch manually in settings.

### Requesting a New Language

Don't see your language? [Open an issue](https://github.com/octasoft-ltd/wsl-ui/issues) to request it.

---

## Settings

Access settings from the gear icon in the header.

### Application Settings

![Application Settings](screenshots/settings-app.png)

Configure your preferred terminal and IDE, startup behavior, and system tray options.

### WSL Global Settings

![WSL Global Settings](screenshots/settings-wsl-global.png)

Edit `.wslconfig` settings that apply to all distributions:
- Memory and CPU limits
- Swap size and location
- GUI applications (WSLg)
- Networking mode

### Per-Distribution Settings

![Distribution Settings](screenshots/settings-wsl-distro.png)

Edit `wsl.conf` settings for individual distributions:
- Automount options
- Network configuration
- Systemd and boot commands
- Windows interoperability

### Remote Sources

![Remote Sources](screenshots/settings-sources.png)

Manage distribution catalogs:
- Microsoft Store entries
- Custom download URLs
- Container image references
- LXC catalog settings

### Disk Mounting

![Disk Mount Panel](screenshots/panel-disk-mount.png)

Mount VHD files or physical disks into WSL.

---

## Themes

WSL UI includes 17 built-in themes with full customization support.

### Built-in Themes

![Appearance Settings](screenshots/settings-appearance.png)

**Dark Themes:** Mission Control, Obsidian, Cobalt, Dracula, Nord, Solarized Dark, Monokai, GitHub Dark

**Light Themes:** Daylight, Mission Control Light, Obsidian Light

**Middle-Ground:** Slate Dusk, Forest Mist, Rose Quartz, Ocean Fog

**Accessibility:** High Contrast (dark), High Contrast Light - Maximum contrast themes for low vision users

### Theme Example

![Dracula Theme](screenshots/theme-dracula.png)
*Dracula - Purple/pink vampire theme*

### Custom Theme Editor

Create your own theme with the custom editor. Adjust 29 color variables across backgrounds, text, borders, accents, and buttons with live preview.

---

## Keyboard Shortcuts & Accessibility

WSL UI is designed to be fully accessible with keyboard navigation and screen readers.

### Navigation

| Key | Action |
|-----|--------|
| **Tab** | Move to next interactive element |
| **Shift+Tab** | Move to previous interactive element |
| **Enter** | Activate buttons, submit forms |
| **Space** | Toggle checkboxes, activate buttons |
| **Arrow Keys** | Navigate within menus and lists |

### Dialogs & Menus

| Key | Action |
|-----|--------|
| **Escape** | Close any open dialog or menu |
| **Enter** | Submit dialog form (when valid) |
| **Tab** | Navigate between dialog fields |

### Quick Actions Menu

| Key | Action |
|-----|--------|
| **Enter** or **Space** | Open menu from trigger button |
| **Escape** | Close menu |
| **Arrow Down/Up** | Navigate menu items |

### Accessibility Features

- **Screen Reader Support** - All dialogs announce their title, status changes are announced via ARIA live regions
- **Focus Management** - Focus is trapped within dialogs and returns to the trigger element when closed
- **High Contrast Themes** - Two high contrast themes available (dark and light) for low vision users
- **Reduced Motion** - Animations are disabled when system prefers reduced motion
- **Keyboard Navigation** - All features accessible without a mouse

---

## Troubleshooting

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for solutions to common issues.

---

## More Information

- [Privacy Policy](PRIVACY.md)
- [GitHub Repository](https://github.com/octasoft-ltd/wsl-ui)
- [Report Issues](https://github.com/octasoft-ltd/wsl-ui/issues)

