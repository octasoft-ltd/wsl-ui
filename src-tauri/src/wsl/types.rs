use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Windows Registry path where WSL distributions are stored
pub const WSL_REGISTRY_PATH: &str = r"Software\Microsoft\Windows\CurrentVersion\Lxss";

// ==================== Preflight Check Types ====================

/// Result of WSL preflight check - determines if WSL is ready to use
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum WslPreflightStatus {
    /// WSL is installed and ready
    Ready,
    /// WSL executable not found at configured path
    NotInstalled { configured_path: String },
    /// WSL Windows feature is not enabled (error 0x8007019e)
    FeatureDisabled { error_code: String },
    /// WSL2 kernel needs update (error 0x1bc)
    KernelUpdateRequired,
    /// Virtual Machine Platform not enabled or virtualization disabled (error 0x80370102)
    VirtualizationDisabled { error_code: String },
    /// Unknown error during preflight check
    Unknown { message: String },
}

// Note: The helper methods (is_ready, title, message, help_url) are implemented
// in TypeScript (wslService.ts) to keep the UI logic in the frontend.
// The backend just returns the enum variant for the frontend to interpret.

// Re-export DistroState from wsl-core to avoid duplication
pub use wsl_core::DistroState;

/// WSL Distribution - local wrapper that's compatible with wsl-core
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Distribution {
    /// Distribution ID (GUID from Windows Registry)
    pub id: Option<String>,
    /// Name of the distribution (for display purposes)
    pub name: String,
    pub state: DistroState,
    pub version: u8,
    pub is_default: bool,
    /// Installation location (base path from Windows Registry)
    pub location: Option<String>,
}

impl From<wsl_core::Distribution> for Distribution {
    fn from(d: wsl_core::Distribution) -> Self {
        Self {
            id: d.id,
            name: d.name,
            state: d.state,
            version: d.version,
            is_default: d.is_default,
            location: None, // Populated later from registry info
        }
    }
}

#[derive(Debug, Error)]
pub enum WslError {
    #[error("Failed to execute WSL command: {0}")]
    CommandFailed(String),

    #[error("Failed to parse WSL output: {0}")]
    ParseError(String),

    #[error("Distribution not found: {0}")]
    DistroNotFound(String),

    #[error("Operation timed out: {0}")]
    Timeout(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

// Convert WslError to a string for Tauri command results
impl From<WslError> for String {
    fn from(error: WslError) -> Self {
        error.to_string()
    }
}

// ==================== Disk Mount Types ====================

/// Information about a disk mounted in WSL
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MountedDisk {
    /// The disk path (e.g., \\.\PHYSICALDRIVE0 or D:\VHDs\data.vhdx)
    pub path: String,
    /// Mount point inside WSL (e.g., /mnt/wsl/mydisk)
    pub mount_point: String,
    /// Filesystem type (e.g., ext4, ntfs)
    pub filesystem: Option<String>,
    /// Whether this is a VHD file
    pub is_vhd: bool,
}

/// Information about a physical disk available for mounting
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PhysicalDisk {
    /// Device ID (e.g., \\.\PHYSICALDRIVE0)
    pub device_id: String,
    /// Friendly name (e.g., "Samsung SSD 970")
    pub friendly_name: String,
    /// Total size in bytes
    pub size_bytes: u64,
    /// List of partitions on this disk
    pub partitions: Vec<DiskPartition>,
}

/// Information about a partition on a physical disk
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiskPartition {
    /// Partition index (1-based)
    pub index: u32,
    /// Size in bytes
    pub size_bytes: u64,
    /// Filesystem type if known
    pub filesystem: Option<String>,
    /// Drive letter if assigned (e.g., "C:")
    pub drive_letter: Option<String>,
}

/// Options for mounting a disk
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MountDiskOptions {
    /// Path to the disk (physical disk or VHD file)
    pub disk_path: String,
    /// Whether this is a VHD file
    pub is_vhd: bool,
    /// Custom mount name (optional)
    pub mount_name: Option<String>,
    /// Filesystem type (optional, defaults to ext4)
    pub filesystem_type: Option<String>,
    /// Additional mount options (optional)
    pub mount_options: Option<String>,
    /// Partition index to mount (optional, 1-based)
    pub partition: Option<u32>,
    /// Bare mount - attach without mounting
    pub bare: bool,
}

// ==================== Compact Types ====================

/// Result of a VHDX compact operation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CompactResult {
    /// Size before compacting (in bytes)
    pub size_before: u64,
    /// Size after compacting (in bytes)
    pub size_after: u64,
    /// Bytes trimmed by fstrim (if available)
    pub fstrim_bytes: Option<u64>,
    /// Message from fstrim (success or failure reason)
    pub fstrim_message: Option<String>,
}

impl CompactResult {
    /// Calculate the space saved by compacting
    pub fn space_saved(&self) -> u64 {
        self.size_before.saturating_sub(self.size_after)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_wsl_registry_path() {
        assert_eq!(
            WSL_REGISTRY_PATH,
            r"Software\Microsoft\Windows\CurrentVersion\Lxss"
        );
    }

    #[test]
    fn test_distribution_from_wsl_core() {
        let core_distro = wsl_core::Distribution {
            id: Some("12345-guid".to_string()),
            name: "Ubuntu".to_string(),
            state: DistroState::Running,
            version: 2,
            is_default: true,
        };

        let distro = Distribution::from(core_distro);

        assert_eq!(distro.id, Some("12345-guid".to_string()));
        assert_eq!(distro.name, "Ubuntu");
        assert_eq!(distro.state, DistroState::Running);
        assert_eq!(distro.version, 2);
        assert!(distro.is_default);
        assert!(distro.location.is_none()); // Location is populated later
    }

    #[test]
    fn test_distribution_serialization() {
        let distro = Distribution {
            id: Some("guid-123".to_string()),
            name: "Debian".to_string(),
            state: DistroState::Stopped,
            version: 2,
            is_default: false,
            location: Some(r"C:\WSL\Debian".to_string()),
        };

        let json = serde_json::to_string(&distro).unwrap();
        assert!(json.contains("\"name\":\"Debian\""));
        assert!(json.contains("\"isDefault\":false"));
        assert!(json.contains("\"state\":\"Stopped\""));
    }

    #[test]
    fn test_distribution_deserialization() {
        let json = r#"{
            "id": "guid-456",
            "name": "Alpine",
            "state": "Running",
            "version": 2,
            "isDefault": true,
            "location": null
        }"#;

        let distro: Distribution = serde_json::from_str(json).unwrap();
        assert_eq!(distro.name, "Alpine");
        assert_eq!(distro.state, DistroState::Running);
        assert!(distro.is_default);
        assert!(distro.location.is_none());
    }

    #[test]
    fn test_wsl_error_command_failed() {
        let error = WslError::CommandFailed("wsl --list failed".to_string());
        assert_eq!(
            error.to_string(),
            "Failed to execute WSL command: wsl --list failed"
        );
    }

    #[test]
    fn test_wsl_error_parse_error() {
        let error = WslError::ParseError("unexpected format".to_string());
        assert_eq!(
            error.to_string(),
            "Failed to parse WSL output: unexpected format"
        );
    }

    #[test]
    fn test_wsl_error_distro_not_found() {
        let error = WslError::DistroNotFound("Ubuntu".to_string());
        assert_eq!(error.to_string(), "Distribution not found: Ubuntu");
    }

    #[test]
    fn test_wsl_error_timeout() {
        let error = WslError::Timeout("operation exceeded 30s".to_string());
        assert_eq!(
            error.to_string(),
            "Operation timed out: operation exceeded 30s"
        );
    }

    #[test]
    fn test_wsl_error_to_string() {
        let error = WslError::CommandFailed("test error".to_string());
        let string: String = error.into();
        assert_eq!(string, "Failed to execute WSL command: test error");
    }

    #[test]
    fn test_mounted_disk_serialization() {
        let disk = MountedDisk {
            path: r"D:\VHDs\data.vhdx".to_string(),
            mount_point: "/mnt/wsl/data".to_string(),
            filesystem: Some("ext4".to_string()),
            is_vhd: true,
        };

        let json = serde_json::to_string(&disk).unwrap();
        assert!(json.contains("\"mountPoint\":\"/mnt/wsl/data\""));
        assert!(json.contains("\"isVhd\":true"));
    }

    #[test]
    fn test_physical_disk_with_partitions() {
        let disk = PhysicalDisk {
            device_id: r"\\.\PHYSICALDRIVE1".to_string(),
            friendly_name: "Samsung SSD 970".to_string(),
            size_bytes: 500107862016,
            partitions: vec![
                DiskPartition {
                    index: 1,
                    size_bytes: 104857600,
                    filesystem: Some("FAT32".to_string()),
                    drive_letter: None,
                },
                DiskPartition {
                    index: 2,
                    size_bytes: 500003004416,
                    filesystem: Some("NTFS".to_string()),
                    drive_letter: Some("E:".to_string()),
                },
            ],
        };

        assert_eq!(disk.partitions.len(), 2);
        assert_eq!(disk.partitions[0].index, 1);
        assert_eq!(disk.partitions[1].drive_letter, Some("E:".to_string()));
    }

    #[test]
    fn test_mount_disk_options_serialization() {
        let options = MountDiskOptions {
            disk_path: r"D:\disks\mydata.vhdx".to_string(),
            is_vhd: true,
            mount_name: Some("mydata".to_string()),
            filesystem_type: Some("ext4".to_string()),
            mount_options: None,
            partition: None,
            bare: false,
        };

        let json = serde_json::to_string(&options).unwrap();
        assert!(json.contains("\"diskPath\":"));
        assert!(json.contains("\"isVhd\":true"));
        assert!(json.contains("\"mountName\":\"mydata\""));
        assert!(json.contains("\"bare\":false"));
    }

    #[test]
    fn test_mount_disk_options_deserialization() {
        let json = r#"{
            "diskPath": "\\\\?\\PHYSICALDRIVE2",
            "isVhd": false,
            "mountName": null,
            "filesystemType": "ext4",
            "mountOptions": "rw",
            "partition": 1,
            "bare": true
        }"#;

        let options: MountDiskOptions = serde_json::from_str(json).unwrap();
        assert!(!options.is_vhd);
        assert!(options.mount_name.is_none());
        assert_eq!(options.partition, Some(1));
        assert!(options.bare);
    }

    #[test]
    fn test_disk_partition_clone() {
        let partition = DiskPartition {
            index: 1,
            size_bytes: 1024,
            filesystem: Some("ntfs".to_string()),
            drive_letter: Some("C:".to_string()),
        };

        let cloned = partition.clone();
        assert_eq!(cloned.index, partition.index);
        assert_eq!(cloned.filesystem, partition.filesystem);
    }

    #[test]
    fn test_wsl_preflight_status_serialization() {
        // Test NotInstalled serializes configured_path -> configuredPath (camelCase)
        let status = WslPreflightStatus::NotInstalled {
            configured_path: r"C:\Windows\System32\wsl.exe".to_string(),
        };
        let json = serde_json::to_string(&status).unwrap();

        // Verify camelCase serialization
        assert!(
            json.contains("configuredPath"),
            "Expected camelCase 'configuredPath' in JSON: {}",
            json
        );
        assert!(
            json.contains(r"C:\\Windows\\System32\\wsl.exe"),
            "Expected path in JSON: {}",
            json
        );
        assert!(
            json.contains(r#""status":"notInstalled""#),
            "Expected status tag in JSON: {}",
            json
        );

        // Verify round-trip deserialization works
        let deserialized: WslPreflightStatus = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, status);
    }

    #[test]
    fn test_wsl_preflight_status_all_variants_serialization() {
        // Test all variants serialize correctly
        let test_cases = vec![
            (WslPreflightStatus::Ready, r#"{"status":"ready"}"#),
            (
                WslPreflightStatus::FeatureDisabled {
                    error_code: "0x8007019e".to_string(),
                },
                r#"{"status":"featureDisabled","errorCode":"0x8007019e"}"#,
            ),
            (
                WslPreflightStatus::KernelUpdateRequired,
                r#"{"status":"kernelUpdateRequired"}"#,
            ),
            (
                WslPreflightStatus::VirtualizationDisabled {
                    error_code: "0x80370102".to_string(),
                },
                r#"{"status":"virtualizationDisabled","errorCode":"0x80370102"}"#,
            ),
            (
                WslPreflightStatus::Unknown {
                    message: "test error".to_string(),
                },
                r#"{"status":"unknown","message":"test error"}"#,
            ),
        ];

        for (status, expected_json) in test_cases {
            let json = serde_json::to_string(&status).unwrap();
            assert_eq!(json, expected_json, "Serialization mismatch for {:?}", status);

            // Verify round-trip
            let deserialized: WslPreflightStatus = serde_json::from_str(&json).unwrap();
            assert_eq!(deserialized, status, "Deserialization mismatch for {:?}", status);
        }
    }
}

