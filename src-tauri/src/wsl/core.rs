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

/// Detect wsl.exe's "no installed distributions" message.
///
/// wsl.exe emits this message in the system language and exits with code 1,
/// so an English-only match misses it on localized Windows (GH #101).
/// This list only covers locales we have confirmed output for; the registry
/// check in `list_distributions` handles all other locales.
fn is_no_distros_output(combined_output: &str) -> bool {
    combined_output
        .to_lowercase()
        .contains("no installed distributions")
        // zh-CN: "适用于 Linux 的 Windows 子系统没有已安装的分发。"
        || combined_output.contains("没有已安装的分发")
}

/// Parse the locale-neutral output of `wsl --list --running --quiet`.
fn parse_running_distro_names(output: &str) -> Vec<String> {
    output
        .trim_start_matches('\u{feff}')
        .lines()
        .map(|line| line.trim().trim_start_matches('*').trim())
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

fn command_output_names(
    output: super::executor::wsl_command::CommandOutput,
    description: &str,
) -> Result<Vec<String>, WslError> {
    if !output.success {
        let message = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            format!("Unable to {}", description)
        };
        return Err(WslError::CommandFailed(message));
    }
    Ok(parse_running_distro_names(&output.stdout))
}

/// Return running distro names without depending on localized status words.
pub(crate) fn list_running_distribution_names() -> Result<Vec<String>, WslError> {
    command_output_names(
        wsl_executor().list_running()?,
        "determine which WSL distributions are running",
    )
}

fn list_quiet_distribution_names(include_all: bool) -> Result<Vec<String>, WslError> {
    command_output_names(
        wsl_executor().list_quiet(include_all)?,
        "determine whether a WSL distribution is transitioning",
    )
}

fn find_transitioning_names(all: &[String], registered: &[String]) -> Vec<String> {
    all.iter()
        .filter(|name| {
            !registered
                .iter()
                .any(|registered| registered.eq_ignore_ascii_case(name))
        })
        .cloned()
        .collect()
}

fn list_transitioning_distribution_names() -> Result<Vec<String>, WslError> {
    let registered = list_quiet_distribution_names(false)?;
    let all = list_quiet_distribution_names(true)?;
    Ok(find_transitioning_names(&all, &registered))
}

fn distribution_is_running(name: &str) -> Result<bool, WslError> {
    Ok(list_running_distribution_names()?
        .iter()
        .any(|running| running.eq_ignore_ascii_case(name)))
}

fn ensure_distribution_stopped(name: &str, operation: &str) -> Result<(), WslError> {
    if distribution_is_running(name)? {
        return Err(WslError::CommandFailed(format!(
            "Distribution must be stopped before {}. Please stop it first.",
            operation
        )));
    }
    if list_transitioning_distribution_names()?
        .iter()
        .any(|transitioning| transitioning.eq_ignore_ascii_case(name))
    {
        return Err(WslError::CommandFailed(format!(
            "Distribution is busy installing, uninstalling, converting, or exporting and cannot be {} yet.",
            operation
        )));
    }
    Ok(())
}

fn wait_for_stopped(name: Option<&str>, timeout: std::time::Duration) -> Result<(), WslError> {
    let started = std::time::Instant::now();
    loop {
        let running = list_running_distribution_names()?;
        let still_running = match name {
            Some(name) => running.iter().any(|item| item.eq_ignore_ascii_case(name)),
            None => !running.is_empty(),
        };
        let still_transitioning = if still_running {
            false
        } else {
            let transitioning = list_transitioning_distribution_names()?;
            match name {
                Some(name) => transitioning
                    .iter()
                    .any(|item| item.eq_ignore_ascii_case(name)),
                None => !transitioning.is_empty(),
            }
        };
        if !still_running && !still_transitioning {
            return Ok(());
        }
        if started.elapsed() >= timeout {
            let target = name
                .map(|name| format!("distribution '{}'", name))
                .unwrap_or_else(|| "all WSL distributions".to_string());
            return Err(WslError::Timeout(format!(
                "Could not confirm that {} stopped or finished transitioning",
                target
            )));
        }
        std::thread::sleep(std::time::Duration::from_secs(1));
    }
}

/// List all WSL distributions with their status
pub fn list_distributions() -> Result<Vec<Distribution>, WslError> {
    debug!("Listing WSL distributions");

    let output = wsl_executor().list_verbose()?;

    // Check for "no installed distributions" - this is a valid state, not an error
    let combined_output = format!("{}\n{}", output.stdout, output.stderr);
    if is_no_distros_output(&combined_output) {
        debug!("No WSL distributions installed");
        return Ok(Vec::new());
    }

    if !output.success {
        // The "no installed distributions" message is localized, so the phrase
        // match above can miss it on locales we don't know about. The Lxss
        // registry is locale-independent: no registered distro entries means
        // this is the valid empty state, not a failure (GH #101). The check
        // returns false when the registry is unreadable, so a transient
        // registry failure surfaces the command error instead of silently
        // clearing the inventory.
        if resource_monitor().registry_confirms_no_distros() {
            debug!("WSL list failed but registry has no distros - treating as empty state");
            return Ok(Vec::new());
        }
        warn!("WSL list command failed: {}", output.stderr);
        return Err(WslError::CommandFailed(output.stderr));
    }

    // Parse WSL output to get basic distribution info
    let mut distros: Vec<Distribution> = parse_wsl_list_output(&output.stdout)
        .into_iter()
        .map(Distribution::from)
        .collect();

    // Localized `--verbose` status words parse as Unknown. Promote only the
    // running entries using the locale-neutral `--running --quiet` output.
    if distros.iter().any(|d| d.state == DistroState::Unknown) {
        match list_running_distribution_names() {
            Ok(running) => {
                for distro in &mut distros {
                    if distro.state == DistroState::Unknown
                        && running.iter().any(|name| name.eq_ignore_ascii_case(&distro.name))
                    {
                        distro.state = DistroState::Running;
                    }
                }
            }
            Err(error) => warn!("Could not resolve localized WSL states: {}", error),
        }
    }

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

    debug!("Verifying distribution '{}' has stopped", name);
    wait_for_stopped(Some(name), std::time::Duration::from_secs(30))?;
    info!("Distribution '{}' stopped successfully", name);
    Ok(())
}

/// Force stop all WSL distributions (nuclear option)
pub fn force_stop_distribution(name: &str) -> Result<(), WslError> {
    info!("Force stopping distribution '{}' (will shutdown all WSL)", name);

    let output = wsl_executor().shutdown()?;

    if !output.success {
        warn!("Force stop command failed: {}", output.stderr);
        return Err(WslError::CommandFailed(output.stderr));
    }

    debug!("Verifying all distributions have stopped");
    wait_for_stopped(None, std::time::Duration::from_secs(15))?;
    info!("All WSL instances shut down (force stop successful)");
    Ok(())
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

    debug!("Verifying all distributions have stopped");
    wait_for_stopped(None, std::time::Duration::from_secs(15))?;
    info!("All WSL instances shut down");
    Ok(())
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
    if !distros.iter().any(|d| d.name == name) {
        return Err(WslError::DistroNotFound(name.to_string()));
    }
    ensure_distribution_stopped(name, "moving")?;

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
    if !distros.iter().any(|d| d.name == name) {
        return Err(WslError::DistroNotFound(name.to_string()));
    }
    ensure_distribution_stopped(name, "changing sparse mode")?;

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
    if !distros.iter().any(|d| d.name == name) {
        return Err(WslError::DistroNotFound(name.to_string()));
    }
    ensure_distribution_stopped(name, "resizing")?;

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
    use crate::utils::is_mock_mode;

    info!("Compacting distribution disk for '{}'", name);

    // In mock mode, return a successful mock result
    if is_mock_mode() {
        info!("Mock: Compacting distribution '{}'", name);
        // Simulate a successful compact with realistic size reduction
        return Ok(CompactResult {
            size_before: 8_000_000_000,     // ~8 GB before
            size_after: 6_500_000_000,      // ~6.5 GB after (1.5 GB saved)
            fstrim_bytes: Some(1_200_000_000),
            fstrim_message: Some("Mock: 1.2 GB trimmed".to_string()),
        });
    }

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
    shutdown_all()?;
    info!("WSL shutdown verified - all distros stopped");

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
        ensure_distribution_stopped(name, "changing version")?;
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

    let old_name = distro.name.clone();
    ensure_distribution_stopped(&old_name, "renaming")?;

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

/// Classify a `/mnt/wsl/<name>` mount entry: PHYSICALDRIVE names are physical
/// disks addressed as `\\.\PHYSICALDRIVEn`; anything else mounted there came
/// from `wsl --mount --vhd` and is a VHD file (GH #113).
fn classify_mounted_disk(disk_name: &str) -> (String, bool) {
    if disk_name.starts_with("PHYSICALDRIVE") {
        (format!(r"\\.\{}", disk_name), false)
    } else {
        (disk_name.to_string(), true)
    }
}

/// List disks currently mounted in WSL via `wsl --mount`
pub fn list_mounted_disks() -> Result<Vec<MountedDisk>, WslError> {
    info!("Listing mounted disks");

    let distros = list_distributions()?;
    let running = list_running_distribution_names()?;
    let any_running = !running.is_empty();

    if !any_running {
        debug!("WSL not running, no mounted disks");
        return Ok(Vec::new());
    }

    // Get the default distro for exec (prefer default, fall back to any running)
    let is_running = |distro: &&Distribution| {
        running
            .iter()
            .any(|name| name.eq_ignore_ascii_case(&distro.name))
    };
    let default_distro = distros
        .iter()
        .filter(is_running)
        .find(|d| d.is_default)
        .or_else(|| distros.iter().find(is_running));

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

            let (path, is_vhd) = classify_mounted_disk(disk_name);

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



#[cfg(test)]
mod tests {
    use super::{
        classify_mounted_disk, find_transitioning_names, is_no_distros_output,
        parse_running_distro_names,
    };

    #[test]
    fn test_parse_running_distro_names_is_locale_neutral() {
        let output = "\u{feff}Ubuntu\r\n開発環境\r\n  Debian  \r\n\r\n";
        assert_eq!(
            parse_running_distro_names(output),
            vec!["Ubuntu", "開発環境", "Debian"]
        );
    }

    #[test]
    fn test_find_transitioning_names_compares_all_with_registered() {
        let all = vec!["Ubuntu".to_string(), "Converting".to_string()];
        let registered = vec!["Ubuntu".to_string()];
        assert_eq!(find_transitioning_names(&all, &registered), vec!["Converting"]);
    }

    // GH #101: on localized Windows, wsl.exe emits the no-distro message in
    // the system language; treating it as an error showed a failure banner.
    #[test]
    fn test_no_distros_english() {
        let output = "Windows Subsystem for Linux has no installed distributions.\n\
                      Distributions can be installed by visiting the Microsoft Store:\n";
        assert!(is_no_distros_output(output));
    }

    #[test]
    fn test_no_distros_english_case_insensitive() {
        assert!(is_no_distros_output("...HAS NO INSTALLED DISTRIBUTIONS..."));
    }

    #[test]
    fn test_no_distros_chinese_simplified() {
        // Verbatim zh-CN output reported in GH #101
        let output = "适用于 Linux 的 Windows 子系统没有已安装的分发。\n\
                      可通过安装包含以下说明的分发来解决此问题\n";
        assert!(is_no_distros_output(output));
    }

    #[test]
    fn test_normal_list_output_is_not_no_distros() {
        let output = "  NAME      STATE           VERSION\n\
                      * Ubuntu    Running         2\n";
        assert!(!is_no_distros_output(output));
    }

    #[test]
    fn test_unrelated_error_is_not_no_distros() {
        assert!(!is_no_distros_output(
            "The Windows Subsystem for Linux instance has terminated."
        ));
    }

    // GH #113: VHD mounts were reported as physical disks (is_vhd always false).
    #[test]
    fn test_classify_physical_drive() {
        let (path, is_vhd) = classify_mounted_disk("PHYSICALDRIVE2");
        assert_eq!(path, r"\\.\PHYSICALDRIVE2");
        assert!(!is_vhd);
    }

    #[test]
    fn test_classify_vhd_mount() {
        let (path, is_vhd) = classify_mounted_disk("mydata.vhdx");
        assert_eq!(path, "mydata.vhdx");
        assert!(is_vhd);
    }
}
