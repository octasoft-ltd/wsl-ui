//! Mock resource monitor for testing
//!
//! Returns realistic mock values for resource usage, disk information, and registry queries.

use std::sync::Arc;
use log::debug;

use std::collections::HashMap;

use super::{DistroRegistryInfo, DistroResourceUsage, RenameRegistryResult, ResourceMonitor, WslHealth, WslHealthStatus};
use crate::wsl::executor::wsl_command::MockWslExecutor;
use crate::wsl::types::{DiskPartition, PhysicalDisk, WslError};

/// Mock implementation that returns simulated resource data
pub struct MockResourceMonitor {
    /// Reference to the WSL executor mock for state queries
    wsl_mock: Option<Arc<MockWslExecutor>>,
}

impl MockResourceMonitor {
    pub fn new() -> Self {
        Self { wsl_mock: None }
    }

    /// Create with a reference to the WSL executor mock for state consistency
    pub fn with_wsl_mock(wsl_mock: Arc<MockWslExecutor>) -> Self {
        Self { wsl_mock: Some(wsl_mock) }
    }
}

impl Default for MockResourceMonitor {
    fn default() -> Self {
        Self::new()
    }
}

impl ResourceMonitor for MockResourceMonitor {
    fn get_wsl_health(&self) -> WslHealth {
        debug!("Mock: get_wsl_health");
        WslHealth {
            status: WslHealthStatus::Healthy,
            message: "WSL running (mock mode)".to_string(),
            wsl_process_count: 2,
            vm_running: true,
        }
    }

    fn get_wsl_memory_usage(&self) -> Result<u64, WslError> {
        debug!("Mock: get_wsl_memory_usage");
        // Simulate ~4GB total usage
        Ok(4_200_000_000)
    }

    fn get_system_total_memory(&self) -> Option<u64> {
        debug!("Mock: get_system_total_memory");
        // Mock returns 8GB as system total
        Some(8 * 1024 * 1024 * 1024)
    }

    fn get_distro_resource_usage(&self, distro: &str) -> Result<DistroResourceUsage, WslError> {
        debug!("Mock: get_distro_resource_usage for '{}'", distro);

        // Check if distro exists and is running using the WSL mock state
        if let Some(ref wsl_mock) = self.wsl_mock {
            if !wsl_mock.distro_exists(distro) {
                return Err(WslError::DistroNotFound(distro.to_string()));
            }
            if !wsl_mock.distro_is_running(distro) {
                return Err(WslError::CommandFailed(format!(
                    "Distribution {} is not running",
                    distro
                )));
            }
        }

        // Return mock values based on distro name
        let (mock_memory, mock_cpu) = match distro {
            "Ubuntu" => (512_000_000, 2.5),        // ~512MB, 2.5% CPU
            "Ubuntu-22.04" => (384_000_000, 1.8),  // ~384MB, 1.8% CPU
            "Debian" => (256_000_000, 0.5),        // ~256MB, 0.5% CPU
            "Alpine" => (64_000_000, 0.2),         // ~64MB, 0.2% CPU
            "Fedora" => (320_000_000, 1.2),        // ~320MB, 1.2% CPU
            _ => (128_000_000, 0.3),               // ~128MB, 0.3% CPU default
        };

        Ok(DistroResourceUsage {
            name: distro.to_string(),
            memory_used_bytes: mock_memory,
            cpu_percent: Some(mock_cpu),
        })
    }

    fn get_all_distro_registry_info(&self) -> HashMap<String, DistroRegistryInfo> {
        debug!("Mock: get_all_distro_registry_info");

        let mut result = HashMap::new();

        // If we have a WSL mock, use its distro list
        if let Some(ref wsl_mock) = self.wsl_mock {
            for (i, name) in wsl_mock.get_distro_names().iter().enumerate() {
                let guid = format!("{{mock-guid-{:04}-0000-0000-{:012}}}", i, i);
                result.insert(name.clone(), DistroRegistryInfo {
                    id: guid,
                    
                    base_path: Some(format!(r"C:\Users\MockUser\AppData\Local\Packages\{}", name)),
                });
            }
        } else {
            // Default mock distros
            for (i, name) in ["Ubuntu", "Debian", "Alpine"].iter().enumerate() {
                let guid = format!("{{mock-guid-{:04}-0000-0000-{:012}}}", i, i);
                result.insert(name.to_string(), DistroRegistryInfo {
                    id: guid,
                    
                    base_path: Some(format!(r"C:\Users\MockUser\AppData\Local\Packages\{}", name)),
                });
            }
        }

        result
    }

    fn get_distro_base_path(&self, name: &str) -> Option<String> {
        debug!("Mock: get_distro_base_path for '{}'", name);

        // Check if distro exists in mock state
        if let Some(ref wsl_mock) = self.wsl_mock {
            if !wsl_mock.distro_exists(name) {
                return None;
            }
        }

        // Return a mock path
        Some(format!(r"C:\Users\MockUser\AppData\Local\Packages\{}", name))
    }

    fn get_distro_vhdx_size(&self, name: &str) -> Option<u64> {
        debug!("Mock: get_distro_vhdx_size for '{}'", name);

        // Check if distro exists in mock state
        if let Some(ref wsl_mock) = self.wsl_mock {
            if !wsl_mock.distro_exists(name) {
                return None;
            }
        }

        // Return mock VHDX sizes based on distro name
        let size = match name {
            "Ubuntu" => 8_000_000_000,       // 8GB
            "Ubuntu-22.04" => 6_000_000_000, // 6GB
            "Debian" => 4_000_000_000,       // 4GB
            "Alpine" => 500_000_000,         // 500MB
            "Fedora" => 5_000_000_000,       // 5GB
            _ => 2_000_000_000,              // 2GB default
        };

        Some(size)
    }

    fn get_distro_vhdx_path(&self, name: &str) -> Option<String> {
        debug!("Mock: get_distro_vhdx_path for '{}'", name);

        // Check if distro exists in mock state
        if let Some(ref wsl_mock) = self.wsl_mock {
            if !wsl_mock.distro_exists(name) {
                return None;
            }
        }

        // Return mock VHDX path
        Some(format!(r"C:\Users\MockUser\AppData\Local\Packages\{}\ext4.vhdx", name))
    }

    fn compact_vhdx(&self, vhdx_path: &str) -> Result<(), WslError> {
        debug!("Mock: compact_vhdx for '{}'", vhdx_path);

        // Simulate the compact operation taking some time
        std::thread::sleep(std::time::Duration::from_millis(2000));

        // In mock mode, always succeed
        Ok(())
    }

    fn list_physical_disks(&self) -> Result<Vec<PhysicalDisk>, WslError> {
        debug!("Mock: list_physical_disks");

        // Return mock physical disks
        Ok(vec![
            PhysicalDisk {
                device_id: r"\\.\PHYSICALDRIVE0".to_string(),
                friendly_name: "Mock SSD 500GB".to_string(),
                size_bytes: 500_000_000_000,
                partitions: vec![
                    DiskPartition {
                        index: 1,
                        size_bytes: 100_000_000,
                        filesystem: Some("FAT32".to_string()),
                        drive_letter: None,
                    },
                    DiskPartition {
                        index: 2,
                        size_bytes: 450_000_000_000,
                        filesystem: Some("NTFS".to_string()),
                        drive_letter: Some("C:".to_string()),
                    },
                ],
            },
            PhysicalDisk {
                device_id: r"\\.\PHYSICALDRIVE1".to_string(),
                friendly_name: "Mock HDD 1TB".to_string(),
                size_bytes: 1_000_000_000_000,
                partitions: vec![DiskPartition {
                    index: 1,
                    size_bytes: 1_000_000_000_000,
                    filesystem: Some("NTFS".to_string()),
                    drive_letter: Some("D:".to_string()),
                }],
            },
        ])
    }

    fn rename_distribution_registry(
        &self,
        id: &str,
        new_name: &str,
    ) -> Result<RenameRegistryResult, WslError> {
        debug!("Mock: rename_distribution_registry id='{}' new_name='{}'", id, new_name);

        // Use the WSL mock to rename
        if let Some(ref wsl_mock) = self.wsl_mock {
            let _old_name = wsl_mock.rename_distro(id, new_name)?;
            Ok(RenameRegistryResult {
                
                terminal_profile_path: None,
                shortcut_path: None,
            })
        } else {
            Err(WslError::DistroNotFound(id.to_string()))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_get_all_distro_registry_info_returns_all_default_distros() {
        let monitor = MockResourceMonitor::new();
        let info = monitor.get_all_distro_registry_info();

        // Default mock returns Ubuntu, Debian, Alpine
        assert_eq!(info.len(), 3);
        assert!(info.contains_key("Ubuntu"));
        assert!(info.contains_key("Debian"));
        assert!(info.contains_key("Alpine"));
    }

    #[test]
    fn test_get_all_distro_registry_info_returns_valid_guids() {
        let monitor = MockResourceMonitor::new();
        let info = monitor.get_all_distro_registry_info();

        for (name, registry_info) in &info {
            // GUID should start with { and end with }
            assert!(registry_info.id.starts_with('{'), "GUID for {} should start with {{", name);
            assert!(registry_info.id.ends_with('}'), "GUID for {} should end with }}", name);

            // Name in info should match the key

            // Base path should be present
            assert!(registry_info.base_path.is_some(), "Base path for {} should be present", name);
        }
    }

    #[test]
    fn test_get_all_distro_registry_info_with_wsl_mock() {
        let wsl_mock = Arc::new(MockWslExecutor::new());
        let monitor = MockResourceMonitor::with_wsl_mock(wsl_mock);
        let info = monitor.get_all_distro_registry_info();

        // Should return the distros from the WSL mock (7 default distros)
        assert_eq!(info.len(), 7);
        assert!(info.contains_key("Ubuntu-legacy"));
        assert!(info.contains_key("Arch"));
        assert!(info.contains_key("Ubuntu"));
        assert!(info.contains_key("Debian"));
        assert!(info.contains_key("Alpine"));
        assert!(info.contains_key("Ubuntu-22.04"));
        assert!(info.contains_key("Fedora"));
    }

    #[test]
    fn test_get_distro_base_path_returns_path_for_existing_distro() {
        let monitor = MockResourceMonitor::new();

        let path = monitor.get_distro_base_path("Ubuntu");
        assert!(path.is_some());
        assert!(path.unwrap().contains("Ubuntu"));
    }

    #[test]
    fn test_get_distro_base_path_returns_none_for_nonexistent_distro_with_mock() {
        let wsl_mock = Arc::new(MockWslExecutor::new());
        let monitor = MockResourceMonitor::with_wsl_mock(wsl_mock);

        let path = monitor.get_distro_base_path("NonExistent");
        assert!(path.is_none());
    }

    #[test]
    fn test_registry_info_guids_are_unique() {
        let monitor = MockResourceMonitor::new();
        let info = monitor.get_all_distro_registry_info();

        let guids: Vec<&String> = info.values().map(|i| &i.id).collect();
        let unique_guids: std::collections::HashSet<&String> = guids.iter().copied().collect();

        assert_eq!(guids.len(), unique_guids.len(), "GUIDs should be unique");
    }
}
