//! Real resource monitor - queries actual system resources

use std::collections::HashMap;
use std::process::Stdio;
use std::time::{Duration, Instant};

use winreg::enums::*;
use winreg::RegKey;

use super::{DistroRegistryInfo, DistroResourceUsage, RenameRegistryResult, ResourceMonitor, WslHealth, WslHealthStatus};
use crate::settings::get_executable_paths;
use crate::permissions::{self, Failure, FailureKind, Operation};
use crate::utils::hidden_command;
use crate::wsl::types::{DiskPartition, PhysicalDisk, WslError, WSL_REGISTRY_PATH};

/// Real implementation that queries actual system resources
pub struct RealResourceMonitor;

impl RealResourceMonitor {
    pub fn new() -> Self {
        Self
    }

    /// Try Hyper-V with the caller's existing rights before requesting UAC.
    fn compact_with_optimize_vhd(&self, vhdx_path: &str) -> Result<(), Failure> {
        if std::env::var("FORCE_DISKPART").is_ok() {
            return Err(Failure { kind: FailureKind::Unavailable, message: "FORCE_DISKPART set".into() });
        }
        permissions::run_powershell(Operation::CompactHyperV, &format!(
            "Optimize-VHD -Path {} -Mode Full -ErrorAction Stop", permissions::quote(vhdx_path)
        )).map(|_| ())
    }

    /// DiskPart requires elevation at launch, even when Hyper-V rights are delegated.
    fn compact_with_diskpart(&self, vhdx_path: &str) -> Result<(), WslError> {
        if vhdx_path.contains(['\r', '\n', '"']) {
            return Err(WslError::CommandFailed("Invalid VHDX path for DiskPart".into()));
        }
        let directory = tempfile::Builder::new().prefix("wslui-diskpart-").tempdir()
            .map_err(|e| WslError::CommandFailed(format!("Cannot create DiskPart directory: {e}")))?;
        let script_file = directory.path().join("compact.txt");
        std::fs::write(&script_file, format!("select vdisk file=\"{}\"\ncompact vdisk\n", vhdx_path))
            .map_err(|e| WslError::CommandFailed(format!("Cannot write DiskPart script: {e}")))?;
        let script = format!("{}\nWrite-Output '{}0'",
            permissions::native_script("diskpart.exe", &["/s", &script_file.to_string_lossy()]),
            DISKPART_EXIT_MARKER);
        let output = permissions::run_powershell(Operation::CompactDiskpart, &script)?;
        diskpart_compact_outcome(&output, true).map_err(WslError::CommandFailed)
    }
}

/// Marker the elevated diskpart wrapper appends to its output file so the real
/// diskpart exit code survives the UAC boundary in a locale-independent form
/// (GH #102).
const DISKPART_EXIT_MARKER: &str = "WSLUI_DISKPART_EXIT=";

/// Extract the diskpart exit code from the wrapper's marker line, if present.
fn parse_diskpart_exit_marker(output: &str) -> Option<i64> {
    output
        .lines()
        .rev()
        .find_map(|line| line.trim().strip_prefix(DISKPART_EXIT_MARKER))
        .and_then(|code| code.trim().parse::<i64>().ok())
}

/// Decide whether an elevated diskpart compact run succeeded.
///
/// GH #102: diskpart output is fully localized, so "successfully compacted" /
/// "error" / "failed" never match on non-English Windows. The primary signal is
/// therefore diskpart's own exit code carried by the wrapper marker. The
/// narrow English failure phrases are kept only as a supplementary guard for
/// the English-locale case where diskpart exits 0 despite reporting an error.
fn diskpart_compact_outcome(captured_output: &str, launcher_success: bool) -> Result<(), String> {
    let output_lower = captured_output.to_lowercase();
    let success_text = output_lower.contains("successfully compacted");
    // Actual diskpart failure phrases, not the broad "error"/"failed" words —
    // diskpart echoes script lines, so a path like D:\errors\ext4.vhdx must
    // not trip the guard.
    let hard_error_text = output_lower.contains("diskpart has encountered an error")
        || output_lower.contains("virtual disk service error");

    if let Some(code) = parse_diskpart_exit_marker(captured_output) {
        if code != 0 {
            return Err(format!(
                "Diskpart failed (exit code {}): {}",
                code,
                captured_output.trim()
            ));
        }
        if hard_error_text && !success_text {
            return Err(format!("Diskpart failed: {}", captured_output.trim()));
        }
        return Ok(());
    }

    // No marker: the wrapper never reached diskpart (or an older script ran).
    // Fall back to the previous heuristics.
    if success_text {
        return Ok(());
    }
    if output_lower.contains("error") || output_lower.contains("failed") {
        return Err(format!("Diskpart failed: {}", captured_output.trim()));
    }
    if !launcher_success {
        let trimmed = captured_output.trim();
        return Err(if trimmed.is_empty() {
            "Diskpart compact failed with no output".to_string()
        } else {
            trimmed.to_string()
        });
    }
    Ok(())
}

fn compact_with_fallback(
    optimize: impl FnOnce() -> Result<(), crate::permissions::Failure>,
    diskpart: impl FnOnce() -> Result<(), WslError>,
) -> Result<(), WslError> {
    match optimize() {
        Ok(()) => Ok(()),
        Err(error) if error.kind == FailureKind::Unavailable => diskpart(),
        Err(error) => Err(error.into()),
    }
}

impl Default for RealResourceMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl ResourceMonitor for RealResourceMonitor {
    fn get_wsl_health(&self) -> WslHealth {
        let paths = get_executable_paths();

        // Check if WSL2 VM is running by looking for wslhost.exe processes
        log::debug!("Checking WSL health via PowerShell Get-Process wslhost");
        let vm_output = hidden_command(&paths.powershell)
            .args([
                "-NoProfile",
                "-Command",
                "@(Get-Process -Name wslhost -ErrorAction SilentlyContinue).Count",
            ])
            .output();

        let wslhost_count: u32 = vm_output
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    String::from_utf8_lossy(&o.stdout).trim().parse().ok()
                } else {
                    None
                }
            })
            .unwrap_or(0);

        let vm_running = wslhost_count > 0;
        log::debug!("WSL VM running: {} (wslhost count: {})", vm_running, wslhost_count);

        // Count wsl.exe processes for warning/unhealthy detection
        log::debug!("Counting wsl.exe processes via PowerShell Get-Process wsl");
        let output = hidden_command(&paths.powershell)
            .args([
                "-NoProfile",
                "-Command",
                "@(Get-Process -Name wsl -ErrorAction SilentlyContinue).Count",
            ])
            .output();

        let process_count: u32 = output
            .ok()
            .and_then(|o| {
                if o.status.success() {
                    String::from_utf8_lossy(&o.stdout).trim().parse().ok()
                } else {
                    None
                }
            })
            .unwrap_or(0);

        // Determine status based on VM state and process count
        let (status, message) = if !vm_running {
            (WslHealthStatus::Stopped, "WSL stopped".to_string())
        } else {
            match process_count {
                0..=49 => (
                    WslHealthStatus::Healthy,
                    "WSL running".to_string(),
                ),
                50..=99 => (
                    WslHealthStatus::Warning,
                    format!("{} WSL processes - consider restarting WSL", process_count),
                ),
                _ => (
                    WslHealthStatus::Unhealthy,
                    format!("{} WSL processes - WSL may be unstable, restart recommended", process_count),
                ),
            }
        };

        WslHealth {
            status,
            message,
            wsl_process_count: process_count,
            vm_running,
        }
    }

    fn get_wsl_memory_usage(&self) -> Result<u64, WslError> {
        let paths = get_executable_paths();

        // Use PowerShell to get vmmem process memory
        log::debug!("Querying WSL memory usage via PowerShell Get-Process vmmem");
        let output = hidden_command(&paths.powershell)
            .args([
                "-NoProfile",
                "-Command",
                "(Get-Process -Name vmmem*,Vmmem* -ErrorAction SilentlyContinue | Measure-Object WorkingSet64 -Sum).Sum",
            ])
            .output()
            .map_err(|e| WslError::CommandFailed(format!("Failed to query vmmem: {}", e)))?;

        if !output.status.success() {
            // vmmem might not exist if no WSL distros are running
            return Ok(0);
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let memory: u64 = stdout.trim().parse().unwrap_or(0);

        Ok(memory)
    }

    fn get_system_total_memory(&self) -> Option<u64> {
        let paths = get_executable_paths();
        log::debug!("Querying total system memory via PowerShell Get-CimInstance Win32_ComputerSystem");
        let output = hidden_command(&paths.powershell)
            .args([
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory",
            ])
            .output()
            .ok()?;

        if !output.status.success() {
            return None;
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        stdout.trim().parse().ok()
    }

    fn get_distro_resource_usage(&self, distro: &str) -> Result<DistroResourceUsage, WslError> {
        let paths = get_executable_paths();
        log::debug!("Getting resource usage for distro '{}'", distro);

        // Timeout for resource monitoring commands (5 seconds)
        let cmd_timeout = Duration::from_secs(5);

        // Helper to run a command with timeout.
        // Reads stdout/stderr in background threads to prevent pipe buffer deadlock:
        // if the child writes more than the OS pipe buffer (~4 KB) and the parent is
        // not reading, the child blocks indefinitely and never exits.
        let run_with_timeout = |mut child: std::process::Child| -> Option<std::process::Output> {
            let mut stdout_pipe = child.stdout.take();
            let mut stderr_pipe = child.stderr.take();

            let stdout_thread = std::thread::spawn(move || {
                let mut buf = Vec::new();
                if let Some(ref mut pipe) = stdout_pipe {
                    std::io::Read::read_to_end(pipe, &mut buf).ok();
                }
                buf
            });
            let stderr_thread = std::thread::spawn(move || {
                let mut buf = Vec::new();
                if let Some(ref mut pipe) = stderr_pipe {
                    std::io::Read::read_to_end(pipe, &mut buf).ok();
                }
                buf
            });

            let start = Instant::now();
            let status = loop {
                match child.try_wait() {
                    Ok(Some(status)) => break status,
                    Ok(None) => {
                        if start.elapsed() > cmd_timeout {
                            let _ = child.kill();
                            let _ = stdout_thread.join();
                            let _ = stderr_thread.join();
                            return None;
                        }
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    Err(_) => {
                        let _ = stdout_thread.join();
                        let _ = stderr_thread.join();
                        return None;
                    }
                }
            };

            let stdout = stdout_thread.join().unwrap_or_default();
            let stderr = stderr_thread.join().unwrap_or_default();
            Some(std::process::Output { status, stdout, stderr })
        };

        // Get number of CPU cores for normalization (with timeout)
        // Try nproc first, fallback to getconf which is more POSIX-compliant
        log::debug!("Querying CPU cores for '{}': wsl -d {} -- nproc", distro, distro);
        let num_cores: f64 = hidden_command(&paths.wsl)
            .args(["-d", distro, "--", "nproc"])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .ok()
            .and_then(|c| run_with_timeout(c))
            .and_then(|o| {
                if o.status.success() {
                    String::from_utf8_lossy(&o.stdout).trim().parse().ok()
                } else {
                    None
                }
            })
            .or_else(|| {
                // Fallback to getconf for Alpine/BusyBox
                log::debug!("Falling back to getconf for CPU cores: wsl -d {} -- getconf _NPROCESSORS_ONLN", distro);
                hidden_command(&paths.wsl)
                    .args(["-d", distro, "--", "getconf", "_NPROCESSORS_ONLN"])
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                    .ok()
                    .and_then(|c| run_with_timeout(c))
                    .and_then(|o| {
                        if o.status.success() {
                            String::from_utf8_lossy(&o.stdout).trim().parse().ok()
                        } else {
                            None
                        }
                    })
            })
            .unwrap_or(1.0);

        // Try procps-style ps first (has pcpu), fallback to BusyBox (rss only)
        let (total_rss_kb, total_cpu) = {
            // First try: procps with pcpu and rss
            log::debug!("Querying process stats for '{}': wsl -d {} -- ps -e -o pcpu=,rss=", distro, distro);
            let procps_result = hidden_command(&paths.wsl)
                .args(["-d", distro, "--", "ps", "-e", "-o", "pcpu=,rss="])
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .ok()
                .and_then(|c| run_with_timeout(c))
                .filter(|o| o.status.success());

            if let Some(output) = procps_result {
                // procps succeeded - parse pcpu and rss
                let stdout = String::from_utf8_lossy(&output.stdout);
                let mut rss: u64 = 0;
                let mut cpu: f64 = 0.0;
                for line in stdout.lines() {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 2 {
                        if let Ok(c) = parts[0].parse::<f64>() {
                            cpu += c;
                        }
                        if let Ok(r) = parts[1].parse::<u64>() {
                            rss += r;
                        }
                    }
                }
                (rss, Some(cpu))
            } else {
                // Fallback: BusyBox-compatible ps (rss only, no CPU support)
                log::debug!("Falling back to BusyBox ps for '{}': wsl -d {} -- ps -e -o rss=", distro, distro);
                let busybox_result = hidden_command(&paths.wsl)
                    .args(["-d", distro, "--", "ps", "-e", "-o", "rss="])
                    .stdout(Stdio::piped())
                    .stderr(Stdio::piped())
                    .spawn()
                    .ok()
                    .and_then(|c| run_with_timeout(c));

                match busybox_result {
                    Some(output) if output.status.success() => {
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        let mut rss: u64 = 0;
                        for line in stdout.lines() {
                            if let Ok(r) = line.trim().parse::<u64>() {
                                rss += r;
                            }
                        }
                        (rss, None) // No CPU info available on BusyBox
                    }
                    Some(output) => {
                        return Err(WslError::CommandFailed(format!(
                            "Failed to get stats for {}: {}",
                            distro,
                            String::from_utf8_lossy(&output.stderr)
                        )));
                    }
                    None => {
                        return Err(WslError::Timeout(format!("Resource stats for {} timed out", distro)));
                    }
                }
            }
        };

        // Normalize CPU% to 0-100% range (divide by number of cores)
        let normalized_cpu = total_cpu.map(|cpu| cpu / num_cores);

        Ok(DistroResourceUsage {
            name: distro.to_string(),
            memory_used_bytes: total_rss_kb * 1024,
            cpu_percent: normalized_cpu,
        })
    }

    fn get_all_distro_registry_info(&self) -> HashMap<String, DistroRegistryInfo> {
        let mut result = HashMap::new();

        // Open the WSL registry key
        log::debug!("Reading WSL registry: HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss");
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let lxss = match hkcu.open_subkey(WSL_REGISTRY_PATH) {
            Ok(key) => key,
            Err(_) => return result,
        };

        // Enumerate all subkeys (each is a GUID for a distribution)
        for guid_result in lxss.enum_keys() {
            let guid = match guid_result {
                Ok(g) => g,
                Err(_) => continue,
            };

            // Skip non-GUID keys (like DefaultDistribution value key)
            if !guid.starts_with('{') {
                continue;
            }

            // Open the distribution's subkey
            let distro_key = match lxss.open_subkey(&guid) {
                Ok(key) => key,
                Err(_) => continue,
            };

            // Read DistributionName (required)
            let name: String = match distro_key.get_value("DistributionName") {
                Ok(n) => n,
                Err(_) => continue,
            };

            // Read BasePath (optional)
            let base_path: Option<String> = distro_key.get_value("BasePath").ok();

            result.insert(
                name,
                DistroRegistryInfo {
                    id: guid,
                    base_path,
                },
            );
        }

        result
    }

    fn registry_confirms_no_distros(&self) -> bool {
        log::debug!("Checking Lxss registry for confirmed zero distros");
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let lxss = match hkcu.open_subkey(WSL_REGISTRY_PATH) {
            Ok(key) => key,
            // An absent Lxss key means WSL has never registered a distro;
            // any other error (e.g. access denied) means we cannot rule out
            // registered distros, so don't claim the empty state (GH #101).
            Err(e) => return e.kind() == std::io::ErrorKind::NotFound,
        };

        for guid_result in lxss.enum_keys() {
            match guid_result {
                // Any GUID subkey is a registered distro, even if its values
                // are currently unreadable
                Ok(name) if name.starts_with('{') => return false,
                Ok(_) => continue,
                // Enumeration failed - cannot confirm the key is empty
                Err(_) => return false,
            }
        }

        true
    }

    fn get_distro_base_path(&self, name: &str) -> Option<String> {
        // Reuse get_all_distro_registry_info which already uses winreg
        self.get_all_distro_registry_info()
            .get(name)
            .and_then(|info| info.base_path.clone())
    }

    fn get_distro_vhdx_size(&self, name: &str) -> Option<u64> {
        let vhdx_path = self.get_distro_vhdx_path(name)?;
        std::fs::metadata(&vhdx_path).ok().map(|m| m.len())
    }

    fn get_distro_vhdx_path(&self, name: &str) -> Option<String> {
        let base_path = self.get_distro_base_path(name)?;
        Some(format!(r"{}\ext4.vhdx", base_path))
    }

    fn compact_vhdx(&self, vhdx_path: &str) -> Result<(), WslError> {
        log::info!("Compacting VHDX: {}", vhdx_path);

        // Verify the file exists
        if !std::path::Path::new(vhdx_path).exists() {
            return Err(WslError::CommandFailed(format!(
                "VHDX file not found: {}",
                vhdx_path
            )));
        }

        compact_with_fallback(
            || self.compact_with_optimize_vhd(vhdx_path),
            || self.compact_with_diskpart(vhdx_path),
        )
    }

    fn list_physical_disks(&self) -> Result<Vec<PhysicalDisk>, WslError> {
        let paths = get_executable_paths();
        log::debug!("Listing physical disks via PowerShell Get-Disk");

        let ps_script = r#"
            Get-Disk | ForEach-Object {
                $disk = $_
                $partitions = Get-Partition -DiskNumber $disk.Number -ErrorAction SilentlyContinue | ForEach-Object {
                    $vol = Get-Volume -Partition $_ -ErrorAction SilentlyContinue
                    [PSCustomObject]@{
                        Index = $_.PartitionNumber
                        Size = $_.Size
                        FileSystem = if ($vol) { $vol.FileSystemType } else { $null }
                        DriveLetter = if ($_.DriveLetter) { "$($_.DriveLetter):" } else { $null }
                    }
                }
                [PSCustomObject]@{
                    DeviceId = "\\.\PHYSICALDRIVE$($disk.Number)"
                    FriendlyName = $disk.FriendlyName
                    Size = $disk.Size
                    Partitions = @($partitions)
                }
            } | ConvertTo-Json -Depth 3
        "#;

        let output = hidden_command(&paths.powershell)
            .args(["-NoProfile", "-Command", ps_script])
            .output()
            .map_err(|e| WslError::CommandFailed(e.to_string()))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(WslError::CommandFailed(stderr.to_string()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout);

        let disks = if stdout.trim().starts_with('[') {
            parse_physical_disks_json(&stdout)?
        } else if stdout.trim().starts_with('{') {
            parse_physical_disks_json(&format!("[{}]", stdout))?
        } else {
            Vec::new()
        };

        Ok(disks)
    }

    fn rename_distribution_registry(
        &self,
        id: &str,
        new_name: &str,
    ) -> Result<RenameRegistryResult, WslError> {
        // Open the WSL registry key for the distribution
        log::debug!("Renaming distribution in registry: {} -> {}", id, new_name);
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let lxss_path = format!(r"{}\{}", WSL_REGISTRY_PATH, id);

        let distro_key = hkcu
            .open_subkey_with_flags(&lxss_path, KEY_READ | KEY_WRITE)
            .map_err(|e| WslError::CommandFailed(format!("Failed to open registry key: {}", e)))?;


        // Get paths before renaming (for optional updates)
        let terminal_profile_path: Option<String> = distro_key.get_value("TerminalProfilePath").ok();
        let shortcut_path: Option<String> = distro_key.get_value("ShortcutPath").ok();

        // Update the DistributionName value
        distro_key
            .set_value("DistributionName", &new_name)
            .map_err(|e| WslError::CommandFailed(format!("Failed to update registry: {}", e)))?;

        Ok(RenameRegistryResult {
            
            terminal_profile_path,
            shortcut_path,
        })
    }
}

// === Helper Functions ===

/// Parse physical disks JSON from PowerShell output
fn parse_physical_disks_json(json_str: &str) -> Result<Vec<PhysicalDisk>, WslError> {
    #[derive(serde::Deserialize)]
    struct RawDisk {
        #[serde(rename = "DeviceId")]
        device_id: String,
        #[serde(rename = "FriendlyName")]
        friendly_name: String,
        #[serde(rename = "Size")]
        size: u64,
        #[serde(rename = "Partitions")]
        partitions: Option<serde_json::Value>,
    }

    #[derive(serde::Deserialize)]
    struct RawPartition {
        #[serde(rename = "Index")]
        index: u32,
        #[serde(rename = "Size")]
        size: u64,
        #[serde(rename = "FileSystem")]
        filesystem: Option<String>,
        #[serde(rename = "DriveLetter")]
        drive_letter: Option<String>,
    }

    let raw_disks: Vec<RawDisk> = serde_json::from_str(json_str)
        .map_err(|e| WslError::CommandFailed(format!("Failed to parse disk JSON: {}", e)))?;

    let disks = raw_disks
        .into_iter()
        .map(|raw| {
            let partitions = raw
                .partitions
                .map(|p| {
                    // Handle both array and single object
                    if p.is_array() {
                        serde_json::from_value::<Vec<RawPartition>>(p)
                            .unwrap_or_default()
                    } else if p.is_object() {
                        serde_json::from_value::<RawPartition>(p)
                            .map(|p| vec![p])
                            .unwrap_or_default()
                    } else {
                        Vec::new()
                    }
                })
                .unwrap_or_default()
                .into_iter()
                .map(|rp| DiskPartition {
                    index: rp.index,
                    size_bytes: rp.size,
                    filesystem: rp.filesystem,
                    drive_letter: rp.drive_letter,
                })
                .collect();

            PhysicalDisk {
                device_id: raw.device_id,
                friendly_name: raw.friendly_name,
                size_bytes: raw.size,
                partitions,
            }
        })
        .collect();

    Ok(disks)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Test that get_all_distro_registry_info returns valid data structure
    /// This test requires WSL to be installed on the system
    #[test]
    fn test_get_all_distro_registry_info_returns_hashmap() {
        let monitor = RealResourceMonitor::new();
        let info = monitor.get_all_distro_registry_info();

        // Should return a HashMap (may be empty if no WSL distros installed)
        // The test verifies the function runs without panicking and returns the correct type
        println!("Found {} distributions in registry", info.len());

        // If there are distributions, verify their structure
        for (name, registry_info) in &info {
            println!("  {} -> id: {}", name, registry_info.id);

            // GUID should be in the correct format
            assert!(
                registry_info.id.starts_with('{'),
                "GUID for {} should start with {{, got: {}",
                name,
                registry_info.id
            );
            assert!(
                registry_info.id.ends_with('}'),
                "GUID for {} should end with }}, got: {}",
                name,
                registry_info.id
            );

        }
    }

    /// Test that get_distro_base_path returns None for non-existent distro
    #[test]
    fn test_get_distro_base_path_nonexistent_returns_none() {
        let monitor = RealResourceMonitor::new();

        // This distro name is unlikely to exist
        let path = monitor.get_distro_base_path("__NonExistent_Test_Distro_12345__");
        assert!(path.is_none());
    }

    /// Test that GUIDs returned are unique
    #[test]
    fn test_registry_info_guids_are_unique() {
        let monitor = RealResourceMonitor::new();
        let info = monitor.get_all_distro_registry_info();

        if info.len() > 1 {
            let guids: Vec<&String> = info.values().map(|i| &i.id).collect();
            let unique_guids: std::collections::HashSet<&String> = guids.iter().copied().collect();

            assert_eq!(
                guids.len(),
                unique_guids.len(),
                "GUIDs should be unique across all distributions"
            );
        }
    }

    /// Test that base paths (when present) look valid
    #[test]
    fn test_base_paths_look_valid() {
        let monitor = RealResourceMonitor::new();
        let info = monitor.get_all_distro_registry_info();

        for (name, registry_info) in &info {
            if let Some(ref path) = registry_info.base_path {
                // Base path should look like a Windows path
                assert!(
                    path.contains('\\') || path.contains(':'),
                    "Base path for {} should be a Windows path, got: {}",
                    name,
                    path
                );
            }
        }
    }

    // ==================== GH #102: locale-independent diskpart/Optimize-VHD detection ====================

    #[test]
    fn test_diskpart_marker_parses_exit_code() {
        assert_eq!(
            parse_diskpart_exit_marker("some output\nWSLUI_DISKPART_EXIT=0"),
            Some(0)
        );
        assert_eq!(
            parse_diskpart_exit_marker("output\nWSLUI_DISKPART_EXIT=-2147024891\n"),
            Some(-2147024891)
        );
        assert_eq!(parse_diskpart_exit_marker("no marker here"), None);
    }

    // GH #102: zh-CN diskpart success prints no English words at all; the
    // marker exit code must be enough to report success.
    #[test]
    fn test_diskpart_zh_cn_success_via_marker() {
        let output = "Microsoft DiskPart 版本 10.0.26100.1150\n\
                      已选择虚拟磁盘文件。\n\
                      DiskPart 已成功压缩虚拟磁盘文件。\n\
                      WSLUI_DISKPART_EXIT=0";
        assert!(diskpart_compact_outcome(output, true).is_ok());
    }

    // GH #102: zh-CN diskpart failure has no "error"/"failed" text; the
    // non-zero marker exit code must surface it instead of silent success.
    #[test]
    fn test_diskpart_zh_cn_failure_via_marker() {
        let output = "DiskPart 遇到错误: 拒绝访问。\n\
                      有关详细信息，请参阅系统事件日志。\n\
                      WSLUI_DISKPART_EXIT=-2147024891";
        let result = diskpart_compact_outcome(output, true);
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("-2147024891"));
    }

    // Marker exit 0 but genuine English failure phrase: partial-failure guard
    // must still fire on English Windows.
    #[test]
    fn test_diskpart_english_partial_failure_with_exit_zero() {
        let output = "Virtual Disk Service error:\n\
                      The requested operation could not be completed.\n\
                      WSLUI_DISKPART_EXIT=0";
        assert!(diskpart_compact_outcome(output, true).is_err());
    }

    // A vhdx path containing "error" is echoed in diskpart's script output and
    // must not trip the failure guard when the exit code is 0.
    #[test]
    fn test_diskpart_path_containing_error_word_not_a_failure() {
        let output = "DISKPART> select vdisk file=\"D:\\errors\\ext4.vhdx\"\n\
                      已选择虚拟磁盘文件。\n\
                      WSLUI_DISKPART_EXIT=0";
        assert!(diskpart_compact_outcome(output, true).is_ok());
    }

    // Legacy paths (no marker, e.g. wrapper failed before diskpart ran) keep
    // the previous heuristics.
    #[test]
    fn test_diskpart_no_marker_falls_back_to_heuristics() {
        assert!(diskpart_compact_outcome(
            "DiskPart successfully compacted the virtual disk file.",
            true
        )
        .is_ok());
        assert!(diskpart_compact_outcome("DiskPart has encountered an error: access denied", true).is_err());
        assert!(diskpart_compact_outcome("", false).is_err());
        assert!(diskpart_compact_outcome("", true).is_ok());
    }

    #[test]
    fn compaction_only_falls_back_when_hyperv_is_unavailable() {
        use crate::permissions::{Failure, FailureKind};
        for kind in [FailureKind::Cancelled, FailureKind::PermissionDenied, FailureKind::Other, FailureKind::Unavailable] {
            let mut called = false;
            let result = compact_with_fallback(
                || Err(Failure { kind, message: "original failure".into() }),
                || { called = true; Ok(()) },
            );
            assert_eq!(called, kind == FailureKind::Unavailable);
            assert_eq!(result.is_ok(), kind == FailureKind::Unavailable);
        }
        let result = compact_with_fallback(|| Ok(()), || panic!("fallback after success"));
        assert!(result.is_ok());
    }

    /// Test performance - winreg should be fast (< 100ms for typical registry)
    #[test]
    fn test_registry_query_performance() {
        let monitor = RealResourceMonitor::new();

        let start = std::time::Instant::now();
        let _info = monitor.get_all_distro_registry_info();
        let duration = start.elapsed();

        println!("Registry query took {:?}", duration);

        // Should complete in under 100ms (typically < 5ms)
        assert!(
            duration.as_millis() < 100,
            "Registry query should be fast, took {:?}",
            duration
        );
    }
}
