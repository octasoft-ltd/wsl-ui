//! WSL Executor Module - Anti-Corruption Layer
//!
//! This module provides abstractions over external system interfaces:
//! - `wsl_command`: WSL CLI (wsl.exe) operations
//! - `terminal`: Terminal, File Explorer, and IDE launching
//! - `resource`: System resource monitoring (memory, CPU)
//!
//! Each submodule has Real and Mock implementations, allowing for
//! easy testing and protecting against external interface changes.

pub mod resource;
pub mod terminal;
pub mod wsl_command;

// Re-export types for convenience
pub use resource::{DistroResourceUsage, ResourceMonitor, WslHealth};
pub use terminal::TerminalExecutor;
pub use wsl_command::{MockWslExecutor, WslCommandExecutor};

// Re-export mock types for E2E testing API
pub use wsl_command::mock::MockErrorType;
pub use wsl_command::MockUpdateResult;

use std::sync::{Arc, OnceLock};

use resource::{MockResourceMonitor, RealResourceMonitor};
use terminal::{MockTerminalExecutor, RealTerminalExecutor};
use wsl_command::RealWslExecutor;

// Global executor instances - initialized based on mock mode
static WSL_EXECUTOR: OnceLock<Arc<dyn WslCommandExecutor>> = OnceLock::new();
static TERMINAL_EXECUTOR: OnceLock<Arc<dyn TerminalExecutor>> = OnceLock::new();
static RESOURCE_MONITOR: OnceLock<Arc<dyn ResourceMonitor>> = OnceLock::new();

// Keep reference to mock executors for test configuration
static MOCK_WSL_EXECUTOR: OnceLock<Arc<MockWslExecutor>> = OnceLock::new();

/// Initialize all executors based on mock mode
fn init_executors() {
    if crate::utils::is_mock_mode() {
        log::info!("Initializing mock executors");

        // Create WSL mock executor
        let wsl_mock = Arc::new(MockWslExecutor::new());
        MOCK_WSL_EXECUTOR.get_or_init(|| wsl_mock.clone());
        WSL_EXECUTOR.get_or_init(|| wsl_mock.clone() as Arc<dyn WslCommandExecutor>);

        // Create terminal mock executor
        TERMINAL_EXECUTOR.get_or_init(|| Arc::new(MockTerminalExecutor::new()) as Arc<dyn TerminalExecutor>);

        // Create resource mock executor with reference to WSL mock for state consistency
        let resource_mock = MockResourceMonitor::with_wsl_mock(wsl_mock);
        RESOURCE_MONITOR.get_or_init(|| Arc::new(resource_mock) as Arc<dyn ResourceMonitor>);
    } else {
        log::info!("Initializing real executors");

        WSL_EXECUTOR.get_or_init(|| Arc::new(RealWslExecutor::new()) as Arc<dyn WslCommandExecutor>);
        TERMINAL_EXECUTOR.get_or_init(|| Arc::new(RealTerminalExecutor::new()) as Arc<dyn TerminalExecutor>);
        RESOURCE_MONITOR.get_or_init(|| Arc::new(RealResourceMonitor::new()) as Arc<dyn ResourceMonitor>);
    }
}

/// Get the global WSL command executor
pub fn wsl_executor() -> &'static dyn WslCommandExecutor {
    // Initialize all executors if not already done
    // Note: We can't call init_executors() inside get_or_init because
    // init_executors also calls get_or_init on the same OnceLock, causing deadlock
    if WSL_EXECUTOR.get().is_none() {
        init_executors();
    }
    WSL_EXECUTOR.get().expect("WSL_EXECUTOR should be initialized by init_executors").as_ref()
}

/// Get the global terminal executor
pub fn terminal_executor() -> &'static dyn TerminalExecutor {
    if TERMINAL_EXECUTOR.get().is_none() {
        init_executors();
    }
    TERMINAL_EXECUTOR.get().expect("TERMINAL_EXECUTOR should be initialized by init_executors").as_ref()
}

/// Get the global resource monitor
pub fn resource_monitor() -> &'static dyn ResourceMonitor {
    if RESOURCE_MONITOR.get().is_none() {
        init_executors();
    }
    RESOURCE_MONITOR.get().expect("RESOURCE_MONITOR should be initialized by init_executors").as_ref()
}

/// Get the mock WSL executor for test configuration (only works in mock mode)
pub fn mock_wsl_executor() -> Option<&'static MockWslExecutor> {
    // Ensure executors are initialized first
    let _ = wsl_executor();
    MOCK_WSL_EXECUTOR.get().map(|arc| arc.as_ref())
}

// === E2E Testing API ===
// These functions provide a simple API for E2E tests to configure mock behavior

/// Configure an operation to simulate an error
/// Maps user-friendly operation names to internal WSL operation names:
/// - "delete" -> "unregister"
/// - "stop" -> "terminate"
pub fn set_mock_error(operation: &str, error_type: MockErrorType, delay_ms: u64) {
    if let Some(mock) = mock_wsl_executor() {
        // Map user-friendly names to internal WSL operation names
        let internal_operation = match operation {
            "delete" => "unregister",
            "stop" => "terminate",
            _ => operation,
        };
        mock.set_error(internal_operation, error_type);
        if delay_ms > 0 {
            mock.set_error_delay(delay_ms);
        }
    }
}

/// Clear all error simulation configuration
pub fn clear_mock_errors() {
    if let Some(mock) = mock_wsl_executor() {
        mock.clear_errors();
    }
}

/// Configure whether to simulate stubborn distributions that don't stop on graceful shutdown
pub fn set_stubborn_shutdown(enabled: bool) {
    if let Some(mock) = mock_wsl_executor() {
        mock.set_stubborn_shutdown(enabled);
    }
}

/// Check if force shutdown was used (for test verification)
pub fn was_force_shutdown_used() -> bool {
    mock_wsl_executor().map(|m| m.was_force_used()).unwrap_or(false)
}

/// Reset mock state to default values (for E2E testing)
pub fn reset_mock_state() {
    if let Some(mock) = mock_wsl_executor() {
        mock.reset();
    }
}

/// Set the mock update result (for E2E testing)
pub fn set_mock_update_result(result: MockUpdateResult) {
    if let Some(mock) = mock_wsl_executor() {
        mock.set_update_result(result);
    }
}
