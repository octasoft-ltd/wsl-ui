//! Real resource monitor - queries actual system resources

use std::collections::HashMap;
use std::process::Stdio;
use std::time::{Duration, Instant};

use winreg::enums::*;
use winreg::RegKey;

use super::{DistroRegistryInfo, DistroResourceUsage, RenameRegistryResult, ResourceMonitor, WslHealth, WslHealthStatus};
use crate::settings::get_executable_paths;
use crate::utils::hidden_command;
use crate::wsl::types::{DiskPartition, PhysicalDisk, WslError, WSL_REGISTRY_PATH};

/// Real implementation that queries actual system resources
pub struct RealResourceMonitor;

impl RealResourceMonitor {
    pub fn new() -> Self {
        Self
    }

    /// Check if Optimize-VHD cmdlet is available (requires Hyper-V module)
    fn is_optimize_vhd_available(&self) -> bool {
        // Force diskpart for testing: set FORCE_DISKPART=1
        if std::env::var("FORCE_DISKPART").is_ok() {
            log::info!("FORCE_DISKPART set, skipping Optimize-VHD");
            return false;
        }

        let paths = get_executable_paths();

        // Quick check without elevation - just see if the cmdlet exists
        let output = hidden_command(&paths.powershell)
            .args([
                "-NoProfile",
                "-Command",
                "if (Get-Command Optimize-VHD -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }",
            ])
            .output();

        match output {
            Ok(o) => o.status.success(),
            Err(_) => false,
        }
    }

    /// Compact VHDX using Optimize-VHD PowerShell cmdlet (requires Hyper-V)
    fn compact_with_optimize_vhd(&self, vhdx_path: &str) -> Result<(), WslError> {
        let paths = get_executable_paths();
        log::debug!("Attempting compact with Optimize-VHD: {}", vhdx_path);

        // Check if Optimize-VHD is available before asking for elevation
        if !self.is_optimize_vhd_available() {
            log::info!("Optimize-VHD cmdlet not available - Hyper-V module not installed");
            return Err(WslError::CommandFailed(
                "Optimize-VHD not available - Hyper-V feature may not be installed".to_string(),
            ));
        }

        // Create temp file to capture output from elevated process
        let temp_dir = std::env::temp_dir();
        let stderr_file = temp_dir.join("wsl_optimize_output.txt");

        // Optimize-VHD requires admin - use PowerShell elevation pattern
        // We redirect stdout/stderr to temp files since elevated process output isn't captured
        let escaped_path = vhdx_path.replace("'", "''").replace("\"", "`\"");
        let stderr_path = stderr_file.to_str().unwrap_or("").replace("'", "''");

        let ps_script = format!(
            r#"try {{
                $proc = Start-Process -FilePath 'powershell' -ArgumentList '-NoProfile','-Command','try {{ Optimize-VHD -Path \"{path}\" -Mode Full 2>&1 | Out-File -FilePath \"{stderr}\" -Encoding UTF8; exit 0 }} catch {{ $_.Exception.Message | Out-File -FilePath \"{stderr}\" -Encoding UTF8; exit 1 }}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden
                exit $proc.ExitCode
            }} catch {{
                exit 1223
            }}"#,
            path = escaped_path,
            stderr = stderr_path
        );

        log::info!("Running Optimize-VHD with elevation - UAC dialog will appear");
        let output = hidden_command(&paths.powershell)
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
            .output()
            .map_err(|e| WslError::CommandFailed(format!("Failed to start PowerShell: {}", e)))?;

        // Read the captured output from temp file and clean up
        let captured_output = std::fs::read_to_string(&stderr_file).unwrap_or_default();
        let _ = std::fs::remove_file(&stderr_file);

        // Handle UAC cancellation (exit code 1223 = ERROR_CANCELLED)
        if output.status.code() == Some(1223) {
            return Err(WslError::CommandFailed(
                "Compact cancelled - administrator approval was not granted".to_string(),
            ));
        }

        if !output.status.success() {
            let error_text = if !captured_output.trim().is_empty() {
                captured_output.trim().to_string()
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let stdout = String::from_utf8_lossy(&output.stdout);
                if !stderr.trim().is_empty() {
                    stderr.to_string()
                } else {
                    stdout.to_string()
                }
            };

            // Check if Hyper-V/Optimize-VHD is unavailable
            if error_text.contains("not recognized")
                || error_text.contains("Hyper-V")
                || error_text.contains("CommandNotFoundException")
                || error_text.contains("is not recognized as")
            {
                return Err(WslError::CommandFailed(
                    "Optimize-VHD not available - Hyper-V feature may not be installed".to_string(),
                ));
            }
            return Err(WslError::CommandFailed(error_text));
        }

        Ok(())
    }

    /// Compact VHDX using diskpart (built-in, no Hyper-V required)
    fn compact_with_diskpart(&self, vhdx_path: &str) -> Result<(), WslError> {
        let paths = get_executable_paths();
        log::debug!("Attempting compact with diskpart: {}", vhdx_path);

        // Create temp files for script and output
        let temp_dir = std::env::temp_dir();
        let script_file = temp_dir.join("wsl_compact_script.txt");
        let output_file = temp_dir.join("wsl_compact_output.txt");

        // Create diskpart script
        // Note: We don't need "detach vdisk" - WSL VHDXs aren't attached in diskpart's sense
        // and trying to detach causes "already detached" errors
        let script = format!(
            "select vdisk file=\"{}\"\ncompact vdisk\n",
            vhdx_path
        );

        std::fs::write(&script_file, &script).map_err(|e| {
            WslError::CommandFailed(format!("Failed to create diskpart script: {}", e))
        })?;

        let script_path = script_file.to_str().unwrap_or("").replace("'", "''");
        let output_path = output_file.to_str().unwrap_or("").replace("'", "''");

        // Diskpart requires admin - run via elevated PowerShell that captures output
        // Note: -RedirectStandardOutput doesn't work with -Verb RunAs, so we run
        // diskpart inside an elevated PowerShell that redirects its own output
        let ps_script = format!(
            r#"try {{
                $proc = Start-Process -FilePath 'powershell' -ArgumentList '-NoProfile','-Command','diskpart /s \"{script}\" 2>&1 | Out-File -FilePath \"{output}\" -Encoding UTF8; exit $LASTEXITCODE' -Verb RunAs -Wait -PassThru -WindowStyle Hidden
                exit $proc.ExitCode
            }} catch {{
                $_.Exception.Message | Out-File -FilePath '{output}' -Encoding UTF8
                exit 1223
            }}"#,
            script = script_path,
            output = output_path
        );

        log::info!("Running diskpart with elevation - UAC dialog will appear");
        let output = hidden_command(&paths.powershell)
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &ps_script])
            .output()
            .map_err(|e| WslError::CommandFailed(format!("Failed to start PowerShell: {}", e)))?;

        // Read captured output and clean up
        let captured_output = std::fs::read_to_string(&output_file).unwrap_or_default();
        let _ = std::fs::remove_file(&script_file);
        let _ = std::fs::remove_file(&output_file);

        log::info!("Diskpart output: {}", captured_output.trim());

        // Handle UAC cancellation
        if output.status.code() == Some(1223) {
            return Err(WslError::CommandFailed(
                "Compact cancelled - administrator approval was not granted".to_string(),
            ));
        }

        // Check if compact succeeded - look for the success message
        let output_lower = captured_output.to_lowercase();
        let compact_succeeded = output_lower.contains("successfully compacted");

        // Only treat as error if compact didn't succeed AND there are error indicators
        if !compact_succeeded {
            if output_lower.contains("error") || output_lower.contains("failed") {
                return Err(WslError::CommandFailed(format!(
                    "Diskpart failed: {}",
                    captured_output.trim()
                )));
            }

            if !output.status.success() {
                let error_text = if !captured_output.trim().is_empty() {
                    captured_output.trim().to_string()
                } else {
                    "Diskpart compact failed with no output".to_string()
                };
                return Err(WslError::CommandFailed(error_text));
            }
        }

        log::info!("VHDX compacted successfully using diskpart");
        Ok(())
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

        // Helper to run a command with timeout
        let run_with_timeout = |mut child: std::process::Child| -> Option<std::process::Output> {
            let start = Instant::now();
            loop {
                match child.try_wait() {
                    Ok(Some(status)) => {
                        let stdout = child.stdout.take().map(|mut s| {
                            let mut buf = Vec::new();
                            std::io::Read::read_to_end(&mut s, &mut buf).ok();
                            buf
                        }).unwrap_or_default();
                        let stderr = child.stderr.take().map(|mut s| {
                            let mut buf = Vec::new();
                            std::io::Read::read_to_end(&mut s, &mut buf).ok();
                            buf
                        }).unwrap_or_default();
                        return Some(std::process::Output { status, stdout, stderr });
                    }
                    Ok(None) => {
                        if start.elapsed() > cmd_timeout {
                            let _ = child.kill();
                            return None;
                        }
                        std::thread::sleep(Duration::from_millis(50));
                    }
                    Err(_) => return None,
                }
            }
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

        // Try Optimize-VHD first (requires Hyper-V), fall back to diskpart
        match self.compact_with_optimize_vhd(vhdx_path) {
            Ok(()) => {
                log::info!("VHDX compacted successfully using Optimize-VHD");
                Ok(())
            }
            Err(e) => {
                log::warn!("Optimize-VHD failed ({}), trying diskpart fallback", e);
                self.compact_with_diskpart(vhdx_path)
            }
        }
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
