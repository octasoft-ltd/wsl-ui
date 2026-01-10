use serde::{Deserialize, Serialize};
use thiserror::Error;

/// Represents a WSL distribution
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Distribution {
    /// Distribution ID (GUID from Windows Registry)
    /// This is the canonical identifier used by WSL internally
    pub id: Option<String>,
    /// Name of the distribution (for display purposes)
    pub name: String,
    /// Current state (Running, Stopped, etc.)
    pub state: DistroState,
    /// WSL version (1 or 2)
    pub version: u8,
    /// Whether this is the default distribution
    pub is_default: bool,
}

/// Possible states of a WSL distribution
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum DistroState {
    Running,
    Stopped,
    Installing,
    Unknown,
}

impl From<&str> for DistroState {
    fn from(s: &str) -> Self {
        match s.trim().to_lowercase().as_str() {
            "running" => DistroState::Running,
            "stopped" => DistroState::Stopped,
            "installing" => DistroState::Installing,
            _ => DistroState::Unknown,
        }
    }
}

impl std::fmt::Display for DistroState {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DistroState::Running => write!(f, "Running"),
            DistroState::Stopped => write!(f, "Stopped"),
            DistroState::Installing => write!(f, "Installing"),
            DistroState::Unknown => write!(f, "Unknown"),
        }
    }
}

/// Errors that can occur during WSL operations
#[derive(Debug, Error)]
pub enum WslError {
    #[error("Failed to execute WSL command: {0}")]
    CommandFailed(String),

    #[error("Failed to parse WSL output: {0}")]
    ParseError(String),

    #[error("Distribution not found: {0}")]
    DistroNotFound(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),
}

impl From<WslError> for String {
    fn from(error: WslError) -> Self {
        error.to_string()
    }
}

