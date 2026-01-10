//! Mock terminal executor for testing
//!
//! Simulates terminal/IDE/explorer/download/container operations with configurable delays.

use std::collections::HashMap;
use std::time::Duration;
use log::debug;

use super::{ContainerRuntime, InstalledTerminal, TerminalExecutor};
use crate::wsl::types::WslError;

/// Mock implementation that simulates terminal operations
pub struct MockTerminalExecutor;

impl MockTerminalExecutor {
    pub fn new() -> Self {
        Self
    }

    fn simulate_delay(&self, ms: u64) {
        std::thread::sleep(Duration::from_millis(ms));
    }
}

impl Default for MockTerminalExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalExecutor for MockTerminalExecutor {
    fn detect_store_terminals(&self) -> HashMap<String, InstalledTerminal> {
        debug!("Mock: detect_store_terminals");
        // Return mock data simulating both terminals installed
        let mut terminals = HashMap::new();
        terminals.insert("wt".to_string(), InstalledTerminal {
            id: "wt".to_string(),
            name: "Windows Terminal".to_string(),
            package_family_name: "Microsoft.WindowsTerminal_8wekyb3d8bbwe".to_string(),
            installed: true,
        });
        terminals.insert("wt-preview".to_string(), InstalledTerminal {
            id: "wt-preview".to_string(),
            name: "Windows Terminal Preview".to_string(),
            package_family_name: "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe".to_string(),
            installed: true,
        });
        terminals
    }

    fn open_terminal(&self, distro: &str, id: Option<&str>, terminal_command: &str) -> Result<(), WslError> {
        debug!("Mock: open_terminal distro='{}' id={:?} command='{}'", distro, id, terminal_command);
        self.simulate_delay(100);
        Ok(())
    }

    fn open_terminal_with_command(&self, distro: &str, id: Option<&str>, command: &str, terminal_command: &str) -> Result<(), WslError> {
        debug!("Mock: open_terminal_with_command distro='{}' id={:?} command='{}' terminal='{}'", distro, id, command, terminal_command);
        self.simulate_delay(100);
        Ok(())
    }

    fn open_system_terminal(&self, terminal_command: &str) -> Result<(), WslError> {
        debug!("Mock: open_system_terminal command='{}'", terminal_command);
        self.simulate_delay(100);
        Ok(())
    }

    fn open_file_explorer(&self, distro: &str) -> Result<(), WslError> {
        debug!("Mock: open_file_explorer distro='{}'", distro);
        self.simulate_delay(100);
        Ok(())
    }

    fn open_ide(&self, distro: &str, ide_command: &str) -> Result<(), WslError> {
        debug!("Mock: open_ide distro='{}' ide='{}'", distro, ide_command);
        self.simulate_delay(100);
        Ok(())
    }

    fn detect_container_runtime(&self) -> ContainerRuntime {
        debug!("Mock: detect_container_runtime");
        // Mock always returns Podman as available
        ContainerRuntime::Podman
    }

    fn container_pull(&self, runtime: &str, image: &str) -> Result<(), WslError> {
        debug!("Mock: container_pull runtime='{}' image='{}'", runtime, image);
        self.simulate_delay(500);
        Ok(())
    }

    fn container_create(&self, runtime: &str, image: &str) -> Result<String, WslError> {
        debug!("Mock: container_create runtime='{}' image='{}'", runtime, image);
        self.simulate_delay(200);
        // Return a mock container ID
        Ok("mock-container-12345".to_string())
    }

    fn container_export(&self, runtime: &str, container_id: &str, dest: &str) -> Result<(), WslError> {
        debug!("Mock: container_export runtime='{}' container='{}' dest='{}'", runtime, container_id, dest);
        self.simulate_delay(500);
        Ok(())
    }

    fn container_rm(&self, runtime: &str, container_id: &str) -> Result<(), WslError> {
        debug!("Mock: container_rm runtime='{}' container='{}'", runtime, container_id);
        self.simulate_delay(100);
        Ok(())
    }
}
