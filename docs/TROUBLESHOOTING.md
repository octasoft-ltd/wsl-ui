# WSL UI Troubleshooting Guide

This guide documents known issues and their solutions encountered during development and usage.

---

## Issue #1: Quick Install completes but distro doesn't appear in WSL list

### Symptoms
- User clicks Quick Install for a distro (e.g., openSUSE-Leap-15.6)
- UI shows "Installing from Microsoft..." then "Installed successfully!"
- Distro does NOT appear in the app's distro list
- `wsl --list` does not show the distro
- No error message is displayed

### Root Cause
The `wsl --install <distro> --no-launch` command installs the Windows Store (AppX) package but does **not** register the distro with WSL for some distributions. The distro needs to be launched at least once to complete WSL registration.

**Technical details:**
- The AppX package is installed successfully (visible via `Get-AppxPackage`)
- The WSL registry entry (`HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss`) is NOT created
- The `--no-launch` flag prevents the first-launch registration from occurring
- Affected distros include openSUSE and potentially others that have custom first-boot setup

### Diagnosis
1. Check if AppX package is installed:
   ```powershell
   Get-AppxPackage -Name '*openSUSE*' | Select-Object Name, Version, Status
   ```
   If this shows `Status: Ok`, the package is installed but not registered with WSL.

2. Check WSL registry for registered distros:
   ```cmd
   reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Lxss" /s | findstr DistributionName
   ```
   The problematic distro will be missing from this list.

### Solution
**Fix applied in code:** Removed `--no-launch` flag from quick install. The distro now launches for first-time setup (user creation, password, etc.), which ensures proper WSL registration.

**Manual workaround (if issue occurs):**
1. Remove the orphaned AppX package:
   ```powershell
   Get-AppxPackage '*openSUSE*Leap*15.6*' | Remove-AppxPackage
   ```

2. Reinstall using `wsl --install` WITHOUT the `--no-launch` flag:
   ```cmd
   wsl --install openSUSE-Leap-15.6
   ```

3. Complete the first-time setup wizard that appears (create user, set password, etc.)

### Files Changed
- `src-tauri/src/wsl/install.rs`: Changed `quick_install_distribution()` to use `no_launch: false`
- Added `verify_distro_installed()` function to poll `wsl --list` and confirm registration

### Related
- WSL GitHub Issues: This appears to be expected behavior for `--no-launch` with certain distros
- Affects: openSUSE, potentially other distros with custom OOBE (Out-of-Box Experience)

---

## Issue #2: WSL is not responding / Operations timeout

### Symptoms
- Actions like Start, Stop, or listing distros hang indefinitely
- Error message appears: **"WSL is not responding. Try 'Force Restart WSL' to recover."**
- The app becomes unresponsive when interacting with WSL
- Commands eventually timeout after 30 seconds (default)

### Root Cause
The WSL service or VM can become unresponsive due to:
- **Terminal windows from newly installed distros** - If a distro was recently installed and the terminal window opened automatically during installation is still open, it can block WSL shutdown
- A hung process inside a distro
- WSL kernel crash or deadlock
- Resource exhaustion (memory, disk)
- Corrupted WSL state
- Windows update pending restart

### Diagnosis
1. Check if WSL processes are running:
   ```powershell
   Get-Process -Name wsl*, vmwp* | Format-Table Name, Id, CPU, WorkingSet
   ```

2. Try a simple WSL command from terminal:
   ```cmd
   wsl --list --verbose
   ```
   If this hangs, WSL is definitely unresponsive.

3. Check Windows Event Viewer for WSL errors:
   - Event Viewer → Applications and Services Logs → Microsoft → Windows → WSL

### Solution
**Quick fix:** If you recently installed a new distribution, close any terminal windows that were automatically opened during installation. These can prevent WSL from shutting down gracefully.

**In-app solution:** Use the "Force Shutdown WSL" button that appears in the error banner. This runs `wsl --shutdown --force` to immediately terminate all WSL processes.

**Manual recovery:**
1. Graceful shutdown:
   ```cmd
   wsl --shutdown
   ```

2. If that hangs, force kill WSL processes:
   ```powershell
   # Kill WSL processes
   Stop-Process -Name "wsl" -Force -ErrorAction SilentlyContinue
   Stop-Process -Name "wslservice" -Force -ErrorAction SilentlyContinue

   # Kill the Hyper-V VM worker (if WSL2)
   Get-Process -Name "vmwp" -ErrorAction SilentlyContinue | Stop-Process -Force
   ```

3. Restart WSL by launching any distro or running `wsl`

**Adjusting timeouts:** If you frequently experience timeouts on slower systems, you can increase the timeout values in Settings → Timeouts.

### Files Changed
- `src-tauri/src/wsl/executor/wsl_command/real.rs`: Timeout handling with configurable durations
- `src-tauri/src/wsl/core.rs`: `force_kill_wsl()` implementation
- `src-tauri/src/settings.rs`: `WslTimeoutConfig` for user-configurable timeouts

### Related
- Default timeouts: Quick (10s), Default (30s), Long operations (600s)
- Settings path: `%APPDATA%\wsl-ui\settings.json`

---

## Issue #3: WSL is not installed

### Symptoms
- App fails to start or shows error on launch
- Error message: **"WSL is not installed"**
- No distributions are listed
- All WSL operations fail

### Root Cause
WSL (Windows Subsystem for Linux) is not enabled or installed on the system. This is common on:
- Fresh Windows installations
- Systems where WSL was never enabled
- After certain Windows resets

### Diagnosis
1. Check if WSL is available:
   ```cmd
   wsl --version
   ```
   If this returns "not recognized" or an error, WSL is not installed.

2. Check Windows features:
   ```powershell
   Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux
   ```

### Solution
**Install WSL (Windows 10 version 2004+ or Windows 11):**

1. Open PowerShell or Command Prompt as **Administrator**

2. Run the install command:
   ```cmd
   wsl --install
   ```

3. **Restart your computer** when prompted

4. After restart, WSL will complete setup. You may be prompted to create a Linux user account.

**For older Windows 10 versions (pre-2004):**
1. Enable WSL feature:
   ```powershell
   dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
   ```

2. Enable Virtual Machine Platform (for WSL2):
   ```powershell
   dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
   ```

3. Restart your computer

4. Download and install the WSL2 kernel update from Microsoft:
   https://aka.ms/wsl2kernel

5. Set WSL2 as default:
   ```cmd
   wsl --set-default-version 2
   ```

### Files Changed
- `src/utils/errors.ts`: Error detection for "WSL not installed" scenario
- Provides user-friendly hint: "Run wsl --install in PowerShell as administrator"

### Related
- Microsoft WSL documentation: https://learn.microsoft.com/en-us/windows/wsl/install
- Minimum requirements: Windows 10 version 1903+ (build 18362+) for WSL2
- Windows 11 has WSL available by default (but may need enabling)

---

## Issue #4: Files left behind after unregistering a WSL distribution

### Symptoms
- After running `wsl --unregister <distro>`, files may still exist on disk
- Orphaned folders in custom install locations
- Disk space not fully reclaimed after removing a distro
- Old distro folders visible in File Explorer

### Root Cause
When you run `wsl --unregister <distro>`, WSL removes the registration and deletes the virtual disk (ext4.vhdx) at the registered path. However, files can be left behind in these scenarios:

1. **Wrong uninstall order** - If you uninstall the Microsoft Store app before running `--unregister`, the filesystem may become orphaned
2. **Custom install locations** - Distros imported with `wsl --import` to a custom path may leave the parent folder behind
3. **Store app remnants** - AppX packages keep files in `%LOCALAPPDATA%\Packages`

### Diagnosis
1. Check for remaining WSL filesystems:
   - Open File Explorer and look in `\\wsl$\` sidebar - the distro should no longer appear

2. Check for orphaned folders in common locations:
   ```powershell
   # Default WSL storage location
   dir "$env:LOCALAPPDATA\Packages" | Where-Object { $_.Name -like '*Linux*' -or $_.Name -like '*Ubuntu*' -or $_.Name -like '*SUSE*' -or $_.Name -like '*Debian*' }

   # Check custom import locations (if applicable)
   # e.g., wherever you specified with wsl --import
   ```

3. Verify the distro is fully unregistered:
   ```cmd
   wsl --list --all
   ```

### Solution
**Correct order of operations:**
1. First, unregister from WSL:
   ```cmd
   wsl --list --verbose
   wsl --unregister <DistroName>
   ```

2. Then uninstall the Store app (if applicable):
   - Settings → Apps → Search for the distro name → Uninstall

3. Verify cleanup and manually remove leftovers:
   ```powershell
   # Check and remove orphaned package folders
   $packages = Get-ChildItem "$env:LOCALAPPDATA\Packages" | Where-Object { $_.Name -match 'Linux|Ubuntu|SUSE|Debian|Kali|Fedora' }
   $packages | ForEach-Object { Write-Host $_.FullName }
   # Manually delete if confirmed orphaned
   ```

4. For custom-imported distros, manually delete the install folder:
   ```powershell
   # Example: if you imported to D:\WSL\MyDistro
   Remove-Item -Recurse -Force "D:\WSL\MyDistro"
   ```

**What `--unregister` removes:**
- The distro registration from WSL
- The ext4.vhdx virtual disk file
- All user data, settings, and installed software inside the distro

**What `--unregister` does NOT remove:**
- The parent folder (if custom location)
- Microsoft Store app package
- AppX package data in `%LOCALAPPDATA%\Packages`

### Related
- Microsoft WSL FAQ: https://learn.microsoft.com/en-us/windows/wsl/faq
- Once unregistered, all data is permanently lost unless backed up first
- Use `wsl --export <distro> <filename.tar>` to backup before unregistering

---

## Issue #5: Cannot pull images from private container registries

### Symptoms
- Error when trying to install a container image: "unauthorized" or "authentication required"
- Container images from private registries (e.g., GitLab Container Registry, private Docker Hub, AWS ECR) fail to download
- Public images work fine, but private/authenticated images fail

### Root Cause
The built-in OCI implementation only supports **public container registries**. It does not have access to credentials stored in Docker or Podman configuration files.

Private registries require authentication, which the built-in implementation cannot provide.

### Solution
**Use Docker or Podman as the container runtime:**

1. **Install Docker or Podman** on your Windows system if not already installed
   - Docker Desktop: https://www.docker.com/products/docker-desktop/
   - Podman Desktop: https://podman-desktop.io/

2. **Authenticate with your private registry** using the CLI:
   ```bash
   # For Docker
   docker login registry.example.com

   # For Podman
   podman login registry.example.com

   # For GitLab Container Registry
   docker login registry.gitlab.com

   # For AWS ECR
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.us-east-1.amazonaws.com
   ```

3. **Change the container runtime in WSL UI:**
   - Go to **Settings → Remote Sources**
   - Under **Container Runtime**, select **Docker** or **Podman**
   - This setting persists across sessions

4. **Install your private image** using the Container option in the New Distribution dialog

### How it works
- **Built-in OCI**: Downloads image layers directly from the registry. Fast and lightweight, but no authentication support.
- **Docker/Podman**: Uses the container runtime's credential store (`~/.docker/config.json` or similar). Supports all authentication methods the runtime supports.

### Settings location
Container runtime preference is stored in:
```
%LOCALAPPDATA%\wsl-ui\settings.json
```

Under the `containerRuntime` field:
- `"builtin"` - Built-in OCI (default)
- `"docker"` - Use Docker CLI
- `"podman"` - Use Podman CLI
- `{"custom": "command"}` - Custom runtime

### Related
- Docker credential helpers: https://docs.docker.com/engine/reference/commandline/login/#credential-helpers
- Podman authentication: https://docs.podman.io/en/latest/markdown/podman-login.1.html
- The runtime indicator is shown in the Container installation dialog

---

## Issue #6: E2E tests fail with "Origin header is not a valid URL"

### Symptoms
- E2E tests fail immediately in the `beforeEach` hook
- Error message: **"WebDriverError: javascript error: Origin header is not a valid URL"**
- All tests affected, not just specific ones
- The error occurs when `resetMockState()` tries to invoke Tauri commands via `browser.execute()`

### Root Cause
This is a WebDriver/tauri-driver infrastructure issue. The error occurs when:
1. The tauri-driver or msedgedriver becomes stale or corrupted
2. There are leftover processes from previous test runs
3. The WebDriver session has CORS/origin validation issues with the Tauri webview

### Diagnosis
1. Check for leftover processes:
   ```powershell
   Get-Process -Name "wsl-ui", "tauri-driver", "msedgedriver" -ErrorAction SilentlyContinue
   ```

2. Check if port 4444 is in use:
   ```cmd
   netstat -ano | findstr :4444
   ```

### Solution
**Kill all related processes and retry:**

1. Kill any running app instances:
   ```cmd
   taskkill /F /IM wsl-ui.exe
   ```

2. Kill tauri-driver and msedgedriver:
   ```cmd
   taskkill /F /IM tauri-driver.exe
   taskkill /F /IM msedgedriver.exe
   ```

3. Wait a few seconds for ports to clear, then retry the tests:
   ```cmd
   npm run test:e2e:dev -- --spec src/test/e2e/specs/your-test.spec.ts
   ```

**If the issue persists:**
- Update msedgedriver to match your Edge browser version
- Download from: https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/
- Place the executable in the project root

### Files Changed
- N/A - This is an infrastructure/environment issue

### Related
- tauri-driver documentation: https://github.com/nicksenger/tauri-driver
- WebDriver protocol: https://www.w3.org/TR/webdriver/
- This affects all E2E tests that use `browser.execute()` to invoke Tauri commands

---

## Issue #7: "Failed to translate" warnings when opening terminal

### Symptoms
- When opening a terminal for a distro, multiple warning lines appear before the shell prompt:
  ```
  wsl: Failed to translate 'C:\WINDOWS\system32'
  wsl: Failed to translate 'C:\WINDOWS'
  wsl: Failed to translate 'C:\WINDOWS\System32\Wbem'
  wsl: Failed to translate 'C:\WINDOWS\System32\WindowsPowerShell\v1.0\'
  wsl: Failed to translate 'C:\WINDOWS\System32\OpenSSH\'
  wsl: Failed to translate 'C:\Users\...\AppData\Local\Microsoft\WindowsApps'
  ```
- The shell still works, but these warnings clutter the terminal output
- Typically occurs after disabling drive mounting for a distro

### Root Cause
This happens when **automount is disabled** but **Append Windows PATH** is still enabled for the distro.

When `appendWindowsPath` is enabled (the default), WSL tries to add Windows PATH directories to the Linux PATH environment variable. To do this, it needs to translate Windows paths like `C:\WINDOWS\system32` to their Linux equivalents (e.g., `/mnt/c/WINDOWS/system32`).

However, if automount is disabled, the Windows drives are not mounted at `/mnt/c`, so WSL cannot translate these paths and emits a warning for each one.

### Diagnosis
1. Check if automount is disabled for the distro:
   - In WSL UI: Open distro settings → look for "Automount" toggle (should be OFF)
   - Or check `/etc/wsl.conf` inside the distro:
     ```bash
     cat /etc/wsl.conf
     ```
     Look for `[automount]` section with `enabled=false`

2. Check if appendWindowsPath is still enabled:
   - In WSL UI: Look for "Append Windows PATH" toggle (will be ON)
   - Or in `/etc/wsl.conf`: `[interop]` section, `appendWindowsPath` setting

### Solution
**In WSL UI:**
1. Open the distro's settings (gear icon)
2. Find the **"Append Windows PATH"** toggle (near the mount settings)
3. Turn it **OFF**
4. Restart the distro for changes to take effect

**Manual fix via wsl.conf:**
1. Edit `/etc/wsl.conf` inside the distro:
   ```bash
   sudo nano /etc/wsl.conf
   ```

2. Add or modify the `[interop]` section:
   ```ini
   [interop]
   appendWindowsPath=false
   ```

3. Restart the distro:
   ```cmd
   wsl --terminate <distro-name>
   ```

### Why This Makes Sense
When you disable automount, you're typically trying to isolate the Linux environment from Windows. The `appendWindowsPath` feature only works when Windows drives are mounted, so it should also be disabled for a clean, warning-free experience.

### Files Changed
- N/A - This is a WSL configuration issue, not an app bug

### Related
- WSL interop documentation: https://learn.microsoft.com/en-us/windows/wsl/wsl-config
- The `[interop]` section in wsl.conf controls Windows/Linux integration features
- `appendWindowsPath` defaults to `true` if not specified

---

## Issue #8: Permission denied when saving per-distribution settings (wsl.conf)

### Symptoms
- Error when trying to save per-distribution settings: "Permission denied"
- The distribution's `/etc/wsl.conf` file cannot be updated
- Error appears in logs mentioning write permission failure

### Root Cause
The `/etc/wsl.conf` file inside WSL distributions is typically owned by `root:root` with permissions `644` (read-only for non-root users). This is especially common with distributions installed from the Microsoft Store (e.g., Ubuntu).

When the app attempts to write to this file, it needs root privileges inside the distribution.

### How WSL UI handles this
The app writes to `/etc/wsl.conf` by running a command **as root** inside the distribution:
```bash
wsl -d <distro> -u root -- sh -c "cat > /etc/wsl.conf << 'EOF'
[automount]
enabled=true
...
EOF"
```

This approach:
- Requires the distribution to be **running** (or will start it)
- Uses `-u root` to execute with root privileges
- Safely writes the content using a heredoc

### Why UNC path writing doesn't work
An alternative approach would be writing via the Windows UNC path (`\\wsl$\Ubuntu\etc\wsl.conf`). However, this doesn't work for root-owned files because:
- UNC path access maps to the distribution's **default Linux user** (not root)
- Linux file permissions still apply
- There's no "sudo" equivalent for UNC path access

### Requirements
- The distribution must be **running** to save settings
- The app will execute a command as root inside the distro

### Solution
If you see permission errors:

1. **Ensure the distribution is running** before saving settings
   - Start the distribution from the main list if it's stopped

2. **Manual workaround** (if the app fails):
   ```bash
   # Open a terminal in the distribution
   wsl -d <distro-name>

   # Edit wsl.conf as root
   sudo nano /etc/wsl.conf

   # Save and restart the distro
   exit
   wsl --terminate <distro-name>
   ```

3. **Check file ownership** inside the distro:
   ```bash
   ls -la /etc/wsl.conf
   # Should show: -rw-r--r-- 1 root root ... /etc/wsl.conf
   ```

### Files Changed
- `src-tauri/src/settings.rs`: `write_wsl_conf()` now uses `wsl_executor().exec_as_root()`
- `src-tauri/src/wsl/executor/wsl_command/mod.rs`: Added `exec_as_root` trait method
- `src-tauri/src/wsl/executor/wsl_command/real.rs`: Implements `-u root` flag for root execution

### Related
- WSL wsl.conf documentation: https://learn.microsoft.com/en-us/windows/wsl/wsl-config#wslconf
- The `/etc/wsl.conf` file controls per-distribution settings like automount, network, interop, and boot options

---

## Issue #9: RDP session disconnects immediately

### Symptoms
- You click the Remote Desktop button for a distro with xrdp running
- The RDP connection opens but disconnects within seconds
- The distro appears to shut down shortly after connecting
- A keep-alive terminal opens automatically (this is expected behavior)

### Root Cause
WSL has default timeout settings that automatically shut down idle distributions:

- **instanceIdleTimeout**: Shuts down a distro after 15 seconds of no active console connections (default in recent WSL versions)
- **vmIdleTimeout**: Shuts down the entire WSL VM after all distros are idle

When you connect via RDP, there's no terminal/console session keeping the distro alive. Without the timeout settings configured, WSL considers the distro "idle" and shuts it down, even though you're actively using the graphical desktop.

### Diagnosis
1. Check your `.wslconfig` file:
   ```powershell
   notepad $env:USERPROFILE\.wslconfig
   ```

2. Look for these settings (they should NOT be commented out with `#`):
   ```ini
   [general]
   instanceIdleTimeout=-1

   [wsl2]
   vmIdleTimeout=-1
   ```

3. If these lines are missing or commented out, that's the issue.

### Solution
**Option 1: Configure WSL timeouts (recommended)**

Add these settings to your `.wslconfig` file to disable the idle timeouts:

1. Open or create the file:
   ```powershell
   notepad $env:USERPROFILE\.wslconfig
   ```

2. Add or uncomment these lines:
   ```ini
   [general]
   instanceIdleTimeout=-1

   [wsl2]
   vmIdleTimeout=-1
   ```

3. Restart WSL for changes to take effect:
   ```cmd
   wsl --shutdown
   ```

4. The Remote Desktop button will now connect without needing a keep-alive terminal.

**Option 2: Keep the terminal open (automatic workaround)**

If you don't want to modify your `.wslconfig`, the app automatically opens a keep-alive terminal when it detects timeouts aren't configured. Simply leave this terminal open during your RDP session. When you're done with RDP, you can close the terminal.

### Why -1?
Setting the timeout values to `-1` disables the timeout entirely. You can also set specific values in milliseconds if you prefer a longer timeout rather than disabling it completely:
- `instanceIdleTimeout=300000` = 5 minutes
- `vmIdleTimeout=600000` = 10 minutes

### Files Changed
- `src-tauri/src/commands.rs`: `check_wsl_config_timeouts()` function checks for these settings
- `src/store/distroStore.ts`: Opens keep-alive terminal when timeouts not configured

### Related
- WSL configuration documentation: https://learn.microsoft.com/en-us/windows/wsl/wsl-config#wslconfig
- The `.wslconfig` file is located at `%USERPROFILE%\.wslconfig`
- These settings apply globally to all WSL distributions

---

## Issue #10: RDP connection fails or connects to wrong distro

### Symptoms
- Clicking Remote Desktop connects to a different distro than expected
- RDP connection fails with "unable to connect" error
- xrdp appears to be running but RDP won't connect
- Only one of multiple distros with xrdp works

### Root Cause
Multiple WSL distributions are configured to use the same xrdp port (typically 3389 or 3390). Since all WSL2 distros share the same network namespace and localhost, only one distro can bind to a given port at a time.

When two distros both have xrdp configured on port 3390:
- Whichever distro starts xrdp **first** claims the port
- The second distro's xrdp fails to start (port already in use)
- Connecting to `localhost:3390` always reaches the first distro

### Diagnosis
1. Check which process owns the port from within WSL:
   ```bash
   # Run this in the distro you expect to be using the port
   sudo ss -tlnp | grep 3390
   ```

2. Check xrdp configuration in each distro:
   ```bash
   grep "^port=" /etc/xrdp/xrdp.ini
   ```

3. If multiple distros show the same port, that's the conflict.

### Solution
**Assign unique ports to each distro's xrdp:**

1. Edit `/etc/xrdp/xrdp.ini` in each distro:
   ```bash
   sudo nano /etc/xrdp/xrdp.ini
   ```

2. Change the `port=` line to a unique value for each distro:
   ```ini
   ; Distro 1 (e.g., Ubuntu)
   port=3390

   ; Distro 2 (e.g., Kali)
   port=3391

   ; Distro 3 (e.g., Debian)
   port=3392
   ```

3. Restart xrdp in each distro:
   ```bash
   sudo service xrdp restart
   ```

4. WSL UI will automatically detect the correct port for each distro when you click the Remote Desktop button.

### Suggested port allocation
| Distro | Port |
|--------|------|
| Primary distro | 3390 |
| Secondary distro | 3391 |
| Third distro | 3392 |
| ... | 3393+ |

Avoid using port 3389 as it's the Windows default RDP port and may conflict with Windows Remote Desktop services.

### Files Changed
- N/A - This is a configuration issue in the individual distros

### Related
- xrdp configuration: The `/etc/xrdp/xrdp.ini` file controls xrdp settings
- WSL UI reads the port from each distro's xrdp.ini to connect to the correct port
- All WSL2 distros share localhost - this is by design in WSL2's networking model

---

## Issue #11: WSL System Shell fails with GUI_APPLICATIONS_DISABLED

### Symptoms
- Clicking the system terminal icon (in the header) opens a terminal that immediately shows an error
- Error message:
  ```
  GUI application support is disabled via C:\Users\<username>\.wslconfig or /etc/wsl.conf.
  Error code: Wsl/Service/CreateInstance/WSL_E_GUI_APPLICATIONS_DISABLED

  [process exited with code 4294967295 (0xffffffff)]
  ```
- The "SYS" and "VER" info box in the header may not appear (when system distro is unavailable)

### Root Cause
The WSL2 "system distro" (CBL-Mariner/Azure Linux) is not running because GUI application support has been disabled. This happens when:

1. **`guiApplications=false`** is set in `%USERPROFILE%\.wslconfig`:
   ```ini
   [wsl2]
   guiApplications=false
   ```

2. Running **WSL 1** only - the system distro requires WSL 2

3. Using an **older WSL version** without WSLg support (pre-Store inbox version)

The system distro hosts WSLg (X/Wayland servers, PulseAudio) for GUI application support. When disabled, `wsl --system` commands fail with this error.

### Diagnosis
1. Check your `.wslconfig` file:
   ```powershell
   notepad $env:USERPROFILE\.wslconfig
   ```
   Look for `guiApplications=false` under `[wsl2]`

2. Check WSL version:
   ```cmd
   wsl --version
   ```
   WSLg requires WSL version 2.0+ from the Microsoft Store

3. Verify WSL 2 is available:
   ```cmd
   wsl --list --verbose
   ```
   Check the VERSION column - WSL 1 distros won't have system distro access

### Solution
**If you intentionally disabled GUI applications:**

This is expected behavior. The system shell is only available when the system distro (WSLg) is running. You can:
- Use a regular distro terminal instead of the system shell
- The app will hide the SYS/VER info box when the system distro is unavailable

**If you want to enable GUI application support:**

1. Edit your `.wslconfig`:
   ```powershell
   notepad $env:USERPROFILE\.wslconfig
   ```

2. Either remove the `guiApplications=false` line or set it to `true`:
   ```ini
   [wsl2]
   guiApplications=true
   ```

3. Restart WSL for changes to take effect:
   ```cmd
   wsl --shutdown
   ```

**If you need to update WSL:**

```cmd
wsl --update
```

Or install from the Microsoft Store for the latest features.

### Why disable GUI applications?
Users may intentionally disable GUI applications to:
- Reduce resource usage (the system distro uses ~200MB RAM)
- Run WSL in headless/server environments
- Avoid WSLg startup overhead when only using CLI applications

### Files Changed
- `src-tauri/src/wsl/info.rs`: `get_system_distro_info()` now returns `None` when system distro unavailable
- `src-tauri/src/commands.rs`: Updated return type to `Option<SystemDistroInfo>`
- `src/services/wslService.ts`: Updated TypeScript type to handle `null`
- `src/components/Header.tsx`: Already handles `null` by hiding SYS/VER box

### Related
- WSLg GitHub: https://github.com/microsoft/wslg
- WSL configuration: https://learn.microsoft.com/en-us/windows/wsl/wsl-config
- The system distro is based on CBL-Mariner (now Azure Linux)

---

## Template for New Issues

```markdown
## Issue #N: [Brief description]

### Symptoms
- What the user observes
- Error messages (if any)
- Expected vs actual behavior

### Root Cause
Technical explanation of why this happens.

### Diagnosis
Steps to confirm/diagnose the issue.

### Solution
How we fixed it or workaround steps.

### Files Changed
- List of files modified to fix the issue

### Related
- Links to external issues, documentation, etc.
```
