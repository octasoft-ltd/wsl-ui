# WSL UI - Complete Feature Reference

This document provides a comprehensive list of all features in WSL UI.

## 1. Distribution Management

### View & Monitor
- **Distribution List** - Grid view of all installed WSL distributions
- **Status Indicators** - Real-time online/offline status with color-coded badges
- **Resource Monitoring** - CPU, memory, and disk usage per distribution
- **OS Information** - Displays Linux distribution name and version
- **WSL Version Badge** - Shows WSL 1 or WSL 2 for each distribution
- **Installation Source** - Color-coded badges showing how each distro was installed

### Filtering & Sorting
- **Status Filter** - Filter by running (Online) or stopped (Offline)
- **Source Filter** - Filter by installation source (Store, Container, Download, Import, Clone, LXC)
- **WSL Version Toggle** - Show/hide WSL 1 or WSL 2 distributions
- **Sorting** - Default distribution first, then alphabetically

### Lifecycle Control
- **Start Distribution** - Launch a stopped distribution
- **Stop Distribution** - Gracefully terminate a running distribution
- **Restart Distribution** - Stop and start with one click
- **Force Stop** - Immediately terminate an unresponsive distribution
- **Shutdown All** - Stop all running WSL instances
- **Force Kill WSL** - Nuclear option to terminate all WSL processes (`wsl --shutdown --force`)
- **Set as Default** - Configure which distribution starts by default

### Advanced Management
- **Rename Distribution** - Change distribution name with options to:
  - Update Windows Terminal profile display name
  - Rename Start Menu shortcut
- **Move Distribution** - Relocate to a different drive/folder (requires WSL shutdown)
- **Resize Disk** - Expand VHDX virtual disk size (requires WSL shutdown)
- **Set Default User** - Configure which user logs in by default
- **Set WSL Version** - Convert between WSL 1 and WSL 2
- **Sparse Mode** - Toggle automatic disk space reclamation (requires WSL shutdown)

---

## 2. Installation Sources

### Quick Install (Microsoft Store)
- One-click installation of official distributions
- Includes: Ubuntu, Debian, Kali Linux, openSUSE, Alpine, and more
- Uses `wsl --install` for streamlined setup

### Container Images
- **Docker** - Create distributions from Docker container images
- **Podman** - Create distributions from Podman container images
- **Built-in OCI** - Native OCI implementation (no Docker/Podman required)
- **Custom Runtime** - Use any OCI-compatible container runtime
- Supports both public and authenticated private registries

### Direct Download
- Download rootfs archives from configurable URLs
- Built-in catalog with Ubuntu, Alpine, NixOS, Void Linux, and more
- Add custom download sources with URL and checksum
- SHA256 checksum validation

### Community Catalog (LXC)
- Browse Linux Containers image server
- Hundreds of distributions and versions
- Configurable cache duration
- Option to show unstable/development releases

---

## 3. Backup & Portability

### Export
- Export any distribution to a `.tar` archive
- Auto-generated filename with date stamp
- Choose save location via file dialog

### Import
- Restore distributions from `.tar` archives
- Choose installation name and location
- Automatic metadata tracking

### Clone
- Duplicate existing distributions with a new name
- Choose custom installation location
- Preserves lineage tracking in metadata
- Default name suggestion: `{source}-clone`

---

## 4. Quick Actions Menu

### Instant Access
- **Distribution Info** - View detailed information dialog
- **Open Terminal** - Launch terminal in the distribution
- **Open File Explorer** - Browse files in Windows Explorer
- **Open in IDE** - Open in VS Code or configured IDE
- **Restart** - Quick restart with one click
- **Export to File** - Export distribution to TAR
- **Clone** - Create a copy of the distribution
- **Set as Default** - Make this the default distribution

### Manage Submenu
- **Move Distribution** - Relocate to new location
- **Resize Disk** - Expand virtual disk size
- **Set Default User** - Configure default login user
- **Rename** - Change distribution name
- **Sparse Mode** - Toggle disk space reclamation
- **Set WSL Version** - Convert between WSL 1/2

---

## 5. Custom Actions

### Action Properties
- **Name** - Display name for the action
- **Icon** - Visual icon from 12 predefined icons
- **Command** - Shell command with variable substitution
- **Target Scope** - All distros, specific distros, or regex pattern

### Variables
- `${DISTRO_NAME}` - Distribution name
- `${HOME}` - Home directory path
- `${USER}` - Default user
- `${WINDOWS_HOME}` - Windows user directory (WSL path format)

### Execution Options
- **Confirm Before Run** - Show confirmation dialog
- **Show Output** - Display command output after execution
- **Requires Sudo** - Prompt for sudo password
- **Requires Stopped** - Require distribution to be stopped
- **Run in Terminal** - Execute in user's terminal window

### Management
- Create, edit, delete custom actions
- Drag to reorder
- Import/export actions as JSON
- Shell injection protection via proper escaping

---

## 6. Startup Actions

### Per-Distribution Configuration
- Select which distributions have startup actions
- Enable/disable startup configurations
- Run on app start vs. on distro start

### Action Chaining
- Multiple actions execute sequentially
- Reference custom actions or use inline commands
- Configure timeout per action (default: 60s)
- Option to continue on error or stop

---

## 7. Theming & Appearance

### Built-in Themes (17 themes)

**Dark Themes:**
- Mission Control (Default) - Cyan accents
- Obsidian - Amber/orange accents
- Cobalt - Deep blue with gold
- Dracula - Purple/pink vampire theme
- Nord - Arctic blue palette
- Solarized Dark - Classic readable theme
- Monokai - Vibrant editor colors
- GitHub Dark - GitHub's dark theme

**Middle-Ground Themes:**
- Slate Dusk - Twilight blue-gray
- Forest Mist - Earthy sage
- Rose Quartz - Soft mauve
- Ocean Fog - Coastal blue-gray

**Light Themes:**
- Daylight - Clean bright theme
- Mission Control Light
- Obsidian Light

**Accessibility Themes:**
- High Contrast - Maximum contrast (dark)
- High Contrast Light - Maximum contrast (light)

### Custom Theme Editor
- Full color customization with 29 configurable colors
- Color picker with hex input
- Live preview
- Reset to defaults
- Color groups:
  - Background (5 colors)
  - Text (4 colors)
  - Border (3 colors)
  - Accent (2 colors)
  - Status (5 colors)
  - Buttons (6 colors)
  - Scrollbar (3 colors)

---

## 8. Integration Features

### Terminal Integration
- **Windows Terminal** - Full support with profile detection
- **Windows Terminal Preview** - Early access version support
- **Command Prompt** - Fallback terminal
- **Custom Terminal** - Alacritty, Kitty, WezTerm, etc.
- **System Terminal** - Open WSL2 system shell (CBL-Mariner)

### IDE Integration
- **VS Code** - Default integration
- **Cursor** - AI-enhanced editor
- **Custom IDE** - Configure any IDE with command placeholders
- Opens directly to distribution root

### File Explorer Integration
- Open distributions in Windows Explorer
- UNC path support (`\\wsl$\{distro}`)
- Browse files directly

### System Tray
- Minimize to system tray
- Quick access menu
- Configurable close behavior:
  - Ask each time
  - Always minimize
  - Always quit

---

## 9. WSL Global Settings (.wslconfig)

### Resource Limits
- **Memory** - Maximum RAM allocation (e.g., 4GB, 8GB)
- **Processors** - Number of CPU cores
- **Swap Size** - Virtual memory size
- **Swap File** - Custom swap file path

### Features
- **GUI Applications** - Enable WSLg for Linux GUI apps
- **Localhost Forwarding** - Forward localhost ports to Windows
- **Nested Virtualization** - Run VMs inside WSL
- **Networking Mode** - NAT or mirrored networking
- **Pre-Release Updates** - Get early WSL features

### Advanced
- Kernel command line parameters
- VM idle timeout
- Debug console
- Page reporting
- Safe mode
- Auto memory reclaim (disabled/dropcache/gradual)

---

## 10. Per-Distribution Settings (wsl.conf)

### Automount
- **Enable Automount** - Mount Windows drives automatically
- **Mount fstab** - Process /etc/fstab entries
- **Mount Root** - Where drives mount (default: /mnt/)
- **Mount Options** - Additional options (metadata, permissions)

### Network
- **Generate /etc/hosts** - Auto-generate hosts file
- **Generate /etc/resolv.conf** - Auto-generate DNS config
- **Hostname** - Custom hostname for distribution

### Interoperability
- **Windows Interop** - Run Windows executables from Linux
- **Append Windows PATH** - Add Windows PATH to Linux PATH

### Boot
- **Enable systemd** - Start systemd as init system
- **Boot Command** - Command to run on distribution boot

### User
- **Default User** - Which user logs in by default

---

## 11. Polling & Auto-Refresh

### Configurable Intervals
- **Distribution Status** - Check running/stopped state (default: 10s)
- **Resource Stats** - Update CPU/memory usage (default: 5s)
- **WSL Health** - Check WSL service status (default: 10s)

### Smart Polling
- Automatic exponential backoff on timeouts
- Visual backoff indicator
- Manual reset option
- Pauses when app is minimized
- Skips resource polling when no distros running

---

## 12. Timeouts Configuration

### Operation Categories
- **Quick Operations** - List, version, status (default: 10s)
- **Standard Operations** - Start, stop, mount (default: 30s)
- **Long Operations** - Install, import, export (default: 10 min)
- **Shell Commands** - Custom action execution (default: 30s)
- **Sudo Commands** - Elevated operations (default: 2 min)

---

## 13. Executable Paths

### Configurable Commands
- **WSL** - Path to wsl.exe
- **PowerShell** - For system operations
- **Windows Terminal** - Terminal executable
- **Command Prompt** - Fallback terminal
- **File Explorer** - Windows Explorer path
- **WSL UNC Prefix** - UNC path prefix (`\\wsl$`)

### Installation Location
- **Default Install Path** - Base path for new distributions
- Supports environment variables (e.g., %LOCALAPPDATA%)
- Applies to import, clone, and container installations

---

## 14. Disk Mounting

### Mount Capabilities
- Mount VHD files into WSL
- Mount physical disks and partitions
- Specify mount name and options
- Choose filesystem type (ext4, etc.)
- Bare mount option (attach without mounting)

### Management
- View currently mounted disks
- List available physical disks
- Unmount individual or all disks
- Track mounts made via UI

---

## 15. Status & Health Monitoring

### Status Bar Information
- Default distribution name
- Running/total distribution count
- Total memory usage
- Current WSL IP address (clickable to copy)
- Mounted disks count
- Polling status indicator
- Operation in progress display

### Preflight Checks
- WSL installation verification
- Feature enablement check
- Virtualization status
- Kernel update detection
- Detailed error messages with help links

### WSL Version Info
- WSL version
- Kernel version
- WSLg version
- MSRDC version
- Direct3D version
- DXCore version
- Windows version

---

## 16. Distribution Catalog Management

### Microsoft Store
- View available distributions
- Add custom metadata
- Enable/disable entries

### Download Sources
- Add custom rootfs URLs
- Configure name, URL, checksum
- Enable/disable sources
- Reset to defaults

### Container Images
- Add OCI image references
- Configure registry, image, tag
- Enable/disable entries
- Reset to defaults

### Community Catalog (LXC)
- Configure server URL
- Set cache duration
- Show/hide unstable releases

---

## 17. Notifications

### Notification Types
- **Success** - Operation completed (auto-dismiss: 5s)
- **Info** - Informational messages
- **Warning** - Potential issues
- **Error** - Operation failures

### Features
- Toast-style notifications
- Dismissible with close button
- Color-coded by type
- Optional action buttons

---

## 18. Keyboard & Accessibility

### Features
- Semantic HTML structure
- ARIA labels and roles
- Keyboard navigation support
- Focus management
- Hover states on all interactive elements

---

## 19. Developer & Debug Features

### Debug Logging
- Enable verbose logging
- Access log folder
- Real-time log level changes

### E2E Testing Support
- Mock mode for testing without WSL
- Mock data injection
- Error simulation
- Reset mock state

---

## 20. Distribution Information Dialog

### Details Displayed
- Distribution ID (GUID)
- Name
- WSL Version
- State (Running/Stopped)
- Default user
- Installation source with reference
- Installation location
- Created timestamp
- Installation timestamp
- Disk size (with copy button)
- Memory usage (if running)
- CPU usage (if running)
- OS information

---

## Requirements Summary

### Operations Requiring Distribution Stopped
- Rename
- Export
- Clone
- Set WSL Version (convert)

### Operations Requiring WSL Shutdown
- Move distribution
- Resize disk
- Set WSL Version (convert)
- Toggle sparse mode

### Operations That Auto-Start Distribution
- Open terminal
- Open file explorer
- Open IDE

---

*This document is auto-generated from codebase analysis. Last updated: 2026-01-11*
