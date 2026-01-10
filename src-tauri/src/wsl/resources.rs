//! Resource monitoring for WSL2
//!
//! Provides functions to get memory usage for the WSL2 VM and individual distributions.
//!
//! This module delegates to the resource monitor executor, which provides
//! real or mock implementations based on the runtime mode.

use super::executor::resource_monitor;
use super::types::WslError;

// Re-export types from executor for backward compatibility
pub use super::executor::{DistroResourceUsage, WslHealth};

/// Global WSL2 resource usage
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WslResourceUsage {
    /// Total memory used by WSL2 VM in bytes
    pub memory_used_bytes: u64,
    /// Memory limit from .wslconfig in bytes (None if not set)
    pub memory_limit_bytes: Option<u64>,
}

/// Get WSL health status based on VM state and process count
pub fn get_wsl_health() -> WslHealth {
    resource_monitor().get_wsl_health()
}

/// Get total WSL2 VM memory usage by querying the vmmem process
pub fn get_wsl_memory_usage() -> Result<u64, WslError> {
    resource_monitor().get_wsl_memory_usage()
}

/// Get total system physical memory in bytes
pub fn get_system_total_memory() -> Option<u64> {
    resource_monitor().get_system_total_memory()
}

/// Get resource usage for a specific running distribution
pub fn get_distro_resource_usage(name: &str) -> Result<DistroResourceUsage, WslError> {
    resource_monitor().get_distro_resource_usage(name)
}

/// Parse memory string like "8GB", "4096MB", "8g" into bytes
/// This is public so it can be used by commands to parse .wslconfig memory limit
pub fn parse_memory_string(s: &str) -> Option<u64> {
    let s = s.trim().to_lowercase();

    // Try to find where the number ends and unit begins
    let (num_str, unit) = if let Some(pos) = s.find(|c: char| c.is_alphabetic()) {
        (&s[..pos], &s[pos..])
    } else {
        // No unit, assume bytes
        return s.parse().ok();
    };

    let num: f64 = num_str.trim().parse().ok()?;

    let multiplier: u64 = match unit.trim() {
        "b" => 1,
        "k" | "kb" => 1024,
        "m" | "mb" => 1024 * 1024,
        "g" | "gb" => 1024 * 1024 * 1024,
        "t" | "tb" => 1024 * 1024 * 1024 * 1024,
        _ => return None,
    };

    Some((num * multiplier as f64) as u64)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_memory_string() {
        assert_eq!(parse_memory_string("8GB"), Some(8 * 1024 * 1024 * 1024));
        assert_eq!(parse_memory_string("8gb"), Some(8 * 1024 * 1024 * 1024));
        assert_eq!(parse_memory_string("8G"), Some(8 * 1024 * 1024 * 1024));
        assert_eq!(parse_memory_string("8g"), Some(8 * 1024 * 1024 * 1024));
        assert_eq!(parse_memory_string("4096MB"), Some(4096 * 1024 * 1024));
        assert_eq!(parse_memory_string("4096mb"), Some(4096 * 1024 * 1024));
        assert_eq!(parse_memory_string("4096M"), Some(4096 * 1024 * 1024));
        assert_eq!(parse_memory_string("1024KB"), Some(1024 * 1024));
        assert_eq!(parse_memory_string("1TB"), Some(1024 * 1024 * 1024 * 1024));
        assert_eq!(parse_memory_string("invalid"), None);
        assert_eq!(parse_memory_string(""), None);
    }
}
