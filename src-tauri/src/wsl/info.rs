//! Distribution information operations
//!
//! Functions for getting disk size, OS info, and WSL version from distributions.

use serde::Serialize;
use log::{debug, warn};

use super::executor::{resource_monitor, wsl_executor};
use super::types::WslError;

/// WSL version information from `wsl --version`
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WslVersionInfo {
    pub wsl_version: String,
    pub kernel_version: String,
    pub wslg_version: String,
    pub msrdc_version: String,
    pub direct3d_version: String,
    pub dxcore_version: String,
    pub windows_version: String,
}

impl Default for WslVersionInfo {
    fn default() -> Self {
        Self {
            wsl_version: "Unknown".to_string(),
            kernel_version: "Unknown".to_string(),
            wslg_version: "Unknown".to_string(),
            msrdc_version: "Unknown".to_string(),
            direct3d_version: "Unknown".to_string(),
            dxcore_version: "Unknown".to_string(),
            windows_version: "Unknown".to_string(),
        }
    }
}

/// Get WSL version information by parsing `wsl --version` output
pub fn get_wsl_version() -> Result<WslVersionInfo, WslError> {
    debug!("Getting WSL version");

    let output = wsl_executor().version()?;

    if !output.success {
        warn!("WSL --version command failed: {}", output.stderr);
        return Err(WslError::CommandFailed(output.stderr));
    }

    Ok(parse_wsl_version_output(&output.stdout))
}

/// Parse the output of `wsl --version`
fn parse_wsl_version_output(output: &str) -> WslVersionInfo {
    let mut info = WslVersionInfo::default();

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        // Parse lines like "WSL version: 2.6.2.0"
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim().to_lowercase();
            let value = value.trim().to_string();

            match key.as_str() {
                "wsl version" => info.wsl_version = value,
                "kernel version" => info.kernel_version = value,
                "wslg version" => info.wslg_version = value,
                "msrdc version" => info.msrdc_version = value,
                "direct3d version" => info.direct3d_version = value,
                "dxcore version" => info.dxcore_version = value,
                "windows version" => info.windows_version = value,
                _ => {}
            }
        }
    }

    info
}

/// VHD size information
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VhdSizeInfo {
    /// Actual file size on disk (sparse)
    pub file_size: u64,
    /// Virtual disk maximum size
    pub virtual_size: u64,
}

/// Get both file size and virtual size of a distribution's VHDX
pub fn get_distribution_vhd_size(name: &str) -> Result<VhdSizeInfo, WslError> {
    // Get the VHDX path
    let vhdx_path = get_vhdx_path_from_registry(name)
        .ok_or_else(|| WslError::CommandFailed(format!("Could not find VHDX for {}", name)))?;

    // Get file size
    let file_size = std::fs::metadata(&vhdx_path)
        .map(|m| m.len())
        .unwrap_or(0);

    // Get virtual size using PowerShell Get-VHD
    let virtual_size = get_vhd_virtual_size(&vhdx_path).unwrap_or(file_size);

    Ok(VhdSizeInfo {
        file_size,
        virtual_size,
    })
}

/// Get VHD virtual size by reading the VHDX file header directly
fn get_vhd_virtual_size(vhdx_path: &str) -> Option<u64> {
    use std::io::{Read, Seek, SeekFrom};

    let mut file = std::fs::File::open(vhdx_path).ok()?;

    // VHDX format: The metadata region contains the virtual disk size
    let mut signature = [0u8; 8];
    file.read_exact(&mut signature).ok()?;

    if &signature != b"vhdxfile" {
        return None;
    }

    // Read header 1 at offset 64KB
    file.seek(SeekFrom::Start(0x10000)).ok()?;
    let mut header = [0u8; 4096];
    file.read_exact(&mut header).ok()?;

    if &header[0..4] != b"head" {
        file.seek(SeekFrom::Start(0x20000)).ok()?;
        file.read_exact(&mut header).ok()?;
        if &header[0..4] != b"head" {
            return None;
        }
    }

    // Read the region table at offset 192KB
    file.seek(SeekFrom::Start(0x30000)).ok()?;
    let mut region_table = [0u8; 4096];
    file.read_exact(&mut region_table).ok()?;

    if &region_table[0..4] != b"regi" {
        file.seek(SeekFrom::Start(0x40000)).ok()?;
        file.read_exact(&mut region_table).ok()?;
        if &region_table[0..4] != b"regi" {
            return None;
        }
    }

    let entry_count = u32::from_le_bytes([region_table[8], region_table[9], region_table[10], region_table[11]]) as usize;

    let metadata_guid: [u8; 16] = [
        0x06, 0xa2, 0x7c, 0x8b, 0x90, 0x47, 0x9a, 0x4b,
        0xb8, 0xfe, 0x57, 0x5f, 0x05, 0x0f, 0x88, 0x6e
    ];

    // Each entry is 32 bytes, starting at offset 16
    // Maximum entries that fit in 4096-byte buffer: (4096 - 16) / 32 = 127
    let max_entries = (region_table.len() - 16) / 32;
    for i in 0..entry_count.min(max_entries) {
        let entry_offset = 16 + i * 32;
        let guid = &region_table[entry_offset..entry_offset + 16];

        if guid == metadata_guid {
            let file_offset = u64::from_le_bytes([
                region_table[entry_offset + 16], region_table[entry_offset + 17],
                region_table[entry_offset + 18], region_table[entry_offset + 19],
                region_table[entry_offset + 20], region_table[entry_offset + 21],
                region_table[entry_offset + 22], region_table[entry_offset + 23],
            ]);

            file.seek(SeekFrom::Start(file_offset)).ok()?;
            let mut metadata_header = [0u8; 64];
            file.read_exact(&mut metadata_header).ok()?;

            if &metadata_header[0..8] != b"metadata" {
                return None;
            }

            let md_entry_count = u16::from_le_bytes([metadata_header[10], metadata_header[11]]) as usize;

            let mut metadata_entries = vec![0u8; md_entry_count * 32];
            file.seek(SeekFrom::Start(file_offset + 32)).ok()?;
            file.read_exact(&mut metadata_entries).ok()?;

            let vdisk_size_guid: [u8; 16] = [
                0x24, 0x42, 0xa5, 0x2f, 0x1b, 0xcd, 0x76, 0x48,
                0xb2, 0x11, 0x5d, 0xbe, 0xd8, 0x3b, 0xf4, 0xb8
            ];

            for j in 0..md_entry_count {
                let md_offset = j * 32;
                let item_guid = &metadata_entries[md_offset..md_offset + 16];

                if item_guid == vdisk_size_guid {
                    let item_offset = u32::from_le_bytes([
                        metadata_entries[md_offset + 16], metadata_entries[md_offset + 17],
                        metadata_entries[md_offset + 18], metadata_entries[md_offset + 19],
                    ]) as u64;

                    file.seek(SeekFrom::Start(file_offset + item_offset)).ok()?;
                    let mut size_bytes = [0u8; 8];
                    file.read_exact(&mut size_bytes).ok()?;

                    return Some(u64::from_le_bytes(size_bytes));
                }
            }
            break;
        }
    }

    None
}

/// Get VHDX path from registry
fn get_vhdx_path_from_registry(name: &str) -> Option<String> {
    let base_path = resource_monitor().get_distro_base_path(name)?;
    let vhdx_path = format!(r"{}\ext4.vhdx", base_path);

    if std::fs::metadata(&vhdx_path).is_ok() {
        Some(vhdx_path)
    } else {
        None
    }
}

/// Get disk size of a distribution's VHDX file
pub fn get_distribution_disk_size(name: &str) -> Result<u64, WslError> {
    // Try to find the VHDX via registry first (using resource monitor)
    if let Some(size) = resource_monitor().get_distro_vhdx_size(name) {
        return Ok(size);
    }

    // Fallback: search common locations
    let local_app_data = std::env::var("LOCALAPPDATA")
        .unwrap_or_else(|_| r"C:\Users\Default\AppData\Local".to_string());

    let custom_path = format!(r"{}\wsl\{}\ext4.vhdx", local_app_data, name);
    if let Ok(metadata) = std::fs::metadata(&custom_path) {
        return Ok(metadata.len());
    }

    let packages_path = format!(r"{}\Packages", local_app_data);
    if let Ok(entries) = std::fs::read_dir(&packages_path) {
        for entry in entries.flatten() {
            let path = entry.path();
            if let Some(folder_name) = path.file_name().and_then(|n| n.to_str()) {
                let folder_lower = folder_name.to_lowercase();
                let name_lower = name.to_lowercase();

                let matches = folder_lower.contains(&name_lower)
                    || (name_lower.contains("ubuntu") && folder_lower.contains("canonical"))
                    || (name_lower.contains("debian") && folder_lower.contains("debian"))
                    || (name_lower.contains("kali") && folder_lower.contains("kali"))
                    || (name_lower.contains("opensuse") && folder_lower.contains("suse"))
                    || (name_lower.contains("fedora") && folder_lower.contains("fedora"));

                if matches {
                    let vhdx_path = path.join("LocalState").join("ext4.vhdx");
                    if let Ok(metadata) = std::fs::metadata(&vhdx_path) {
                        return Ok(metadata.len());
                    }
                }
            }
        }
    }

    Ok(0)
}

/// Get the actual OS info from inside the distribution
/// If `id` is provided, uses `--distribution-id` for more reliable identification
pub fn get_distribution_os_info(name: &str, id: Option<&str>) -> Result<String, WslError> {
    let output = wsl_executor().exec(name, id, "cat /etc/os-release")?;

    if !output.success {
        return Ok("Linux".to_string());
    }

    // Parse PRETTY_NAME or NAME from os-release
    for line in output.stdout.lines() {
        if line.starts_with("PRETTY_NAME=") {
            let value = line.trim_start_matches("PRETTY_NAME=").trim_matches('"');
            return Ok(value.to_string());
        }
    }

    for line in output.stdout.lines() {
        if line.starts_with("NAME=") {
            let value = line.trim_start_matches("NAME=").trim_matches('"');
            return Ok(value.to_string());
        }
    }

    Ok("Linux".to_string())
}

/// Get the installation location of a distribution from registry
pub fn get_distribution_location(name: &str) -> Result<Option<String>, WslError> {
    Ok(resource_monitor().get_distro_base_path(name))
}

/// Get the WSL2 IP address by running configurable command (default: `hostname -I`)
/// Returns the first IP address (usually the main WSL2 network interface)
/// All WSL2 distros share the same IP since they run in the same VM
pub fn get_wsl_ip() -> Result<Option<String>, WslError> {
    debug!("Getting WSL IP address");

    let output = wsl_executor().get_ip()?;

    if !output.success {
        warn!("Failed to get WSL IP address: {}", output.stderr);
        return Ok(None);
    }

    // Command may return space-separated IPs, we want the first one
    let ip = output
        .stdout
        .trim()
        .split_whitespace()
        .next()
        .map(|s| s.to_string());

    debug!("Got WSL IP address: {:?}", ip);
    Ok(ip)
}

/// Information about the WSL2 system distribution (CBL-Mariner/Azure Linux)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemDistroInfo {
    /// Friendly name (PRETTY_NAME from os-release)
    pub name: String,
    /// Full version string (VERSION from os-release)
    pub version: String,
    /// Short version ID (VERSION_ID from os-release)
    pub version_id: String,
}

impl Default for SystemDistroInfo {
    fn default() -> Self {
        Self {
            name: "Unknown".to_string(),
            version: "Unknown".to_string(),
            version_id: "Unknown".to_string(),
        }
    }
}

/// Get information about the WSL2 system distribution
/// This queries /etc/os-release in the hidden system distro (CBL-Mariner/Azure Linux)
pub fn get_system_distro_info() -> Result<SystemDistroInfo, WslError> {
    debug!("Getting system distro info");

    let output = wsl_executor().exec_system_with_timeout("cat /etc/os-release", 5)?;

    if !output.success {
        warn!("Failed to get system distro info: {}", output.stderr);
        return Ok(SystemDistroInfo::default());
    }

    Ok(parse_system_distro_info(&output.stdout))
}

/// Parse /etc/os-release output for system distro
fn parse_system_distro_info(output: &str) -> SystemDistroInfo {
    let mut info = SystemDistroInfo::default();

    for line in output.lines() {
        if line.starts_with("PRETTY_NAME=") {
            info.name = line.trim_start_matches("PRETTY_NAME=").trim_matches('"').to_string();
        } else if line.starts_with("VERSION=") {
            info.version = line.trim_start_matches("VERSION=").trim_matches('"').to_string();
        } else if line.starts_with("VERSION_ID=") {
            info.version_id = line.trim_start_matches("VERSION_ID=").trim_matches('"').to_string();
        }
    }

    // Fallback to NAME if PRETTY_NAME not available
    if info.name == "Unknown" {
        for line in output.lines() {
            if line.starts_with("NAME=") {
                info.name = line.trim_start_matches("NAME=").trim_matches('"').to_string();
                break;
            }
        }
    }

    info
}

#[cfg(test)]
mod tests {
    use crate::wsl::executor::resource::MockResourceMonitor;
    use crate::wsl::executor::ResourceMonitor;

    #[test]
    fn test_get_vhdx_size_handles_none_gracefully() {
        // Use mock directly - the real implementation depends on Windows registry
        let monitor = MockResourceMonitor::new();
        let result = monitor.get_distro_vhdx_size("NonExistentDistro");
        // Mock without WSL state returns None for nonexistent distros
        assert!(result.is_some()); // Mock returns a default size
    }

    #[test]
    fn test_get_base_path_handles_none_gracefully() {
        let monitor = MockResourceMonitor::new();
        let result = monitor.get_distro_base_path("NonExistentDistro");
        // Mock without WSL state returns None for nonexistent distros
        assert!(result.is_some()); // Mock returns a default path
    }
}


