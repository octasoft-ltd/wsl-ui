use crate::actions::{self, ActionResult, CustomAction};
use crate::distro_catalog::{self, ContainerImage, DistroCatalog, DownloadDistro, MsStoreDistroInfo};
use crate::download;
use crate::error::AppError;
use crate::metadata::{self, DistroMetadata};
use crate::settings::{self, AppSettings, WslConf, WslConfig};
use crate::temp_file_guard::TempFileGuard;
use crate::utils::{self, is_mock_mode};
use crate::validation::{
    validate_action_id, validate_distro_name, validate_file_path, validate_url,
    validate_wsl_version,
};
use crate::wsl::resources::parse_memory_string;
use crate::wsl::{reset_mock_state, set_mock_error, clear_mock_errors, set_stubborn_shutdown, was_force_shutdown_used, MockErrorType, CompactResult, Distribution, DistroResourceUsage, VhdSizeInfo, WslResourceUsage, WslService, WslVersionInfo, WslPreflightStatus, MountedDisk, MountDiskOptions, PhysicalDisk, InstalledTerminal};
use crate::wsl::executor::terminal_executor;
use crate::{build_tray_menu, TrayState};
use tauri::{AppHandle, Emitter, Manager};

/// Combined resource stats response
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceStats {
    pub global: WslResourceUsage,
    pub per_distro: Vec<DistroResourceUsage>,
}

#[tauri::command]
pub async fn list_distributions() -> Result<Vec<Distribution>, String> {
    tokio::task::spawn_blocking(|| {
        WslService::list_distributions()
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub fn refresh_tray_menu(app: AppHandle) -> Result<(), String> {
    let tray_state: tauri::State<TrayState> = app.state();
    let tray_guard = tray_state
        .tray
        .lock()
        .map_err(|e| AppError::Other(format!("Failed to lock tray: {}", e)))?;
    if let Some(tray) = tray_guard.as_ref() {
        // Query WSL for actual distro list when refreshing (not during startup)
        let menu = build_tray_menu(&app, false)
            .map_err(|e| AppError::Other(format!("Failed to build tray menu: {}", e)))?;
        tray.set_menu(Some(menu))
            .map_err(|e| AppError::Other(format!("Failed to set tray menu: {}", e)))?;
    }
    Ok(())
}

/// Quit the application
#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

/// Hide the main window (minimize to tray)
#[tauri::command]
pub fn hide_window(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        window.hide().map_err(|e| format!("Failed to hide window: {}", e))
    } else {
        Err("Main window not found".to_string())
    }
}

#[tauri::command]
pub fn get_settings() -> AppSettings {
    settings::get_settings()
}

#[tauri::command]
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    settings::save_settings(settings)
}

#[tauri::command]
pub async fn start_distribution(name: String, id: Option<String>) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::start_distribution(&name, id.as_deref())
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn stop_distribution(name: String) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::stop_distribution(&name)
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn force_stop_distribution(name: String) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::force_stop_distribution(&name)
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn delete_distribution(name: String) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::delete_distribution(&name)
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn shutdown_all() -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        WslService::shutdown_all()
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn force_kill_wsl() -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        WslService::force_kill_wsl()
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn set_default_distribution(name: String) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::set_default_distribution(&name)
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn open_terminal(name: String, id: Option<String>) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    let settings = settings::get_settings();
    tokio::task::spawn_blocking(move || {
        WslService::open_terminal(&name, id.as_deref(), &settings.terminal_command)
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn open_system_terminal() -> Result<(), String> {
    let settings = settings::get_settings();
    tokio::task::spawn_blocking(move || {
        WslService::open_system_terminal(&settings.terminal_command)
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn run_action_in_terminal(action_id: String, distro: String, id: Option<String>) -> Result<(), String> {
    validate_distro_name(&distro).map_err(|e| e.to_string())?;
    let settings = settings::get_settings();
    tokio::task::spawn_blocking(move || {
        actions::run_action_in_terminal(&action_id, &distro, id.as_deref(), &settings.terminal_command)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn open_file_explorer(name: String) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::open_file_explorer(&name)
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Open a Windows folder path in Explorer
#[tauri::command]
pub async fn open_folder(path: String) -> Result<(), String> {
    tokio::task::spawn_blocking(move || {
        let paths = settings::get_executable_paths();
        std::process::Command::new(&paths.explorer)
            .arg(&path)
            .spawn()
            .map_err(|e| format!("Failed to open folder: {}", e))?;
        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn restart_distribution(name: String, id: Option<String>) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::restart_distribution(&name, id.as_deref())
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| AppError::Other(format!("Task failed: {}", e)))?
}

#[tauri::command]
pub async fn export_distribution(name: String, path: String) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    validate_file_path(&path).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::export_distribution(&name, &path)
            .map_err(AppError::from)
            .map_err(String::from)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn import_distribution(
    name: String,
    install_location: String,
    tar_path: String,
) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    validate_file_path(&install_location).map_err(|e| e.to_string())?;
    validate_file_path(&tar_path).map_err(|e| e.to_string())?;

    let tar_path_clone = tar_path.clone();
    let name_clone = name.clone();

    tokio::task::spawn_blocking(move || {
        let result = WslService::import_distribution(&name, &install_location, &tar_path);

        // Create metadata if import succeeded
        if result.is_ok() {
            use crate::wsl::executor::resource_monitor;

            let registry_info = resource_monitor().get_all_distro_registry_info();
            if let Some(info) = registry_info.get(&name_clone) {
                let distro_metadata = metadata::DistroMetadata::new_import(
                    info.id.clone(),
                    name_clone.clone(),
                    Some(tar_path_clone),
                );
                if let Err(e) = metadata::save_metadata(distro_metadata) {
                    log::warn!("Failed to save import metadata: {}", e);
                } else {
                    log::info!("Created metadata for imported distribution '{}'", name_clone);
                }
            } else {
                log::warn!("Could not find GUID for imported distribution '{}' - metadata not created", name_clone);
            }
        }

        result.map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn clone_distribution(source: String, new_name: String, install_location: Option<String>) -> Result<(), String> {
    validate_distro_name(&source).map_err(|e| e.to_string())?;
    validate_distro_name(&new_name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::clone_distribution(&source, &new_name, install_location.as_deref()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Result of install path validation
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallPathValidation {
    /// Whether the path is valid for use
    pub is_valid: bool,
    /// Error message if not valid
    pub error: Option<String>,
    /// Name of existing distro using this path (if any)
    pub existing_distro: Option<String>,
}

/// Validate an install path to check if it's already in use by another distribution
#[tauri::command]
pub async fn validate_install_path(path: String, new_name: String) -> Result<InstallPathValidation, String> {
    tokio::task::spawn_blocking(move || {
        use crate::wsl::executor::resource_monitor;
        use crate::settings::get_default_distro_path;

        // Determine the actual path (if empty, use default from settings)
        let actual_path = if path.trim().is_empty() {
            get_default_distro_path(&new_name)
        } else {
            path.clone()
        };

        // Normalize path for comparison (lowercase, consistent slashes)
        let normalized_path = actual_path.to_lowercase().replace('/', r"\");

        // Get all registered distro paths
        let registry_info = resource_monitor().get_all_distro_registry_info();

        // Check if any existing distro uses this path
        for (distro_name, info) in registry_info.iter() {
            if let Some(ref base_path) = info.base_path {
                let normalized_base = base_path.to_lowercase().replace('/', r"\");
                if normalized_base == normalized_path {
                    return Ok(InstallPathValidation {
                        is_valid: false,
                        error: Some(format!(
                            "This location is already used by distribution '{}'",
                            distro_name
                        )),
                        existing_distro: Some(distro_name.clone()),
                    });
                }
            }
        }

        // Check if path exists and has files (vhdx specifically)
        let path_obj = std::path::Path::new(&actual_path);
        if path_obj.exists() {
            let vhdx_path = path_obj.join("ext4.vhdx");
            if vhdx_path.exists() {
                return Ok(InstallPathValidation {
                    is_valid: false,
                    error: Some(
                        "This location contains a WSL disk image (ext4.vhdx) from a previous installation. \
                        Please choose a different location or delete the existing files first.".to_string()
                    ),
                    existing_distro: None,
                });
            }
        }

        Ok(InstallPathValidation {
            is_valid: true,
            error: None,
            existing_distro: None,
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_distribution_disk_size(name: String) -> Result<u64, String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::get_distribution_disk_size(&name).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_distribution_vhd_size(name: String) -> Result<VhdSizeInfo, String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::get_distribution_vhd_size(&name).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_distribution_os_info(name: String, id: Option<String>) -> Result<String, String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::get_distribution_os_info(&name, id.as_deref()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_distribution_location(name: String) -> Result<Option<String>, String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::get_distribution_location(&name).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Get the default install path for a new distribution (expanded)
#[tauri::command]
pub async fn get_default_distro_path(name: String) -> Result<String, String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    Ok(crate::settings::get_default_distro_path(&name))
}

#[tauri::command]
pub async fn get_resource_stats() -> Result<ResourceStats, String> {
    use crate::wsl::resources::get_system_total_memory;

    tokio::task::spawn_blocking(move || {
        // Get memory limit from .wslconfig, fallback to system total memory
        let wsl_config = settings::read_wsl_config().unwrap_or_default();
        let memory_limit = wsl_config
            .memory
            .as_ref()
            .and_then(|m| parse_memory_string(m))
            .or_else(get_system_total_memory);

        let (global, per_distro) =
            WslService::get_resource_usage(memory_limit).map_err(|e| e.to_string())?;

        Ok(ResourceStats { global, per_distro })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_wsl_health() -> Result<crate::wsl::resources::WslHealth, String> {
    tokio::task::spawn_blocking(move || {
        Ok(crate::wsl::resources::get_wsl_health())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn open_ide(name: String) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    let settings = settings::get_settings();
    tokio::task::spawn_blocking(move || {
        WslService::open_ide(&name, &settings.ide_command).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Response for parse_image_reference command
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageReferenceInfo {
    pub registry: String,
    pub repository: String,
    pub tag: String,
    pub suggested_name: String,
    pub full_reference: String,
}

/// Parse a container image reference and return suggested name
#[tauri::command]
pub fn parse_image_reference(image: String) -> Result<ImageReferenceInfo, String> {
    use crate::oci::ImageReference;

    let parsed = ImageReference::parse(&image).map_err(|e| e.to_string())?;

    Ok(ImageReferenceInfo {
        registry: parsed.registry.clone(),
        repository: parsed.repository.clone(),
        tag: parsed.tag.clone(),
        suggested_name: parsed.suggested_name(),
        full_reference: parsed.full_reference(),
    })
}

#[tauri::command]
pub async fn create_from_image(
    app: AppHandle,
    image: String,
    distro_name: String,
    install_location: Option<String>,
    wsl_version: Option<u8>,
) -> Result<(), String> {
    use crate::settings::{get_settings, ContainerRuntime};

    validate_distro_name(&distro_name).map_err(|e| e.to_string())?;
    if let Some(ref loc) = install_location {
        validate_file_path(loc).map_err(|e| e.to_string())?;
    }
    if let Some(v) = wsl_version {
        validate_wsl_version(v).map_err(|e| e.to_string())?;
    }

    let settings = get_settings();
    let runtime = settings.container_runtime.clone();

    let app_handle = app.clone();
    let name_for_progress = distro_name.clone();

    tokio::task::spawn_blocking(move || {
        match runtime {
            ContainerRuntime::Builtin => {
                // Use built-in OCI implementation
                WslService::create_from_oci_image(
                    &image,
                    &distro_name,
                    install_location.as_deref(),
                    wsl_version,
                    Some(Box::new(move |downloaded, total, stage| {
                        let percent = if total > 0 {
                            Some((downloaded as f64 / total as f64) * 100.0)
                        } else {
                            None
                        };

                        let stage_name = if stage.contains("layer") {
                            "downloading"
                        } else if stage.contains("rootfs") {
                            "importing"
                        } else if stage == "Complete" {
                            "complete"
                        } else {
                            "downloading"
                        };

                        let _ = app_handle.emit(
                            "download-progress",
                            serde_json::json!({
                                "distroName": name_for_progress,
                                "stage": stage_name,
                                "bytesDownloaded": downloaded,
                                "totalBytes": if total > 0 { Some(total) } else { None },
                                "percent": percent
                            }),
                        );
                    })),
                )
                .map_err(|e| e.to_string())
            }
            ContainerRuntime::Docker => {
                // Use Docker CLI
                WslService::create_from_image(
                    &image,
                    &distro_name,
                    install_location.as_deref(),
                    wsl_version,
                    Some("docker"),
                )
                .map_err(|e| e.to_string())
            }
            ContainerRuntime::Podman => {
                // Use Podman CLI
                WslService::create_from_image(
                    &image,
                    &distro_name,
                    install_location.as_deref(),
                    wsl_version,
                    Some("podman"),
                )
                .map_err(|e| e.to_string())
            }
            ContainerRuntime::Custom(ref cmd) => {
                // Use custom runtime command
                WslService::create_from_image(
                    &image,
                    &distro_name,
                    install_location.as_deref(),
                    wsl_version,
                    Some(cmd.as_str()),
                )
                .map_err(|e| e.to_string())
            }
        }
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn list_online_distributions() -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(|| {
        WslService::list_online_distributions().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn list_downloadable_distributions() -> Result<Vec<String>, String> {
    tokio::task::spawn_blocking(|| {
        WslService::list_downloadable_distributions().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn quick_install_distribution(distro_id: String) -> Result<(), String> {
    // Run in blocking thread to avoid freezing UI during long Microsoft Store download
    tokio::task::spawn_blocking(move || {
        WslService::quick_install_distribution(&distro_id).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Custom install with progress events - downloads rootfs and imports with progress tracking
#[tauri::command]
pub async fn custom_install_with_progress(
    app: AppHandle,
    distro_id: String,
    custom_name: String,
    install_location: Option<String>,
    wsl_version: Option<u8>,
) -> Result<(), String> {
    validate_distro_name(&custom_name).map_err(|e| e.to_string())?;
    if let Some(ref loc) = install_location {
        validate_file_path(loc).map_err(|e| e.to_string())?;
    }
    if let Some(v) = wsl_version {
        validate_wsl_version(v).map_err(|e| e.to_string())?;
    }

    // In mock mode, use simulated download
    if is_mock_mode() {
        return mock_install_with_progress(&app, &custom_name, wsl_version).await;
    }

    // Get download URL from catalog
    let download_url = distro_catalog::get_download_url(&distro_id).ok_or_else(|| {
        format!(
            "No direct download available for {}. Use Quick Install or Container Image instead.",
            distro_id
        )
    })?;

    // Get checksum from catalog (if available)
    let expected_checksum = distro_catalog::get_download_checksum(&distro_id);

    // Create temp file path with RAII guard for automatic cleanup
    let temp_dir = std::env::temp_dir();
    let tar_path = temp_dir.join(format!("wsl-download-{}.tar.gz", std::process::id()));
    let temp_guard = TempFileGuard::new(&tar_path);

    // Download with progress events and checksum verification
    download::download_with_progress_and_checksum(&app, &download_url, &tar_path, &custom_name, expected_checksum).await?;

    // Determine install location (use settings-based default if not specified)
    let location = match install_location {
        Some(ref loc) if !loc.is_empty() => loc.clone(),
        _ => crate::settings::get_default_distro_path(&custom_name),
    };

    // Create install directory
    std::fs::create_dir_all(&location)
        .map_err(|e| format!("Failed to create install directory: {}", e))?;

    // Emit importing stage
    let _ = app.emit(
        "download-progress",
        download::DownloadProgress {
            distro_name: custom_name.clone(),
            stage: "importing".to_string(),
            bytes_downloaded: 0,
            total_bytes: None,
            percent: None,
        },
    );

    // Import the distribution
    let tar_path_str = tar_path.to_string_lossy().to_string();
    let import_result = WslService::import_distribution_with_version(
        &custom_name,
        &location,
        &tar_path_str,
        wsl_version,
    );

    // Cleanup temp file automatically via Drop (guard will clean up when this function exits)
    // If import was successful, we can explicitly drop the guard here
    // If import failed, the guard will still clean up when the function returns the error
    drop(temp_guard);

    // Create metadata if import succeeded
    if import_result.is_ok() {
        use crate::wsl::executor::resource_monitor;
        use crate::metadata::{DistroMetadata, InstallSource};

        let registry_info = resource_monitor().get_all_distro_registry_info();
        if let Some(info) = registry_info.get(&custom_name) {
            let mut distro_metadata = DistroMetadata::new(
                info.id.clone(),
                custom_name.clone(),
                InstallSource::Download,
            );
            distro_metadata.download_url = Some(download_url.clone());
            distro_metadata.catalog_entry = Some(distro_id.clone());
            if let Err(e) = metadata::save_metadata(distro_metadata) {
                log::warn!("Failed to save install metadata: {}", e);
            } else {
                log::info!("Created metadata for installed distribution '{}'", custom_name);
            }
        } else {
            log::warn!("Could not find GUID for installed distribution '{}' - metadata not created", custom_name);
        }
    }

    // Emit completion or error
    match &import_result {
        Ok(_) => {
            let _ = app.emit(
                "download-progress",
                download::DownloadProgress {
                    distro_name: custom_name.clone(),
                    stage: "complete".to_string(),
                    bytes_downloaded: 0,
                    total_bytes: None,
                    percent: Some(100.0),
                },
            );
        }
        Err(_) => {
            let _ = app.emit(
                "download-progress",
                download::DownloadProgress {
                    distro_name: custom_name.clone(),
                    stage: "error".to_string(),
                    bytes_downloaded: 0,
                    total_bytes: None,
                    percent: None,
                },
            );
        }
    }

    import_result.map_err(|e| e.to_string())
}

// WSL Configuration commands

#[tauri::command]
pub fn get_wsl_config() -> Result<WslConfig, String> {
    settings::read_wsl_config()
}

#[tauri::command]
pub fn save_wsl_config(config: WslConfig) -> Result<(), String> {
    settings::write_wsl_config(config)
}

#[tauri::command]
pub async fn get_wsl_conf(distro_name: String, id: Option<String>) -> Result<WslConf, String> {
    validate_distro_name(&distro_name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || settings::read_wsl_conf(&distro_name, id.as_deref()))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_wsl_conf_raw(distro_name: String, id: Option<String>) -> Result<Option<String>, String> {
    validate_distro_name(&distro_name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || settings::read_wsl_conf_raw(&distro_name, id.as_deref()))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn save_wsl_conf(distro_name: String, config: WslConf) -> Result<(), String> {
    validate_distro_name(&distro_name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || settings::write_wsl_conf(&distro_name, config))
        .await
        .map_err(|e| format!("Task failed: {}", e))?
}

// Custom Actions commands

#[tauri::command]
pub fn get_custom_actions() -> Vec<CustomAction> {
    actions::load_actions()
}

#[tauri::command]
pub fn add_custom_action(action: CustomAction) -> Result<Vec<CustomAction>, String> {
    actions::add_action(action)
}

#[tauri::command]
pub fn update_custom_action(action: CustomAction) -> Result<Vec<CustomAction>, String> {
    actions::update_action(action)
}

#[tauri::command]
pub fn delete_custom_action(id: String) -> Result<Vec<CustomAction>, String> {
    validate_action_id(&id).map_err(|e| e.to_string())?;
    actions::delete_action(&id)
}

#[tauri::command]
pub async fn execute_custom_action(action_id: String, distro: String, id: Option<String>, password: Option<String>) -> Result<ActionResult, String> {
    validate_action_id(&action_id).map_err(|e| e.to_string())?;
    validate_distro_name(&distro).map_err(|e| e.to_string())?;
    // Run in blocking thread to avoid freezing UI during long-running commands
    tokio::task::spawn_blocking(move || {
        actions::execute_action(&action_id, &distro, id.as_deref(), password.as_deref())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub fn export_custom_actions() -> Result<String, String> {
    actions::export_actions()
}

#[tauri::command]
pub fn export_custom_actions_to_file(path: String) -> Result<(), String> {
    actions::export_actions_to_file(&path)
}

#[tauri::command]
pub fn import_custom_actions(json: String, merge: bool) -> Result<Vec<CustomAction>, String> {
    actions::import_actions(&json, merge)
}

#[tauri::command]
pub fn import_custom_actions_from_file(path: String, merge: bool) -> Result<Vec<CustomAction>, String> {
    actions::import_actions_from_file(&path, merge)
}

#[tauri::command]
pub fn check_action_applies(action_id: String, distro: String) -> bool {
    // Validation failures just return false (action doesn't apply)
    if validate_action_id(&action_id).is_err() || validate_distro_name(&distro).is_err() {
        return false;
    }
    let actions = actions::load_actions();
    actions
        .iter()
        .find(|a| a.id == action_id)
        .map(|a| actions::action_applies_to_distro(a, &distro))
        .unwrap_or(false)
}

// Startup Actions command

#[tauri::command]
pub fn get_startup_actions_for_distro(distro_name: String) -> Vec<CustomAction> {
    if validate_distro_name(&distro_name).is_err() {
        return vec![];
    }
    actions::get_startup_actions_for_distro(&distro_name)
}

/// Install from a rootfs URL with progress events
#[tauri::command]
pub async fn install_from_rootfs_url(
    app: AppHandle,
    url: String,
    name: String,
    install_location: Option<String>,
    wsl_version: Option<u8>,
) -> Result<(), String> {
    validate_url(&url).map_err(|e| e.to_string())?;
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    if let Some(ref loc) = install_location {
        validate_file_path(loc).map_err(|e| e.to_string())?;
    }
    if let Some(v) = wsl_version {
        validate_wsl_version(v).map_err(|e| e.to_string())?;
    }

    // In mock mode, use simulated download
    if is_mock_mode() {
        return mock_install_with_progress(&app, &name, wsl_version).await;
    }

    // Create temp file path with RAII guard for automatic cleanup
    let temp_dir = std::env::temp_dir();
    let tar_path = temp_dir.join(format!("wsl-rootfs-{}.tar.gz", std::process::id()));
    let temp_guard = TempFileGuard::new(&tar_path);

    // Download with progress events (no checksum for custom URLs)
    download::download_with_progress_and_checksum(&app, &url, &tar_path, &name, None).await?;

    // Determine install location (use settings-based default if not specified)
    let location = match install_location {
        Some(ref loc) if !loc.is_empty() => loc.clone(),
        _ => crate::settings::get_default_distro_path(&name),
    };

    // Create install directory
    std::fs::create_dir_all(&location)
        .map_err(|e| format!("Failed to create install directory: {}", e))?;

    // Emit importing stage
    let _ = app.emit(
        "download-progress",
        download::DownloadProgress {
            distro_name: name.clone(),
            stage: "importing".to_string(),
            bytes_downloaded: 0,
            total_bytes: None,
            percent: None,
        },
    );

    // Import the distribution
    let tar_path_str = tar_path.to_string_lossy().to_string();
    let import_result = WslService::import_distribution_with_version(
        &name,
        &location,
        &tar_path_str,
        wsl_version,
    );

    // Cleanup temp file automatically via Drop
    drop(temp_guard);

    // Create metadata if import succeeded
    if import_result.is_ok() {
        use crate::wsl::executor::resource_monitor;

        let registry_info = resource_monitor().get_all_distro_registry_info();
        if let Some(info) = registry_info.get(&name) {
            let mut distro_metadata = metadata::DistroMetadata::new(
                info.id.clone(),
                name.clone(),
                metadata::InstallSource::Lxc,
            );
            distro_metadata.download_url = Some(url.clone());
            if let Err(e) = metadata::save_metadata(distro_metadata) {
                log::warn!("Failed to save install metadata: {}", e);
            } else {
                log::info!("Created metadata for installed distribution '{}'", name);
            }
        } else {
            log::warn!("Could not find GUID for installed distribution '{}' - metadata not created", name);
        }
    }

    // Emit completion or error
    match &import_result {
        Ok(_) => {
            let _ = app.emit(
                "download-progress",
                download::DownloadProgress {
                    distro_name: name.clone(),
                    stage: "complete".to_string(),
                    bytes_downloaded: 0,
                    total_bytes: None,
                    percent: Some(100.0),
                },
            );
        }
        Err(_) => {
            let _ = app.emit(
                "download-progress",
                download::DownloadProgress {
                    distro_name: name.clone(),
                    stage: "error".to_string(),
                    bytes_downloaded: 0,
                    total_bytes: None,
                    percent: None,
                },
            );
        }
    }

    import_result.map_err(|e| e.to_string())
}

// Distro Catalog commands

#[tauri::command]
pub fn get_distro_catalog() -> DistroCatalog {
    distro_catalog::get_catalog()
}

#[tauri::command]
pub fn reset_distro_catalog() -> Result<DistroCatalog, String> {
    distro_catalog::reset_to_defaults()
}

#[tauri::command]
pub fn reset_download_distros() -> Result<DistroCatalog, String> {
    distro_catalog::reset_download_distros()
}

#[tauri::command]
pub fn reset_container_images() -> Result<DistroCatalog, String> {
    distro_catalog::reset_container_images()
}

#[tauri::command]
pub fn reset_ms_store_distros() -> Result<DistroCatalog, String> {
    distro_catalog::reset_ms_store_distros()
}

#[tauri::command]
pub fn add_download_distro(distro: DownloadDistro) -> Result<DistroCatalog, String> {
    validate_url(&distro.url).map_err(|e| e.to_string())?;
    distro_catalog::add_download_distro(distro)
}

#[tauri::command]
pub fn update_download_distro(distro: DownloadDistro) -> Result<DistroCatalog, String> {
    validate_url(&distro.url).map_err(|e| e.to_string())?;
    distro_catalog::update_download_distro(distro)
}

#[tauri::command]
pub fn delete_download_distro(id: String) -> Result<DistroCatalog, String> {
    distro_catalog::delete_download_distro(&id)
}

#[tauri::command]
pub fn add_container_image(image: ContainerImage) -> Result<DistroCatalog, String> {
    distro_catalog::add_container_image(image)
}

#[tauri::command]
pub fn update_container_image(image: ContainerImage) -> Result<DistroCatalog, String> {
    distro_catalog::update_container_image(image)
}

#[tauri::command]
pub fn delete_container_image(id: String) -> Result<DistroCatalog, String> {
    distro_catalog::delete_container_image(&id)
}

#[tauri::command]
pub fn update_ms_store_distro(distro_id: String, info: MsStoreDistroInfo) -> Result<DistroCatalog, String> {
    distro_catalog::update_ms_store_distro(distro_id, info)
}

#[tauri::command]
pub fn delete_ms_store_distro(distro_id: String) -> Result<DistroCatalog, String> {
    distro_catalog::delete_ms_store_distro(&distro_id)
}

// WSL Preflight & Version commands

/// Check if WSL is installed and ready to use
/// Returns a WslPreflightStatus indicating readiness or specific error
#[tauri::command]
pub async fn check_wsl_preflight() -> WslPreflightStatus {
    log::debug!("check_wsl_preflight called");
    let result = tokio::task::spawn_blocking(WslService::check_preflight)
        .await
        .unwrap_or_else(|e| WslPreflightStatus::Unknown {
            message: format!("Task failed: {}", e),
        });
    log::debug!("check_wsl_preflight returning {:?}", result);
    result
}

#[tauri::command]
pub async fn get_wsl_version() -> Result<WslVersionInfo, String> {
    tokio::task::spawn_blocking(|| {
        WslService::get_wsl_version().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_wsl_ip() -> Result<Option<String>, String> {
    tokio::task::spawn_blocking(|| {
        WslService::get_wsl_ip().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn get_system_distro_info() -> Result<crate::wsl::SystemDistroInfo, String> {
    tokio::task::spawn_blocking(|| {
        WslService::get_system_distro_info().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn update_wsl(pre_release: bool, current_version: Option<String>) -> Result<String, String> {
    tokio::task::spawn_blocking(move || {
        WslService::update_wsl(pre_release, current_version.as_deref()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// Manage Distribution commands

#[tauri::command]
pub async fn move_distribution(name: String, location: String) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    validate_file_path(&location).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::move_distribution(&name, &location).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn set_sparse(name: String, enabled: bool) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::set_sparse(&name, enabled).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn set_distro_default_user(name: String, username: String) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    // Username validation is done in the core function
    tokio::task::spawn_blocking(move || {
        WslService::set_default_user(&name, &username).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn resize_distribution(name: String, size: String) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::resize_distribution(&name, &size).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn compact_distribution(name: String) -> Result<CompactResult, String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::compact_distribution(&name).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn set_distro_version(name: String, version: u8) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    validate_wsl_version(version).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::set_distro_version(&name, version).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn rename_distribution(
    id: String,
    new_name: String,
    update_terminal_profile: bool,
    update_shortcut: bool,
) -> Result<String, String> {
    // Validate the new name
    validate_distro_name(&new_name).map_err(|e| e.to_string())?;
    tokio::task::spawn_blocking(move || {
        WslService::rename_distribution(&id, &new_name, update_terminal_profile, update_shortcut)
            .map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// Disk Mount commands

#[tauri::command]
pub async fn mount_disk(options: MountDiskOptions) -> Result<(), String> {
    validate_file_path(&options.disk_path).map_err(|e| e.to_string())?;
    if let Some(ref name) = options.mount_name {
        // Mount name should be alphanumeric + underscore/dash
        if !name.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-') {
            return Err("Mount name can only contain alphanumeric characters, underscores, and dashes".to_string());
        }
    }
    tokio::task::spawn_blocking(move || {
        WslService::mount_disk(&options).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn unmount_disk(disk_path: Option<String>) -> Result<(), String> {
    if let Some(ref path) = disk_path {
        validate_file_path(path).map_err(|e| e.to_string())?;
    }
    tokio::task::spawn_blocking(move || {
        WslService::unmount_disk(disk_path.as_deref()).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn list_mounted_disks() -> Result<Vec<MountedDisk>, String> {
    tokio::task::spawn_blocking(|| {
        WslService::list_mounted_disks().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

#[tauri::command]
pub async fn list_physical_disks() -> Result<Vec<PhysicalDisk>, String> {
    tokio::task::spawn_blocking(|| {
        WslService::list_physical_disks().map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// E2E Testing commands

/// Mock install with progress - simulates download and import with progress events
/// This is used internally when running in mock mode to avoid network operations
async fn mock_install_with_progress(
    app: &AppHandle,
    distro_name: &str,
    wsl_version: Option<u8>,
) -> Result<(), String> {
    use crate::wsl::executor::{mock_wsl_executor, resource_monitor};
    use tauri::Emitter;

    // Simulate download with progress events
    download::simulate_download_with_progress(app, distro_name).await?;

    // Emit importing stage
    let _ = app.emit(
        "download-progress",
        download::DownloadProgress {
            distro_name: distro_name.to_string(),
            stage: "importing".to_string(),
            bytes_downloaded: 0,
            total_bytes: None,
            percent: None,
        },
    );

    // Use mock executor to simulate import (adds distro to mock state)
    if let Some(_mock) = mock_wsl_executor() {
        // Simulate import delay
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;

        // The import already happens through the mock executor's install function
        // We just need to call the WSL service which uses the mock
        let result = tokio::task::spawn_blocking({
            let name = distro_name.to_string();
            move || {
                WslService::import_distribution_with_version(
                    &name,
                    "mock-location",
                    "mock-tarball.tar",
                    wsl_version,
                )
            }
        })
        .await
        .map_err(|e| format!("Task failed: {}", e))?;

        match result {
            Ok(_) => {
                // Create mock metadata
                let registry_info = resource_monitor().get_all_distro_registry_info();
                if let Some(info) = registry_info.get(distro_name) {
                    let distro_metadata = metadata::DistroMetadata::new(
                        info.id.clone(),
                        distro_name.to_string(),
                        metadata::InstallSource::Download,
                    );
                    let _ = metadata::save_metadata(distro_metadata);
                }

                let _ = app.emit(
                    "download-progress",
                    download::DownloadProgress {
                        distro_name: distro_name.to_string(),
                        stage: "complete".to_string(),
                        bytes_downloaded: 0,
                        total_bytes: None,
                        percent: Some(100.0),
                    },
                );
                Ok(())
            }
            Err(e) => {
                let _ = app.emit(
                    "download-progress",
                    download::DownloadProgress {
                        distro_name: distro_name.to_string(),
                        stage: "error".to_string(),
                        bytes_downloaded: 0,
                        total_bytes: None,
                        percent: None,
                    },
                );
                Err(e.to_string())
            }
        }
    } else {
        Err("Mock executor not available".to_string())
    }
}

/// Configure mock download behavior (only works in mock mode)
/// delay_ms: milliseconds to simulate download
/// error: optional error message to simulate download failure
#[tauri::command]
pub fn set_mock_download_cmd(delay_ms: u64, error: Option<String>) -> Result<(), String> {
    if !is_mock_mode() {
        return Err("set_mock_download is only available in mock mode".to_string());
    }
    download::set_mock_download(true, delay_ms, error);
    Ok(())
}

/// Reset mock download state (only works in mock mode)
#[tauri::command]
pub fn reset_mock_download_cmd() -> Result<(), String> {
    if !is_mock_mode() {
        return Err("reset_mock_download is only available in mock mode".to_string());
    }
    download::reset_mock_download();
    Ok(())
}

/// Reset mock state to defaults (only works in mock mode)
/// This is used by E2E tests to ensure a clean state between tests
#[tauri::command]
pub fn reset_mock_state_cmd() -> Result<(), String> {
    if is_mock_mode() {
        reset_mock_state();
        download::reset_mock_download();
        metadata::reset_mock_metadata();
        actions::reset_mock_actions();
        Ok(())
    } else {
        Err("reset_mock_state is only available in mock mode".to_string())
    }
}

/// Check if the app is running in mock mode (for E2E tests)
#[tauri::command]
pub fn is_mock_mode_cmd() -> bool {
    is_mock_mode()
}

/// Set a mock error for a specific operation (only works in mock mode)
/// This is used by E2E tests to simulate error scenarios
/// operation: "start", "stop", "delete", "shutdown", "list", "update"
/// error_type: "timeout", "command_failed", "not_found", "cancelled"
/// delay_ms: milliseconds to wait before returning the error
#[tauri::command]
pub fn set_mock_error_cmd(operation: String, error_type: String, delay_ms: u64) -> Result<(), String> {
    if !is_mock_mode() {
        return Err("set_mock_error is only available in mock mode".to_string());
    }

    let mock_error_type = match error_type.as_str() {
        "timeout" => MockErrorType::Timeout,
        "command_failed" => MockErrorType::CommandFailed,
        "not_found" => MockErrorType::DistroNotFound,
        "cancelled" => MockErrorType::Cancelled,
        _ => return Err(format!("Unknown error type: {}. Use 'timeout', 'command_failed', 'not_found', or 'cancelled'", error_type)),
    };

    set_mock_error(&operation, mock_error_type, delay_ms);
    Ok(())
}

/// Clear all mock error configurations (only works in mock mode)
/// This is used by E2E tests to reset error simulation
#[tauri::command]
pub fn clear_mock_errors_cmd() -> Result<(), String> {
    if is_mock_mode() {
        clear_mock_errors();
        Ok(())
    } else {
        Err("clear_mock_errors is only available in mock mode".to_string())
    }
}

/// Configure stubborn shutdown simulation (only works in mock mode)
/// When enabled, graceful shutdown won't stop all distros, triggering --force escalation
/// This is used by E2E tests to test the force kill escalation path
#[tauri::command]
pub fn set_stubborn_shutdown_cmd(enabled: bool) -> Result<(), String> {
    if is_mock_mode() {
        set_stubborn_shutdown(enabled);
        Ok(())
    } else {
        Err("set_stubborn_shutdown is only available in mock mode".to_string())
    }
}

/// Check if force shutdown was used during last force_kill_wsl call (only works in mock mode)
/// This is used by E2E tests to verify the escalation path was triggered
#[tauri::command]
pub fn was_force_shutdown_used_cmd() -> Result<bool, String> {
    if is_mock_mode() {
        Ok(was_force_shutdown_used())
    } else {
        Err("was_force_shutdown_used is only available in mock mode".to_string())
    }
}

/// Set the mock update result (only works in mock mode)
/// result_type: "already_up_to_date" or "updated"
/// old_version: previous version (only used when result_type is "updated")
/// new_version: new version (only used when result_type is "updated")
#[tauri::command]
pub fn set_mock_update_result_cmd(
    result_type: String,
    old_version: Option<String>,
    new_version: Option<String>,
) -> Result<(), String> {
    if !is_mock_mode() {
        return Err("set_mock_update_result is only available in mock mode".to_string());
    }

    use crate::wsl::set_mock_update_result;
    use crate::wsl::MockUpdateResult;

    let result = match result_type.as_str() {
        "already_up_to_date" => MockUpdateResult::AlreadyUpToDate,
        "updated" => {
            let old = old_version.ok_or("old_version is required for 'updated' result")?;
            let new = new_version.ok_or("new_version is required for 'updated' result")?;
            MockUpdateResult::Updated { old_version: old, new_version: new }
        }
        _ => return Err(format!("Unknown result type: {}. Use 'already_up_to_date' or 'updated'", result_type)),
    };

    set_mock_update_result(result);
    Ok(())
}

// Terminal Detection commands

/// Get installed Windows Store terminal applications
/// Returns a list of detected terminals with their installation status
#[tauri::command]
pub fn get_installed_terminals() -> Vec<InstalledTerminal> {
    terminal_executor()
        .detect_store_terminals()
        .into_values()
        .collect()
}

// Distro Metadata commands

/// Get all distro metadata (installation source information)
/// Returns HashMap keyed by GUID (distro_id)
#[tauri::command]
pub fn get_all_distro_metadata() -> std::collections::HashMap<String, DistroMetadata> {
    metadata::get_all_metadata()
}

/// Get metadata for a specific distribution by ID (GUID)
#[tauri::command]
pub fn get_distro_metadata(id: String) -> Option<DistroMetadata> {
    metadata::get_metadata(&id)
}

/// Get metadata for a specific distribution by name (for backwards compatibility)
#[tauri::command]
pub fn get_distro_metadata_by_name(name: String) -> Option<DistroMetadata> {
    if validate_distro_name(&name).is_err() {
        return None;
    }
    metadata::get_metadata_by_name(&name)
}

/// Save metadata for a distribution (uses distro_id as key)
/// Note: Backend now manages metadata creation for most operations.
/// This command is kept for manual metadata correction if needed.
#[tauri::command]
pub fn save_distro_metadata(metadata_entry: DistroMetadata) -> Result<(), String> {
    validate_distro_name(&metadata_entry.distro_name).map_err(|e| e.to_string())?;
    metadata::save_metadata(metadata_entry)
}

/// Delete metadata for a distribution by ID (GUID)
#[tauri::command]
pub fn delete_distro_metadata(id: String) -> Result<(), String> {
    metadata::delete_metadata(&id)
}

/// Delete metadata for a distribution by name (for backwards compatibility)
#[tauri::command]
pub fn delete_distro_metadata_by_name(name: String) -> Result<(), String> {
    validate_distro_name(&name).map_err(|e| e.to_string())?;
    metadata::delete_metadata_by_name(&name)
}

/// Open the Windows Subsystem for Linux Settings app
#[tauri::command]
pub async fn open_wsl_settings() -> Result<(), String> {
    use crate::utils::hidden_command;

    tokio::task::spawn_blocking(|| {
        // WSL Settings app is installed at C:\Program Files\WSL\wslsettings\wslsettings.exe
        let wsl_settings_path = r"C:\Program Files\WSL\wslsettings\wslsettings.exe";

        hidden_command(wsl_settings_path)
            .spawn()
            .map_err(|e| format!("Failed to open WSL Settings: {}. Is WSL installed?", e))?;

        Ok(())
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// Logging commands

/// Set the log level at runtime (true = debug, false = info)
#[tauri::command]
pub fn set_debug_logging(enabled: bool) {
    let level = if enabled {
        log::LevelFilter::Debug
    } else {
        log::LevelFilter::Info
    };
    log::set_max_level(level);
    log::info!("Log level changed to {:?}", level);
}

/// Get the path to the log file directory for support/troubleshooting
#[tauri::command]
pub fn get_log_path() -> String {
    utils::get_config_dir().join("logs").to_string_lossy().to_string()
}

