//! Resource Monitor - Anti-Corruption Layer for system resource queries
//!
//! This module abstracts querying system resources like memory and CPU usage
//! for WSL2 VM and individual distributions, as well as disk information and
//! registry queries for distribution metadata.

mod mock;
mod real;

pub use mock::MockResourceMonitor;
pub use real::RealResourceMonitor;

use crate::wsl::types::{PhysicalDisk, WslError};

/// Per-distribution resource usage
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DistroResourceUsage {
    /// Distribution name
    pub name: String,
    /// Memory used by processes in this distribution (RSS sum) in bytes
    pub memory_used_bytes: u64,
    /// CPU usage percentage (sum of all process CPU%), None if unavailable (e.g., BusyBox)
    pub cpu_percent: Option<f64>,
}

/// Distribution registry information from Windows Registry
#[derive(Debug, Clone)]
pub struct DistroRegistryInfo {
    /// Distribution ID (GUID) - the registry key name
    pub id: String,
    /// Base path where the distribution is stored
    pub base_path: Option<String>,
}

/// WSL health status levels
#[derive(Debug, Clone, serde::Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum WslHealthStatus {
    Stopped,
    Healthy,
    Warning,
    Unhealthy,
}

/// WSL health information
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WslHealth {
    /// Overall health status
    pub status: WslHealthStatus,
    /// Human-readable message explaining the status
    pub message: String,
    /// Number of WSL-related processes currently running
    pub wsl_process_count: u32,
    /// Whether the WSL2 VM is currently running (wslhost.exe present)
    pub vm_running: bool,
}

/// Abstraction over resource monitoring operations.
pub trait ResourceMonitor: Send + Sync {
    // === Memory and CPU Monitoring ===

    /// Get WSL health status based on VM state and process count
    fn get_wsl_health(&self) -> WslHealth;

    /// Get total WSL2 VM memory usage by querying the vmmem process
    fn get_wsl_memory_usage(&self) -> Result<u64, WslError>;

    /// Get total system physical memory in bytes
    fn get_system_total_memory(&self) -> Option<u64>;

    /// Get resource usage for a specific running distribution
    fn get_distro_resource_usage(&self, distro: &str) -> Result<DistroResourceUsage, WslError>;

    // === Registry Queries ===

    /// Get all distribution registry info (IDs, names, paths) in one query
    /// Returns a HashMap keyed by distribution name (case-insensitive lookup recommended)
    fn get_all_distro_registry_info(&self) -> std::collections::HashMap<String, DistroRegistryInfo>;

    /// Get the base path for a distribution from Windows registry
    fn get_distro_base_path(&self, name: &str) -> Option<String>;

    /// Get the VHDX file size for a distribution (queries registry then filesystem)
    fn get_distro_vhdx_size(&self, name: &str) -> Option<u64>;

    /// Get the full path to a distribution's VHDX file
    fn get_distro_vhdx_path(&self, name: &str) -> Option<String>;

    /// Compact a VHDX file to reclaim unused space
    /// Uses Optimize-VHD (if Hyper-V available) with diskpart fallback
    /// Requires WSL to be fully shutdown and admin privileges (UAC prompt)
    fn compact_vhdx(&self, vhdx_path: &str) -> Result<(), WslError>;

    // === Disk Information ===

    /// List all physical disks available on the system
    fn list_physical_disks(&self) -> Result<Vec<PhysicalDisk>, WslError>;

    // === Registry Modifications ===

    /// Rename a distribution in the Windows Registry
    /// Returns the old name on success, along with optional paths for terminal profile and shortcut
    fn rename_distribution_registry(
        &self,
        id: &str,
        new_name: &str,
    ) -> Result<RenameRegistryResult, WslError>;
}

/// Result from renaming a distribution in the registry
#[derive(Debug, Clone)]
pub struct RenameRegistryResult {
    /// Path to Windows Terminal profile fragment (if exists)
    pub terminal_profile_path: Option<String>,
    /// Path to Start Menu shortcut (if exists)
    pub shortcut_path: Option<String>,
}
