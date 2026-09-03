//! Real WSL command executor - calls actual wsl.exe

use std::process::Stdio;
use std::time::Duration;
 use log::{debug, error, info};
use wsl_core::decode_wsl_output;

use super::{CommandOutput, WslCommandExecutor};
use crate::settings::{get_executable_paths, get_timeout_config};
use crate::utils::hidden_command;
use crate::wsl::executor::supports_distribution_id;
use crate::wsl::types::{WslError, WslPreflightStatus};

/// Extract WSL version from `wsl --version` output
/// The output format is like:
/// WSL version: 2.3.26.0
/// Kernel version: 5.15.167.4-1
/// ...
fn extract_wsl_version(output: &str) -> Option<String> {
    // Strip BOM that appears when decoding UTF-16 LE WSL output on non-English locales.
    // Without this, the first line starts with '\u{FEFF}' and starts_with("wsl") fails.
    let output = output.trim_start_matches('\u{FEFF}');
    for line in output.lines() {
        let line = line.trim();
        // Handle both "WSL version:" and "WSL バージョン:" (Japanese) etc.
        if line.to_lowercase().starts_with("wsl") && line.contains(':') {
            if let Some(version) = line.split(':').nth(1) {
                let version = version.trim();
                if !version.is_empty() {
                    return Some(version.to_string());
                }
            }
        }
    }
    None
}

/// Redact secrets from a command argument before it is logged. Sudo custom
/// actions are built as `echo <password> | sudo -S bash -c <cmd>`; the password
/// must never reach the log (GH #150) — with Debug Logging enabled the log
/// persists on disk and users attach it to bug reports.
fn redact_secrets_for_log(arg: &str) -> String {
    if let (Some(echo_pos), Some(sudo_pos)) = (arg.find("echo "), arg.find(" | sudo -S")) {
        if echo_pos + "echo ".len() <= sudo_pos {
            return format!("{}echo '***'{}", &arg[..echo_pos], &arg[sudo_pos..]);
        }
    }
    arg.to_string()
}

/// Locale-independent check that the configured WSL executable exists on disk.
/// Bare command names (the default setting is just "wsl") are resolved against
/// PATH the way CreateProcess does; explicit paths are checked directly.
fn executable_exists_on_disk(configured: &str) -> bool {
    let path = std::path::Path::new(configured);
    let has_extension = path.extension().is_some();

    if configured.contains('\\') || configured.contains('/') {
        return path.is_file() || (!has_extension && path.with_extension("exe").is_file());
    }

    // Bare command name: search PATH. wsl.exe lives in System32 or the
    // WindowsApps alias directory, both of which are on PATH.
    let file_name = if has_extension {
        configured.to_string()
    } else {
        format!("{}.exe", configured)
    };
    std::env::var_os("PATH")
        .map(|dirs| std::env::split_paths(&dirs).any(|dir| dir.join(&file_name).is_file()))
        .unwrap_or(false)
}

/// Classify a preflight command failure (spawn/wait error) into a preflight
/// status. GH #102: the human-readable part of a spawn failure comes from
/// FormatMessageW and is localized (e.g. "系统找不到指定的文件。" on zh-CN), so
/// English phrases alone misfire on non-English Windows. Locale-independent
/// signals are checked first: WSL hex error codes, the stable "(os error N)"
/// suffix Rust appends to io::Error text (2 = ERROR_FILE_NOT_FOUND,
/// 3 = ERROR_PATH_NOT_FOUND), and whether the executable exists on disk.
fn classify_preflight_command_failure(
    msg: &str,
    wsl_exists_on_disk: bool,
    configured_path: &str,
) -> WslPreflightStatus {
    let msg_lower = msg.to_lowercase();

    // WSL hex error codes are locale-independent; if present, wsl.exe ran.
    if msg_lower.contains("0x8007019e") {
        return WslPreflightStatus::FeatureDisabled {
            error_code: "0x8007019e".to_string(),
        };
    }
    if msg_lower.contains("0x80370102") {
        return WslPreflightStatus::VirtualizationDisabled {
            error_code: "0x80370102".to_string(),
        };
    }

    let not_found_by_os_code =
        msg_lower.contains("(os error 2)") || msg_lower.contains("(os error 3)");

    // English phrases kept as a fallback for messages that did not come from
    // io::Error (e.g. shell-produced text).
    let not_found_by_english_text = msg_lower.contains("not found")
        || msg_lower.contains("not recognized")
        || msg_lower.contains("cannot find")
        || msg_lower.contains("no such file")
        || msg_lower.contains("system cannot find");

    // Final locale-independent net: a spawn failure while the configured
    // executable is absent from disk means WSL is not installed, whatever the
    // localized message says.
    if not_found_by_os_code || not_found_by_english_text || !wsl_exists_on_disk {
        return WslPreflightStatus::NotInstalled {
            configured_path: configured_path.to_string(),
        };
    }

    WslPreflightStatus::Unknown {
        message: msg.to_string(),
    }
}

/// Real implementation that calls wsl.exe
pub struct RealWslExecutor;

impl RealWslExecutor {
    pub fn new() -> Self {
        Self
    }

    /// Get the default timeout from settings
    fn default_timeout(&self) -> Duration {
        Duration::from_secs(get_timeout_config().default_secs)
    }

    /// Get the quick timeout from settings
    fn quick_timeout(&self) -> Duration {
        Duration::from_secs(get_timeout_config().quick_secs)
    }

    /// Get the long timeout from settings
    fn long_timeout(&self) -> Duration {
        Duration::from_secs(get_timeout_config().long_secs)
    }

    /// Execute a WSL command with default timeout
    fn execute(&self, args: &[&str]) -> Result<CommandOutput, WslError> {
        self.execute_with_timeout(args, self.default_timeout())
    }

    /// Execute a WSL command with custom timeout
    fn execute_with_timeout(&self, args: &[&str], timeout: Duration) -> Result<CommandOutput, WslError> {
        debug!(
            "Executing WSL command: {:?}",
            args.iter().map(|a| redact_secrets_for_log(a)).collect::<Vec<_>>()
        );

        let paths = get_executable_paths();
        let mut child = hidden_command(&paths.wsl)
            .args(args)
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| {
                error!("Failed to spawn WSL command: {}", e);
                WslError::CommandFailed(e.to_string())
            })?;

        // Drain stdout and stderr in background threads to prevent pipe buffer
        // deadlock: if the child writes more than the OS pipe buffer (~4 KB) and
        // the parent is not reading, the child blocks indefinitely and never exits.
        let mut stdout_pipe = child.stdout.take();
        let mut stderr_pipe = child.stderr.take();

        let stdout_thread = std::thread::spawn(move || {
            let mut buf = Vec::new();
            if let Some(ref mut pipe) = stdout_pipe {
                use std::io::Read;
                let _ = pipe.read_to_end(&mut buf);
            }
            buf
        });

        let stderr_thread = std::thread::spawn(move || {
            let mut buf = Vec::new();
            if let Some(ref mut pipe) = stderr_pipe {
                use std::io::Read;
                let _ = pipe.read_to_end(&mut buf);
            }
            buf
        });

        let start = std::time::Instant::now();

        let status = loop {
            match child.try_wait() {
                Ok(Some(status)) => break status,
                Ok(None) => {
                    if start.elapsed() > timeout {
                        let _ = child.kill();
                        // Join reader threads so they clean up; they should exit
                        // quickly now that the child process has been killed.
                        let _ = stdout_thread.join();
                        let _ = stderr_thread.join();
                        error!("WSL command timed out after {} seconds", timeout.as_secs());
                        return Err(WslError::Timeout(
                            "WSL is not responding. Try 'Force Restart WSL' to recover.".into()
                        ));
                    }
                    std::thread::sleep(Duration::from_millis(50));
                }
                Err(e) => {
                    let _ = stdout_thread.join();
                    let _ = stderr_thread.join();
                    error!("Error waiting for WSL command: {}", e);
                    return Err(WslError::CommandFailed(e.to_string()));
                }
            }
        };

        let stdout_bytes = stdout_thread.join().unwrap_or_default();
        let stderr_bytes = stderr_thread.join().unwrap_or_default();

        let stdout = decode_wsl_output(&stdout_bytes);
        let stderr = decode_wsl_output(&stderr_bytes);

        if !status.success() {
            debug!("WSL command returned non-zero: {}", stderr);
        }

        Ok(CommandOutput {
            stdout,
            stderr,
            success: status.success(),
        })
    }

    /// Execute a long-running command (like install, export) with extended timeout
    fn execute_long(&self, args: &[&str]) -> Result<CommandOutput, WslError> {
        self.execute_with_timeout(args, self.long_timeout())
    }
}

impl Default for RealWslExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl WslCommandExecutor for RealWslExecutor {
    fn list_verbose(&self) -> Result<CommandOutput, WslError> {
        self.execute_with_timeout(&["--list", "--verbose"], self.quick_timeout())
    }

    fn list_online(&self) -> Result<CommandOutput, WslError> {
        self.execute(&["--list", "--online"])
    }

    fn start(&self, distro: &str, id: Option<&str>) -> Result<CommandOutput, WslError> {
        // Run a quick command to start the distro
        // Use --distribution-id if available and supported for more reliable identification
        match id.filter(|_| supports_distribution_id()) {
            Some(guid) => self.execute(&["--distribution-id", guid, "--", "echo", "started"]),
            None => self.execute(&["-d", distro, "--", "echo", "started"]),
        }
    }

    fn terminate(&self, distro: &str) -> Result<CommandOutput, WslError> {
        self.execute(&["--terminate", distro])
    }

    fn shutdown(&self) -> Result<CommandOutput, WslError> {
        self.execute(&["--shutdown"])
    }

    fn shutdown_force(&self) -> Result<CommandOutput, WslError> {
        self.execute(&["--shutdown", "--force"])
    }

    fn unregister(&self, distro: &str) -> Result<CommandOutput, WslError> {
        self.execute(&["--unregister", distro])
    }

    fn install(&self, distro: &str, name: Option<&str>, location: Option<&str>, no_launch: bool) -> Result<CommandOutput, WslError> {
        let mut args = vec!["--install", distro];

        if let Some(n) = name {
            args.push("--name");
            args.push(n);
        }
        if let Some(loc) = location {
            args.push("--location");
            args.push(loc);
        }
        if no_launch {
            args.push("--no-launch");
        }

        self.execute_long(&args)
    }

    fn import(&self, name: &str, location: &str, tarball: &str, version: Option<u8>) -> Result<CommandOutput, WslError> {
        let mut args = vec!["--import", name, location, tarball];
        let version_str;
        if let Some(v) = version {
            version_str = v.to_string();
            args.push("--version");
            args.push(&version_str);
        }
        self.execute_long(&args)
    }

    fn export(&self, distro: &str, file: &str, format: Option<&str>) -> Result<CommandOutput, WslError> {
        let mut args = vec!["--export", distro, file];
        if let Some(fmt) = format {
            args.push("--format");
            args.push(fmt);
        }
        self.execute_long(&args)
    }

    fn set_default(&self, distro: &str) -> Result<CommandOutput, WslError> {
        self.execute(&["--set-default", distro])
    }

    fn set_version(&self, distro: &str, version: u8) -> Result<CommandOutput, WslError> {
        let ver_str = version.to_string();
        // Version conversion can take several minutes (especially v1 → v2)
        self.execute_long(&["--set-version", distro, &ver_str])
    }

    fn set_sparse(&self, distro: &str, enabled: bool) -> Result<CommandOutput, WslError> {
        let val = if enabled { "true" } else { "false" };
        // Use --allow-unsafe as Microsoft has flagged sparse VHD support as potentially risky
        // The user has already been warned via the confirmation dialog before reaching here
        self.execute(&["--manage", distro, "--set-sparse", val, "--allow-unsafe"])
    }

    fn move_distro(&self, distro: &str, location: &str) -> Result<CommandOutput, WslError> {
        self.execute_long(&["--manage", distro, "--move", location])
    }

    fn resize(&self, distro: &str, size: &str) -> Result<CommandOutput, WslError> {
        self.execute(&["--manage", distro, "--resize", size])
    }

    fn set_default_user(&self, distro: &str, username: &str) -> Result<CommandOutput, WslError> {
        self.execute(&["--manage", distro, "--set-default-user", username])
    }

    fn mount_disk(&self, disk: &str, vhd: bool, bare: bool, name: Option<&str>,
                  fs_type: Option<&str>, options: Option<&str>, partition: Option<u32>) -> Result<CommandOutput, WslError> {
        let mut args = vec!["--mount", disk];

        if vhd {
            args.push("--vhd");
        }
        if bare {
            args.push("--bare");
        }
        if let Some(n) = name {
            args.push("--name");
            args.push(n);
        }
        if let Some(fs) = fs_type {
            args.push("--type");
            args.push(fs);
        }
        if let Some(opts) = options {
            args.push("--options");
            args.push(opts);
        }
        if let Some(p) = partition {
            let part_str = p.to_string();
            args.push("--partition");
            // Need to own this string
            return self.execute(&["--mount", disk,
                if vhd { "--vhd" } else { "" },
                if bare { "--bare" } else { "" },
                "--partition", &part_str].iter()
                .filter(|s| !s.is_empty())
                .copied()
                .collect::<Vec<_>>()
                .as_slice());
        }

        let args: Vec<&str> = args.into_iter().filter(|s| !s.is_empty()).collect();
        self.execute(&args)
    }

    fn unmount_disk(&self, disk: Option<&str>) -> Result<CommandOutput, WslError> {
        match disk {
            Some(d) => self.execute(&["--unmount", d]),
            None => self.execute(&["--unmount"]),
        }
    }

    fn version(&self) -> Result<CommandOutput, WslError> {
        self.execute_with_timeout(&["--version"], self.quick_timeout())
    }

    fn status(&self) -> Result<CommandOutput, WslError> {
        self.execute_with_timeout(&["--status"], self.quick_timeout())
    }

    fn update(&self, pre_release: bool, current_version: Option<&str>) -> Result<CommandOutput, WslError> {
        use log::info;

        let paths = get_executable_paths();

        // Use provided version or fall back to fetching it
        let version_before = current_version.map(|s| s.to_string()).or_else(|| {
            self.version().ok().and_then(|v| extract_wsl_version(&v.stdout))
        });

        debug!("WSL version before update: {:?}", version_before);

        // Build the wsl update arguments
        let wsl_args = if pre_release {
            "--update --pre-release"
        } else {
            "--update"
        };

        // Use PowerShell to run wsl.exe with elevation via Start-Process -Verb RunAs
        // This brings the UAC dialog to the foreground and shows "Windows Subsystem for Linux"
        // as the program requesting elevation (clean and trustworthy looking)
        // -WindowStyle Hidden prevents the command window from flashing
        // try-catch handles UAC cancellation which throws an exception
        let ps_script = format!(
            r#"try {{ $result = Start-Process -FilePath '{}' -ArgumentList '{}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ErrorAction Stop; exit $result.ExitCode }} catch {{ Write-Error $_.Exception.Message; exit 1223 }}"#,
            paths.wsl.replace('\\', "\\\\"),
            wsl_args
        );

        debug!("Running WSL update via PowerShell elevation: {}", wsl_args);
        info!("WSL update requires administrator privileges - UAC dialog will appear");

        let output = hidden_command(&paths.powershell)
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
            .output()
            .map_err(|e| {
                error!("Failed to run PowerShell for WSL update: {}", e);
                WslError::CommandFailed(e.to_string())
            })?;

        let success = output.status.success();
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();

        if !success {
            debug!("WSL update command failed with exit code: {:?}", output.status.code());
            // Check if user cancelled UAC - exit code 1223 is ERROR_CANCELLED
            if output.status.code() == Some(1223) {
                return Err(WslError::CommandFailed(
                    "Update cancelled - administrator approval was not granted".to_string()
                ));
            }
            return Err(WslError::CommandFailed(
                if stderr.is_empty() {
                    "WSL update failed".to_string()
                } else {
                    stderr
                }
            ));
        }

        // Get version AFTER update for comparison
        let version_after = self.version()
            .ok()
            .and_then(|v| extract_wsl_version(&v.stdout));

        debug!("WSL version after update: {:?}", version_after);

        // Build message based on version comparison
        let message = match (version_before, version_after) {
            (Some(before), Some(after)) if before != after => {
                format!("WSL updated from {} to {}", before, after)
            }
            (Some(ver), _) | (_, Some(ver)) => {
                format!("WSL is up to date (version {})", ver)
            }
            _ => {
                if pre_release {
                    "WSL update check completed (pre-release channel)".to_string()
                } else {
                    "WSL update check completed".to_string()
                }
            }
        };

        info!("{}", message);

        Ok(CommandOutput {
            stdout: message,
            stderr: String::new(),
            success: true,
        })
    }

    fn exec(&self, distro: &str, id: Option<&str>, command: &str) -> Result<CommandOutput, WslError> {
        // Use --distribution-id if available and supported for more reliable identification
        match id.filter(|_| supports_distribution_id()) {
            Some(guid) => self.execute(&["--distribution-id", guid, "--", "sh", "-c", command]),
            None => self.execute(&["-d", distro, "--", "sh", "-c", command]),
        }
    }

    fn exec_as_root(&self, distro: &str, id: Option<&str>, command: &str) -> Result<CommandOutput, WslError> {
        // Use -u root to run as root user for privileged operations
        match id.filter(|_| supports_distribution_id()) {
            Some(guid) => self.execute(&["--distribution-id", guid, "-u", "root", "--", "sh", "-c", command]),
            None => self.execute(&["-d", distro, "-u", "root", "--", "sh", "-c", command]),
        }
    }

    fn exec_with_timeout(&self, distro: &str, id: Option<&str>, command: &str, timeout_secs: u64) -> Result<CommandOutput, WslError> {
        let timeout = Duration::from_secs(timeout_secs);
        // Use --distribution-id if available and supported for more reliable identification
        match id.filter(|_| supports_distribution_id()) {
            Some(guid) => self.execute_with_timeout(
                &["--distribution-id", guid, "--", "sh", "-c", command],
                timeout
            ),
            None => self.execute_with_timeout(
                &["-d", distro, "--", "sh", "-c", command],
                timeout
            ),
        }
    }

    fn get_ip(&self, distro: &str) -> Result<CommandOutput, WslError> {
        // Use the system distro of an already-running distribution for reliable
        // IP detection. Uses 'ip route get 1' to find the source IP for outbound
        // traffic, which works with both NAT and mirrored networking modes.
        self.exec_system_with_timeout(
            distro,
            "ip route get 1 2>/dev/null | head -1 | sed 's/.*src \\([0-9.]*\\).*/\\1/'",
            self.quick_timeout().as_secs(),
        )
    }

    fn exec_system(&self, distro: &str, command: &str) -> Result<CommandOutput, WslError> {
        self.exec_system_with_timeout(distro, command, self.default_timeout().as_secs())
    }

    fn exec_system_with_timeout(&self, distro: &str, command: &str, timeout_secs: u64) -> Result<CommandOutput, WslError> {
        let timeout = std::time::Duration::from_secs(timeout_secs);
        // Run in the WSL2 system distro (CBL-Mariner/Azure Linux) scoped to the
        // given distribution. A bare `wsl --system` would target the default
        // distribution and boot it as a side effect (GH #157).
        self.execute_with_timeout(&["--system", "-d", distro, "--", "sh", "-c", command], timeout)
    }

    fn check_preflight(&self) -> WslPreflightStatus {
        let paths = get_executable_paths();

        debug!("Running WSL preflight check with executable: {}", paths.wsl);

        // Step 1: Check if wsl.exe exists and is executable
        // Try to run wsl --status with a short timeout
        let result = self.status();

        match result {
            Ok(output) => {
                // Log raw output for debugging
                debug!("Preflight stdout ({} chars): {:?}", output.stdout.len(), &output.stdout[..output.stdout.len().min(200)]);
                debug!("Preflight stderr ({} chars): {:?}", output.stderr.len(), &output.stderr[..output.stderr.len().min(200)]);
                debug!("Preflight exit success: {}", output.success);

                // WSL responded - check if there are any error indicators in the output
                let combined = format!("{}\n{}", output.stdout, output.stderr).to_lowercase();

                // Check for error patterns even if exit code is 0 (WSL sometimes returns 0 with error messages)
                // Note: "WSL1 is not supported" is NOT an error - it just means WSL1 mode isn't available
                // We only care if WSL2 is not supported (which indicates virtualization issues)
                let has_virtualization_error = combined.contains("0x80370102")
                    || combined.contains("virtual machine platform")
                    || (combined.contains("wsl2") && combined.contains("not supported"));

                let has_feature_disabled_error = combined.contains("0x8007019e")
                    || (combined.contains("windows subsystem for linux") && combined.contains("not enabled"));

                let has_kernel_update_error = combined.contains("0x1bc")
                    || (combined.contains("kernel") && combined.contains("update"));

                // Check for errors first, even if exit code was 0
                if has_virtualization_error {
                    return WslPreflightStatus::VirtualizationDisabled {
                        error_code: if combined.contains("0x80370102") {
                            "0x80370102".to_string()
                        } else {
                            "VM Platform required".to_string()
                        },
                    };
                }

                if has_feature_disabled_error {
                    return WslPreflightStatus::FeatureDisabled {
                        error_code: "0x8007019e".to_string(),
                    };
                }

                if has_kernel_update_error {
                    return WslPreflightStatus::KernelUpdateRequired;
                }

                if output.success {
                    debug!("WSL preflight check passed");
                    WslPreflightStatus::Ready
                } else {
                    // Command failed - get the full message for diagnosis
                    let full_msg = if output.stderr.trim().is_empty() {
                        output.stdout.trim().to_string()
                    } else {
                        output.stderr.trim().to_string()
                    };
                    debug!("WSL preflight failed with message: {}", full_msg);

                    // Return unknown error with the actual message
                    WslPreflightStatus::Unknown {
                        message: if full_msg.is_empty() { "Command failed with no output".to_string() } else { full_msg }
                    }
                }
            }
            Err(WslError::Timeout(_)) => {
                debug!("WSL preflight check timed out");
                WslPreflightStatus::Unknown {
                    message: "WSL is not responding (timeout)".to_string(),
                }
            }
            Err(WslError::CommandFailed(msg)) => {
                debug!("WSL preflight check failed: {}", msg);
                classify_preflight_command_failure(
                    &msg,
                    executable_exists_on_disk(&paths.wsl),
                    &paths.wsl,
                )
            }
            Err(e) => {
                debug!("WSL preflight check error: {}", e);
                WslPreflightStatus::Unknown {
                    message: e.to_string(),
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{classify_preflight_command_failure, redact_secrets_for_log};
    use crate::wsl::types::WslPreflightStatus;

    // GH #150: the sudo password must never appear in the debug log.
    #[test]
    fn test_redact_sudo_password_from_log() {
        let arg = "echo 'hunter2' | sudo -S bash -c 'apt update'";
        let redacted = redact_secrets_for_log(arg);
        assert!(!redacted.contains("hunter2"));
        assert_eq!(redacted, "echo '***' | sudo -S bash -c 'apt update'");
    }

    #[test]
    fn test_redact_handles_shell_wrapped_command() {
        let arg = "cd ~ 2>/dev/null; echo 'p@ss word' | sudo -S bash -c 'systemctl restart nginx'";
        let redacted = redact_secrets_for_log(arg);
        assert!(!redacted.contains("p@ss word"));
        assert!(redacted.contains("sudo -S bash -c 'systemctl restart nginx'"));
    }

    #[test]
    fn test_redact_leaves_ordinary_args_alone() {
        assert_eq!(redact_secrets_for_log("-d"), "-d");
        assert_eq!(redact_secrets_for_log("echo hello"), "echo hello");
        assert_eq!(
            redact_secrets_for_log("grep sudo -S file"),
            "grep sudo -S file"
        );
    }

    // GH #102: a missing wsl.exe on zh-CN Windows produces a localized spawn
    // message; only the "(os error 2)" suffix Rust appends is stable.
    #[test]
    fn test_preflight_not_installed_zh_cn_os_error_2() {
        let status = classify_preflight_command_failure(
            "系统找不到指定的文件。 (os error 2)",
            false,
            "wsl",
        );
        assert!(matches!(status, WslPreflightStatus::NotInstalled { .. }));
    }

    #[test]
    fn test_preflight_not_installed_german_os_error_3() {
        let status = classify_preflight_command_failure(
            "Das System kann den angegebenen Pfad nicht finden. (os error 3)",
            false,
            r"C:\missing\wsl.exe",
        );
        assert!(matches!(
            status,
            WslPreflightStatus::NotInstalled { configured_path } if configured_path == r"C:\missing\wsl.exe"
        ));
    }

    // GH #102: even without a recognizable message, a spawn failure while the
    // configured executable is absent from disk means WSL is not installed.
    #[test]
    fn test_preflight_not_installed_by_missing_executable() {
        let status = classify_preflight_command_failure(
            "アクセスが拒否されました。",
            false,
            "wsl",
        );
        assert!(matches!(status, WslPreflightStatus::NotInstalled { .. }));
    }

    #[test]
    fn test_preflight_english_not_found_still_detected() {
        let status = classify_preflight_command_failure(
            "The system cannot find the file specified. (os error 2)",
            false,
            "wsl",
        );
        assert!(matches!(status, WslPreflightStatus::NotInstalled { .. }));
    }

    // Hex error codes are locale-independent and mean wsl.exe actually ran, so
    // they must win over the not-found heuristics.
    #[test]
    fn test_preflight_feature_disabled_wins_on_localized_message() {
        let status = classify_preflight_command_failure(
            "适用于 Linux 的 Windows 子系统没有已安装的分发版。错误: 0x8007019e",
            true,
            "wsl",
        );
        assert!(matches!(status, WslPreflightStatus::FeatureDisabled { .. }));
    }

    #[test]
    fn test_preflight_virtualization_disabled_hex_code() {
        let status = classify_preflight_command_failure(
            "請啟用虛擬機器平台... 錯誤: 0x80370102",
            true,
            "wsl",
        );
        assert!(matches!(status, WslPreflightStatus::VirtualizationDisabled { .. }));
    }

    // An unrelated localized failure with wsl.exe present on disk must stay
    // Unknown and preserve the original message for diagnosis.
    #[test]
    fn test_preflight_unrelated_localized_error_stays_unknown() {
        let msg = "拒绝访问。 (os error 5)";
        let status = classify_preflight_command_failure(msg, true, "wsl");
        assert!(matches!(
            status,
            WslPreflightStatus::Unknown { message } if message == msg
        ));
    }
}
