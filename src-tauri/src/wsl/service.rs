//! WSL service facade
//!
//! Provides a unified API for all WSL operations, maintaining backward
//! compatibility while delegating to specialized modules.

use super::executor::wsl_executor;
use super::info::{VhdSizeInfo, WslVersionInfo};
use super::resources::{self, DistroResourceUsage, WslResourceUsage};
use super::types::{CompactResult, Distribution, WslError, WslPreflightStatus, MountedDisk, MountDiskOptions, PhysicalDisk};
use super::{core, import_export, info, install, terminal};

/// WSL Service - facade for all WSL operations
///
/// This struct provides a unified interface for all WSL operations,
/// delegating to specialized modules internally.
pub struct WslService;

impl WslService {
    // ==================== Core Operations ====================

    /// List all WSL distributions with their status
    pub fn list_distributions() -> Result<Vec<Distribution>, WslError> {
        core::list_distributions()
    }

    /// Start a WSL distribution
    /// If `id` is provided, uses `--distribution-id` for more reliable identification
    pub fn start_distribution(name: &str, id: Option<&str>) -> Result<(), WslError> {
        core::start_distribution(name, id)
    }

    /// Stop/terminate a specific WSL distribution
    pub fn stop_distribution(name: &str) -> Result<(), WslError> {
        core::stop_distribution(name)
    }

    /// Force stop distribution by shutting down all WSL instances
    /// This is a nuclear option when normal stop fails
    pub fn force_stop_distribution(name: &str) -> Result<(), WslError> {
        core::force_stop_distribution(name)
    }

    /// Delete/unregister a WSL distribution
    pub fn delete_distribution(name: &str) -> Result<(), WslError> {
        core::delete_distribution(name)
    }

    /// Shutdown all WSL distributions
    pub fn shutdown_all() -> Result<(), WslError> {
        core::shutdown_all()
    }

    /// Force kill all WSL processes and restart the LxssManager service
    /// This is the nuclear option when WSL is completely unresponsive
    pub fn force_kill_wsl() -> Result<(), WslError> {
        core::force_kill_wsl()
    }

    /// Set a distribution as the default
    pub fn set_default_distribution(name: &str) -> Result<(), WslError> {
        core::set_default_distribution(name)
    }

    /// Restart a distribution (stop then start)
    /// If `id` is provided, uses `--distribution-id` for more reliable identification
    pub fn restart_distribution(name: &str, id: Option<&str>) -> Result<(), WslError> {
        core::restart_distribution(name, id)
    }

    // ==================== Terminal & IDE ====================

    /// Open terminal in a distribution
    /// If `id` is provided, uses `--distribution-id` for more reliable identification
    pub fn open_terminal(name: &str, id: Option<&str>, terminal_command: &str) -> Result<(), WslError> {
        terminal::open_terminal(name, id, terminal_command)
    }

    /// Open terminal connected to the WSL2 system distro (CBL-Mariner/Azure Linux)
    pub fn open_system_terminal(terminal_command: &str) -> Result<(), WslError> {
        terminal::open_system_terminal(terminal_command)
    }

    /// Open terminal and execute a command in a distribution
    /// The terminal stays open after the command completes so user can see output
    /// If `id` is provided, uses `--distribution-id` for more reliable identification
    pub fn open_terminal_with_command(name: &str, id: Option<&str>, command: &str, terminal_command: &str) -> Result<(), WslError> {
        terminal::open_terminal_with_command(name, id, command, terminal_command)
    }

    /// Open File Explorer in the distribution's root
    pub fn open_file_explorer(name: &str) -> Result<(), WslError> {
        terminal::open_file_explorer(name)
    }

    /// Open IDE connected to the distribution
    pub fn open_ide(name: &str, ide_command: &str) -> Result<(), WslError> {
        terminal::open_ide(name, ide_command)
    }

    // ==================== Import/Export ====================

    /// Export a distribution to a tar file
    pub fn export_distribution(name: &str, path: &str) -> Result<(), WslError> {
        import_export::export_distribution(name, path)
    }

    /// Import a distribution from a tar file
    pub fn import_distribution(
        name: &str,
        install_location: &str,
        tar_path: &str,
    ) -> Result<(), WslError> {
        import_export::import_distribution(name, install_location, tar_path)
    }

    /// Import a distribution from a tar file with specific WSL version
    pub fn import_distribution_with_version(
        name: &str,
        install_location: &str,
        tar_path: &str,
        wsl_version: Option<u8>,
    ) -> Result<(), WslError> {
        import_export::import_distribution_with_version(name, install_location, tar_path, wsl_version)
    }

    /// Clone a distribution (export + import with new name)
    ///
    /// If `install_location` is None, defaults to `%LOCALAPPDATA%\wsl\<new_name>`
    pub fn clone_distribution(source: &str, new_name: &str, install_location: Option<&str>) -> Result<(), WslError> {
        import_export::clone_distribution(source, new_name, install_location)
    }

    // ==================== Installation ====================

    /// Get list of available distributions from Microsoft (for quick install)
    pub fn list_online_distributions() -> Result<Vec<String>, WslError> {
        install::list_online_distributions()
    }

    /// Quick install from Microsoft (uses wsl --install, fast but fixed name)
    pub fn quick_install_distribution(distro_id: &str) -> Result<(), WslError> {
        install::quick_install_distribution(distro_id)
    }

    /// Get list of distros available for custom install (direct download)
    pub fn list_downloadable_distributions() -> Result<Vec<String>, WslError> {
        install::list_downloadable_distributions()
    }

    /// Create a new distribution from a Docker/Podman image (legacy - uses container runtime)
    ///
    /// `runtime_hint` can be "docker", "podman", or None to auto-detect
    pub fn create_from_image(
        image: &str,
        distro_name: &str,
        install_location: Option<&str>,
        wsl_version: Option<u8>,
        runtime_hint: Option<&str>,
    ) -> Result<(), WslError> {
        install::create_from_image(image, distro_name, install_location, wsl_version, runtime_hint)
    }

    /// Create a new distribution from an OCI container image (native - no Docker/Podman required)
    pub fn create_from_oci_image(
        image: &str,
        distro_name: &str,
        install_location: Option<&str>,
        wsl_version: Option<u8>,
        progress: Option<crate::oci::ProgressCallback>,
    ) -> Result<(), WslError> {
        install::create_from_oci_image(image, distro_name, install_location, wsl_version, progress)
    }

    // ==================== Information ====================

    /// Get disk size of a distribution's VHDX file
    pub fn get_distribution_disk_size(name: &str) -> Result<u64, WslError> {
        info::get_distribution_disk_size(name)
    }

    /// Get both file size and virtual size of a distribution's VHD
    pub fn get_distribution_vhd_size(name: &str) -> Result<VhdSizeInfo, WslError> {
        info::get_distribution_vhd_size(name)
    }

    /// Get the actual OS info from inside the distribution
    /// If `id` is provided, uses `--distribution-id` for more reliable identification
    pub fn get_distribution_os_info(name: &str, id: Option<&str>) -> Result<String, WslError> {
        info::get_distribution_os_info(name, id)
    }

    /// Get the installation location (BasePath) of a distribution
    pub fn get_distribution_location(name: &str) -> Result<Option<String>, WslError> {
        info::get_distribution_location(name)
    }

    // ==================== Resource Monitoring ====================

    /// Get total WSL2 VM memory usage (from vmmem process)
    #[allow(dead_code)]
    pub fn get_wsl_memory_usage() -> Result<u64, WslError> {
        resources::get_wsl_memory_usage()
    }

    /// Get resource usage for a specific running distribution
    #[allow(dead_code)]
    pub fn get_distro_resource_usage(name: &str) -> Result<DistroResourceUsage, WslError> {
        resources::get_distro_resource_usage(name)
    }

    /// Get complete resource usage stats including per-distro breakdown
    pub fn get_resource_usage(
        memory_limit: Option<u64>,
    ) -> Result<(WslResourceUsage, Vec<DistroResourceUsage>), WslError> {
        let memory_used = resources::get_wsl_memory_usage()?;

        let global = WslResourceUsage {
            memory_used_bytes: memory_used,
            memory_limit_bytes: memory_limit,
        };

        // Get per-distro usage for running distributions
        let distributions = core::list_distributions()?;
        let mut distro_usage = Vec::new();

        for distro in distributions {
            if distro.state == crate::wsl::DistroState::Running {
                if let Ok(usage) = resources::get_distro_resource_usage(&distro.name) {
                    distro_usage.push(usage);
                }
            }
        }

        Ok((global, distro_usage))
    }

    // ==================== Preflight & Version ====================

    /// Check if WSL is installed and ready to use
    /// Returns a WslPreflightStatus indicating readiness or specific error
    pub fn check_preflight() -> WslPreflightStatus {
        wsl_executor().check_preflight()
    }

    /// Get WSL version information
    pub fn get_wsl_version() -> Result<WslVersionInfo, WslError> {
        info::get_wsl_version()
    }

    /// Get the WSL2 IP address (shared across all WSL2 distros)
    /// Returns None if no distros are running
    pub fn get_wsl_ip() -> Result<Option<String>, WslError> {
        info::get_wsl_ip()
    }

    /// Get information about the WSL2 system distribution (CBL-Mariner/Azure Linux)
    pub fn get_system_distro_info() -> Result<info::SystemDistroInfo, WslError> {
        info::get_system_distro_info()
    }

    /// Update WSL using `wsl --update`
    /// If pre_release is true, uses `wsl --update --pre-release`
    /// current_version is used for before/after comparison
    /// Returns the update result message on success
    pub fn update_wsl(pre_release: bool, current_version: Option<&str>) -> Result<String, WslError> {
        core::update_wsl(pre_release, current_version)
    }

    // ==================== Manage Operations ====================

    /// Move a distribution to a new location
    /// Requires the distribution to be stopped first
    pub fn move_distribution(name: &str, location: &str) -> Result<(), WslError> {
        core::move_distribution(name, location)
    }

    /// Set sparse mode for a distribution's virtual disk
    /// Sparse mode allows automatic disk space reclamation
    pub fn set_sparse(name: &str, enabled: bool) -> Result<(), WslError> {
        core::set_sparse(name, enabled)
    }

    /// Set the default user for a distribution
    pub fn set_default_user(name: &str, username: &str) -> Result<(), WslError> {
        core::set_default_user(name, username)
    }

    /// Resize a distribution's virtual disk
    /// Size should be a string like "50GB" or "1TB"
    pub fn resize_distribution(name: &str, size: &str) -> Result<(), WslError> {
        core::resize_distribution(name, size)
    }

    /// Compact a distribution's virtual disk to reclaim unused space
    ///
    /// This operation:
    /// - Requires WSL to be fully shutdown (not just the distro stopped)
    /// - May take several minutes for large disks (~1 minute per GB)
    /// - Requires administrator privileges (UAC prompt will appear)
    pub fn compact_distribution(name: &str) -> Result<CompactResult, WslError> {
        core::compact_distribution(name)
    }

    /// Set the WSL version for a distribution (1 or 2)
    /// This converts the distribution between WSL 1 and WSL 2.
    /// Note: This operation can take several minutes.
    pub fn set_distro_version(name: &str, version: u8) -> Result<(), WslError> {
        core::set_distro_version(name, version)
    }

    /// Rename a distribution
    /// Requires the distribution ID (GUID) and optionally updates terminal profile and shortcut
    /// Returns the old name on success
    pub fn rename_distribution(
        id: &str,
        new_name: &str,
        update_terminal_profile: bool,
        update_shortcut: bool,
    ) -> Result<String, WslError> {
        let options = core::RenameOptions {
            update_terminal_profile,
            update_shortcut,
        };
        core::rename_distribution(id, new_name, &options)
    }

    // ==================== Disk Mount Operations ====================

    /// Mount a disk to WSL
    pub fn mount_disk(options: &MountDiskOptions) -> Result<(), WslError> {
        core::mount_disk(options)
    }

    /// Unmount a disk from WSL
    /// If disk_path is None, unmounts all disks
    pub fn unmount_disk(disk_path: Option<&str>) -> Result<(), WslError> {
        core::unmount_disk(disk_path)
    }

    /// List disks currently mounted in WSL
    pub fn list_mounted_disks() -> Result<Vec<MountedDisk>, WslError> {
        core::list_mounted_disks()
    }

    /// List physical disks available for mounting
    pub fn list_physical_disks() -> Result<Vec<PhysicalDisk>, WslError> {
        core::list_physical_disks()
    }
}
