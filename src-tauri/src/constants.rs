//! Application constants for WSLUI
//!
//! Centralizes all hardcoded values for easier maintenance and documentation.
//!
//! Note: Default settings are now defined in resources/default-settings.json
//! and embedded at compile time. See settings.rs for details.

// ==================== Application Metadata ====================

/// Internal application identifier used for config directories
pub const APP_NAME: &str = "wsl-ui";

// ==================== Configuration File Names ====================

/// Settings configuration file
pub const CONFIG_FILE_SETTINGS: &str = "settings.json";

/// Custom actions configuration file
pub const CONFIG_FILE_ACTIONS: &str = "custom-actions.json";

/// Startup actions configuration file
pub const CONFIG_FILE_STARTUP: &str = "startup-configs.json";

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_name_is_valid() {
        assert!(!APP_NAME.is_empty());
        assert!(!APP_NAME.contains(' '));
        assert!(APP_NAME.chars().all(|c| c.is_ascii_alphanumeric() || c == '-'));
    }

    #[test]
    fn test_config_files_have_json_extension() {
        assert!(CONFIG_FILE_SETTINGS.ends_with(".json"));
        assert!(CONFIG_FILE_ACTIONS.ends_with(".json"));
        assert!(CONFIG_FILE_STARTUP.ends_with(".json"));
    }
}
