//! Import and export operations for WSL distributions
//!
//! Functions for exporting distributions to tar files, importing from tar files,
//! and cloning distributions.

use super::executor::{resource_monitor, wsl_executor};
use super::types::WslError;
use crate::metadata::{self, DistroMetadata};
use log::{info, warn};

/// Create the install location directory (and any missing parents) before
/// invoking `wsl --import`. Without this, importing into a fresh path under
/// e.g. `%LOCALAPPDATA%\wsl\...` fails with `Wsl/ERROR_PATH_NOT_FOUND`
/// because WSL does not create parent directories itself.
fn ensure_install_location_exists(install_location: &str) -> Result<(), WslError> {
    if crate::utils::is_mock_mode() {
        return Ok(());
    }
    create_install_dir(install_location)
}

/// Mock-agnostic directory creator. Extracted so it can be unit-tested without
/// touching the `WSL_MOCK` env var (which is process-global and would race with
/// other parallel tests).
fn create_install_dir(install_location: &str) -> Result<(), WslError> {
    std::fs::create_dir_all(install_location).map_err(|e| {
        WslError::CommandFailed(format!(
            "Failed to create install directory '{}': {}",
            install_location, e
        ))
    })
}

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
    ensure_install_location_exists(install_location)?;
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
    ensure_install_location_exists(install_location)?;
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
    use crate::utils::is_mock_mode;

    info!("Cloning distribution '{}' to '{}'", source, new_name);

    // In mock mode, just call the mock import/export without filesystem operations
    if is_mock_mode() {
        // Mock export (just validates source exists)
        let export_output = wsl_executor().export(source, "/tmp/mock-clone.tar", None)?;
        if !export_output.success {
            return Err(WslError::CommandFailed(export_output.stderr));
        }

        // Mock import (adds to mock state)
        let import_output = wsl_executor().import(new_name, "/tmp/mock-location", "/tmp/mock-clone.tar", Some(2))?;
        if !import_output.success {
            return Err(WslError::CommandFailed(import_output.stderr));
        }

        info!("Mock: Cloned distribution '{}' to '{}'", source, new_name);
        return Ok(());
    }

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

    // Import with new name (install dir is created inside import_distribution)
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

    /// Regression test for OCT-799 / GitHub #86: importing into a nested
    /// path whose parent directory does not yet exist must succeed. Before
    /// the fix, `wsl --import` failed with `Wsl/ERROR_PATH_NOT_FOUND`
    /// because WSL does not create intermediate directories.
    #[test]
    fn test_create_install_dir_creates_missing_parents() {
        use std::time::{SystemTime, UNIX_EPOCH};
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let root = std::env::temp_dir().join(format!("oct799-{}-{}", std::process::id(), unique));
        let nested = root.join("wsl").join("arch-linux-current");

        assert!(!root.exists(), "precondition: root must not exist");
        assert!(!nested.parent().unwrap().exists(), "precondition: parent must not exist");

        let result = create_install_dir(nested.to_str().unwrap());
        assert!(result.is_ok(), "create_install_dir returned error: {:?}", result);
        assert!(nested.exists(), "nested install path should exist after call");

        let _ = std::fs::remove_dir_all(&root);
    }

    /// Calling on an existing path is a no-op (idempotent).
    #[test]
    fn test_create_install_dir_is_idempotent() {
        use std::time::{SystemTime, UNIX_EPOCH};
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let dir = std::env::temp_dir().join(format!("oct799-idem-{}-{}", std::process::id(), unique));
        std::fs::create_dir_all(&dir).unwrap();

        let result = create_install_dir(dir.to_str().unwrap());
        assert!(result.is_ok());
        assert!(dir.exists());

        let _ = std::fs::remove_dir_all(&dir);
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





