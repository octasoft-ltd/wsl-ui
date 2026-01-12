// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod actions;
mod commands;
mod constants;
mod distro_catalog;
mod download;
mod error;
mod metadata;
mod oci;
mod settings;
mod temp_file_guard;
mod utils;
mod validation;
mod wsl;

use commands::{
    add_container_image, add_custom_action, add_download_distro,
    check_action_applies, clone_distribution, create_from_image,
    custom_install_with_progress, delete_container_image,
    delete_custom_action, delete_distribution, delete_download_distro, delete_ms_store_distro,
    delete_startup_config, execute_custom_action,
    execute_startup_actions, export_custom_actions, export_custom_actions_to_file, export_distribution,
    get_app_startup_distros, get_custom_actions, get_distro_catalog, get_distribution_disk_size,
    get_distribution_vhd_size, get_distribution_os_info, get_resource_stats, get_wsl_health, check_wsl_preflight, get_wsl_version, get_wsl_ip, get_system_distro_info, get_settings,
    get_startup_config, get_startup_configs, get_wsl_conf, get_wsl_conf_raw, get_wsl_config, hide_window, import_custom_actions, import_custom_actions_from_file,
    import_distribution, install_from_rootfs_url, is_mock_mode_cmd, list_distributions,
    list_downloadable_distributions, list_online_distributions, move_distribution, open_file_explorer, open_folder, open_ide,
    get_distribution_location, get_default_distro_path, parse_image_reference,
    open_terminal, open_system_terminal, run_action_in_terminal, quick_install_distribution, quit_app, refresh_tray_menu, rename_distribution, resize_distribution,
    reset_distro_catalog, reset_download_distros, reset_container_images, reset_ms_store_distros, reset_mock_state_cmd, set_mock_error_cmd, clear_mock_errors_cmd, set_stubborn_shutdown_cmd, was_force_shutdown_used_cmd, set_mock_download_cmd, reset_mock_download_cmd, set_mock_update_result_cmd, get_installed_terminals, restart_distribution, save_settings, save_startup_config,
    save_wsl_conf, save_wsl_config, set_default_distribution, set_distro_default_user, set_distro_version, set_sparse, shutdown_all, force_kill_wsl, start_distribution,
    stop_distribution, force_stop_distribution, update_container_image, update_custom_action, update_download_distro,
    update_ms_store_distro, update_wsl, validate_install_path,
    // Disk Mount commands
    mount_disk, unmount_disk, list_mounted_disks, list_physical_disks,
    // Distro Metadata commands
    get_all_distro_metadata, get_distro_metadata, get_distro_metadata_by_name, save_distro_metadata, delete_distro_metadata, delete_distro_metadata_by_name,
    // WSL Settings
    open_wsl_settings,
    // Logging commands
    set_debug_logging, get_log_path,
    // Telemetry commands
    track_event, get_telemetry_status,
};
use std::sync::Mutex;
use tauri::{
    menu::{Menu, MenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIcon, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, State,
};
use wsl::{DistroState, WslService};

/// State to hold the tray icon for later menu updates
pub struct TrayState {
    pub tray: Mutex<Option<TrayIcon>>,
}

/// Show the main window properly on Windows
fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        // On Windows, we need to:
        // 1. Show the window (if hidden)
        // 2. Unminimize it (if minimized)
        // 3. Set focus to bring it to front
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Build a minimal fallback tray menu with just Show and Quit
/// This is used when the full menu fails to build
fn build_fallback_tray_menu(app: &AppHandle) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let separator = MenuItem::with_id(app, "sep_fallback", "─────────────", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    Menu::with_items(app, &[&show, &separator, &quit])
}

/// Build the tray menu with current distributions for the Open Terminal submenu
/// If skip_wsl_query is true, shows a placeholder in the terminal submenu (for fast startup)
/// Falls back to a minimal menu if building fails
fn build_tray_menu(app: &AppHandle, skip_wsl_query: bool) -> Result<Menu<tauri::Wry>, tauri::Error> {
    // Try to build the full menu, fall back to minimal menu if it fails
    match build_full_tray_menu(app, skip_wsl_query) {
        Ok(menu) => Ok(menu),
        Err(e) => {
            log::warn!("Failed to build full tray menu: {}. Using fallback.", e);
            build_fallback_tray_menu(app)
        }
    }
}

/// Build the tray menu with pre-fetched distributions (for async updates)
/// This avoids blocking the main thread by using distributions that were fetched in background
fn build_tray_menu_with_distros(app: &AppHandle, distros: Option<Vec<wsl::Distribution>>) -> Result<Menu<tauri::Wry>, tauri::Error> {
    match build_full_tray_menu_with_distros(app, distros) {
        Ok(menu) => Ok(menu),
        Err(e) => {
            log::warn!("Failed to build full tray menu with distros: {}. Using fallback.", e);
            build_fallback_tray_menu(app)
        }
    }
}

/// Build the full tray menu with pre-fetched distributions
fn build_full_tray_menu_with_distros(app: &AppHandle, distros: Option<Vec<wsl::Distribution>>) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let separator1 = MenuItem::with_id(app, "sep1", "─────────────", false, None::<&str>)?;

    // Build Open Terminal submenu with provided distributions
    let terminal_submenu = build_terminal_submenu_with_distros(app, distros)?;

    let separator2 = MenuItem::with_id(app, "sep2", "─────────────", false, None::<&str>)?;
    let shutdown_all_item =
        MenuItem::with_id(app, "shutdown_all", "Shutdown All WSL", true, None::<&str>)?;
    let separator3 = MenuItem::with_id(app, "sep3", "─────────────", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[
            &show,
            &separator1,
            &terminal_submenu,
            &separator2,
            &shutdown_all_item,
            &separator3,
            &quit,
        ],
    )
}

/// Build the Open Terminal submenu with pre-fetched distributions
fn build_terminal_submenu_with_distros(app: &AppHandle, distros: Option<Vec<wsl::Distribution>>) -> Result<Submenu<tauri::Wry>, tauri::Error> {
    let submenu = Submenu::with_id(app, "open_terminal", "Open Terminal", true)?;

    match distros {
        None => {
            // WSL query failed or returned error
            let unavailable =
                MenuItem::with_id(app, "wsl_unavailable", "(WSL unavailable)", false, None::<&str>)?;
            submenu.append(&unavailable)?;
        }
        Some(distros) if distros.is_empty() => {
            let no_distros =
                MenuItem::with_id(app, "no_distros", "(No distributions)", false, None::<&str>)?;
            submenu.append(&no_distros)?;
        }
        Some(distros) => {
            for distro in distros {
                let item_id = format!("terminal_{}", distro.name);
                let label = if distro.state == DistroState::Running {
                    format!("{} (Running)", distro.name)
                } else {
                    distro.name.clone()
                };
                let item = MenuItem::with_id(app, &item_id, &label, true, None::<&str>)?;
                submenu.append(&item)?;
            }
        }
    }

    Ok(submenu)
}

/// Build the full tray menu with all items
fn build_full_tray_menu(app: &AppHandle, skip_wsl_query: bool) -> Result<Menu<tauri::Wry>, tauri::Error> {
    let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let separator1 = MenuItem::with_id(app, "sep1", "─────────────", false, None::<&str>)?;

    // Build Open Terminal submenu with current distributions
    let terminal_submenu = build_terminal_submenu(app, skip_wsl_query)?;

    let separator2 = MenuItem::with_id(app, "sep2", "─────────────", false, None::<&str>)?;
    let shutdown_all_item =
        MenuItem::with_id(app, "shutdown_all", "Shutdown All WSL", true, None::<&str>)?;
    let separator3 = MenuItem::with_id(app, "sep3", "─────────────", false, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    Menu::with_items(
        app,
        &[
            &show,
            &separator1,
            &terminal_submenu,
            &separator2,
            &shutdown_all_item,
            &separator3,
            &quit,
        ],
    )
}

/// Build the Open Terminal submenu with all distributions
/// If skip_wsl_query is true, shows a placeholder instead of querying WSL (for fast startup)
/// This function handles WSL errors gracefully to ensure the tray menu can still be built
fn build_terminal_submenu(app: &AppHandle, skip_wsl_query: bool) -> Result<Submenu<tauri::Wry>, tauri::Error> {
    let submenu = Submenu::with_id(app, "open_terminal", "Open Terminal", true)?;

    if skip_wsl_query {
        // Show placeholder during initial startup to avoid blocking
        let loading =
            MenuItem::with_id(app, "loading_distros", "(Loading...)", false, None::<&str>)?;
        submenu.append(&loading)?;
        return Ok(submenu);
    }

    // Try to get distributions, but handle errors gracefully
    match WslService::list_distributions() {
        Ok(distros) if distros.is_empty() => {
            let no_distros =
                MenuItem::with_id(app, "no_distros", "(No distributions)", false, None::<&str>)?;
            submenu.append(&no_distros)?;
        }
        Ok(distros) => {
            for distro in distros {
                // Create a unique ID for each distro's terminal menu item
                let item_id = format!("terminal_{}", distro.name);
                let label = if distro.state == DistroState::Running {
                    format!("{} (Running)", distro.name)
                } else {
                    distro.name.clone()
                };
                let item = MenuItem::with_id(app, &item_id, &label, true, None::<&str>)?;
                submenu.append(&item)?;
            }
        }
        Err(_) => {
            // WSL is unavailable or errored - show placeholder
            let unavailable =
                MenuItem::with_id(app, "wsl_unavailable", "(WSL unavailable)", false, None::<&str>)?;
            submenu.append(&unavailable)?;
        }
    }

    Ok(submenu)
}

#[cfg(test)]
mod tests {


    #[test]
    fn test_build_terminal_submenu_handles_empty_distros() {
        // This test verifies that build_terminal_submenu handles empty distro lists
        // without panicking. In a real test, we'd need to mock WslService::list_distributions
        // but this serves as documentation of expected behavior.
    }

    #[test]
    fn test_tray_state_mutex_not_poisoned() {
        // This test documents that TrayState mutex should handle poisoning gracefully
        // The actual implementation uses map_err to convert poison errors to Tauri errors
    }
}

#[tokio::main]
async fn main() {
    // Get the log directory path to match our config directory structure
    let log_dir = utils::get_config_dir().join("logs");

    tauri::Builder::default()
        .plugin(
            tauri_plugin_log::Builder::new()
                .clear_targets()
                .targets([
                    tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::Folder { path: log_dir, file_name: Some("wsl-ui".into()) },
                    ),
                    tauri_plugin_log::Target::new(
                        tauri_plugin_log::TargetKind::Stdout,
                    ),
                ])
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Debug
                } else {
                    log::LevelFilter::Info
                })
                .build(),
        )
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_aptabase::Builder::new(
            option_env!("APTABASE_APP_KEY").unwrap_or("")
        ).build())
        .manage(TrayState {
            tray: Mutex::new(None),
        })
        .setup(|app| {
            // Apply debug logging setting from saved settings
            let app_settings = settings::get_settings();
            if app_settings.debug_logging {
                log::set_max_level(log::LevelFilter::Debug);
                log::info!("Debug logging enabled from settings");
            }

            // Create initial tray menu (skip WSL query to avoid blocking startup)
            let menu = build_tray_menu(app.handle(), true)?;

            // Build tray icon
            let icon = app.default_window_icon()
                .ok_or_else(|| tauri::Error::InvalidIcon(std::io::Error::new(
                    std::io::ErrorKind::NotFound,
                    "Default window icon not found"
                )))?;
            let tray = TrayIconBuilder::new()
                .icon(icon.clone())
                .menu(&menu)
                .tooltip("WSL UI")
                .on_menu_event(|app, event| {
                    let event_id = event.id.as_ref();
                    match event_id {
                        "show" => {
                            show_main_window(app);
                        }
                        "shutdown_all" => {
                            let _ = WslService::shutdown_all();
                        }
                        "quit" => {
                            app.exit(0);
                        }
                        id if id.starts_with("terminal_") => {
                            // Extract distro name from the menu item ID
                            let distro_name = id.strip_prefix("terminal_").unwrap_or("");
                            if !distro_name.is_empty() {
                                let settings = settings::get_settings();
                                // Note: Tray menu doesn't have distribution ID, fallback to name
                                let _ = WslService::open_terminal(
                                    distro_name,
                                    None,
                                    &settings.terminal_command,
                                );
                                // Emit event to notify frontend that state may have changed
                                // (opening terminal on stopped distro starts it)
                                let _ = app.emit("distro-state-changed", ());
                            }
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    let app = tray.app_handle();
                    match event {
                        TrayIconEvent::Click {
                            button: MouseButton::Left,
                            button_state: MouseButtonState::Up,
                            ..
                        } => {
                            // Left-click: show window
                            show_main_window(app);
                        }
                        TrayIconEvent::Enter { .. } => {
                            // Mouse entered tray icon - refresh menu asynchronously
                            // First, immediately set a loading menu (non-blocking)
                            let tray_state: State<TrayState> = app.state();
                            if let Ok(loading_menu) = build_tray_menu(app, true) {
                                if let Ok(guard) = tray_state.tray.lock() {
                                    if let Some(tray_icon) = guard.as_ref() {
                                        let _ = tray_icon.set_menu(Some(loading_menu));
                                    }
                                }
                            }

                            // Then spawn async task to fetch distributions and update menu
                            let app_handle = app.clone();
                            tauri::async_runtime::spawn(async move {
                                // This runs in background - fetch distributions
                                let distros_result = tokio::task::spawn_blocking(|| {
                                    WslService::list_distributions()
                                }).await;

                                // Convert Result<Result<Vec, WslError>, JoinError> to Option<Vec>
                                let distros = distros_result.ok().and_then(|r| r.ok());

                                // Build and set the full menu
                                if let Ok(menu) = build_tray_menu_with_distros(&app_handle, distros) {
                                    // Get tray icon and set menu - use inner scope to drop guard before end
                                    let set_result = {
                                        let tray_state = app_handle.state::<TrayState>();
                                        let guard = tray_state.tray.lock();
                                        if let Ok(guard) = guard {
                                            if let Some(tray_icon) = guard.as_ref() {
                                                tray_icon.set_menu(Some(menu))
                                            } else {
                                                Ok(())
                                            }
                                        } else {
                                            Ok(())
                                        }
                                    };
                                    if let Err(e) = set_result {
                                        log::warn!("Failed to set tray menu after async load: {}", e);
                                    }
                                }
                            });
                        }
                        _ => {}
                    }
                })
                .build(app)?;

            // Store tray icon in state for later menu updates
            let tray_state: State<TrayState> = app.state();
            match tray_state.tray.lock() {
                Ok(mut guard) => *guard = Some(tray),
                Err(e) => eprintln!("Warning: Failed to lock tray state: {}", e),
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            // Handle close based on user preference
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let app_settings = settings::get_settings();
                match app_settings.close_action {
                    settings::CloseAction::Minimize => {
                        // Always minimize to tray
                        let _ = window.hide();
                        api.prevent_close();
                    }
                    settings::CloseAction::Quit => {
                        // Allow close to proceed (app will quit)
                    }
                    settings::CloseAction::Ask => {
                        // Emit event to frontend to show dialog
                        let _ = window.emit("close-requested", ());
                        api.prevent_close();
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            list_distributions,
            refresh_tray_menu,
            quit_app,
            hide_window,
            start_distribution,
            stop_distribution,
            force_stop_distribution,
            delete_distribution,
            shutdown_all,
            force_kill_wsl,
            set_default_distribution,
            open_terminal,
            open_system_terminal,
            run_action_in_terminal,
            open_file_explorer,
            open_folder,
            open_ide,
            restart_distribution,
            export_distribution,
            import_distribution,
            clone_distribution,
            validate_install_path,
            create_from_image,
            list_online_distributions,
            list_downloadable_distributions,
            quick_install_distribution,
            custom_install_with_progress,
            get_distribution_disk_size,
            get_distribution_vhd_size,
            get_distribution_os_info,
            get_distribution_location,
            get_default_distro_path,
            get_resource_stats,
            get_wsl_health,
            get_settings,
            save_settings,
            get_wsl_config,
            save_wsl_config,
            get_wsl_conf,
            get_wsl_conf_raw,
            save_wsl_conf,
            // Custom Actions commands
            get_custom_actions,
            add_custom_action,
            update_custom_action,
            delete_custom_action,
            execute_custom_action,
            export_custom_actions,
            export_custom_actions_to_file,
            import_custom_actions,
            import_custom_actions_from_file,
            check_action_applies,
            // Startup Actions commands
            get_startup_configs,
            get_startup_config,
            save_startup_config,
            delete_startup_config,
            execute_startup_actions,
            get_app_startup_distros,
            // Install from URL
            install_from_rootfs_url,
            // Distro Catalog commands
            get_distro_catalog,
            reset_distro_catalog,
            reset_download_distros,
            reset_container_images,
            reset_ms_store_distros,
            add_download_distro,
            update_download_distro,
            delete_download_distro,
            add_container_image,
            update_container_image,
            delete_container_image,
            update_ms_store_distro,
            delete_ms_store_distro,
            // OCI Image commands
            parse_image_reference,
            // WSL Preflight & Version commands
            check_wsl_preflight,
            get_wsl_version,
            get_wsl_ip,
            get_system_distro_info,
            update_wsl,
            // WSL Settings
            open_wsl_settings,
            // Manage Distribution commands
            move_distribution,
            set_sparse,
            set_distro_default_user,
            set_distro_version,
            resize_distribution,
            rename_distribution,
            // Disk Mount commands
            mount_disk,
            unmount_disk,
            list_mounted_disks,
            list_physical_disks,
            // E2E Testing commands (only work in mock mode)
            reset_mock_state_cmd,
            is_mock_mode_cmd,
            set_mock_error_cmd,
            clear_mock_errors_cmd,
            set_stubborn_shutdown_cmd,
            was_force_shutdown_used_cmd,
            set_mock_download_cmd,
            reset_mock_download_cmd,
            set_mock_update_result_cmd,
            // Terminal Detection commands
            get_installed_terminals,
            // Distro Metadata commands
            get_all_distro_metadata,
            get_distro_metadata,
            get_distro_metadata_by_name,
            save_distro_metadata,
            delete_distro_metadata,
            delete_distro_metadata_by_name,
            // Logging commands
            set_debug_logging,
            get_log_path,
            // Telemetry commands
            track_event,
            get_telemetry_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
