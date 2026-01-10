//! Common utility functions for WSL2 Manager
//!
//! This module provides shared utilities used across the application,
//! following the DRY principle.

use crate::constants::APP_NAME;
use std::path::PathBuf;
use std::process::Command;

#[cfg(target_os = "windows")]
use std::os::windows::process::CommandExt;

/// Windows flag to prevent console window from appearing
#[cfg(target_os = "windows")]
const CREATE_NO_WINDOW: u32 = 0x08000000;

/// Create a Command that runs without showing a console window on Windows.
///
/// This is essential for production builds to prevent console window flashing
/// when the app executes background commands like `wsl --list`.
///
/// On non-Windows platforms, this returns a normal Command.
pub fn hidden_command(program: &str) -> Command {
    let mut cmd = Command::new(program);

    #[cfg(target_os = "windows")]
    cmd.creation_flags(CREATE_NO_WINDOW);

    cmd
}

/// Check if we're running in mock mode for development
///
/// Mock mode is enabled when:
/// - WSL_MOCK environment variable is set
/// - Running on non-Windows platforms (for development on Linux/Mac)
pub fn is_mock_mode() -> bool {
    std::env::var("WSL_MOCK").is_ok() || cfg!(not(target_os = "windows"))
}

/// Get the application config directory
///
/// Returns the path to the application's config directory, creating it if necessary.
/// On Windows: %LOCALAPPDATA%/wsl-ui
/// On other platforms (mock mode): $HOME/wsl-ui or ./wsl-ui
pub fn get_config_dir() -> PathBuf {
    let base_dir = std::env::var("LOCALAPPDATA")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());

    let config_dir = PathBuf::from(base_dir).join(APP_NAME);

    // Ensure directory exists (ignore errors)
    let _ = std::fs::create_dir_all(&config_dir);

    config_dir
}

/// Get path for a specific config file
///
/// # Arguments
/// * `filename` - The name of the config file (e.g., "settings.json")
pub fn get_config_file(filename: &str) -> PathBuf {
    get_config_dir().join(filename)
}

/// Get the user profile directory (USERPROFILE on Windows, HOME elsewhere)
pub fn get_user_profile() -> PathBuf {
    let profile = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(profile)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_name() {
        assert_eq!(APP_NAME, "wsl-ui");
    }

    #[test]
    fn test_get_config_dir_returns_path() {
        let dir = get_config_dir();
        assert!(dir.to_string_lossy().contains(APP_NAME));
    }

    #[test]
    fn test_get_config_file() {
        let file = get_config_file("test.json");
        assert!(file.to_string_lossy().ends_with("test.json"));
        assert!(file.to_string_lossy().contains(APP_NAME));
    }

    #[test]
    fn test_is_mock_mode_on_non_windows() {
        // On non-Windows, should always return true
        #[cfg(not(target_os = "windows"))]
        assert!(is_mock_mode());
    }
}
