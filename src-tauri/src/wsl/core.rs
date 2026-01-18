//! Core WSL operations
//!
//! Basic operations for listing, starting, stopping, and managing WSL distributions.
//! All WSL CLI calls go through the executor abstraction layer.

use std::path::Path;
use log::{debug, error, info, warn};
use winreg::enums::*;
use winreg::RegKey;
use wsl_core::parse_wsl_list_output;

use super::executor::{resource_monitor, wsl_executor};
use super::types::{CompactResult, Distribution, DistroState, WslError, MountedDisk, MountDiskOptions, PhysicalDisk, WSL_REGISTRY_PATH};
use crate::metadata;

/// Parse bytes trimmed from fstrim output
/// Handles formats like:
/// - util-linux: "/: 1.2 TiB (1288557195264 bytes) trimmed on /dev/sdd"
/// - BusyBox: "/: 123456789 bytes"
fn parse_fstrim_bytes(output: &str) -> Option<u64> {
    // Look for "(N bytes)" pattern first (util-linux verbose format)
    if let Some(start) = output.find('(') {
        if let Some(end) = output[start..].find(" bytes)") {
            let num_str = &output[start + 1..start + end];
            if let Ok(bytes) = num_str.parse::<u64>() {
                return Some(bytes);
            }
        }
    }

    // Look for "N bytes" pattern (BusyBox format)
    for part in output.split_whitespace() {
        if let Ok(bytes) = part.parse::<u64>() {
            // Check if next word is "bytes"
            if output.contains(&format!("{} bytes", bytes)) {
                return Some(bytes);
            }
        }
    }

    None
}

/// List all WSL distributions with their status
pub fn list_distributions() -> Result<Vec<Distribution>, WslError> {
    debug!("Listing WSL distributions");

    let output = wsl_executor().list_verbose()?;

    // Check for "no installed distributions" - this is a valid state, not an error
    let combined_output = format!("{}\n{}", output.stdout, output.stderr).to_lowercase();
    if combined_output.contains("no installed distributions") {
        debug!("No WSL distributions installed");
        return Ok(Vec::new());
    }

    if !output.success {
        warn!("WSL list command failed: {}", output.stderr);
        return Err(WslError::CommandFailed(output.stderr));
    }

    // Parse WSL output to get basic distribution info
    let mut distros: Vec<Distribution> = parse_wsl_list_output(&output.stdout)
        .into_iter()
        .map(Distribution::from)
        .collect();

    // Fetch registry info to get distribution IDs (GUIDs)
    let registry_info = resource_monitor().get_all_distro_registry_info();

    // Merge registry info (ID and location) into distributions
    for distro in &mut distros {
        if let Some(info) = registry_info.get(&distro.name) {
            distro.id = Some(info.id.clone());
            distro.location = info.base_path.clone();
        }
    }

    debug!("Listed {} distributions", distros.len());
    Ok(distros)
}

/// Start a WSL distribution
/// If `id` is provided, uses `--distribution-id` for more reliable identification
pub fn start_distribution(name: &str, id: Option<&str>) -> Result<(), WslError> {
    info!("Starting distribution '{}'", name);

    let output = wsl_executor().start(name, id)?;

    if output.success {
        info!("Distribution '{}' started successfully", name);
        return Ok(());
    }

    // If start failed, return the error
    warn!("Start command failed for '{}': {}", name, output.stderr);
    Err(WslError::CommandFailed(format!(
        "{}. If this is NixOS or a minimal distro, try running 'wsl -d {}' manually for first boot.",
        output.stderr, name
    )))
}

/// Stop/terminate a specific WSL distribution with timeout
pub fn stop_distribution(name: &str) -> Result<(), WslError> {
    info!("Stopping distribution '{}'", name);

    let output = wsl_executor().terminate(name)?;

    if !output.success {
        warn!("Stop command failed for '{}': {}", name, output.stderr);
        return Err(WslError::CommandFailed(output.stderr));
    }

    // Verify the distro actually stopped
    let verify_timeout = std::time::Duration::from_secs(30);
    let verify_start = std::time::Instant::now();

    debug!("Verifying distribution '{}' has stopped", name);
    loop {
        if let Ok(distros) = list_distributions() {
            if let Some(distro) = distros.iter().find(|d| d.name == name) {
                if distro.state != DistroState::Running {
                    info!("Distribution '{}' stopped successfully", name);
                    return Ok(());
                }
                debug!("Distribution '{}' still running (state: {}), waiting...", name, distro.state);
            } else {
                info!("Distribution '{}' no longer exists", name);
                return Ok(());
            }
        }

        if verify_start.elapsed() > verify_timeout {
            error!("Distribution '{}' did not stop within 30 seconds", name);
            return Err(WslError::CommandFailed(
                format!("'{}' is taking too long to stop. Try 'Force Stop' to shutdown all WSL instances.", name)
            ));
        }

        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}

/// Force stop all WSL distributions (nuclear option)
pub fn force_stop_distribution(name: &str) -> Result<(), WslError> {
    info!("Force stopping distribution '{}' (will shutdown all WSL)", name);

    let output = wsl_executor().shutdown()?;

    if !output.success {
        warn!("Force stop command failed: {}", output.stderr);
        return Err(WslError::CommandFailed(output.stderr));
    }

    // Verify all distros are stopped
    let verify_timeout = std::time::Duration::from_secs(15);
    let verify_start = std::time::Instant::now();

    debug!("Verifying all distributions have stopped");
    loop {
        if let Ok(distros) = list_distributions() {
            let running_count = distros.iter().filter(|d| d.state == DistroState::Running).count();
            if running_count == 0 {
                info!("All WSL instances shut down (force stop successful)");
                return Ok(());
            }
            debug!("{} distributions still running, waiting...", running_count);
        }

        if verify_start.elapsed() > verify_timeout {
            warn!("Some distributions may still be stopping after force shutdown");
            return Ok(());
        }

        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}

/// Delete/unregister a WSL distribution
pub fn delete_distribution(name: &str) -> Result<(), WslError> {
    info!("Deleting distribution '{}'", name);

    // Get the ID before deletion so we can clean up metadata
    let distro_id = metadata::get_distro_id_by_name(name);

    let output = wsl_executor().unregister(name)?;

    if !output.success {
        warn!("Delete command failed for '{}': {}", name, output.stderr);
        return Err(WslError::CommandFailed(output.stderr));
    }

    // Delete metadata after successful unregister
    if let Some(id) = distro_id {
        if let Err(e) = metadata::delete_metadata(&id) {
            warn!("Failed to delete metadata (non-fatal): {}", e);
        } else {
            info!("Deleted metadata for distribution '{}'", name);
        }
    }

    info!("Distribution '{}' deleted successfully", name);
    Ok(())
}

/// Shutdown all WSL distributions
pub fn shutdown_all() -> Result<(), WslError> {
    info!("Shutting down all WSL instances");

    let output = wsl_executor().shutdown()?;

    if !output.success {
        warn!("Shutdown command failed: {}", output.stderr);
        return Err(WslError::CommandFailed(output.stderr));
    }

    // Verify all distros are stopped
    let verify_timeout = std::time::Duration::from_secs(15);
    let verify_start = std::time::Instant::now();

    debug!("Verifying all distributions have stopped");
    loop {
        if let Ok(distros) = list_distributions() {
            let running_count = distros.iter().filter(|d| d.state == DistroState::Running).count();
            if running_count == 0 {
                info!("All WSL instances shut down");
                return Ok(());
            }
            debug!("{} distributions still running, waiting...", running_count);
        }

        if verify_start.elapsed() > verify_timeout {
            warn!("Some distributions may still be stopping after shutdown");
            return Ok(());
        }

        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}

/// Force kill all WSL processes using wsl --shutdown --force
/// This directly uses the --force flag for immediate termination
/// WARNING: This may cause data loss in running distributions
pub fn force_kill_wsl() -> Result<(), WslError> {
    info!("Force killing all WSL processes using wsl --shutdown --force");

    // Use --force directly for immediate termination
    let output = wsl_executor().shutdown_force()?;

    if !output.success {
        warn!("wsl --shutdown --force returned non-zero exit code: {}", output.stderr);
    }

    // Give WSL time to fully terminate
    std::thread::sleep(std::time::Duration::from_secs(2));

    // Verify shutdown
    if let Ok(distros) = list_distributions() {
        let still_running = distros.iter().filter(|d| d.state == DistroState::Running).count();
        if still_running > 0 {
            warn!(
                "WARNING: {} distributions may still be running. You may need to restart your computer.",
                still_running
            );
        }
    }

    info!("WSL force shutdown completed - WSL will start automatically on next use");
    Ok(())
}

/// Set a distribution as the default
pub fn set_default_distribution(name: &str) -> Result<(), WslError> {
    let output = wsl_executor().set_default(name)?;

    if !output.success {
        return Err(WslError::CommandFailed(output.stderr));
    }

    Ok(())
}

/// Restart a distribution (stop then start)
/// If `id` is provided, uses `--distribution-id` for more reliable identification
pub fn restart_distribution(name: &str, id: Option<&str>) -> Result<(), WslError> {
    stop_distribution(name)?;
    std::thread::sleep(std::time::Duration::from_secs(1));
    start_distribution(name, id)?;
    Ok(())
}

// ==================== Manage Operations ====================

/// Move a distribution to a new location
pub fn move_distribution(name: &str, location: &str) -> Result<(), WslError> {
    info!("Moving distribution to new location");

    // Verify distro is stopped
    let distros = list_distributions()?;
    if let Some(distro) = distros.iter().find(|d| d.name == name) {
        if distro.state == DistroState::Running {
            return Err(WslError::CommandFailed(
                "Distribution must be stopped before moving. Please stop it first.".to_string()
            ));
        }
    } else {
        return Err(WslError::DistroNotFound(name.to_string()));
    }

    // Create destination directory if it doesn't exist
    if let Err(e) = std::fs::create_dir_all(location) {
        error!("Failed to create destination directory: {}", e);
        return Err(WslError::CommandFailed(format!("Failed to create destination directory: {}", e)));
    }

    let output = wsl_executor().move_distro(name, location)?;

    if !output.success {
        let error_msg = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            "Unknown error occurred".to_string()
        };
        warn!("Move command failed: {}", error_msg);
        return Err(WslError::CommandFailed(error_msg));
    }

    info!("Distribution moved successfully");
    Ok(())
}

/// Set sparse mode for a distribution's virtual disk
pub fn set_sparse(name: &str, enabled: bool) -> Result<(), WslError> {
    info!("Setting sparse mode for distribution");

    // Verify distro is stopped
    let distros = list_distributions()?;
    if let Some(distro) = distros.iter().find(|d| d.name == name) {
        if distro.state == DistroState::Running {
            return Err(WslError::CommandFailed(
                "Distribution must be stopped before changing sparse mode. Please stop it first.".to_string()
            ));
        }
    } else {
        return Err(WslError::DistroNotFound(name.to_string()));
    }

    let output = wsl_executor().set_sparse(name, enabled)?;

    if !output.success {
        let error_msg = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            "Unknown error occurred".to_string()
        };
        warn!("Set sparse command failed: {}", error_msg);
        return Err(WslError::CommandFailed(error_msg));
    }

    info!("Sparse mode set successfully");
    Ok(())
}

/// Set the default user for a distribution
pub fn set_default_user(name: &str, username: &str) -> Result<(), WslError> {
    info!("Setting default user for distribution");

    // Verify distro exists
    let distros = list_distributions()?;
    if !distros.iter().any(|d| d.name == name) {
        return Err(WslError::DistroNotFound(name.to_string()));
    }

    // Validate username format (basic Linux username rules)
    if username.is_empty() {
        return Err(WslError::CommandFailed("Username cannot be empty".to_string()));
    }
    if !username.chars().next().unwrap().is_ascii_lowercase() {
        return Err(WslError::CommandFailed("Username must start with a lowercase letter".to_string()));
    }
    if !username.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_' || c == '-') {
        return Err(WslError::CommandFailed(
            "Username can only contain lowercase letters, digits, underscores, and hyphens".to_string()
        ));
    }

    let output = wsl_executor().set_default_user(name, username)?;

    if !output.success {
        let error_msg = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            "Unknown error occurred".to_string()
        };
        warn!("Set default user command failed: {}", error_msg);
        return Err(WslError::CommandFailed(error_msg));
    }

    info!("Default user set successfully");
    Ok(())
}

/// Resize a distribution's virtual disk
pub fn resize_distribution(name: &str, size: &str) -> Result<(), WslError> {
    info!("Resizing distribution disk to {}", size);

    // Verify distro is stopped
    let distros = list_distributions()?;
    if let Some(distro) = distros.iter().find(|d| d.name == name) {
        if distro.state == DistroState::Running {
            return Err(WslError::CommandFailed(
                "Distribution must be stopped before resizing. Please stop it first.".to_string()
            ));
        }
    } else {
        return Err(WslError::DistroNotFound(name.to_string()));
    }

    if size.is_empty() {
        return Err(WslError::CommandFailed("Size cannot be empty".to_string()));
    }

    let output = wsl_executor().resize(name, size)?;

    if !output.success {
        // WSL sometimes outputs errors to stdout instead of stderr
        let error_msg = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            "Resize failed".to_string()
        };
        warn!("Resize command failed: {}", error_msg);
        return Err(WslError::CommandFailed(error_msg));
    }

    info!("Distribution resized successfully");
    Ok(())
}

/// Compact a distribution's virtual disk to reclaim unused space
///
/// This operation:
/// 1. Starts the distro (if not running) to run fstrim
/// 2. Runs `fstrim -av` to zero unused blocks (required for compaction to work)
/// 3. Shuts down WSL completely
/// 4. Compacts the VHDX using Optimize-VHD or diskpart
///
/// Requirements:
/// - May take several minutes for large disks
/// - Requires administrator privileges (UAC prompt will appear)
pub fn compact_distribution(name: &str) -> Result<CompactResult, WslError> {
    info!("Compacting distribution disk for '{}'", name);

    // Verify distro exists and check WSL version
    let distros = list_distributions()?;
    let distro = distros
        .iter()
        .find(|d| d.name == name)
        .ok_or_else(|| WslError::DistroNotFound(name.to_string()))?;

    // WSL1 doesn't use VHDX - files are stored directly in a folder
    if distro.version == 1 {
        return Err(WslError::CommandFailed(
            "Compact is only available for WSL2 distributions. WSL1 does not use virtual disk files.".to_string()
        ));
    }

    let vhdx_path = resource_monitor()
        .get_distro_vhdx_path(name)
        .ok_or_else(|| {
            WslError::CommandFailed(format!(
                "Could not locate VHDX file for distribution: {}",
                name
            ))
        })?;

    info!("Found VHDX at: {}", vhdx_path);

    // Get size before compact
    let size_before = resource_monitor()
        .get_distro_vhdx_size(name)
        .unwrap_or(0);

    info!("Size before compact: {} bytes", size_before);

    // Step 1: Run fstrim to zero unused blocks (this is essential for compaction to work)
    // The distro needs to be running for this, and we need root privileges
    info!("Running fstrim to prepare disk for compaction...");

    // Run fstrim as root using wsl -u root (no sudo password needed)
    // Try util-linux syntax first (-av), fall back to BusyBox syntax (-v /) for Alpine
    let fstrim_result = wsl_executor().exec_as_root(
        name,
        distro.id.as_deref(),
        "fstrim -av 2>/dev/null || fstrim -v / 2>&1 || echo 'fstrim not available'"
    );

    // Parse fstrim output to extract bytes trimmed
    let (fstrim_bytes, fstrim_message) = match fstrim_result {
        Ok(output) => {
            let stdout = output.stdout.trim();
            info!("fstrim output: {}", stdout);

            if stdout.contains("not available") {
                (None, Some("fstrim not available on this distribution".to_string()))
            } else {
                // Try to parse bytes from output like "1.2 TiB (1288557195264 bytes) trimmed"
                // or BusyBox format "/: 123456789 bytes"
                let bytes = parse_fstrim_bytes(stdout);
                if bytes.is_some() {
                    (bytes, Some(stdout.to_string()))
                } else {
                    (None, Some(stdout.to_string()))
                }
            }
        }
        Err(e) => {
            warn!("fstrim command failed (continuing anyway): {}", e);
            (None, Some(format!("fstrim failed: {}", e)))
        }
    };

    // Step 2: Shutdown WSL completely (VHDX must not be in use for compaction)
    info!("Shutting down WSL to release VHDX lock...");
    let shutdown_result = wsl_executor().shutdown();
    if let Err(e) = shutdown_result {
        warn!("WSL shutdown returned error (may already be stopped): {}", e);
    }

    // Verify WSL is actually stopped (up to 10 seconds)
    let verify_timeout = std::time::Duration::from_secs(10);
    let verify_start = std::time::Instant::now();
    loop {
        if let Ok(distros) = list_distributions() {
            let running_count = distros.iter().filter(|d| d.state == DistroState::Running).count();
            if running_count == 0 {
                info!("WSL shutdown verified - all distros stopped");
                break;
            }
            debug!("{} distributions still running, waiting...", running_count);
        }

        if verify_start.elapsed() > verify_timeout {
            warn!("WSL distros may still be running after shutdown wait");
            break;
        }

        std::thread::sleep(std::time::Duration::from_secs(1));
    }

    // Additional wait for filesystem to release VHDX lock
    std::thread::sleep(std::time::Duration::from_millis(1000));

    // Step 3: Run the compact operation
    info!("Starting VHDX compact operation...");
    resource_monitor().compact_vhdx(&vhdx_path)?;

    // Give filesystem a moment to update metadata
    std::thread::sleep(std::time::Duration::from_millis(500));

    // Get size after compact
    let size_after = resource_monitor()
        .get_distro_vhdx_size(name)
        .unwrap_or(0);

    let result = CompactResult {
        size_before,
        size_after,
        fstrim_bytes,
        fstrim_message,
    };

    info!(
        "Compact completed. Size: {} -> {} (saved {} bytes)",
        size_before,
        size_after,
        result.space_saved()
    );

    Ok(result)
}

/// Set the WSL version for a distribution (1 or 2)
///
/// This converts the distribution between WSL 1 and WSL 2.
/// Note: This operation can take several minutes, especially for v1 → v2 conversion.
/// The distribution must be stopped before conversion.
pub fn set_distro_version(name: &str, version: u8) -> Result<(), WslError> {
    info!("Setting distribution WSL version to {}", version);

    // Validate version
    if version != 1 && version != 2 {
        return Err(WslError::CommandFailed(
            "Version must be 1 or 2".to_string()
        ));
    }

    // Verify distro exists and is stopped
    let distros = list_distributions()?;
    if let Some(distro) = distros.iter().find(|d| d.name == name) {
        if distro.state == DistroState::Running {
            return Err(WslError::CommandFailed(
                "Distribution must be stopped before changing version. Please stop it first.".to_string()
            ));
        }
        // Check if already at target version
        if distro.version == version {
            info!("Distribution is already WSL {}", version);
            return Ok(());
        }
    } else {
        return Err(WslError::DistroNotFound(name.to_string()));
    }

    let output = wsl_executor().set_version(name, version)?;

    if !output.success {
        // WSL sometimes outputs errors to stdout instead of stderr
        let error_msg = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            "Version conversion failed".to_string()
        };
        warn!("Set version command failed: {}", error_msg);
        return Err(WslError::CommandFailed(error_msg));
    }

    info!("Distribution version changed to WSL {} successfully", version);
    Ok(())
}

/// Options for renaming a distribution
#[derive(Debug, Clone)]
pub struct RenameOptions {
    /// Update the Windows Terminal profile fragment display name
    pub update_terminal_profile: bool,
    /// Rename the Start Menu shortcut file
    pub update_shortcut: bool,
}

impl Default for RenameOptions {
    fn default() -> Self {
        Self {
            update_terminal_profile: true,
            update_shortcut: true,
        }
    }
}

/// Rename a WSL distribution
///
/// This modifies the registry DistributionName value. Optionally also updates:
/// - Windows Terminal profile fragment (display name)
/// - Start Menu shortcut filename
///
/// The distribution must be stopped before renaming.
/// Requires the distribution ID (GUID) to locate the registry key.
pub fn rename_distribution(
    id: &str,
    new_name: &str,
    options: &RenameOptions,
) -> Result<String, WslError> {
    info!("Renaming distribution to '{}'", new_name);

    // Validate new name
    if new_name.is_empty() {
        return Err(WslError::CommandFailed("New name cannot be empty".to_string()));
    }

    // Check for invalid characters
    const INVALID_CHARS: &[char] = &['<', '>', ':', '"', '/', '\\', '|', '?', '*'];
    if new_name.chars().any(|c| INVALID_CHARS.contains(&c)) {
        return Err(WslError::CommandFailed(format!(
            "Name contains invalid characters. Cannot use: < > : \" / \\ | ? *"
        )));
    }

    // Check name length
    if new_name.len() > 64 {
        return Err(WslError::CommandFailed(
            "Name is too long (max 64 characters)".to_string()
        ));
    }

    // Check the distribution exists and is stopped, get old name
    let distros = list_distributions()?;
    let distro = distros
        .iter()
        .find(|d| d.id.as_deref() == Some(id))
        .ok_or_else(|| WslError::DistroNotFound(id.to_string()))?;

    if distro.state == DistroState::Running {
        return Err(WslError::CommandFailed(
            "Distribution must be stopped before renaming. Please stop it first.".to_string()
        ));
    }

    let old_name = distro.name.clone();

    // Check new name doesn't conflict with existing distribution
    if distros.iter().any(|d| d.name.eq_ignore_ascii_case(new_name) && d.id.as_deref() != Some(id)) {
        return Err(WslError::CommandFailed(format!(
            "A distribution named '{}' already exists", new_name
        )));
    }

    // Use the resource monitor abstraction for registry rename
    // This works transparently in both real and mock modes
    let rename_result = resource_monitor().rename_distribution_registry(id, new_name)?;
    let terminal_profile_path = rename_result.terminal_profile_path;
    let shortcut_path = rename_result.shortcut_path;

    info!("Registry updated: '{}' -> '{}'", old_name, new_name);

    // Optionally update Windows Terminal profile fragment and settings.json files
    if options.update_terminal_profile {
        if let Some(path) = &terminal_profile_path {
            match update_terminal_profile_name(path, new_name) {
                Ok(Some(profile_guid)) => {
                    info!("Updated terminal profile fragment");
                    // Also update Terminal and Terminal Preview settings.json files
                    update_terminal_settings_json(&profile_guid, new_name);
                }
                Ok(None) => {
                    info!("Updated terminal profile fragment (no GUID found)");
                }
                Err(e) => {
                    warn!("Failed to update terminal profile (non-fatal): {}", e);
                }
            }
        }
    }

    // Optionally rename Start Menu shortcut
    if options.update_shortcut {
        if let Some(old_shortcut_path) = &shortcut_path {
            match rename_shortcut(old_shortcut_path, &old_name, new_name) {
                Ok(new_shortcut_path) => {
                    // Update the registry with the new shortcut path
                    // Re-open the registry key for this update
                    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
                    let lxss_path = format!(r"{}\{}", WSL_REGISTRY_PATH, id);
                    if let Ok(distro_key) = hkcu.open_subkey_with_flags(&lxss_path, KEY_WRITE) {
                        if let Err(e) = distro_key.set_value("ShortcutPath", &new_shortcut_path) {
                            warn!("Failed to update shortcut path in registry (non-fatal): {}", e);
                        } else {
                            info!("Updated shortcut path in registry");
                        }
                    }
                }
                Err(e) => {
                    warn!("Failed to rename shortcut (non-fatal): {}", e);
                }
            }
        }
    }

    // Update metadata with new name (GUID key stays the same)
    if let Err(e) = metadata::update_distro_name(id, new_name) {
        warn!("Failed to update metadata name (non-fatal): {}", e);
    } else {
        info!("Updated metadata for renamed distribution");
    }

    info!("Distribution renamed successfully");
    Ok(old_name)
}

/// Update the display name in a Windows Terminal profile fragment JSON file
/// Returns the profile GUID if found (for use in updating settings.json)
fn update_terminal_profile_name(path: &str, new_name: &str) -> Result<Option<String>, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read terminal profile: {}", e))?;

    // Parse JSON
    let mut json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse terminal profile JSON: {}", e))?;

    // Find and update the profile name, capture the GUID
    let mut profile_guid: Option<String> = None;
    if let Some(profiles) = json.get_mut("profiles").and_then(|p| p.as_array_mut()) {
        for profile in profiles {
            if profile.get("name").is_some() {
                profile["name"] = serde_json::Value::String(new_name.to_string());
                // Capture the GUID for updating settings.json
                if let Some(guid) = profile.get("guid").and_then(|g| g.as_str()) {
                    profile_guid = Some(guid.to_string());
                }
            }
        }
    }

    // Write back
    let new_content = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("Failed to serialize terminal profile JSON: {}", e))?;

    std::fs::write(path, new_content)
        .map_err(|e| format!("Failed to write terminal profile: {}", e))?;

    Ok(profile_guid)
}

/// Update profile name in Windows Terminal settings.json files (both regular and Preview)
/// Finds the profile by GUID and updates its name
fn update_terminal_settings_json(profile_guid: &str, new_name: &str) {
    // Get LocalAppData path
    let local_app_data = match std::env::var("LOCALAPPDATA") {
        Ok(path) => path,
        Err(_) => {
            warn!("Could not get LOCALAPPDATA environment variable");
            return;
        }
    };

    // Paths to both Terminal variants' settings.json
    let settings_paths = [
        // Windows Terminal Preview (Store app)
        format!(
            "{}\\Packages\\Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe\\LocalState\\settings.json",
            local_app_data
        ),
        // Windows Terminal (Store app)
        format!(
            "{}\\Packages\\Microsoft.WindowsTerminal_8wekyb3d8bbwe\\LocalState\\settings.json",
            local_app_data
        ),
    ];

    for settings_path in &settings_paths {
        if let Err(e) = update_single_terminal_settings(settings_path, profile_guid, new_name) {
            // Log but don't fail - this is best-effort
            debug!("Could not update terminal settings at {}: {}", settings_path, e);
        } else {
            info!("Updated terminal settings.json at {}", settings_path);
        }
    }
}

/// Update a single Terminal settings.json file
fn update_single_terminal_settings(path: &str, profile_guid: &str, new_name: &str) -> Result<(), String> {
    let path = Path::new(path);
    if !path.exists() {
        return Err("Settings file does not exist".to_string());
    }

    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("Failed to read settings: {}", e))?;

    // Parse JSON
    let mut json: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings JSON: {}", e))?;

    // Find the profile by GUID in profiles.list
    let mut updated = false;
    if let Some(profiles) = json.get_mut("profiles") {
        if let Some(list) = profiles.get_mut("list").and_then(|l| l.as_array_mut()) {
            for profile in list {
                if let Some(guid) = profile.get("guid").and_then(|g| g.as_str()) {
                    // Compare GUIDs case-insensitively
                    if guid.eq_ignore_ascii_case(profile_guid) {
                        profile["name"] = serde_json::Value::String(new_name.to_string());
                        updated = true;
                        break;
                    }
                }
            }
        }
    }

    if !updated {
        return Err(format!("Profile with GUID {} not found in settings", profile_guid));
    }

    // Write back (preserve formatting as much as possible)
    let new_content = serde_json::to_string_pretty(&json)
        .map_err(|e| format!("Failed to serialize settings JSON: {}", e))?;

    std::fs::write(path, new_content)
        .map_err(|e| format!("Failed to write settings: {}", e))?;

    Ok(())
}

/// Rename a Start Menu shortcut file
fn rename_shortcut(old_path: &str, old_name: &str, new_name: &str) -> Result<String, String> {
    let old_path = Path::new(old_path);

    if !old_path.exists() {
        return Err(format!("Shortcut file not found: {:?}", old_path));
    }

    // Construct new path by replacing old name with new name in filename
    let parent = old_path.parent().ok_or("Invalid shortcut path")?;
    let old_filename = old_path.file_name().ok_or("Invalid shortcut filename")?;
    let old_filename_str = old_filename.to_string_lossy();

    // Replace the distribution name in the filename
    let new_filename = old_filename_str.replace(old_name, new_name);
    let new_path = parent.join(&new_filename);

    std::fs::rename(old_path, &new_path)
        .map_err(|e| format!("Failed to rename shortcut: {}", e))?;

    Ok(new_path.to_string_lossy().to_string())
}

// ==================== Disk Mount Operations ====================

/// Mount a disk to WSL
pub fn mount_disk(options: &MountDiskOptions) -> Result<(), WslError> {
    info!("Mounting disk: {}", options.disk_path);

    let output = wsl_executor().mount_disk(
        &options.disk_path,
        options.is_vhd,
        options.bare,
        options.mount_name.as_deref(),
        options.filesystem_type.as_deref(),
        options.mount_options.as_deref(),
        options.partition,
    )?;

    if !output.success {
        let error_msg = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            "Unknown error occurred".to_string()
        };
        warn!("Mount command failed: {}", error_msg);
        return Err(WslError::CommandFailed(error_msg));
    }

    info!("Disk mounted successfully");
    Ok(())
}

/// Unmount a disk from WSL
pub fn unmount_disk(disk_path: Option<&str>) -> Result<(), WslError> {
    if let Some(path) = disk_path {
        info!("Unmounting disk: {}", path);
    } else {
        info!("Unmounting all disks");
    }

    let output = wsl_executor().unmount_disk(disk_path)?;

    if !output.success {
        let error_msg = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            "Unknown error occurred".to_string()
        };
        warn!("Unmount command failed: {}", error_msg);
        return Err(WslError::CommandFailed(error_msg));
    }

    info!("Disk unmounted successfully");
    Ok(())
}

/// List disks currently mounted in WSL via `wsl --mount`
pub fn list_mounted_disks() -> Result<Vec<MountedDisk>, WslError> {
    info!("Listing mounted disks");

    // First check if any WSL distro is running
    let distros = list_distributions()?;
    let any_running = distros.iter().any(|d| d.state == DistroState::Running);

    if !any_running {
        debug!("WSL not running, no mounted disks");
        return Ok(Vec::new());
    }

    // Get the default distro for exec (prefer default, fall back to any running)
    let default_distro = distros.iter().find(|d| d.is_default)
        .or_else(|| distros.iter().find(|d| d.state == DistroState::Running));

    let distro = match default_distro {
        Some(d) => d,
        None => return Ok(Vec::new()),
    };

    let output = wsl_executor().exec(
        &distro.name,
        distro.id.as_deref(),
        "mount | grep -E '^/dev/sd[a-z]+[0-9]* on /mnt/wsl/[^/]+\\s' 2>/dev/null || echo ''"
    )?;

    let mut mounted_disks = Vec::new();
    let internal_mounts = ["docker-desktop", "docker-desktop-data", "docker-desktop-bind", "rancher-desktop", "rancher-desktop-data"];

    for line in output.stdout.lines() {
        if line.trim().is_empty() {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 5 && parts[1] == "on" && parts[3] == "type" {
            let mount_point = parts[2].to_string();
            let filesystem = Some(parts[4].to_string());
            let disk_name = mount_point.strip_prefix("/mnt/wsl/").unwrap_or("");

            if internal_mounts.iter().any(|&m| disk_name.starts_with(m)) {
                continue;
            }

            let (path, is_vhd) = if disk_name.starts_with("PHYSICALDRIVE") {
                (format!(r"\\.\{}", disk_name), false)
            } else {
                (disk_name.to_string(), false)
            };

            mounted_disks.push(MountedDisk {
                path,
                mount_point,
                filesystem,
                is_vhd,
            });
        }
    }

    debug!("Found {} mounted disks", mounted_disks.len());
    Ok(mounted_disks)
}

/// List physical disks available for mounting
pub fn list_physical_disks() -> Result<Vec<PhysicalDisk>, WslError> {
    info!("Listing physical disks");

    let disks = resource_monitor().list_physical_disks()?;

    debug!("Found {} physical disks", disks.len());
    Ok(disks)
}

/// Update WSL
/// current_version is the version before update (for comparison)
/// Returns the update result message on success
pub fn update_wsl(pre_release: bool, current_version: Option<&str>) -> Result<String, WslError> {
    info!("Updating WSL (pre_release: {}, current_version: {:?})", pre_release, current_version);

    let output = wsl_executor().update(pre_release, current_version)?;

    if !output.success {
        warn!("WSL update command failed: {}", output.stderr);
        return Err(WslError::CommandFailed(output.stderr));
    }

    let message = output.stdout.trim().to_string();
    info!("WSL update completed successfully: {}", message);
    Ok(message)
}


