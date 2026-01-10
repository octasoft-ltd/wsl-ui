//! Terminal and IDE integration for WSL distributions
//!
//! Functions for opening terminals, file explorer, and IDEs connected
//! to WSL distributions.
//!
//! This module delegates to the terminal executor, which provides
//! real or mock implementations based on the runtime mode.

use super::executor::terminal_executor;
use super::types::WslError;

/// Open terminal in a distribution
/// If `id` is provided, uses `--distribution-id` for more reliable identification
pub fn open_terminal(name: &str, id: Option<&str>, terminal_command: &str) -> Result<(), WslError> {
    terminal_executor().open_terminal(name, id, terminal_command)
}

/// Open terminal connected to the WSL2 system distro (CBL-Mariner/Azure Linux)
pub fn open_system_terminal(terminal_command: &str) -> Result<(), WslError> {
    terminal_executor().open_system_terminal(terminal_command)
}

/// Open terminal and execute a command in a distribution
/// The terminal stays open after the command completes so user can see output
/// If `id` is provided, uses `--distribution-id` for more reliable identification
pub fn open_terminal_with_command(name: &str, id: Option<&str>, command: &str, terminal_command: &str) -> Result<(), WslError> {
    terminal_executor().open_terminal_with_command(name, id, command, terminal_command)
}

/// Open File Explorer in the distribution's root
pub fn open_file_explorer(name: &str) -> Result<(), WslError> {
    terminal_executor().open_file_explorer(name)
}

/// Open IDE connected to the distribution
pub fn open_ide(name: &str, ide_command: &str) -> Result<(), WslError> {
    terminal_executor().open_ide(name, ide_command)
}


