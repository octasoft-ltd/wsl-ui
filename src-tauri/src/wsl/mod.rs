//! WSL management module
//!
//! This module provides functionality for managing Windows Subsystem for Linux
//! (WSL) distributions, including:
//! - Core operations: list, start, stop, delete, restart, update
//! - Terminal and IDE integration
//! - Import/export operations
//! - Distribution installation
//! - Disk and OS information
//! - Resource monitoring
//! - Version information

mod core;
pub mod executor;
mod import_export;
mod info;
mod install;
pub mod resources;
mod service;
mod terminal;
mod types;

// Re-export types
pub use types::{CompactResult, Distribution, DistroState, WslError, MountedDisk, MountDiskOptions, PhysicalDisk, WslPreflightStatus};

// Re-export resource types
pub use resources::{DistroResourceUsage, WslResourceUsage};

// Re-export version and system info types
pub use info::{SystemDistroInfo, VhdSizeInfo, WslVersionInfo};

// Re-export terminal types
pub use executor::terminal::InstalledTerminal;

// Re-export service for backward compatibility
pub use service::WslService;

// Re-export mock functions for E2E testing (from executor module)
pub use executor::{
    reset_mock_state, set_mock_error, clear_mock_errors, MockErrorType,
    set_stubborn_shutdown, was_force_shutdown_used,
    set_mock_update_result, MockUpdateResult
};
