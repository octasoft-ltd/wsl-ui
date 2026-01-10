//! Mock WSL command executor for testing
//!
//! Returns realistic CLI output strings that match wsl.exe format,
//! allowing parsing logic to be tested.

use std::collections::HashMap;
use std::sync::Mutex;
use std::time::Duration;
use log::debug;

use super::{CommandOutput, WslCommandExecutor};
use crate::wsl::types::{WslError, WslPreflightStatus};

/// Distribution state for mock
#[derive(Debug, Clone, PartialEq)]
pub enum MockDistroState {
    Running,
    Stopped,
}

/// Mock distribution data
#[derive(Debug, Clone)]
pub struct MockDistro {
    pub name: String,
    pub state: MockDistroState,
    pub version: u8,
    pub is_default: bool,
}

/// Error simulation configuration
#[derive(Debug, Clone, Default)]
pub struct ErrorConfig {
    pub operation_errors: HashMap<String, MockErrorType>,
    pub delay_ms: u64,
}

/// Types of errors that can be simulated
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum MockErrorType {
    Timeout,
    CommandFailed,
    DistroNotFound,
    Cancelled, // User cancelled operation (e.g., UAC dialog)
}

/// Update operation result types
#[derive(Debug, Clone, PartialEq, Default)]
pub enum MockUpdateResult {
    #[default]
    AlreadyUpToDate,
    Updated { old_version: String, new_version: String },
}

/// Force kill simulation config
#[derive(Debug, Clone, Default)]
pub struct ForceKillConfig {
    pub simulate_stubborn: bool,
    pub force_was_used: bool,
}

/// Internal mock state
#[derive(Debug)]
pub struct MockState {
    pub distributions: Vec<MockDistro>,
    pub error_config: ErrorConfig,
    pub force_kill_config: ForceKillConfig,
    pub update_result: MockUpdateResult,
}

impl Default for MockState {
    fn default() -> Self {
        Self {
            distributions: vec![
                // WSL 2 - Running - Store install (default)
                MockDistro {
                    name: "Ubuntu".to_string(),
                    state: MockDistroState::Running,
                    version: 2,
                    is_default: true,
                },
                // WSL 2 - Stopped - LXC install
                MockDistro {
                    name: "Debian".to_string(),
                    state: MockDistroState::Stopped,
                    version: 2,
                    is_default: false,
                },
                // WSL 2 - Stopped - Container install
                MockDistro {
                    name: "Alpine".to_string(),
                    state: MockDistroState::Stopped,
                    version: 2,
                    is_default: false,
                },
                // WSL 2 - Running - Download install
                MockDistro {
                    name: "Ubuntu-22.04".to_string(),
                    state: MockDistroState::Running,
                    version: 2,
                    is_default: false,
                },
                // WSL 2 - Stopped - Import
                MockDistro {
                    name: "Fedora".to_string(),
                    state: MockDistroState::Stopped,
                    version: 2,
                    is_default: false,
                },
                // WSL 1 - Stopped - Clone
                MockDistro {
                    name: "Ubuntu-legacy".to_string(),
                    state: MockDistroState::Stopped,
                    version: 1,
                    is_default: false,
                },
                // WSL 1 - Running - Unknown source
                MockDistro {
                    name: "Arch".to_string(),
                    state: MockDistroState::Running,
                    version: 1,
                    is_default: false,
                },
            ],
            error_config: ErrorConfig::default(),
            force_kill_config: ForceKillConfig::default(),
            update_result: MockUpdateResult::default(),
        }
    }
}

/// Mock WSL executor that returns realistic CLI output
pub struct MockWslExecutor {
    state: Mutex<MockState>,
}

impl MockWslExecutor {
    pub fn new() -> Self {
        Self {
            state: Mutex::new(MockState::default()),
        }
    }

    /// Reset mock state to defaults
    pub fn reset(&self) {
        let mut state = self.state.lock().unwrap();
        *state = MockState::default();
    }

    /// Configure an error for an operation
    pub fn set_error(&self, operation: &str, error: MockErrorType) {
        let mut state = self.state.lock().unwrap();
        state.error_config.operation_errors.insert(operation.to_string(), error);
    }

    /// Set error delay
    pub fn set_error_delay(&self, delay_ms: u64) {
        let mut state = self.state.lock().unwrap();
        state.error_config.delay_ms = delay_ms;
    }

    /// Clear all error configurations
    pub fn clear_errors(&self) {
        let mut state = self.state.lock().unwrap();
        state.error_config = ErrorConfig::default();
    }

    /// Set stubborn shutdown mode
    pub fn set_stubborn_shutdown(&self, enabled: bool) {
        let mut state = self.state.lock().unwrap();
        state.force_kill_config.simulate_stubborn = enabled;
        state.force_kill_config.force_was_used = false;
    }

    /// Set the update result for mock
    pub fn set_update_result(&self, result: MockUpdateResult) {
        let mut state = self.state.lock().unwrap();
        state.update_result = result;
    }

    /// Check if force shutdown was used
    pub fn was_force_used(&self) -> bool {
        let state = self.state.lock().unwrap();
        state.force_kill_config.force_was_used
    }

    /// Check if a distribution exists
    pub fn distro_exists(&self, name: &str) -> bool {
        let state = self.state.lock().unwrap();
        state.distributions.iter().any(|d| d.name == name)
    }

    /// Check if a distribution is running
    pub fn distro_is_running(&self, name: &str) -> bool {
        let state = self.state.lock().unwrap();
        state.distributions.iter()
            .find(|d| d.name == name)
            .map(|d| d.state == MockDistroState::Running)
            .unwrap_or(false)
    }

    /// Get all distribution names
    pub fn get_distro_names(&self) -> Vec<String> {
        let state = self.state.lock().unwrap();
        state.distributions.iter().map(|d| d.name.clone()).collect()
    }

    /// Rename a distribution in the mock state
    /// Returns the old name if successful, or an error if the distribution is not found or is running
    pub fn rename_distro(&self, id: &str, new_name: &str) -> Result<String, WslError> {
        debug!("Mock: rename_distro id='{}' new_name='{}'", id, new_name);
        self.simulate_delay(200);

        let mut state = self.state.lock().unwrap();

        // Find distro by ID (mock uses index-based IDs)
        // Parse the mock GUID format: {mock-guid-XXXX-0000-0000-000000000XXX}
        // Extract the first 4-digit number after "{mock-guid-"
        let index = if id.starts_with("{mock-guid-") {
            id.strip_prefix("{mock-guid-")
                .and_then(|s| s.get(0..4))
                .and_then(|s| s.parse::<usize>().ok())
        } else {
            None
        };

        // Also try to find by name if ID parsing fails
        let distro = if let Some(idx) = index {
            state.distributions.get_mut(idx)
        } else {
            state.distributions.iter_mut().find(|d| d.name == id)
        };

        match distro {
            Some(d) => {
                if d.state == MockDistroState::Running {
                    return Err(WslError::CommandFailed(
                        "Distribution must be stopped before renaming".to_string()
                    ));
                }
                let old_name = d.name.clone();
                d.name = new_name.to_string();
                Ok(old_name)
            }
            None => Err(WslError::DistroNotFound(id.to_string()))
        }
    }

    /// Check for simulated error
    fn check_error(&self, operation: &str) -> Option<WslError> {
        let state = self.state.lock().unwrap();
        if let Some(error_type) = state.error_config.operation_errors.get(operation) {
            let delay = state.error_config.delay_ms;
            let error = match error_type {
                MockErrorType::Timeout => WslError::Timeout(format!("{} timed out (simulated)", operation)),
                MockErrorType::CommandFailed => WslError::CommandFailed(format!("{} failed (simulated)", operation)),
                MockErrorType::DistroNotFound => WslError::DistroNotFound("SimulatedNotFound".to_string()),
                MockErrorType::Cancelled => WslError::CommandFailed("Update cancelled - administrator approval was not granted".to_string()),
            };
            drop(state);
            if delay > 0 {
                std::thread::sleep(Duration::from_millis(delay));
            }
            return Some(error);
        }
        None
    }

    /// Simulate a short delay
    fn simulate_delay(&self, ms: u64) {
        std::thread::sleep(Duration::from_millis(ms));
    }

    /// Build list output matching wsl.exe format
    fn build_list_output(&self) -> String {
        let state = self.state.lock().unwrap();
        let mut output = String::from("  NAME                   STATE           VERSION\n");
        for distro in &state.distributions {
            let marker = if distro.is_default { "* " } else { "  " };
            let state_str = match distro.state {
                MockDistroState::Running => "Running",
                MockDistroState::Stopped => "Stopped",
            };
            output.push_str(&format!(
                "{}{:<22} {:<15} {}\n",
                marker, distro.name, state_str, distro.version
            ));
        }
        output
    }
}

impl Default for MockWslExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl WslCommandExecutor for MockWslExecutor {
    fn list_verbose(&self) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("list") {
            return Err(err);
        }
        debug!("Mock: list_verbose");
        self.simulate_delay(100);
        Ok(CommandOutput {
            stdout: self.build_list_output(),
            stderr: String::new(),
            success: true,
        })
    }

    fn list_online(&self) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("list_online") {
            return Err(err);
        }
        debug!("Mock: list_online");
        self.simulate_delay(200);
        // Realistic wsl --list --online output
        let output = r#"The following is a list of valid distributions that can be installed.
Install using 'wsl.exe --install <Distro>'.

NAME                                   FRIENDLY NAME
Ubuntu                                 Ubuntu
Debian                                 Debian GNU/Linux
kali-linux                             Kali Linux Rolling
Ubuntu-18.04                           Ubuntu 18.04 LTS
Ubuntu-20.04                           Ubuntu 20.04 LTS
Ubuntu-22.04                           Ubuntu 22.04 LTS
Ubuntu-24.04                           Ubuntu 24.04 LTS
OracleLinux_7_9                        Oracle Linux 7.9
OracleLinux_8_7                        Oracle Linux 8.7
OracleLinux_9_1                        Oracle Linux 9.1
openSUSE-Leap-15.6                     openSUSE Leap 15.6
SUSE-Linux-Enterprise-15-SP5           SUSE Linux Enterprise 15 SP5
openSUSE-Tumbleweed                    openSUSE Tumbleweed
"#;
        Ok(CommandOutput {
            stdout: output.to_string(),
            stderr: String::new(),
            success: true,
        })
    }

    fn start(&self, distro: &str, id: Option<&str>) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("start") {
            return Err(err);
        }
        debug!("Mock: start distro='{}' id={:?}", distro, id);
        self.simulate_delay(500);

        let mut state = self.state.lock().unwrap();
        if let Some(d) = state.distributions.iter_mut().find(|d| d.name == distro) {
            d.state = MockDistroState::Running;
            Ok(CommandOutput {
                stdout: "started\n".to_string(),
                stderr: String::new(),
                success: true,
            })
        } else {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: format!("There is no distribution with the supplied name.\n"),
                success: false,
            })
        }
    }

    fn terminate(&self, distro: &str) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("terminate") {
            return Err(err);
        }
        debug!("Mock: terminate distro='{}'", distro);
        self.simulate_delay(300);

        let mut state = self.state.lock().unwrap();
        if let Some(d) = state.distributions.iter_mut().find(|d| d.name == distro) {
            d.state = MockDistroState::Stopped;
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: String::new(),
                success: true,
            })
        } else {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: format!("There is no distribution with the supplied name.\n"),
                success: false,
            })
        }
    }

    fn shutdown(&self) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("shutdown") {
            return Err(err);
        }
        debug!("Mock: shutdown");
        self.simulate_delay(500);

        let mut state = self.state.lock().unwrap();
        let simulate_stubborn = state.force_kill_config.simulate_stubborn;

        if simulate_stubborn {
            // Only stop some distros - leave Ubuntu running
            for distro in &mut state.distributions {
                if distro.name != "Ubuntu" {
                    distro.state = MockDistroState::Stopped;
                }
            }
        } else {
            for distro in &mut state.distributions {
                distro.state = MockDistroState::Stopped;
            }
        }

        Ok(CommandOutput {
            stdout: String::new(),
            stderr: String::new(),
            success: true,
        })
    }

    fn shutdown_force(&self) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("shutdown_force") {
            return Err(err);
        }
        debug!("Mock: shutdown_force");
        self.simulate_delay(500);

        let mut state = self.state.lock().unwrap();
        state.force_kill_config.force_was_used = true;

        // Force stops everything
        for distro in &mut state.distributions {
            distro.state = MockDistroState::Stopped;
        }

        Ok(CommandOutput {
            stdout: String::new(),
            stderr: String::new(),
            success: true,
        })
    }

    fn unregister(&self, distro: &str) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("unregister") {
            return Err(err);
        }
        debug!("Mock: unregister distro='{}'", distro);
        self.simulate_delay(200);

        let mut state = self.state.lock().unwrap();
        let initial_len = state.distributions.len();
        state.distributions.retain(|d| d.name != distro);

        if state.distributions.len() < initial_len {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: String::new(),
                success: true,
            })
        } else {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: format!("There is no distribution with the supplied name.\n"),
                success: false,
            })
        }
    }

    fn install(&self, distro: &str, name: Option<&str>, _location: Option<&str>, _no_launch: bool) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("install") {
            return Err(err);
        }
        debug!("Mock: install distro='{}' name={:?}", distro, name);
        self.simulate_delay(2000);

        let mut state = self.state.lock().unwrap();
        let distro_name = name.unwrap_or(distro).to_string();
        state.distributions.push(MockDistro {
            name: distro_name,
            state: MockDistroState::Stopped,
            version: 2,
            is_default: false,
        });

        Ok(CommandOutput {
            stdout: format!("Installing: {}\nInstallation successful!\n", distro),
            stderr: String::new(),
            success: true,
        })
    }

    fn import(&self, name: &str, _location: &str, _tarball: &str, version: Option<u8>) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("import") {
            return Err(err);
        }
        debug!("Mock: import name='{}'", name);
        self.simulate_delay(2000);

        let mut state = self.state.lock().unwrap();
        state.distributions.push(MockDistro {
            name: name.to_string(),
            state: MockDistroState::Stopped,
            version: version.unwrap_or(2),
            is_default: false,
        });

        Ok(CommandOutput {
            stdout: String::new(),
            stderr: String::new(),
            success: true,
        })
    }

    fn export(&self, distro: &str, _file: &str, _format: Option<&str>) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("export") {
            return Err(err);
        }
        debug!("Mock: export distro='{}'", distro);
        self.simulate_delay(2000);

        let state = self.state.lock().unwrap();
        if state.distributions.iter().any(|d| d.name == distro) {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: String::new(),
                success: true,
            })
        } else {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: format!("There is no distribution with the supplied name.\n"),
                success: false,
            })
        }
    }

    fn set_default(&self, distro: &str) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("set_default") {
            return Err(err);
        }
        debug!("Mock: set_default distro='{}'", distro);
        self.simulate_delay(200);

        let mut state = self.state.lock().unwrap();
        let exists = state.distributions.iter().any(|d| d.name == distro);
        if exists {
            for d in &mut state.distributions {
                d.is_default = d.name == distro;
            }
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: String::new(),
                success: true,
            })
        } else {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: format!("There is no distribution with the supplied name.\n"),
                success: false,
            })
        }
    }

    fn set_version(&self, distro: &str, version: u8) -> Result<CommandOutput, WslError> {
        debug!("Mock: set_version distro='{}' version={}", distro, version);
        self.simulate_delay(1000);

        let mut state = self.state.lock().unwrap();
        if let Some(d) = state.distributions.iter_mut().find(|d| d.name == distro) {
            d.version = version;
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: String::new(),
                success: true,
            })
        } else {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: format!("There is no distribution with the supplied name.\n"),
                success: false,
            })
        }
    }

    fn set_sparse(&self, distro: &str, enabled: bool) -> Result<CommandOutput, WslError> {
        debug!("Mock: set_sparse distro='{}' enabled={}", distro, enabled);
        self.simulate_delay(500);

        let state = self.state.lock().unwrap();
        if state.distributions.iter().any(|d| d.name == distro) {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: String::new(),
                success: true,
            })
        } else {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: format!("There is no distribution with the supplied name.\n"),
                success: false,
            })
        }
    }

    fn move_distro(&self, distro: &str, _location: &str) -> Result<CommandOutput, WslError> {
        debug!("Mock: move_distro distro='{}'", distro);
        self.simulate_delay(2000);

        let state = self.state.lock().unwrap();
        if state.distributions.iter().any(|d| d.name == distro) {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: String::new(),
                success: true,
            })
        } else {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: format!("There is no distribution with the supplied name.\n"),
                success: false,
            })
        }
    }

    fn resize(&self, distro: &str, size: &str) -> Result<CommandOutput, WslError> {
        debug!("Mock: resize distro='{}' size='{}'", distro, size);
        self.simulate_delay(500);

        let state = self.state.lock().unwrap();
        if state.distributions.iter().any(|d| d.name == distro) {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: String::new(),
                success: true,
            })
        } else {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: format!("There is no distribution with the supplied name.\n"),
                success: false,
            })
        }
    }

    fn set_default_user(&self, distro: &str, username: &str) -> Result<CommandOutput, WslError> {
        debug!("Mock: set_default_user distro='{}' user='{}'", distro, username);
        self.simulate_delay(300);

        let state = self.state.lock().unwrap();
        if state.distributions.iter().any(|d| d.name == distro) {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: String::new(),
                success: true,
            })
        } else {
            Ok(CommandOutput {
                stdout: String::new(),
                stderr: format!("There is no distribution with the supplied name.\n"),
                success: false,
            })
        }
    }

    fn mount_disk(&self, disk: &str, _vhd: bool, _bare: bool, _name: Option<&str>,
                  _fs_type: Option<&str>, _options: Option<&str>, _partition: Option<u32>) -> Result<CommandOutput, WslError> {
        debug!("Mock: mount_disk disk='{}'", disk);
        self.simulate_delay(500);
        Ok(CommandOutput {
            stdout: String::new(),
            stderr: String::new(),
            success: true,
        })
    }

    fn unmount_disk(&self, disk: Option<&str>) -> Result<CommandOutput, WslError> {
        debug!("Mock: unmount_disk disk={:?}", disk);
        self.simulate_delay(300);
        Ok(CommandOutput {
            stdout: String::new(),
            stderr: String::new(),
            success: true,
        })
    }

    fn version(&self) -> Result<CommandOutput, WslError> {
        debug!("Mock: version");
        self.simulate_delay(100);
        // Realistic wsl --version output
        let output = r#"WSL version: 2.3.26.0
Kernel version: 5.15.167.4-1
WSLg version: 1.0.65
MSRDC version: 1.2.5620
Direct3D version: 1.611.1-81528511
DXCore version: 10.0.26100.1-240331-1435.ge-release
Windows version: 10.0.26100.2605
"#;
        Ok(CommandOutput {
            stdout: output.to_string(),
            stderr: String::new(),
            success: true,
        })
    }

    fn status(&self) -> Result<CommandOutput, WslError> {
        debug!("Mock: status");
        self.simulate_delay(100);
        let output = r#"Default Distribution: Ubuntu
Default Version: 2
"#;
        Ok(CommandOutput {
            stdout: output.to_string(),
            stderr: String::new(),
            success: true,
        })
    }

    fn update(&self, pre_release: bool, current_version: Option<&str>) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("update") {
            return Err(err);
        }
        debug!("Mock: update pre_release={} current_version={:?}", pre_release, current_version);
        self.simulate_delay(1000); // Reduced for faster tests

        let state = self.state.lock().unwrap();
        let pre_release_suffix = if pre_release { " (pre-release channel)" } else { "" };
        let message = match &state.update_result {
            MockUpdateResult::AlreadyUpToDate => {
                match current_version {
                    Some(ver) => format!("WSL is up to date (version {}){}", ver, pre_release_suffix),
                    None => format!("The most recent version of Windows Subsystem for Linux is already installed.{}", pre_release_suffix),
                }
            }
            MockUpdateResult::Updated { old_version, new_version } => {
                format!("WSL updated from {} to {}{}", old_version, new_version, pre_release_suffix)
            }
        };
        Ok(CommandOutput {
            stdout: message,
            stderr: String::new(),
            success: true,
        })
    }

    fn exec(&self, distro: &str, id: Option<&str>, command: &str) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("exec") {
            return Err(err);
        }
        debug!("Mock: exec distro='{}' id={:?} command='{}'", distro, id, command);
        self.simulate_delay(200);

        let state = self.state.lock().unwrap();
        if !state.distributions.iter().any(|d| d.name == distro) {
            return Ok(CommandOutput {
                stdout: String::new(),
                stderr: format!("There is no distribution with the supplied name.\n"),
                success: false,
            });
        }

        // Simulate some common commands
        let stdout = if command.contains("cat /etc/os-release") {
            match distro {
                d if d.contains("Ubuntu") => "PRETTY_NAME=\"Ubuntu 22.04.3 LTS\"\nNAME=\"Ubuntu\"\n".to_string(),
                d if d.contains("Debian") => "PRETTY_NAME=\"Debian GNU/Linux 12 (bookworm)\"\nNAME=\"Debian GNU/Linux\"\n".to_string(),
                d if d.contains("Alpine") => "PRETTY_NAME=\"Alpine Linux v3.18\"\nNAME=\"Alpine Linux\"\n".to_string(),
                _ => "PRETTY_NAME=\"Linux\"\nNAME=\"Linux\"\n".to_string(),
            }
        } else if command.contains("df") || command.contains("stat") {
            "1234567890\n".to_string()
        } else {
            String::new()
        };

        Ok(CommandOutput {
            stdout,
            stderr: String::new(),
            success: true,
        })
    }

    fn exec_with_timeout(&self, distro: &str, id: Option<&str>, command: &str, _timeout_secs: u64) -> Result<CommandOutput, WslError> {
        // Just delegate to exec for mock - timeout doesn't matter in tests
        self.exec(distro, id, command)
    }

    fn exec_as_root(&self, distro: &str, id: Option<&str>, command: &str) -> Result<CommandOutput, WslError> {
        // Just delegate to exec for mock - user doesn't matter in tests
        debug!("Mock: exec_as_root distro='{}' id={:?} command='{}'", distro, id, command);
        self.exec(distro, id, command)
    }

    fn get_ip(&self) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("get_ip") {
            return Err(err);
        }
        debug!("Mock: get_ip (via system distro)");
        Ok(CommandOutput {
            stdout: "172.25.160.1\n".to_string(),
            stderr: String::new(),
            success: true,
        })
    }

    fn exec_system(&self, command: &str) -> Result<CommandOutput, WslError> {
        self.exec_system_with_timeout(command, 30)
    }

    fn exec_system_with_timeout(&self, command: &str, _timeout_secs: u64) -> Result<CommandOutput, WslError> {
        if let Some(err) = self.check_error("exec_system") {
            return Err(err);
        }
        debug!("Mock: exec_system command='{}'", command);
        self.simulate_delay(100);

        // Simulate some common system distro commands
        let stdout = if command.contains("cat /etc/os-release") {
            // CBL-Mariner / Azure Linux (the WSL2 system distro)
            // PRETTY_NAME is just the friendly name, VERSION is separate
            r#"NAME="CBL-Mariner"
VERSION="2.0.20240301"
ID=mariner
VERSION_ID="2.0"
PRETTY_NAME="CBL-Mariner"
ANSI_COLOR="1;34"
HOME_URL="https://aka.ms/cbl-mariner"
BUG_REPORT_URL="https://aka.ms/cbl-mariner"
SUPPORT_URL="https://aka.ms/cbl-mariner"
"#.to_string()
        } else if command.contains("ip") && command.contains("addr") {
            "10.5.0.2\n".to_string()
        } else if command.contains("free") {
            "              total        used        free\nMem:       32768000     8192000    24576000\n".to_string()
        } else if command.contains("uname") {
            "Linux\n".to_string()
        } else if command.contains("hostname") {
            "172.25.160.1\n".to_string()
        } else {
            String::new()
        };

        Ok(CommandOutput {
            stdout,
            stderr: String::new(),
            success: true,
        })
    }

    fn check_preflight(&self) -> WslPreflightStatus {
        debug!("Mock: check_preflight");
        // In mock mode, WSL is always ready unless we configure an error
        if let Some(err) = self.check_error("preflight") {
            match err {
                WslError::CommandFailed(msg) => {
                    if msg.contains("not found") || msg.contains("not installed") {
                        return WslPreflightStatus::NotInstalled {
                            configured_path: "mock-wsl.exe".to_string(),
                        };
                    } else if msg.contains("0x8007019e") {
                        return WslPreflightStatus::FeatureDisabled {
                            error_code: "0x8007019e".to_string(),
                        };
                    } else if msg.contains("0x80370102") {
                        return WslPreflightStatus::VirtualizationDisabled {
                            error_code: "0x80370102".to_string(),
                        };
                    }
                    return WslPreflightStatus::Unknown { message: msg };
                }
                _ => return WslPreflightStatus::Unknown { message: err.to_string() },
            }
        }
        WslPreflightStatus::Ready
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_list_output_format() {
        let executor = MockWslExecutor::new();
        let result = executor.list_verbose().unwrap();

        // Verify output looks like real wsl.exe
        assert!(result.stdout.contains("NAME"));
        assert!(result.stdout.contains("STATE"));
        assert!(result.stdout.contains("VERSION"));
        assert!(result.stdout.contains("Ubuntu"));
        assert!(result.stdout.contains("Running"));
    }

    #[test]
    fn test_shutdown_stubborn_mode() {
        let executor = MockWslExecutor::new();
        executor.set_stubborn_shutdown(true);

        executor.shutdown().unwrap();
        assert!(!executor.was_force_used());

        // Ubuntu should still be running
        let output = executor.list_verbose().unwrap();
        assert!(output.stdout.contains("Ubuntu") && output.stdout.contains("Running"));

        // Force shutdown
        executor.shutdown_force().unwrap();
        assert!(executor.was_force_used());

        // Now all stopped
        let output = executor.list_verbose().unwrap();
        assert!(!output.stdout.contains("Running"));
    }


    #[test]
    fn test_check_preflight_returns_ready_by_default() {
        let executor = MockWslExecutor::new();
        let status = executor.check_preflight();
        assert_eq!(status, WslPreflightStatus::Ready);
    }

    #[test]
    fn test_check_preflight_timeout_error() {
        let executor = MockWslExecutor::new();
        executor.set_error("preflight", MockErrorType::Timeout);

        let status = executor.check_preflight();
        match status {
            WslPreflightStatus::Unknown { message } => {
                assert!(message.contains("timed out"), "Expected timeout message, got: {}", message);
            }
            _ => panic!("Expected Unknown status for timeout error, got: {:?}", status),
        }
    }

    #[test]
    fn test_check_preflight_clear_errors_restores_ready() {
        let executor = MockWslExecutor::new();

        // Set an error
        executor.set_error("preflight", MockErrorType::Timeout);
        let status = executor.check_preflight();
        assert!(matches!(status, WslPreflightStatus::Unknown { .. }));

        // Clear errors
        executor.clear_errors();
        let status = executor.check_preflight();
        assert_eq!(status, WslPreflightStatus::Ready);
    }
}
