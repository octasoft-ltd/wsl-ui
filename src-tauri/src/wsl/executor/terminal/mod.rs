//! Terminal Executor - Anti-Corruption Layer for external Windows process execution
//!
//! This module abstracts launching external Windows applications and commands:
//! - Terminals (Windows Terminal, cmd)
//! - File Explorer
//! - IDEs (VS Code, Cursor)
//! - Downloads (curl)
//! - Container runtimes (podman, docker)

mod mock;
mod real;

pub use mock::MockTerminalExecutor;
pub use real::RealTerminalExecutor;

use std::collections::HashMap;
use crate::wsl::types::WslError;

/// Available container runtime
#[derive(Debug, Clone, PartialEq)]
pub enum ContainerRuntime {
    Podman,
    Docker,
    None,
}

/// Information about an installed Windows Store terminal
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledTerminal {
    /// Terminal variant identifier (e.g., "wt", "wt-preview")
    pub id: String,
    /// Display name for the terminal
    pub name: String,
    /// Windows Store PackageFamilyName (e.g., "Microsoft.WindowsTerminal_8wekyb3d8bbwe")
    pub package_family_name: String,
    /// Whether this terminal is installed
    pub installed: bool,
}

/// Abstraction over external Windows process execution.
pub trait TerminalExecutor: Send + Sync {
    // === Terminal Detection ===

    /// Detect installed Windows Store terminal applications
    /// Returns a map of terminal ID ("wt", "wt-preview") to InstalledTerminal info
    fn detect_store_terminals(&self) -> HashMap<String, InstalledTerminal>;

    // === Interactive Application Launching ===

    /// Open a terminal connected to a WSL distribution
    /// If `id` is provided, uses `--distribution-id` for more reliable identification
    fn open_terminal(&self, distro: &str, id: Option<&str>, terminal_command: &str) -> Result<(), WslError>;

    /// Open a terminal and execute a command in a WSL distribution
    /// The terminal stays open after the command completes so user can see output
    /// If `id` is provided, uses `--distribution-id` for more reliable identification
    fn open_terminal_with_command(&self, distro: &str, id: Option<&str>, command: &str, terminal_command: &str) -> Result<(), WslError>;

    /// Open a terminal connected to the WSL2 system distro (CBL-Mariner/Azure Linux)
    /// Uses `wsl --system` to access the hidden system distribution
    fn open_system_terminal(&self, terminal_command: &str) -> Result<(), WslError>;

    /// Open File Explorer in the distribution's root filesystem
    fn open_file_explorer(&self, distro: &str) -> Result<(), WslError>;

    /// Open an IDE connected to the distribution
    fn open_ide(&self, distro: &str, ide_command: &str) -> Result<(), WslError>;

    // === Container Runtime Operations ===

    /// Check which container runtime is available (podman preferred over docker)
    fn detect_container_runtime(&self) -> ContainerRuntime;

    /// Pull a container image
    fn container_pull(&self, runtime: &str, image: &str) -> Result<(), WslError>;

    /// Create a container from an image, returns container ID
    fn container_create(&self, runtime: &str, image: &str) -> Result<String, WslError>;

    /// Export a container to a tar file
    fn container_export(&self, runtime: &str, container_id: &str, dest: &str) -> Result<(), WslError>;

    /// Remove a container
    fn container_rm(&self, runtime: &str, container_id: &str) -> Result<(), WslError>;
}
