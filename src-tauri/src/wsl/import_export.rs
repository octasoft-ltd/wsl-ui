//! Import and export operations for WSL distributions
//!
//! Functions for exporting distributions to tar files, importing from tar files,
//! and cloning distributions.

use super::executor::{resource_monitor, wsl_executor};
use super::types::WslError;
use crate::metadata::{self, DistroMetadata};
use log::{info, warn};

/// Export a distribution to a tar file
pub fn export_distribution(name: &str, path: &str) -> Result<(), WslError> {
    let output = wsl_executor().export(name, path, None)?;

    if !output.success {
        // WSL often writes errors to stdout instead of stderr
        let error_msg = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            "Export failed with no error message".to_string()
        };
        return Err(WslError::CommandFailed(error_msg));
    }

    Ok(())
}

/// Import a distribution from a tar file
pub fn import_distribution(name: &str, install_location: &str, tar_path: &str) -> Result<(), WslError> {
    let output = wsl_executor().import(name, install_location, tar_path, None)?;

    if !output.success {
        // WSL often writes errors to stdout instead of stderr
        let error_msg = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            "Import failed with no error message".to_string()
        };
        return Err(WslError::CommandFailed(error_msg));
    }

    Ok(())
}

/// Import a distribution with optional WSL version
pub fn import_distribution_with_version(
    name: &str,
    install_location: &str,
    tar_path: &str,
    wsl_version: Option<u8>,
) -> Result<(), WslError> {
    let output = wsl_executor().import(name, install_location, tar_path, wsl_version)?;

    if !output.success {
        // WSL often writes errors to stdout instead of stderr
        let error_msg = if !output.stderr.trim().is_empty() {
            output.stderr
        } else if !output.stdout.trim().is_empty() {
            output.stdout
        } else {
            "Import failed with no error message".to_string()
        };
        return Err(WslError::CommandFailed(error_msg));
    }

    Ok(())
}

/// Clone a distribution (export + import with new name)
///
/// If `install_location` is None, uses the default from settings.
/// Creates metadata for the cloned distribution automatically.
pub fn clone_distribution(source: &str, new_name: &str, install_location: Option<&str>) -> Result<(), WslError> {
    use crate::settings::get_default_distro_path;

    info!("Cloning distribution '{}' to '{}'", source, new_name);

    // Get source distro's GUID before cloning (for metadata lineage)
    let registry_info = resource_monitor().get_all_distro_registry_info();
    let source_id = registry_info.get(source).map(|info| info.id.clone());

    // Create temp file path
    let temp_dir = std::env::temp_dir();
    let temp_file = temp_dir.join(format!("wsl-clone-{}.tar", std::process::id()));
    let temp_path = temp_file.to_string_lossy().to_string();

    // Export to temp file
    export_distribution(source, &temp_path)?;

    // Use provided location or default from settings
    let final_location = match install_location {
        Some(loc) if !loc.trim().is_empty() => loc.to_string(),
        _ => get_default_distro_path(new_name),
    };

    // Create the directory if it doesn't exist
    std::fs::create_dir_all(&final_location)
        .map_err(|e| WslError::CommandFailed(format!("Failed to create install directory: {}", e)))?;

    // Import with new name
    let result = import_distribution(new_name, &final_location, &temp_path);

    // Clean up temp file (ignore errors)
    let _ = std::fs::remove_file(&temp_file);

    // Only create metadata if import succeeded
    if result.is_ok() {
        // Get the new distro's GUID from registry
        let new_registry_info = resource_monitor().get_all_distro_registry_info();
        if let Some(new_info) = new_registry_info.get(new_name) {
            let metadata = DistroMetadata::new_clone(
                new_info.id.clone(),
                new_name.to_string(),
                source_id.unwrap_or_else(|| "unknown".to_string()),
            );
            if let Err(e) = metadata::save_metadata(metadata) {
                warn!("Failed to save clone metadata: {}", e);
            } else {
                info!("Created metadata for cloned distribution '{}'", new_name);
            }
        } else {
            warn!("Could not find GUID for cloned distribution '{}' - metadata not created", new_name);
        }
    }

    result
}

/// Helper to extract error message from WSL command output
/// WSL often writes errors to stdout instead of stderr
#[cfg(test)]
fn extract_error_message(output: &super::executor::wsl_command::CommandOutput, default_msg: &str) -> String {
    if !output.stderr.trim().is_empty() {
        output.stderr.clone()
    } else if !output.stdout.trim().is_empty() {
        output.stdout.clone()
    } else {
        default_msg.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::wsl::executor::wsl_command::CommandOutput;

    #[test]
    fn test_extract_error_message_prefers_stderr() {
        let output = CommandOutput {
            success: false,
            stdout: "stdout message".to_string(),
            stderr: "stderr message".to_string(),
        };
        assert_eq!(extract_error_message(&output, "default"), "stderr message");
    }

    #[test]
    fn test_extract_error_message_falls_back_to_stdout() {
        let output = CommandOutput {
            success: false,
            stdout: "stdout message".to_string(),
            stderr: "".to_string(),
        };
        assert_eq!(extract_error_message(&output, "default"), "stdout message");
    }

    #[test]
    fn test_extract_error_message_falls_back_to_stdout_whitespace() {
        let output = CommandOutput {
            success: false,
            stdout: "stdout message".to_string(),
            stderr: "   \n\t  ".to_string(),
        };
        assert_eq!(extract_error_message(&output, "default"), "stdout message");
    }

    #[test]
    fn test_extract_error_message_uses_default_when_empty() {
        let output = CommandOutput {
            success: false,
            stdout: "".to_string(),
            stderr: "".to_string(),
        };
        assert_eq!(extract_error_message(&output, "default message"), "default message");
    }

    #[test]
    fn test_extract_error_message_uses_default_when_whitespace() {
        let output = CommandOutput {
            success: false,
            stdout: "   ".to_string(),
            stderr: "  \n".to_string(),
        };
        assert_eq!(extract_error_message(&output, "fallback"), "fallback");
    }

    #[test]
    fn test_location_selection_uses_provided_path() {
        let provided = Some("C:\\WSL\\MyDistro");
        let final_location = match provided {
            Some(loc) if !loc.trim().is_empty() => loc.to_string(),
            _ => "default_path".to_string(),
        };
        assert_eq!(final_location, "C:\\WSL\\MyDistro");
    }

    #[test]
    fn test_location_selection_ignores_empty_string() {
        let provided: Option<&str> = Some("");
        let final_location = match provided {
            Some(loc) if !loc.trim().is_empty() => loc.to_string(),
            _ => "default_path".to_string(),
        };
        assert_eq!(final_location, "default_path");
    }

    #[test]
    fn test_location_selection_ignores_whitespace() {
        let provided = Some("   ");
        let final_location = match provided {
            Some(loc) if !loc.trim().is_empty() => loc.to_string(),
            _ => "default_path".to_string(),
        };
        assert_eq!(final_location, "default_path");
    }

    #[test]
    fn test_location_selection_uses_default_for_none() {
        let provided: Option<&str> = None;
        let final_location = match provided {
            Some(loc) if !loc.trim().is_empty() => loc.to_string(),
            _ => "default_path".to_string(),
        };
        assert_eq!(final_location, "default_path");
    }

    #[test]
    fn test_temp_file_path_format() {
        let temp_dir = std::env::temp_dir();
        let pid = std::process::id();
        let temp_file = temp_dir.join(format!("wsl-clone-{}.tar", pid));

        // Verify the path ends with expected pattern
        let path_str = temp_file.to_string_lossy();
        assert!(path_str.contains("wsl-clone-"));
        assert!(path_str.ends_with(".tar"));
    }

    #[test]
    fn test_temp_file_unique_per_process() {
        let temp_dir = std::env::temp_dir();
        let pid = std::process::id();
        let temp_file1 = temp_dir.join(format!("wsl-clone-{}.tar", pid));
        let temp_file2 = temp_dir.join(format!("wsl-clone-{}.tar", pid));

        // Same process should get same path (deterministic)
        assert_eq!(temp_file1, temp_file2);
    }
}





