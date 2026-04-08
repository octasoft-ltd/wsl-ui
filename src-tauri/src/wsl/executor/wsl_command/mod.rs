//! WSL Command Executor - Anti-Corruption Layer for wsl.exe CLI
//!
//! This module provides an abstraction over the wsl.exe CLI interface.
//! All WSL command invocations go through the `WslCommandExecutor` trait,
//! allowing for easy mocking and protecting against CLI changes.

pub mod mock;
mod real;

pub use mock::MockWslExecutor;
pub use mock::MockUpdateResult;
pub use real::RealWslExecutor;

use crate::wsl::types::{WslError, WslPreflightStatus};

/// Result type for command output
#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub stdout: String,
    pub stderr: String,
    pub success: bool,
}

/// Abstraction over WSL command execution.
/// This is the Anti-Corruption Layer protecting our code from wsl.exe CLI changes.
#[allow(dead_code)]
pub trait WslCommandExecutor: Send + Sync {
    // === List Operations ===

    /// Execute `wsl --list --verbose` and return raw output
    fn list_verbose(&self) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --list --online` and return raw output
    fn list_online(&self) -> Result<CommandOutput, WslError>;

    // === Lifecycle Operations ===

    /// Execute `wsl -d <distro>` or `wsl --distribution-id <id>` to start (runs default shell briefly)
    /// If `id` is provided, uses `--distribution-id` for more reliable identification
    fn start(&self, distro: &str, id: Option<&str>) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --terminate <distro>`
    fn terminate(&self, distro: &str) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --shutdown`
    fn shutdown(&self) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --shutdown --force`
    fn shutdown_force(&self) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --unregister <distro>`
    fn unregister(&self, distro: &str) -> Result<CommandOutput, WslError>;

    // === Installation Operations ===

    /// Execute `wsl --install <distro>` with optional name, location, and no-launch flag
    fn install(&self, distro: &str, name: Option<&str>, location: Option<&str>, no_launch: bool) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --import <name> <location> <tarball>` with optional version
    fn import(&self, name: &str, location: &str, tarball: &str, version: Option<u8>) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --export <distro> <file>` with optional format
    fn export(&self, distro: &str, file: &str, format: Option<&str>) -> Result<CommandOutput, WslError>;

    // === Configuration Operations ===

    /// Execute `wsl --set-default <distro>`
    fn set_default(&self, distro: &str) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --set-version <distro> <version>`
    fn set_version(&self, distro: &str, version: u8) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --manage <distro> --set-sparse <true|false> --allow-unsafe`
    fn set_sparse(&self, distro: &str, enabled: bool) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --manage <distro> --move <location>`
    fn move_distro(&self, distro: &str, location: &str) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --manage <distro> --resize <size>`
    fn resize(&self, distro: &str, size: &str) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --manage <distro> --set-default-user <username>`
    fn set_default_user(&self, distro: &str, username: &str) -> Result<CommandOutput, WslError>;

    // === Disk Operations ===

    /// Execute `wsl --mount` with various options
    fn mount_disk(&self, disk: &str, vhd: bool, bare: bool, name: Option<&str>,
                  fs_type: Option<&str>, options: Option<&str>, partition: Option<u32>) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --unmount [disk]`
    fn unmount_disk(&self, disk: Option<&str>) -> Result<CommandOutput, WslError>;

    // === Info Operations ===

    /// Execute `wsl --version` and return raw output
    fn version(&self) -> Result<CommandOutput, WslError>;

    /// Execute `wsl --status` and return raw output
    fn status(&self) -> Result<CommandOutput, WslError>;

    // === Update Operations ===

    /// Execute `wsl --update` with optional --pre-release
    /// current_version is used for before/after comparison message
    fn update(&self, pre_release: bool, current_version: Option<&str>) -> Result<CommandOutput, WslError>;

    // === Command Execution in Distro ===

    /// Execute a command inside a distribution with default timeout.
    /// Command is wrapped in `sh -c` for proper shell interpretation.
    /// If `id` is provided, uses `wsl --distribution-id <id>`, otherwise `wsl -d <distro>`
    fn exec(&self, distro: &str, id: Option<&str>, command: &str) -> Result<CommandOutput, WslError>;

    /// Execute a command with custom timeout.
    /// Command is wrapped in `sh -c` for proper shell interpretation.
    /// If `id` is provided, uses `wsl --distribution-id <id>`, otherwise `wsl -d <distro>`
    fn exec_with_timeout(&self, distro: &str, id: Option<&str>, command: &str, timeout_secs: u64) -> Result<CommandOutput, WslError>;

    /// Execute a command inside a distribution as root user.
    /// Uses `wsl -u root` to run commands with root privileges.
    /// Useful for writing to system files like /etc/wsl.conf
    fn exec_as_root(&self, distro: &str, id: Option<&str>, command: &str) -> Result<CommandOutput, WslError>;

    /// Get WSL2 network IP address
    /// Uses system distro with `ip route` for reliable IP detection
    fn get_ip(&self) -> Result<CommandOutput, WslError>;

    // === System Distro Operations ===

    /// Execute a command in the WSL2 system distro (CBL-Mariner/Azure Linux)
    /// Uses `wsl --system -- <command>` to run in the always-available system distro.
    /// This is useful for VM-wide operations that don't depend on user distros.
    fn exec_system(&self, command: &str) -> Result<CommandOutput, WslError>;

    /// Execute a command in the system distro with custom timeout
    fn exec_system_with_timeout(&self, command: &str, timeout_secs: u64) -> Result<CommandOutput, WslError>;

    // === Preflight Check ===

    /// Check if WSL is installed and ready to use
    /// This is a quick check that verifies:
    /// 1. The wsl.exe executable exists at the configured path
    /// 2. Running `wsl --status` succeeds
    /// Returns a WslPreflightStatus indicating readiness or specific error
    fn check_preflight(&self) -> WslPreflightStatus;
}
