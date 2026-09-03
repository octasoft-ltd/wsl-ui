//! Distribution installation operations
//!
//! Functions for installing WSL distributions from various sources:
//! WSL's online catalog, direct download, and container images.

use crate::distro_catalog;
use crate::metadata::{self, DistroMetadata, InstallSource};
use crate::temp_file_guard::TempFileGuard;
use log::{info, warn};

use super::executor::terminal::ContainerRuntime;
use super::executor::wsl_command::CommandOutput;
use super::executor::{resource_monitor, terminal_executor, wsl_executor};
use super::import_export::import_distribution_with_version;
use super::types::WslError;

/// Process-wide counter for temp install artifact names.
static TEMP_ARTIFACT_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// Unique tag for temp install artifacts: `<pid>-<seq>`.
///
/// The PID alone is shared by every install running in this app instance, so
/// two overlapping installs would use (and delete) the same temp path; the
/// sequence number makes each install's artifacts unique within the process.
pub(crate) fn unique_temp_tag() -> String {
    format!(
        "{}-{}",
        std::process::id(),
        TEMP_ARTIFACT_SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
    )
}

/// Get the distributions exposed by WSL's online catalog (for quick install)
pub fn list_online_distributions() -> Result<Vec<String>, WslError> {
    let output = wsl_executor().list_online()?;

    let mut distros = Vec::new();
    let mut found_header = false;

    for line in output.stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if line.contains("NAME") || line.contains("----") {
            found_header = true;
            continue;
        }

        if found_header {
            if let Some(name) = line.split_whitespace().next() {
                if !name.contains("following") && !name.contains("install") {
                    distros.push(name.to_string());
                }
            }
        }
    }

    Ok(distros)
}

/// Quick install through WSL's online catalog (uses wsl --install with a fixed name)
/// Uses --no-launch to avoid blocking, then spawns a background launch to trigger registration.
/// Creates metadata for the installed distribution automatically.
fn summarize_install_output(value: &str) -> String {
    const MAX_LINES: usize = 8;

    let mut lines: Vec<&str> = value
        .split(['\r', '\n'])
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect();
    lines.dedup();

    // Native WSL writes many carriage-return progress updates. Prefer its
    // diagnostic lines so the final error remains readable; if it supplied
    // only progress output, retain the last few updates as useful context.
    let diagnostics: Vec<&str> = lines
        .iter()
        .copied()
        .filter(|line| !line.to_ascii_lowercase().starts_with("downloading:"))
        .collect();
    let selected = if diagnostics.is_empty() {
        &lines
    } else {
        &diagnostics
    };
    let start = selected.len().saturating_sub(MAX_LINES);
    selected[start..].join("\n")
}

fn format_install_failure(output: &CommandOutput) -> String {
    let stdout = summarize_install_output(&output.stdout);
    let stderr = summarize_install_output(&output.stderr);
    let details = [stdout, stderr]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("\n");

    let mut message = if details.is_empty() {
        "Install failed: WSL exited without an error message.".to_string()
    } else {
        format!("Install failed:\n{}", details)
    };

    if message.to_ascii_lowercase().contains("override manifest") {
        message.push_str(
            "\nThe community manifest may contain an outdated URL or checksum. \
             Review or reset it under Settings > Remote Sources before retrying.",
        );
    }

    message
}

pub fn quick_install_distribution(distro_id: &str) -> Result<(), WslError> {
    info!("Quick installing distribution '{}'", distro_id);

    // Step 1: Install with --no-launch (installs AppX package without blocking)
    let output = wsl_executor().install(distro_id, None, None, true)?;

    if !output.success {
        let message = format_install_failure(&output);
        warn!("Quick install of '{}' failed: {}", distro_id, message);
        return Err(WslError::CommandFailed(message));
    }

    // Step 2: Get the distribution GUID from registry (available after install)
    // This allows us to open the terminal using --distribution-id for reliable identification
    let registry_info = resource_monitor().get_all_distro_registry_info();
    let distro_guid = registry_info.get(distro_id).map(|info| info.id.clone());

    // Step 3: Open the distro in user's preferred terminal (triggers WSL registration)
    // This opens a visible terminal for first-time setup without blocking
    let settings = crate::settings::get_settings();
    let _ = terminal_executor().open_terminal(
        distro_id,
        distro_guid.as_deref(),
        &settings.terminal_command,
    );

    // Step 4: Poll for the distro to appear in wsl --list (registration happens on launch)
    verify_distro_installed(distro_id, 30, 2)?;

    // Step 5: Create metadata for the installed distribution
    // Reuse the GUID if we got it earlier, otherwise query again
    let final_guid = distro_guid.or_else(|| {
        resource_monitor()
            .get_all_distro_registry_info()
            .get(distro_id)
            .map(|info| info.id.clone())
    });

    if let Some(guid) = final_guid {
        let mut metadata = DistroMetadata::new(guid, distro_id.to_string(), InstallSource::Store);
        metadata.catalog_entry = Some(distro_id.to_string());
        if let Err(e) = metadata::save_metadata(metadata) {
            warn!("Failed to save install metadata: {}", e);
        } else {
            info!(
                "Created metadata for installed distribution '{}'",
                distro_id
            );
        }
    } else {
        warn!(
            "Could not find GUID for installed distribution '{}' - metadata not created",
            distro_id
        );
    }

    Ok(())
}

/// Verify a distribution is installed by polling wsl --list
/// Returns Ok if found within timeout, Err if not found
fn verify_distro_installed(
    distro_id: &str,
    max_attempts: u32,
    delay_secs: u32,
) -> Result<(), WslError> {
    // Normalize the distro ID: lowercase, keep only alphanumeric and hyphen
    let distro_normalized: String = distro_id
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect();

    for attempt in 1..=max_attempts {
        // Give WSL time to register the distro
        if attempt > 1 {
            std::thread::sleep(std::time::Duration::from_secs(delay_secs as u64));
        }

        // Check if distro appears in list
        if let Ok(output) = wsl_executor().list_verbose() {
            for line in output.stdout.lines() {
                // WSL output has Unicode spacing - strip to alphanumeric for comparison
                let line_normalized: String = line
                    .to_lowercase()
                    .chars()
                    .filter(|c| c.is_alphanumeric() || *c == '-')
                    .collect();

                // Check if this line contains our distro name
                if line_normalized.contains(&distro_normalized) {
                    return Ok(());
                }
            }
        }
    }

    Err(WslError::CommandFailed(format!(
        "Installation initiated but '{}' did not appear in WSL list after {} seconds. \
        WSL may still be finishing the installation - check `wsl --list --verbose` or try again later.",
        distro_id, max_attempts * delay_secs
    )))
}

/// Get list of distros available for custom install (direct download)
pub fn list_downloadable_distributions() -> Result<Vec<String>, WslError> {
    Ok(distro_catalog::list_enabled_download_distros())
}

/// Create a new distribution from a Docker/Podman image
///
/// `runtime_hint` can be "docker", "podman", or None to auto-detect
/// Creates metadata for the installed distribution automatically.
pub fn create_from_image(
    image: &str,
    distro_name: &str,
    install_location: Option<&str>,
    wsl_version: Option<u8>,
    runtime_hint: Option<&str>,
) -> Result<(), WslError> {
    info!(
        "Creating distribution '{}' from container image '{}'",
        distro_name, image
    );

    let executor = terminal_executor();

    // Determine container runtime - use hint if provided, otherwise auto-detect
    let runtime = if let Some(hint) = runtime_hint {
        match hint {
            "docker" => "docker",
            "podman" => "podman",
            other => other, // Allow custom runtime commands
        }
    } else {
        // Auto-detect (prefer podman)
        match executor.detect_container_runtime() {
            ContainerRuntime::Podman => "podman",
            ContainerRuntime::Docker => "docker",
            ContainerRuntime::None => {
                return Err(WslError::CommandFailed(
                    "Neither Podman nor Docker found. Please install Podman or Docker.".to_string(),
                ));
            }
        }
    };

    // Step 1: Determine install location and create it up front, before the
    // expensive pull/export work, so a bad location fails fast without leaks
    let location = match install_location {
        Some(loc) if !loc.is_empty() => loc.to_string(),
        _ => crate::settings::get_default_distro_path(distro_name),
    };

    std::fs::create_dir_all(&location).map_err(|e| {
        WslError::CommandFailed(format!("Failed to create install directory: {}", e))
    })?;

    // Create temp file for tar export, cleaned up on all paths (including panic)
    let temp_dir = std::env::temp_dir();
    let tar_path = temp_dir.join(format!("wsl-image-{}.tar", unique_temp_tag()));
    let tar_path_str = tar_path.to_string_lossy().to_string();
    let _tar_guard = TempFileGuard::new(&tar_path);

    // Step 2: Pull the image
    executor.container_pull(runtime, image)?;

    // Step 3: Create a container from the image
    let container_id = executor.container_create(runtime, image)?;

    // Step 4: Export the container to a tar file
    if let Err(e) = executor.container_export(runtime, &container_id, &tar_path_str) {
        let _ = executor.container_rm(runtime, &container_id);
        return Err(e);
    }

    // Step 5: Import with optional WSL version
    let import_result =
        import_distribution_with_version(distro_name, &location, &tar_path_str, wsl_version);

    // Step 6: Cleanup (tar file is removed by _tar_guard on drop)
    let _ = executor.container_rm(runtime, &container_id);

    // Create metadata if import succeeded
    if import_result.is_ok() {
        let registry_info = resource_monitor().get_all_distro_registry_info();
        if let Some(info) = registry_info.get(distro_name) {
            let mut distro_metadata = DistroMetadata::new(
                info.id.clone(),
                distro_name.to_string(),
                InstallSource::Container,
            );
            distro_metadata.image_reference = Some(image.to_string());
            if let Err(e) = metadata::save_metadata(distro_metadata) {
                warn!("Failed to save install metadata: {}", e);
            } else {
                info!(
                    "Created metadata for installed distribution '{}'",
                    distro_name
                );
            }
        } else {
            warn!(
                "Could not find GUID for installed distribution '{}' - metadata not created",
                distro_name
            );
        }
    }

    import_result
}

/// Create a new distribution from an OCI container image (native - no Docker/Podman required)
///
/// This downloads the image layers directly from the container registry and creates
/// a rootfs tarball for WSL import, without requiring any container runtime.
/// Creates metadata for the installed distribution automatically.
pub fn create_from_oci_image(
    image: &str,
    distro_name: &str,
    install_location: Option<&str>,
    wsl_version: Option<u8>,
    progress: Option<crate::oci::ProgressCallback>,
) -> Result<(), WslError> {
    info!(
        "Creating distribution '{}' from OCI image '{}'",
        distro_name, image
    );

    // Determine install location and create it up front, before the expensive
    // image download, so a bad location fails fast without leaking the rootfs
    let location = match install_location {
        Some(loc) if !loc.is_empty() => loc.to_string(),
        _ => crate::settings::get_default_distro_path(distro_name),
    };

    std::fs::create_dir_all(&location).map_err(|e| {
        WslError::CommandFailed(format!("Failed to create install directory: {}", e))
    })?;

    // Create temp directory for OCI operations, cleaned up on all paths (including panic)
    let temp_dir = std::env::temp_dir();
    let oci_work_dir = temp_dir.join(format!("wsl-oci-{}", unique_temp_tag()));
    std::fs::create_dir_all(&oci_work_dir)
        .map_err(|e| WslError::CommandFailed(format!("Failed to create temp directory: {}", e)))?;
    let _work_dir_guard = TempFileGuard::new(&oci_work_dir);

    // Pull the image and create rootfs tarball
    let tar_path = crate::oci::pull_and_create_rootfs(image, &oci_work_dir, progress)
        .map_err(|e| WslError::CommandFailed(format!("Failed to pull OCI image: {}", e)))?;

    let tar_path_str = tar_path.to_string_lossy().to_string();

    // Import with optional WSL version (temp directory is removed by _work_dir_guard on drop)
    let import_result =
        import_distribution_with_version(distro_name, &location, &tar_path_str, wsl_version);

    // Create metadata if import succeeded
    if import_result.is_ok() {
        let registry_info = resource_monitor().get_all_distro_registry_info();
        if let Some(info) = registry_info.get(distro_name) {
            let mut distro_metadata = DistroMetadata::new(
                info.id.clone(),
                distro_name.to_string(),
                InstallSource::Container,
            );
            distro_metadata.image_reference = Some(image.to_string());
            if let Err(e) = metadata::save_metadata(distro_metadata) {
                warn!("Failed to save install metadata: {}", e);
            } else {
                info!(
                    "Created metadata for installed distribution '{}'",
                    distro_name
                );
            }
        } else {
            warn!(
                "Could not find GUID for installed distribution '{}' - metadata not created",
                distro_name
            );
        }
    }

    import_result
}

/// Parse WSL online distributions output (extracted for testability)
#[cfg(test)]
fn parse_online_distros_output(output: &str) -> Vec<String> {
    let mut distros = Vec::new();
    let mut found_header = false;

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        if line.contains("NAME") || line.contains("----") {
            found_header = true;
            continue;
        }

        if found_header {
            if let Some(name) = line.split_whitespace().next() {
                if !name.contains("following") && !name.contains("install") {
                    distros.push(name.to_string());
                }
            }
        }
    }

    distros
}

/// Normalize a distro name for comparison (extracted for testability)
#[cfg(test)]
fn normalize_distro_name(name: &str) -> String {
    name.to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect()
}

/// Check if a normalized line contains a normalized distro name
#[cfg(test)]
fn line_contains_distro(line: &str, distro_normalized: &str) -> bool {
    let line_normalized: String = line
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect();
    line_normalized.contains(distro_normalized)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_install_failure_includes_both_streams_and_override_hint() {
        let output = crate::wsl::executor::wsl_command::CommandOutput {
            stdout: "The downloaded file does not match the expected checksum.\n".to_string(),
            stderr: "The distribution is provided by an override manifest.\n".to_string(),
            success: false,
        };

        let message = format_install_failure(&output);

        assert!(message.contains("does not match the expected checksum"));
        assert!(message.contains("provided by an override manifest"));
        assert!(message.contains("community manifest may contain an outdated URL or checksum"));
    }

    #[test]
    fn test_install_failure_discards_console_progress_noise() {
        let output = crate::wsl::executor::wsl_command::CommandOutput {
            stdout: "Downloading: 10%\rDownloading: 50%\rChecksum mismatch\r".to_string(),
            stderr: String::new(),
            success: false,
        };

        let message = format_install_failure(&output);

        assert!(!message.contains("Downloading: 10%"));
        assert!(message.contains("Checksum mismatch"));
    }

    // Tests for parse_online_distros_output
    #[test]
    fn test_parse_online_distros_basic() {
        let output = r#"
NAME                                   FRIENDLY NAME
Ubuntu                                 Ubuntu
Debian                                 Debian GNU/Linux
kali-linux                            Kali Linux Rolling
"#;
        let distros = parse_online_distros_output(output);
        assert_eq!(distros, vec!["Ubuntu", "Debian", "kali-linux"]);
    }

    #[test]
    fn test_parse_online_distros_with_dashes() {
        let output = r#"
NAME                                   FRIENDLY NAME
----                                   -------------
Ubuntu-22.04                           Ubuntu 22.04 LTS
openSUSE-Leap-15.5                     openSUSE Leap 15.5
"#;
        let distros = parse_online_distros_output(output);
        assert_eq!(distros, vec!["Ubuntu-22.04", "openSUSE-Leap-15.5"]);
    }

    #[test]
    fn test_parse_online_distros_ignores_preamble() {
        let output = r#"
The following is a list of valid distributions that can be installed.
Install using 'wsl --install -d <Distro>'.

NAME                                   FRIENDLY NAME
Ubuntu                                 Ubuntu
"#;
        let distros = parse_online_distros_output(output);
        assert_eq!(distros, vec!["Ubuntu"]);
    }

    #[test]
    fn test_parse_online_distros_empty_output() {
        let output = "";
        let distros = parse_online_distros_output(output);
        assert!(distros.is_empty());
    }

    #[test]
    fn test_parse_online_distros_no_header() {
        let output = "Ubuntu\nDebian\n";
        let distros = parse_online_distros_output(output);
        // Without header, nothing should be parsed
        assert!(distros.is_empty());
    }

    #[test]
    fn test_parse_online_distros_whitespace_lines() {
        let output = r#"
NAME                                   FRIENDLY NAME

Ubuntu                                 Ubuntu

Debian                                 Debian

"#;
        let distros = parse_online_distros_output(output);
        assert_eq!(distros, vec!["Ubuntu", "Debian"]);
    }

    // Tests for normalize_distro_name
    #[test]
    fn test_normalize_distro_name_lowercase() {
        assert_eq!(normalize_distro_name("Ubuntu"), "ubuntu");
        assert_eq!(normalize_distro_name("DEBIAN"), "debian");
    }

    #[test]
    fn test_normalize_distro_name_preserves_hyphens() {
        assert_eq!(normalize_distro_name("Ubuntu-22.04"), "ubuntu-2204");
        assert_eq!(normalize_distro_name("kali-linux"), "kali-linux");
    }

    #[test]
    fn test_normalize_distro_name_strips_special_chars() {
        assert_eq!(normalize_distro_name("Open SUSE (15.5)"), "opensuse155");
        assert_eq!(normalize_distro_name("Arch_Linux"), "archlinux");
    }

    #[test]
    fn test_normalize_distro_name_unicode() {
        // WSL output sometimes has Unicode spacing
        assert_eq!(normalize_distro_name("Ubuntu\u{00A0}22.04"), "ubuntu2204");
    }

    #[test]
    fn test_normalize_distro_name_empty() {
        assert_eq!(normalize_distro_name(""), "");
    }

    // Tests for line_contains_distro
    #[test]
    fn test_line_contains_distro_exact_match() {
        assert!(line_contains_distro("Ubuntu", "ubuntu"));
        assert!(line_contains_distro("  Ubuntu  ", "ubuntu"));
    }

    #[test]
    fn test_line_contains_distro_with_extras() {
        assert!(line_contains_distro("* Ubuntu (Default)", "ubuntu"));
        assert!(line_contains_distro("  Ubuntu    Running    2", "ubuntu"));
    }

    #[test]
    fn test_line_contains_distro_case_insensitive() {
        assert!(line_contains_distro("UBUNTU", "ubuntu"));
        assert!(line_contains_distro(
            "ubuntu",
            "UBUNTU".to_lowercase().as_str()
        ));
    }

    #[test]
    fn test_line_contains_distro_unicode_wsl_output() {
        // WSL output often contains Unicode non-breaking spaces
        let wsl_line = "  Ubuntu\u{00A0}\u{00A0}Running\u{00A0}\u{00A0}2";
        assert!(line_contains_distro(wsl_line, "ubuntu"));
    }

    #[test]
    fn test_line_contains_distro_no_match() {
        assert!(!line_contains_distro("Debian", "ubuntu"));
        assert!(!line_contains_distro("", "ubuntu"));
    }

    #[test]
    fn test_line_contains_distro_partial_match() {
        // "Ubuntu-22.04" normalized is "ubuntu-2204", should match "ubuntu"
        assert!(line_contains_distro("Ubuntu-22.04", "ubuntu"));
        // But "Ubuntu" should not match if looking for "ubuntu-22"
        assert!(!line_contains_distro("Ubuntu", "ubuntu-22"));
    }

    // Tests for runtime hint handling
    #[test]
    fn test_runtime_hint_docker() {
        let hint = Some("docker");
        let runtime = match hint {
            Some("docker") => "docker",
            Some("podman") => "podman",
            Some(other) => other,
            None => "auto",
        };
        assert_eq!(runtime, "docker");
    }

    #[test]
    fn test_runtime_hint_podman() {
        let hint = Some("podman");
        let runtime = match hint {
            Some("docker") => "docker",
            Some("podman") => "podman",
            Some(other) => other,
            None => "auto",
        };
        assert_eq!(runtime, "podman");
    }

    #[test]
    fn test_runtime_hint_custom() {
        let hint = Some("nerdctl");
        let runtime = match hint {
            Some("docker") => "docker",
            Some("podman") => "podman",
            Some(other) => other,
            None => "auto",
        };
        assert_eq!(runtime, "nerdctl");
    }

    #[test]
    fn test_runtime_hint_none() {
        let hint: Option<&str> = None;
        let runtime = match hint {
            Some("docker") => "docker",
            Some("podman") => "podman",
            Some(other) => other,
            None => "auto",
        };
        assert_eq!(runtime, "auto");
    }

    // Tests for location fallback
    #[test]
    fn test_install_location_uses_provided() {
        let install_location = Some("C:\\WSL\\MyDistro");
        let location = match install_location {
            Some(loc) if !loc.is_empty() => loc.to_string(),
            _ => "default".to_string(),
        };
        assert_eq!(location, "C:\\WSL\\MyDistro");
    }

    #[test]
    fn test_install_location_empty_uses_default() {
        let install_location = Some("");
        let location = match install_location {
            Some(loc) if !loc.is_empty() => loc.to_string(),
            _ => "default".to_string(),
        };
        assert_eq!(location, "default");
    }

    #[test]
    fn test_install_location_none_uses_default() {
        let install_location: Option<&str> = None;
        let location = match install_location {
            Some(loc) if !loc.is_empty() => loc.to_string(),
            _ => "default".to_string(),
        };
        assert_eq!(location, "default");
    }

    // Tests for temp file paths
    #[test]
    fn test_container_temp_path_format() {
        let temp_dir = std::env::temp_dir();
        let tar_path = temp_dir.join(format!("wsl-image-{}.tar", super::unique_temp_tag()));

        let path_str = tar_path.to_string_lossy();
        assert!(path_str.contains("wsl-image-"));
        assert!(path_str.ends_with(".tar"));
    }

    #[test]
    fn test_oci_work_dir_format() {
        let temp_dir = std::env::temp_dir();
        let oci_work_dir = temp_dir.join(format!("wsl-oci-{}", super::unique_temp_tag()));

        let path_str = oci_work_dir.to_string_lossy();
        assert!(path_str.contains("wsl-oci-"));
    }

    // Concurrent installs share the same PID, so temp artifact names must
    // differ per install or overlapping installs overwrite/delete each
    // other's tar/work dir (Greptile review on GH #103 fix).
    #[test]
    fn test_unique_temp_tag_differs_per_call() {
        let a = super::unique_temp_tag();
        let b = super::unique_temp_tag();
        assert_ne!(a, b);
        let pid_prefix = format!("{}-", std::process::id());
        assert!(a.starts_with(&pid_prefix));
        assert!(b.starts_with(&pid_prefix));
    }
}
