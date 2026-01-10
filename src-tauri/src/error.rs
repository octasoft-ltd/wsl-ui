//! Unified error handling for WSL2 Manager
//!
//! This module provides a unified error type that all components use,
//! ensuring consistent error handling across the application.

use thiserror::Error;

/// Application-wide error type
#[derive(Debug, Error)]
pub enum AppError {
    // ==================== WSL Errors ====================
    /// WSL command execution failed
    #[error("WSL command failed: {0}")]
    WslCommand(String),

    /// WSL distribution not found
    #[error("Distribution not found: {0}")]
    DistroNotFound(String),

    /// Failed to parse WSL output
    #[error("Failed to parse WSL output: {0}")]
    WslParseError(String),

    /// WSL operation timed out
    #[error("Operation timed out: {0}")]
    Timeout(String),

    // ==================== Podman Errors ====================
    /// Podman is not installed
    #[error("Podman not installed")]
    PodmanNotInstalled,

    /// Podman command failed
    #[error("Podman command failed: {0}")]
    PodmanCommand(String),

    // ==================== Configuration Errors ====================
    /// Failed to read configuration
    #[error("Failed to read config: {0}")]
    ConfigRead(String),

    /// Failed to write configuration
    #[error("Failed to write config: {0}")]
    ConfigWrite(String),

    /// Invalid configuration value
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),

    // ==================== Action Errors ====================
    /// Action not found
    #[error("Action not found: {0}")]
    ActionNotFound(String),

    /// Action does not apply to distribution
    #[error("Action '{action}' does not apply to distribution '{distro}'")]
    ActionNotApplicable { action: String, distro: String },

    // ==================== File/Path Errors ====================
    /// File operation failed
    #[error("File operation failed: {0}")]
    FileOperation(String),

    /// Invalid path
    #[error("Invalid path: {0}")]
    InvalidPath(String),

    // ==================== Validation Errors ====================
    /// Input validation failed
    #[error("Validation failed: {0}")]
    Validation(String),

    // ==================== Download Errors ====================
    /// Download operation failed
    #[error("Download failed: {0}")]
    DownloadFailed(String),

    /// Network request failed
    #[error("Network error: {0}")]
    NetworkError(String),

    // ==================== General Errors ====================
    /// IO error wrapper
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),

    /// JSON serialization/deserialization error
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),

    /// HTTP client error
    #[error("HTTP error: {0}")]
    Http(String),

    /// Generic error for edge cases
    #[error("{0}")]
    Other(String),
}

/// Convert AppError to String for Tauri command compatibility
impl From<AppError> for String {
    fn from(error: AppError) -> Self {
        error.to_string()
    }
}

/// Convert validation errors to app errors
impl From<crate::validation::ValidationError> for AppError {
    fn from(error: crate::validation::ValidationError) -> Self {
        AppError::Validation(error.to_string())
    }
}

/// Convert WSL errors to app errors
impl From<crate::wsl::WslError> for AppError {
    fn from(error: crate::wsl::WslError) -> Self {
        match error {
            crate::wsl::WslError::CommandFailed(msg) => AppError::WslCommand(msg),
            crate::wsl::WslError::ParseError(msg) => AppError::WslParseError(msg),
            crate::wsl::WslError::DistroNotFound(name) => AppError::DistroNotFound(name),
            crate::wsl::WslError::Timeout(msg) => AppError::Timeout(msg),
            crate::wsl::WslError::IoError(e) => AppError::Io(e),
        }
    }
}

/// Convert reqwest errors to app errors
impl From<reqwest::Error> for AppError {
    fn from(error: reqwest::Error) -> Self {
        AppError::Http(error.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_error_display() {
        let err = AppError::DistroNotFound("Ubuntu".into());
        assert_eq!(err.to_string(), "Distribution not found: Ubuntu");
    }

    #[test]
    fn test_app_error_to_string() {
        let err = AppError::WslCommand("timeout".into());
        let s: String = err.into();
        assert_eq!(s, "WSL command failed: timeout");
    }

    #[test]
    fn test_action_not_applicable() {
        let err = AppError::ActionNotApplicable {
            action: "update".into(),
            distro: "Alpine".into(),
        };
        assert_eq!(
            err.to_string(),
            "Action 'update' does not apply to distribution 'Alpine'"
        );
    }

    #[test]
    fn test_io_error_conversion() {
        let io_err = std::io::Error::new(std::io::ErrorKind::NotFound, "file missing");
        let app_err: AppError = io_err.into();
        assert!(app_err.to_string().contains("file missing"));
    }

    #[test]
    fn test_wsl_error_conversion() {
        use crate::wsl::WslError;

        let wsl_err = WslError::CommandFailed("timeout".to_string());
        let app_err: AppError = wsl_err.into();
        assert_eq!(app_err.to_string(), "WSL command failed: timeout");

        let wsl_err = WslError::DistroNotFound("Ubuntu".to_string());
        let app_err: AppError = wsl_err.into();
        assert_eq!(app_err.to_string(), "Distribution not found: Ubuntu");
    }

    #[test]
    fn test_validation_error_conversion() {
        use crate::validation::ValidationError;

        let val_err = ValidationError::InvalidDistroName("test".to_string());
        let app_err: AppError = val_err.into();
        assert!(app_err.to_string().contains("Validation failed"));
    }

    #[test]
    fn test_error_to_string_conversion() {
        let err = AppError::WslCommand("test error".to_string());
        let err_string: String = err.into();
        assert_eq!(err_string, "WSL command failed: test error");
    }

    #[test]
    fn test_download_errors() {
        let err = AppError::DownloadFailed("connection timeout".to_string());
        assert_eq!(err.to_string(), "Download failed: connection timeout");

        let err = AppError::NetworkError("DNS resolution failed".to_string());
        assert_eq!(err.to_string(), "Network error: DNS resolution failed");
    }
}
