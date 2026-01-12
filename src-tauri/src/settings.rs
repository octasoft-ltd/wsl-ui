use crate::constants::CONFIG_FILE_SETTINGS;
use crate::utils::{get_config_file, get_user_profile, is_mock_mode};
use crate::wsl::executor::wsl_executor;
use configparser::ini::Ini;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

/// Default settings JSON embedded at compile time from resources/default-settings.json
const DEFAULT_SETTINGS_JSON: &str = include_str!("../resources/default-settings.json");

/// Polling interval settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollingIntervals {
    pub distros: u64,
    pub resources: u64,
    pub health: u64,
}

/// WSL command timeout configuration (in seconds)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WslTimeoutConfig {
    /// Quick operations: list, version, status
    pub quick_secs: u64,
    /// Default operations: most commands
    pub default_secs: u64,
    /// Long operations: install, import, export, move, update
    pub long_secs: u64,
    /// Shell command execution
    pub shell_secs: u64,
    /// Shell commands with sudo
    pub sudo_shell_secs: u64,
}

/// Executable paths configuration
/// Allows users to override default paths for system commands
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecutablePaths {
    /// WSL CLI executable
    pub wsl: String,
    /// PowerShell executable
    pub powershell: String,
    /// Command Prompt executable
    pub cmd: String,
    /// Windows Explorer executable
    pub explorer: String,
    /// Windows Terminal executable
    pub windows_terminal: String,
    /// WSL UNC path prefix for accessing distro filesystems
    pub wsl_unc_prefix: String,
}

/// Distribution source settings (LXC catalog)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistributionSourceSettings {
    /// Enable community catalog (LXC Images)
    pub lxc_enabled: bool,
    /// LXC server base URL
    pub lxc_base_url: String,
    /// Cache duration in hours
    pub cache_duration_hours: u32,
    /// Show experimental/unstable releases
    pub show_unstable_releases: bool,
}

/// Container runtime options for pulling images
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum ContainerRuntime {
    /// Built-in OCI implementation (no external dependencies)
    Builtin,
    /// Use Docker CLI
    Docker,
    /// Use Podman CLI
    Podman,
    /// Custom command (user-specified)
    Custom(String),
}

/// Close action preference for window close button
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "lowercase")]
pub enum CloseAction {
    /// Show dialog to choose between minimize and quit
    #[default]
    Ask,
    /// Always minimize to system tray
    Minimize,
    /// Always quit the application
    Quit,
}

/// Application settings
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub ide_command: String,
    pub terminal_command: String,
    /// What to do when the user clicks the window close button
    #[serde(default)]
    pub close_action: CloseAction,
    /// Whether anonymous usage telemetry is enabled
    #[serde(default)]
    pub telemetry_enabled: bool,
    /// Whether the user has seen the telemetry opt-in prompt
    #[serde(default)]
    pub telemetry_prompt_seen: bool,
    /// Saved custom IDE command (persisted even when a preset is active)
    #[serde(default)]
    pub saved_custom_ide_command: String,
    /// Saved custom terminal command (persisted even when a preset is active)
    #[serde(default)]
    pub saved_custom_terminal_command: String,
    pub use_pre_release_updates: bool,
    pub polling_enabled: bool,
    pub polling_intervals: PollingIntervals,
    pub wsl_timeouts: WslTimeoutConfig,
    pub executable_paths: ExecutablePaths,
    pub distribution_sources: DistributionSourceSettings,
    /// Container runtime for pulling OCI images
    pub container_runtime: ContainerRuntime,
    /// Default base path for new WSL installations (unexpanded, e.g. "%LOCALAPPDATA%\\wsl")
    /// None = use default "%LOCALAPPDATA%\\wsl"
    pub default_install_base_path: Option<String>,
    /// Enable debug logging (more verbose logs for troubleshooting)
    pub debug_logging: bool,
}

/// WSL2 Global Configuration (.wslconfig)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WslConfig {
    pub memory: Option<String>,
    pub processors: Option<u32>,
    pub swap: Option<String>,
    pub swap_file: Option<String>,
    pub localhost_forwarding: Option<bool>,
    pub kernel_command_line: Option<String>,
    pub nested_virtualization: Option<bool>,
    pub vm_idle_timeout: Option<u32>,
    pub gui_applications: Option<bool>,
    pub debug_console: Option<bool>,
    pub page_reporting: Option<bool>,
    pub safe_mode: Option<bool>,
    pub auto_memory_reclaim: Option<String>,
    pub networking_mode: Option<String>,
}

/// Per-distribution configuration (wsl.conf)
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WslConf {
    // [automount]
    pub automount_enabled: Option<bool>,
    pub automount_mount_fs_tab: Option<bool>,
    pub automount_root: Option<String>,
    pub automount_options: Option<String>,

    // [network]
    pub network_generate_hosts: Option<bool>,
    pub network_generate_resolv_conf: Option<bool>,
    pub network_hostname: Option<String>,

    // [interop]
    pub interop_enabled: Option<bool>,
    pub interop_append_windows_path: Option<bool>,

    // [user]
    pub user_default: Option<String>,

    // [boot]
    pub boot_systemd: Option<bool>,
    pub boot_command: Option<String>,
}

lazy_static::lazy_static! {
    static ref SETTINGS: Mutex<AppSettings> = Mutex::new(load_or_create_settings());
}

/// Get default settings from embedded JSON
fn get_default_settings() -> AppSettings {
    serde_json::from_str(DEFAULT_SETTINGS_JSON)
        .expect("Failed to parse embedded default-settings.json - this is a bug")
}

/// Load settings from file, or create from defaults if not exists
fn load_or_create_settings() -> AppSettings {
    let path = get_config_file(CONFIG_FILE_SETTINGS);

    if path.exists() {
        // Try to load existing settings
        match fs::read_to_string(&path) {
            Ok(content) => {
                match serde_json::from_str(&content) {
                    Ok(settings) => return settings,
                    Err(e) => {
                        eprintln!("Warning: Failed to parse settings.json: {}. Using defaults.", e);
                    }
                }
            }
            Err(e) => {
                eprintln!("Warning: Failed to read settings.json: {}. Using defaults.", e);
            }
        }
    }

    // Create settings file from defaults
    let defaults = get_default_settings();
    if let Err(e) = save_settings_to_file(&defaults) {
        eprintln!("Warning: Failed to create settings.json: {}", e);
    }
    defaults
}

/// Save settings to file
fn save_settings_to_file(settings: &AppSettings) -> Result<(), String> {
    let path = get_config_file(CONFIG_FILE_SETTINGS);
    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write settings file: {}", e))
}

/// Get current settings
pub fn get_settings() -> AppSettings {
    SETTINGS
        .lock()
        .map(|guard| guard.clone())
        .unwrap_or_else(|poisoned| {
            // If mutex is poisoned, log warning and return settings from the poisoned lock
            eprintln!("Warning: Settings mutex was poisoned, recovering");
            poisoned.into_inner().clone()
        })
}

/// Get current WSL timeout configuration
/// This reads from settings on each call to allow runtime mutability
pub fn get_timeout_config() -> WslTimeoutConfig {
    get_settings().wsl_timeouts
}

/// Get current executable paths configuration
/// This reads from settings on each call to allow runtime mutability
pub fn get_executable_paths() -> ExecutablePaths {
    get_settings().executable_paths
}

/// Default base path for WSL installations (unexpanded)
const DEFAULT_INSTALL_BASE_PATH: &str = r"%LOCALAPPDATA%\wsl";

/// Expand environment variables in a path string (Windows-style %VAR%)
fn expand_env_vars(path: &str) -> String {
    let mut result = path.to_string();

    // Find all %VAR% patterns and expand them
    while let Some(start) = result.find('%') {
        if let Some(end) = result[start + 1..].find('%') {
            let var_name = &result[start + 1..start + 1 + end];
            let replacement = std::env::var(var_name).unwrap_or_default();
            result = format!("{}{}{}", &result[..start], replacement, &result[start + 2 + end..]);
        } else {
            break;
        }
    }

    result
}

/// Get the default install base path (expanded)
/// Returns the configured path from settings, or falls back to %LOCALAPPDATA%\wsl
pub fn get_default_install_base_path() -> String {
    let settings = get_settings();
    let path = settings
        .default_install_base_path
        .as_deref()
        .filter(|s| !s.trim().is_empty())
        .unwrap_or(DEFAULT_INSTALL_BASE_PATH);

    expand_env_vars(path)
}

/// Get the full default path for a distribution (base path + name)
pub fn get_default_distro_path(name: &str) -> String {
    let base = get_default_install_base_path();
    format!(r"{}\{}", base, name)
}

/// Save settings
pub fn save_settings(settings: AppSettings) -> Result<(), String> {
    save_settings_to_file(&settings)?;
    match SETTINGS.lock() {
        Ok(mut guard) => {
            *guard = settings;
            Ok(())
        }
        Err(poisoned) => {
            // Recover from poisoned mutex by replacing the value
            eprintln!("Warning: Settings mutex was poisoned, recovering");
            *poisoned.into_inner() = settings;
            Ok(())
        }
    }
}

/// Get the .wslconfig file path
fn get_wslconfig_path() -> PathBuf {
    get_user_profile().join(".wslconfig")
}

/// Read .wslconfig file
pub fn read_wsl_config() -> Result<WslConfig, String> {
    if is_mock_mode() {
        return Ok(WslConfig {
            memory: Some("8GB".to_string()),
            processors: Some(4),
            swap: Some("4GB".to_string()),
            localhost_forwarding: Some(true),
            gui_applications: Some(true),
            nested_virtualization: Some(false),
            ..Default::default()
        });
    }

    let path = get_wslconfig_path();

    if !path.exists() {
        return Ok(WslConfig::default());
    }

    let content = fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read .wslconfig: {}", e))?;

    parse_wsl_config(&content)
}

/// Parse .wslconfig INI content using configparser library
fn parse_wsl_config(content: &str) -> Result<WslConfig, String> {
    let mut ini = Ini::new_cs(); // case-sensitive for preserving key casing
    ini.set_comment_symbols(&['#', ';']);

    ini.read(content.to_string())
        .map_err(|e| format!("Failed to parse .wslconfig: {}", e))?;

    Ok(WslConfig {
        memory: ini.get("wsl2", "memory"),
        processors: ini.getuint("wsl2", "processors").ok().flatten().map(|v| v as u32),
        swap: ini.get("wsl2", "swap"),
        swap_file: ini.get("wsl2", "swapFile").or_else(|| ini.get("wsl2", "swapfile")),
        localhost_forwarding: ini.getbool("wsl2", "localhostForwarding")
            .ok().flatten()
            .or_else(|| ini.getbool("wsl2", "localhostforwarding").ok().flatten()),
        kernel_command_line: ini.get("wsl2", "kernelCommandLine")
            .or_else(|| ini.get("wsl2", "kernelcommandline")),
        nested_virtualization: ini.getbool("wsl2", "nestedVirtualization")
            .ok().flatten()
            .or_else(|| ini.getbool("wsl2", "nestedvirtualization").ok().flatten()),
        vm_idle_timeout: ini.getuint("wsl2", "vmIdleTimeout").ok().flatten()
            .or_else(|| ini.getuint("wsl2", "vmidletimeout").ok().flatten())
            .map(|v| v as u32),
        gui_applications: ini.getbool("wsl2", "guiApplications")
            .ok().flatten()
            .or_else(|| ini.getbool("wsl2", "guiapplications").ok().flatten()),
        debug_console: ini.getbool("wsl2", "debugConsole")
            .ok().flatten()
            .or_else(|| ini.getbool("wsl2", "debugconsole").ok().flatten()),
        page_reporting: ini.getbool("wsl2", "pageReporting")
            .ok().flatten()
            .or_else(|| ini.getbool("wsl2", "pagereporting").ok().flatten()),
        safe_mode: ini.getbool("wsl2", "safeMode")
            .ok().flatten()
            .or_else(|| ini.getbool("wsl2", "safemode").ok().flatten()),
        auto_memory_reclaim: ini.get("wsl2", "autoMemoryReclaim")
            .or_else(|| ini.get("wsl2", "automemoryreclaim")),
        networking_mode: ini.get("wsl2", "networkingMode")
            .or_else(|| ini.get("wsl2", "networkingmode")),
    })
}

/// Write .wslconfig file
pub fn write_wsl_config(config: WslConfig) -> Result<(), String> {
    if is_mock_mode() {
        return Ok(());
    }

    let path = get_wslconfig_path();
    let content = serialize_wsl_config(&config);

    fs::write(&path, content).map_err(|e| format!("Failed to write .wslconfig: {}", e))
}

/// Serialize WslConfig to INI format
fn serialize_wsl_config(config: &WslConfig) -> String {
    let mut lines = vec!["[wsl2]".to_string()];

    if let Some(ref v) = config.memory {
        lines.push(format!("memory={}", v));
    }
    if let Some(v) = config.processors {
        lines.push(format!("processors={}", v));
    }
    if let Some(ref v) = config.swap {
        lines.push(format!("swap={}", v));
    }
    if let Some(ref v) = config.swap_file {
        lines.push(format!("swapFile={}", v));
    }
    if let Some(v) = config.localhost_forwarding {
        lines.push(format!("localhostForwarding={}", v));
    }
    if let Some(ref v) = config.kernel_command_line {
        lines.push(format!("kernelCommandLine={}", v));
    }
    if let Some(v) = config.nested_virtualization {
        lines.push(format!("nestedVirtualization={}", v));
    }
    if let Some(v) = config.vm_idle_timeout {
        lines.push(format!("vmIdleTimeout={}", v));
    }
    if let Some(v) = config.gui_applications {
        lines.push(format!("guiApplications={}", v));
    }
    if let Some(v) = config.debug_console {
        lines.push(format!("debugConsole={}", v));
    }
    if let Some(v) = config.page_reporting {
        lines.push(format!("pageReporting={}", v));
    }
    if let Some(v) = config.safe_mode {
        lines.push(format!("safeMode={}", v));
    }
    if let Some(ref v) = config.auto_memory_reclaim {
        lines.push(format!("autoMemoryReclaim={}", v));
    }
    if let Some(ref v) = config.networking_mode {
        lines.push(format!("networkingMode={}", v));
    }

    lines.join("\n") + "\n"
}

/// Read wsl.conf from a distribution
/// If `id` is provided, uses `--distribution-id` for more reliable identification
pub fn read_wsl_conf(distro_name: &str, id: Option<&str>) -> Result<WslConf, String> {
    if is_mock_mode() {
        return Ok(WslConf {
            automount_enabled: Some(true),
            automount_root: Some("/mnt/".to_string()),
            network_generate_hosts: Some(true),
            network_generate_resolv_conf: Some(true),
            interop_enabled: Some(true),
            interop_append_windows_path: Some(true),
            boot_systemd: Some(true),
            ..Default::default()
        });
    }

    let output = wsl_executor().exec(distro_name, id, "cat /etc/wsl.conf")
        .map_err(|e| format!("Failed to read wsl.conf: {}", e))?;

    if !output.success {
        // File might not exist, return defaults
        return Ok(WslConf::default());
    }

    parse_wsl_conf(&output.stdout)
}

/// Read raw wsl.conf content from a distribution
/// Returns the file content as-is, or None if the file doesn't exist
pub fn read_wsl_conf_raw(distro_name: &str, id: Option<&str>) -> Result<Option<String>, String> {
    if is_mock_mode() {
        return Ok(Some(r#"[automount]
enabled=true
root=/mnt/

[network]
generateHosts=true
generateResolvConf=true

[interop]
enabled=true
appendWindowsPath=true

[boot]
systemd=true
"#.to_string()));
    }

    let output = wsl_executor().exec(distro_name, id, "cat /etc/wsl.conf")
        .map_err(|e| format!("Failed to read wsl.conf: {}", e))?;

    if !output.success {
        // File doesn't exist
        return Ok(None);
    }

    let content = output.stdout.trim();
    if content.is_empty() {
        Ok(None)
    } else {
        Ok(Some(content.to_string()))
    }
}

/// Parse wsl.conf INI content
/// Parse wsl.conf INI content using configparser library
fn parse_wsl_conf(content: &str) -> Result<WslConf, String> {
    let mut ini = Ini::new_cs();
    ini.set_comment_symbols(&['#', ';']);

    ini.read(content.to_string())
        .map_err(|e| format!("Failed to parse wsl.conf: {}", e))?;

    // Helper to get bool with case-insensitive key fallback
    let get_bool = |section: &str, key: &str, alt_key: &str| -> Option<bool> {
        ini.getbool(section, key).ok().flatten()
            .or_else(|| ini.getbool(section, alt_key).ok().flatten())
    };

    let get_str = |section: &str, key: &str, alt_key: &str| -> Option<String> {
        ini.get(section, key).or_else(|| ini.get(section, alt_key))
    };

    Ok(WslConf {
        automount_enabled: get_bool("automount", "enabled", "enabled"),
        automount_mount_fs_tab: get_bool("automount", "mountFsTab", "mountfstab"),
        automount_root: get_str("automount", "root", "root"),
        automount_options: get_str("automount", "options", "options"),
        network_generate_hosts: get_bool("network", "generateHosts", "generatehosts"),
        network_generate_resolv_conf: get_bool("network", "generateResolvConf", "generateresolvconf"),
        network_hostname: get_str("network", "hostname", "hostname"),
        interop_enabled: get_bool("interop", "enabled", "enabled"),
        interop_append_windows_path: get_bool("interop", "appendWindowsPath", "appendwindowspath"),
        user_default: get_str("user", "default", "default"),
        boot_systemd: get_bool("boot", "systemd", "systemd"),
        boot_command: get_str("boot", "command", "command"),
    })
}

/// Write wsl.conf to a distribution
/// Uses wsl -u root to write with root privileges since /etc/wsl.conf is typically owned by root
pub fn write_wsl_conf(distro_name: &str, config: WslConf) -> Result<(), String> {
    if is_mock_mode() {
        return Ok(());
    }

    let content = serialize_wsl_conf(&config);

    // Use heredoc to write the content safely via root user
    // The WSLCONFEOF delimiter is unlikely to appear in INI content
    let command = format!(
        "cat > /etc/wsl.conf << 'WSLCONFEOF'\n{}WSLCONFEOF",
        content
    );

    let output = wsl_executor()
        .exec_as_root(distro_name, None, &command)
        .map_err(|e| format!("Failed to write wsl.conf: {}", e))?;

    if !output.success {
        return Err(format!(
            "Failed to write wsl.conf: {}",
            output.stderr.trim()
        ));
    }

    Ok(())
}

/// Serialize WslConf to INI format
fn serialize_wsl_conf(config: &WslConf) -> String {
    let mut sections: Vec<String> = vec![];

    // [automount]
    let mut automount = vec![];
    if let Some(v) = config.automount_enabled {
        automount.push(format!("enabled={}", v));
    }
    if let Some(v) = config.automount_mount_fs_tab {
        automount.push(format!("mountFsTab={}", v));
    }
    if let Some(ref v) = config.automount_root {
        automount.push(format!("root={}", v));
    }
    if let Some(ref v) = config.automount_options {
        automount.push(format!("options=\"{}\"", v));
    }
    if !automount.is_empty() {
        sections.push(format!("[automount]\n{}", automount.join("\n")));
    }

    // [network]
    let mut network = vec![];
    if let Some(v) = config.network_generate_hosts {
        network.push(format!("generateHosts={}", v));
    }
    if let Some(v) = config.network_generate_resolv_conf {
        network.push(format!("generateResolvConf={}", v));
    }
    if let Some(ref v) = config.network_hostname {
        network.push(format!("hostname={}", v));
    }
    if !network.is_empty() {
        sections.push(format!("[network]\n{}", network.join("\n")));
    }

    // [interop]
    let mut interop = vec![];
    if let Some(v) = config.interop_enabled {
        interop.push(format!("enabled={}", v));
    }
    if let Some(v) = config.interop_append_windows_path {
        interop.push(format!("appendWindowsPath={}", v));
    }
    if !interop.is_empty() {
        sections.push(format!("[interop]\n{}", interop.join("\n")));
    }

    // [user]
    let mut user = vec![];
    if let Some(ref v) = config.user_default {
        user.push(format!("default={}", v));
    }
    if !user.is_empty() {
        sections.push(format!("[user]\n{}", user.join("\n")));
    }

    // [boot]
    let mut boot = vec![];
    if let Some(v) = config.boot_systemd {
        boot.push(format!("systemd={}", v));
    }
    if let Some(ref v) = config.boot_command {
        boot.push(format!("command={}", v));
    }
    if !boot.is_empty() {
        sections.push(format!("[boot]\n{}", boot.join("\n")));
    }

    sections.join("\n\n") + "\n"
}

#[cfg(test)]
mod tests {
    use super::*;

    // ==================== WSL Config Parsing Tests ====================

    #[test]
    fn test_parse_wsl_config_basic() {
        let content = r#"
[wsl2]
memory=8GB
processors=4
swap=4GB
"#;
        let config = parse_wsl_config(content).unwrap();

        assert_eq!(config.memory, Some("8GB".to_string()));
        assert_eq!(config.processors, Some(4));
        assert_eq!(config.swap, Some("4GB".to_string()));
    }

    #[test]
    fn test_parse_wsl_config_all_fields() {
        let content = r#"
[wsl2]
memory=16GB
processors=8
swap=8GB
swapFile=C:\swap.vhdx
localhostForwarding=true
nestedVirtualization=false
vmIdleTimeout=60000
guiApplications=true
debugConsole=false
pageReporting=true
safeMode=false
autoMemoryReclaim=gradual
networkingMode=mirrored
"#;
        let config = parse_wsl_config(content).unwrap();

        assert_eq!(config.memory, Some("16GB".to_string()));
        assert_eq!(config.processors, Some(8));
        assert_eq!(config.swap, Some("8GB".to_string()));
        assert_eq!(config.swap_file, Some("C:\\swap.vhdx".to_string()));
        assert_eq!(config.localhost_forwarding, Some(true));
        assert_eq!(config.nested_virtualization, Some(false));
        assert_eq!(config.vm_idle_timeout, Some(60000));
        assert_eq!(config.gui_applications, Some(true));
        assert_eq!(config.debug_console, Some(false));
        assert_eq!(config.page_reporting, Some(true));
        assert_eq!(config.safe_mode, Some(false));
        assert_eq!(config.auto_memory_reclaim, Some("gradual".to_string()));
        assert_eq!(config.networking_mode, Some("mirrored".to_string()));
    }

    #[test]
    fn test_parse_wsl_config_with_comments() {
        let content = r#"
# This is a comment
[wsl2]
; This is also a comment
memory=8GB
# Another comment
processors=4
"#;
        let config = parse_wsl_config(content).unwrap();

        assert_eq!(config.memory, Some("8GB".to_string()));
        assert_eq!(config.processors, Some(4));
    }

    #[test]
    fn test_parse_wsl_config_ignores_other_sections() {
        let content = r#"
[other]
memory=16GB

[wsl2]
memory=8GB

[another]
memory=4GB
"#;
        let config = parse_wsl_config(content).unwrap();

        // Should only parse the [wsl2] section
        assert_eq!(config.memory, Some("8GB".to_string()));
    }

    #[test]
    fn test_parse_wsl_config_empty() {
        let config = parse_wsl_config("").unwrap();

        assert!(config.memory.is_none());
        assert!(config.processors.is_none());
    }

    // ==================== WSL Conf Parsing Tests ====================

    #[test]
    fn test_parse_wsl_conf_basic() {
        let content = r#"
[automount]
enabled=true
root=/mnt/

[boot]
systemd=true
"#;
        let config = parse_wsl_conf(content).unwrap();

        assert_eq!(config.automount_enabled, Some(true));
        assert_eq!(config.automount_root, Some("/mnt/".to_string()));
        assert_eq!(config.boot_systemd, Some(true));
    }

    #[test]
    fn test_parse_wsl_conf_all_sections() {
        let content = r#"
[automount]
enabled=true
mountFsTab=true
root=/mnt/
options=metadata,uid=1000

[network]
generateHosts=true
generateResolvConf=false
hostname=myhost

[interop]
enabled=true
appendWindowsPath=false

[user]
default=myuser

[boot]
systemd=true
command=/etc/init.d/start.sh
"#;
        let config = parse_wsl_conf(content).unwrap();

        assert_eq!(config.automount_enabled, Some(true));
        assert_eq!(config.automount_mount_fs_tab, Some(true));
        assert_eq!(config.automount_root, Some("/mnt/".to_string()));
        assert_eq!(config.automount_options, Some("metadata,uid=1000".to_string()));
        assert_eq!(config.network_generate_hosts, Some(true));
        assert_eq!(config.network_generate_resolv_conf, Some(false));
        assert_eq!(config.network_hostname, Some("myhost".to_string()));
        assert_eq!(config.interop_enabled, Some(true));
        assert_eq!(config.interop_append_windows_path, Some(false));
        assert_eq!(config.user_default, Some("myuser".to_string()));
        assert_eq!(config.boot_systemd, Some(true));
        assert_eq!(config.boot_command, Some("/etc/init.d/start.sh".to_string()));
    }

    // ==================== Serialization Tests ====================

    #[test]
    fn test_serialize_wsl_config() {
        let config = WslConfig {
            memory: Some("8GB".to_string()),
            processors: Some(4),
            swap: Some("4GB".to_string()),
            ..Default::default()
        };

        let serialized = serialize_wsl_config(&config);

        assert!(serialized.contains("[wsl2]"));
        assert!(serialized.contains("memory=8GB"));
        assert!(serialized.contains("processors=4"));
        assert!(serialized.contains("swap=4GB"));
    }

    #[test]
    fn test_serialize_wsl_config_skips_none() {
        let config = WslConfig {
            memory: Some("8GB".to_string()),
            processors: None,
            ..Default::default()
        };

        let serialized = serialize_wsl_config(&config);

        assert!(serialized.contains("memory=8GB"));
        assert!(!serialized.contains("processors"));
    }

    #[test]
    fn test_serialize_wsl_conf() {
        let config = WslConf {
            automount_enabled: Some(true),
            automount_root: Some("/mnt/".to_string()),
            boot_systemd: Some(true),
            ..Default::default()
        };

        let serialized = serialize_wsl_conf(&config);

        assert!(serialized.contains("[automount]"));
        assert!(serialized.contains("enabled=true"));
        assert!(serialized.contains("root=/mnt/"));
        assert!(serialized.contains("[boot]"));
        assert!(serialized.contains("systemd=true"));
    }

    // ==================== Round-trip Tests ====================

    #[test]
    fn test_wsl_config_roundtrip() {
        let original = WslConfig {
            memory: Some("8GB".to_string()),
            processors: Some(4),
            localhost_forwarding: Some(true),
            gui_applications: Some(true),
            ..Default::default()
        };

        let serialized = serialize_wsl_config(&original);
        let parsed = parse_wsl_config(&serialized).unwrap();

        assert_eq!(parsed.memory, original.memory);
        assert_eq!(parsed.processors, original.processors);
        assert_eq!(parsed.localhost_forwarding, original.localhost_forwarding);
        assert_eq!(parsed.gui_applications, original.gui_applications);
    }
}

