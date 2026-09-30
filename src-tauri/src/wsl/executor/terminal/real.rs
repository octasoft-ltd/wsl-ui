//! Real terminal executor - launches actual terminal/IDE/explorer/download/container applications

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

use super::{ContainerRuntime, InstalledTerminal, TerminalExecutor};
use crate::settings::get_executable_paths;
use crate::utils::{hidden_command, wsl_command};
use crate::wsl::executor::supports_distribution_id;
use crate::wsl::types::WslError;

/// Cache for detected store terminals (detected once at startup)
static STORE_TERMINALS_CACHE: OnceLock<HashMap<String, InstalledTerminal>> = OnceLock::new();

/// Real implementation that launches actual applications
pub struct RealTerminalExecutor;

impl RealTerminalExecutor {
    pub fn new() -> Self {
        Self
    }

    /// Detect Windows Store terminals via PowerShell Get-AppxPackage
    fn detect_store_terminals_impl() -> HashMap<String, InstalledTerminal> {
        let paths = get_executable_paths();
        let mut terminals = HashMap::new();

        // Query for Windows Terminal packages
        let output = hidden_command(&paths.powershell)
            .args([
                "-NoProfile",
                "-Command",
                "Get-AppxPackage *WindowsTerminal* | Select-Object Name, PackageFamilyName | ConvertTo-Json"
            ])
            .output();

        match output {
            Ok(output) if output.status.success() => {
                let stdout = String::from_utf8_lossy(&output.stdout);
                Self::parse_appx_packages(&stdout, &mut terminals);
            }
            Ok(output) => {
                log::debug!(
                    "Get-AppxPackage returned non-zero: {}",
                    String::from_utf8_lossy(&output.stderr)
                );
            }
            Err(e) => {
                log::warn!("Failed to run Get-AppxPackage: {}", e);
            }
        }

        // Add entries for terminals that weren't found (marked as not installed)
        if !terminals.contains_key("wt") {
            terminals.insert("wt".to_string(), InstalledTerminal {
                id: "wt".to_string(),
                name: "Windows Terminal".to_string(),
                package_family_name: String::new(),
                installed: false,
            });
        }
        if !terminals.contains_key("wt-preview") {
            terminals.insert("wt-preview".to_string(), InstalledTerminal {
                id: "wt-preview".to_string(),
                name: "Windows Terminal Preview".to_string(),
                package_family_name: String::new(),
                installed: false,
            });
        }

        terminals
    }

    /// Parse the JSON output from Get-AppxPackage
    fn parse_appx_packages(json_str: &str, terminals: &mut HashMap<String, InstalledTerminal>) {
        // PowerShell returns a single object for one result, or an array for multiple
        let trimmed = json_str.trim();
        if trimmed.is_empty() {
            return;
        }

        // Try parsing as array first
        if let Ok(packages) = serde_json::from_str::<Vec<serde_json::Value>>(trimmed) {
            for pkg in packages {
                Self::process_package(&pkg, terminals);
            }
        } else if let Ok(pkg) = serde_json::from_str::<serde_json::Value>(trimmed) {
            // Single object
            Self::process_package(&pkg, terminals);
        }
    }

    /// Process a single package JSON object
    fn process_package(pkg: &serde_json::Value, terminals: &mut HashMap<String, InstalledTerminal>) {
        let name = pkg.get("Name").and_then(|v| v.as_str()).unwrap_or("");
        let family_name = pkg.get("PackageFamilyName").and_then(|v| v.as_str()).unwrap_or("");

        if family_name.is_empty() {
            return;
        }

        // Match package name to our terminal IDs
        if name.contains("WindowsTerminalPreview") {
            terminals.insert("wt-preview".to_string(), InstalledTerminal {
                id: "wt-preview".to_string(),
                name: "Windows Terminal Preview".to_string(),
                package_family_name: family_name.to_string(),
                installed: true,
            });
        } else if name.contains("WindowsTerminal") {
            terminals.insert("wt".to_string(), InstalledTerminal {
                id: "wt".to_string(),
                name: "Windows Terminal".to_string(),
                package_family_name: family_name.to_string(),
                installed: true,
            });
        }
    }
}

impl Default for RealTerminalExecutor {
    fn default() -> Self {
        Self::new()
    }
}

impl TerminalExecutor for RealTerminalExecutor {
    fn detect_store_terminals(&self) -> HashMap<String, InstalledTerminal> {
        STORE_TERMINALS_CACHE
            .get_or_init(Self::detect_store_terminals_impl)
            .clone()
    }

    fn open_terminal(&self, distro: &str, id: Option<&str>, terminal_command: &str) -> Result<(), WslError> {
        match terminal_command {
            "auto" => open_terminal_auto(distro, id),
            "wt" => open_terminal_wt(distro, id),
            "wt-preview" => open_terminal_wt_preview(distro, id),
            "cmd" => open_terminal_cmd(distro, id),
            // Custom terminal: supports template placeholders ($DISTRO_NAME, $DISTRO_ID, $WSL)
            // e.g., "alacritty -e $WSL --distribution-id $DISTRO_ID --cd ~"
            _ => open_terminal_custom(distro, id, terminal_command),
        }
    }

    fn open_terminal_with_command(&self, distro: &str, id: Option<&str>, command: &str, terminal_command: &str) -> Result<(), WslError> {
        match terminal_command {
            "auto" => open_terminal_with_command_auto(distro, id, command),
            "wt" => open_terminal_with_command_wt(distro, id, command),
            "wt-preview" => open_terminal_with_command_wt_preview(distro, id, command),
            "cmd" => open_terminal_with_command_cmd(distro, id, command),
            // For custom terminals, fall back to auto detection
            _ => open_terminal_with_command_auto(distro, id, command),
        }
    }

    fn open_system_terminal(&self, terminal_command: &str) -> Result<(), WslError> {
        match terminal_command {
            "auto" => open_system_terminal_auto(),
            "wt" => open_system_terminal_wt(),
            "wt-preview" => open_system_terminal_wt_preview(),
            "cmd" => open_system_terminal_cmd(),
            // Custom terminal: supports template placeholders ($WSL)
            // e.g., "alacritty -e $WSL --system --cd ~"
            _ => open_system_terminal_custom(terminal_command),
        }
    }

    fn open_file_explorer(&self, distro: &str) -> Result<(), WslError> {
        let paths = get_executable_paths();
        let unc_path = format!(r"{}\{}", paths.wsl_unc_prefix, distro);
        log::debug!("Opening file explorer: {} {}", paths.explorer, unc_path);
        hidden_command(&paths.explorer)
            .arg(&unc_path)
            .spawn()
            .map_err(|e| WslError::CommandFailed(e.to_string()))?;
        Ok(())
    }

    fn open_ide(&self, distro: &str, ide_command: &str) -> Result<(), WslError> {
        let paths = get_executable_paths();
        log::debug!("Opening IDE '{}' for distro '{}'", ide_command, distro);

        // Template support: if command contains placeholders, expand and execute
        // Placeholders: $DISTRO_NAME, $WSL_PATH
        if ide_command.contains("$DISTRO_NAME") || ide_command.contains("$WSL_PATH") {
            let expanded = ide_command
                .replace("$WSL_PATH", &paths.wsl_unc_prefix)
                .replace("$DISTRO_NAME", distro);

            // Parse command - handle quoted paths (e.g., "C:\Program Files\...")
            let (program, args) = parse_command_with_quotes(&expanded);
            log::debug!("IDE template expanded: {} {:?}", program, args);

            return hidden_command(&program)
                .args(&args)
                .spawn()
                .map(|_| ())
                .map_err(|e| {
                    WslError::CommandFailed(format!(
                        "Failed to open IDE with command '{}': {}",
                        expanded, e
                    ))
                });
        }

        // Legacy behavior for simple IDE names (code, cursor, etc.)
        let remote_arg = format!("wsl+{}", distro);

        // Method 1: Try the configured IDE command directly
        log::debug!("Trying IDE direct: {} --remote {} /home", ide_command, remote_arg);
        if hidden_command(ide_command)
            .args(["--remote", &remote_arg, "/home"])
            .spawn()
            .is_ok()
        {
            return Ok(());
        }

        // Method 2: Try common Windows installation paths
        let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
        let program_files = std::env::var("ProgramFiles").unwrap_or_default();

        let possible_paths: Vec<String> = match ide_command {
            "code" => vec![
                format!(r"{}\Programs\Microsoft VS Code\bin\code.cmd", local_app_data),
                format!(r"{}\Microsoft VS Code\bin\code.cmd", program_files),
            ],
            "cursor" => vec![
                format!(r"{}\Programs\cursor\Cursor.exe", local_app_data),
                format!(r"{}\Cursor\Cursor.exe", program_files),
            ],
            _ => vec![],
        };

        for path in &possible_paths {
            if std::path::Path::new(path).exists() {
                log::debug!("Trying IDE path: {} --remote {} /home", path, remote_arg);
                if hidden_command(path)
                    .args(["--remote", &remote_arg, "/home"])
                    .spawn()
                    .is_ok()
                {
                    return Ok(());
                }
            }
        }

        // Method 3: Try running the IDE from within WSL itself
        log::debug!("Trying IDE via WSL: {} -d {} -- {} .", paths.wsl, distro, ide_command);
        if wsl_command(&paths.wsl)
            .args(["-d", distro, "--", ide_command, "."])
            .current_dir(format!(r"{}\{}\home", paths.wsl_unc_prefix, distro))
            .spawn()
            .is_ok()
        {
            return Ok(());
        }

        Err(WslError::CommandFailed(format!(
            "IDE '{}' not found. For custom IDEs, use template: \"C:\\path\\to\\ide.exe\" $WSL_PATH\\$DISTRO_NAME\\home",
            ide_command
        )))
    }

    fn detect_container_runtime(&self) -> ContainerRuntime {
        log::debug!("Detecting container runtime...");
        if hidden_command("podman").arg("--version").output().is_ok() {
            log::debug!("Container runtime detected: podman");
            ContainerRuntime::Podman
        } else if hidden_command("docker").arg("--version").output().is_ok() {
            log::debug!("Container runtime detected: docker");
            ContainerRuntime::Docker
        } else {
            log::debug!("No container runtime detected");
            ContainerRuntime::None
        }
    }

    fn container_pull(&self, runtime: &str, image: &str) -> Result<(), WslError> {
        log::debug!("Container pull: {} pull {}", runtime, image);
        let output = hidden_command(runtime)
            .args(["pull", image])
            .output()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    WslError::CommandFailed(format!("Container runtime '{}' not found. Please install {} or check your settings.", runtime, runtime))
                } else {
                    WslError::CommandFailed(format!("Failed to run '{}': {}", runtime, e))
                }
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(WslError::CommandFailed(format!("Failed to pull image: {}", stderr)));
        }

        Ok(())
    }

    fn container_create(&self, runtime: &str, image: &str) -> Result<String, WslError> {
        log::debug!("Container create: {} create {}", runtime, image);
        let output = hidden_command(runtime)
            .args(["create", image])
            .output()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    WslError::CommandFailed(format!("Container runtime '{}' not found. Please install {} or check your settings.", runtime, runtime))
                } else {
                    WslError::CommandFailed(format!("Failed to run '{}': {}", runtime, e))
                }
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(WslError::CommandFailed(format!("Failed to create container: {}", stderr)));
        }

        let container_id = String::from_utf8_lossy(&output.stdout).trim().to_string();
        log::debug!("Container created: {}", container_id);
        Ok(container_id)
    }

    fn container_export(&self, runtime: &str, container_id: &str, dest: &str) -> Result<(), WslError> {
        log::debug!("Container export: {} export {} -o {}", runtime, container_id, dest);
        let output = hidden_command(runtime)
            .args(["export", container_id, "-o", dest])
            .output()
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::NotFound {
                    WslError::CommandFailed(format!("Container runtime '{}' not found. Please install {} or check your settings.", runtime, runtime))
                } else {
                    WslError::CommandFailed(format!("Failed to run '{}': {}", runtime, e))
                }
            })?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(WslError::CommandFailed(format!("Failed to export container: {}", stderr)));
        }

        Ok(())
    }

    fn container_rm(&self, runtime: &str, container_id: &str) -> Result<(), WslError> {
        log::debug!("Container rm: {} rm {}", runtime, container_id);
        // Best effort - ignore errors since container might already be removed
        let _ = hidden_command(runtime)
            .args(["rm", container_id])
            .output();
        Ok(())
    }
}

// === Helper Functions ===

/// Parse a command string that may contain quoted paths
/// Returns (program, args) where program is the executable and args are the remaining arguments
/// Handles: "C:\Program Files\app.exe" arg1 arg2
fn parse_command_with_quotes(cmd: &str) -> (String, Vec<String>) {
    let cmd = cmd.trim();
    let mut args: Vec<String> = Vec::new();
    let mut current = String::new();
    let mut in_quotes = false;
    let mut chars = cmd.chars().peekable();

    while let Some(c) = chars.next() {
        match c {
            '"' => {
                in_quotes = !in_quotes;
            }
            ' ' if !in_quotes => {
                if !current.is_empty() {
                    args.push(current.clone());
                    current.clear();
                }
            }
            _ => {
                current.push(c);
            }
        }
    }

    if !current.is_empty() {
        args.push(current);
    }

    if args.is_empty() {
        return (String::new(), Vec::new());
    }

    let program = args.remove(0);
    (program, args)
}

fn parse_terminal_command(expanded: &str) -> (String, Vec<String>) {
    parse_command_with_quotes(expanded)
}
/// Strip curly braces from a GUID string.
/// Registry GUIDs include braces like `{3c002dba-...}`, but curly braces cause
/// issues in PowerShell (interpreted as ScriptBlock) and some terminal launchers.
/// WSL accepts GUIDs both with and without braces.
fn strip_guid_braces(guid: &str) -> String {
    guid.trim_start_matches('{').trim_end_matches('}').to_string()
}

/// Generate WSL arguments for identifying a distribution
/// Uses --distribution-id when available and supported for reliable identification
fn wsl_distro_args(name: &str, id: Option<&str>) -> Vec<String> {
    match id.filter(|_| supports_distribution_id()) {
        Some(guid) => vec!["--distribution-id".to_string(), strip_guid_braces(guid)],
        None => vec!["-d".to_string(), name.to_string()],
    }
}

/// Get the package family name for a terminal variant from cache
fn get_cached_package_family_name(terminal_id: &str) -> Option<String> {
    STORE_TERMINALS_CACHE
        .get()
        .and_then(|cache| cache.get(terminal_id))
        .filter(|t| t.installed)
        .map(|t| t.package_family_name.clone())
}

/// Auto-detect terminal: try Windows Terminal Preview, then Windows Terminal, fall back to cmd
fn open_terminal_auto(distro: &str, id: Option<&str>) -> Result<(), WslError> {
    // Use detected terminals from cache for reliable detection
    let cache = STORE_TERMINALS_CACHE.get_or_init(RealTerminalExecutor::detect_store_terminals_impl);

    // Try Windows Terminal Preview first if installed
    if let Some(preview) = cache.get("wt-preview").filter(|t| t.installed) {
        if open_terminal_wt_preview_with_package(distro, id, &preview.package_family_name).is_ok() {
            return Ok(());
        }
    }

    // Try Windows Terminal (stable) if installed
    if cache.get("wt").map(|t| t.installed).unwrap_or(false) {
        if open_terminal_wt(distro, id).is_ok() {
            return Ok(());
        }
    }

    // Fall back to cmd
    open_terminal_cmd(distro, id)
}

/// Check if a Windows Terminal profile exists by name
fn wt_profile_exists(name: &str, settings_path: &PathBuf) -> bool {
    if let Ok(content) = fs::read_to_string(settings_path) {
        let search_pattern = format!(r#""name": "{}""#, name);
        let search_pattern_alt = format!(r#""name":"{}""#, name);
        content.contains(&search_pattern) || content.contains(&search_pattern_alt)
    } else {
        false
    }
}

/// Get Windows Terminal (stable) settings path using detected package family name
fn get_wt_settings_path() -> PathBuf {
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let package_name = get_cached_package_family_name("wt")
        .unwrap_or_else(|| "Microsoft.WindowsTerminal_8wekyb3d8bbwe".to_string());
    PathBuf::from(local_app_data)
        .join("Packages")
        .join(package_name)
        .join("LocalState")
        .join("settings.json")
}

/// Get Windows Terminal Preview settings path using detected package family name
fn get_wt_preview_settings_path() -> PathBuf {
    let local_app_data = std::env::var("LOCALAPPDATA").unwrap_or_default();
    let package_name = get_cached_package_family_name("wt-preview")
        .unwrap_or_else(|| "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe".to_string());
    PathBuf::from(local_app_data)
        .join("Packages")
        .join(package_name)
        .join("LocalState")
        .join("settings.json")
}

/// Open Windows Terminal with WSL distribution
fn open_terminal_wt(distro: &str, id: Option<&str>) -> Result<(), WslError> {
    let paths = get_executable_paths();

    // Prefer profile-based launch when a matching profile exists: this preserves
    // the user's configured colours, fonts, and title for the distribution.
    // Fall back to wsl --distribution-id (or -d) only when no profile is found.
    let settings_path = get_wt_settings_path();
    let args: Vec<String> = if wt_profile_exists(distro, &settings_path) {
        vec!["-p".to_string(), distro.to_string()]
    } else {
        let mut args = vec![paths.wsl.clone()];
        args.extend(wsl_distro_args(distro, id));
        args.extend(["--cd".to_string(), "~".to_string()]);
        args
    };

    log::debug!("Opening Windows Terminal: {} {:?}", paths.windows_terminal, args);
    wsl_command(&paths.windows_terminal)
        .args(&args)
        .spawn()
        .map_err(|e| {
            WslError::CommandFailed(format!(
                "Failed to open Windows Terminal: {}. Is it installed?",
                e
            ))
        })?;
    Ok(())
}

/// Open Windows Terminal Preview with WSL distribution
fn open_terminal_wt_preview(distro: &str, id: Option<&str>) -> Result<(), WslError> {
    // Get the detected package family name, or use fallback
    let package_family_name = get_cached_package_family_name("wt-preview")
        .unwrap_or_else(|| "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe".to_string());
    open_terminal_wt_preview_with_package(distro, id, &package_family_name)
}

/// Open Windows Terminal Preview with a specific package family name
fn open_terminal_wt_preview_with_package(distro: &str, id: Option<&str>, package_family_name: &str) -> Result<(), WslError> {
    let paths = get_executable_paths();

    // Prefer profile-based launch when a matching profile exists: this preserves
    // the user's configured colours, fonts, and title for the distribution.
    // Fall back to wsl --distribution-id (or -d) only when no profile is found.
    let settings_path = get_wt_preview_settings_path();
    let args = if wt_profile_exists(distro, &settings_path) {
        vec!["-p".to_string(), distro.to_string()]
    } else {
        let mut args = vec![paths.wsl.clone()];
        args.extend(wsl_distro_args(distro, id));
        args.extend(["--cd".to_string(), "~".to_string()]);
        args
    };
    let argument_list = args.iter().map(|arg| quote_windows_arg(arg)).collect::<Vec<_>>().join(" ");
    let ps_command = terminal_preview_script(package_family_name, &argument_list);
    log::debug!("Opening Windows Terminal Preview via PowerShell: {}", ps_command);
    wsl_command(&paths.powershell)
        .args(["-NoProfile", "-Command", &ps_command])
        .spawn()
        .map_err(|e| {
            WslError::CommandFailed(format!(
                "Failed to open Windows Terminal Preview: {}. Is it installed from the Microsoft Store?",
                e
            ))
        })?;
    Ok(())
}

/// Open cmd.exe with wsl
fn open_terminal_cmd(distro: &str, id: Option<&str>) -> Result<(), WslError> {
    let paths = get_executable_paths();
    let distro_args = wsl_distro_args(distro, id);
    log::debug!("Opening cmd terminal: {} /C start {} {} {} --cd ~", paths.cmd, paths.wsl, distro_args[0], distro_args[1]);
    wsl_command(&paths.cmd)
        .args(["/C", "start", &paths.wsl, &distro_args[0], &distro_args[1], "--cd", "~"])
        .spawn()
        .map_err(|e| WslError::CommandFailed(e.to_string()))?;
    Ok(())
}

/// Check if a command template contains any placeholders
fn has_template_placeholders(cmd: &str) -> bool {
    cmd.contains("$DISTRO_ARGS") || cmd.contains("$DISTRO_NAME") || cmd.contains("$DISTRO_ID") || cmd.contains("$WSL")
}

/// Expand template placeholders in a command string for regular distributions
/// Placeholders:
///   $WSL - path to wsl.exe
///   $DISTRO_ARGS - expands to "--distribution-id <guid> --cd ~" (preferred)
///   $DISTRO_ID - distribution GUID on WSL >= 2.4.4, falls back to name on older WSL (legacy)
///   $DISTRO_NAME - distribution name (legacy)
fn expand_template(template: &str, distro: &str, id: Option<&str>, wsl_path: &str) -> String {
    let result = replace_template_value(template, "$WSL", wsl_path);

    // $DISTRO_ARGS expands to the full distribution identification args
    let distro_args = match id.filter(|_| supports_distribution_id()) {
        Some(guid) => format!("--distribution-id {} --cd ~", strip_guid_braces(guid)),
        None => format!("-d \"{}\" --cd ~", distro),
    };
    let result = result.replace("$DISTRO_ARGS", &distro_args);

    // Legacy placeholders for backwards compatibility
    let result = replace_template_value(&result, "$DISTRO_NAME", distro);
    let distro_id = id.filter(|_| supports_distribution_id())
        .map(|g| strip_guid_braces(g))
        .unwrap_or_else(|| distro.to_string());
    replace_template_value(&result, "$DISTRO_ID", &distro_id)
}

/// Preserve a scalar placeholder as one argument, respecting template quotes.
fn replace_template_value(template: &str, placeholder: &str, value: &str) -> String {
    let mut result = String::new();
    let mut previous = 0;
    let mut in_quotes = false;
    for (index, _) in template.match_indices(placeholder) {
        let prefix = &template[previous..index];
        in_quotes ^= prefix.matches('"').count() % 2 != 0;
        result.push_str(prefix);
        if !in_quotes && value.chars().any(char::is_whitespace) {
            result.push('"');
            result.push_str(value);
            result.push('"');
        } else {
            result.push_str(value);
        }
        previous = index + placeholder.len();
    }
    result.push_str(&template[previous..]);
    result
}

/// Expand template placeholders for system terminal
/// $DISTRO_ARGS expands to "--system --cd ~"
fn expand_template_system(template: &str, wsl_path: &str) -> String {
    let result = replace_template_value(template, "$WSL", wsl_path);
    let result = result.replace("$DISTRO_ARGS", "--system --cd ~");
    // Clear legacy placeholders (not applicable for system terminal)
    let result = result.replace("$DISTRO_NAME", "");
    result.replace("$DISTRO_ID", "")
}

/// Open a custom terminal using template expansion or legacy pattern matching
fn open_terminal_custom(distro: &str, id: Option<&str>, terminal_cmd: &str) -> Result<(), WslError> {
    let paths = get_executable_paths();
    log::debug!("Opening custom terminal '{}' for distro '{}'", terminal_cmd, distro);

    // If command contains template placeholders, expand and execute
    if has_template_placeholders(terminal_cmd) {
        let expanded = expand_template(terminal_cmd, distro, id, &paths.wsl);

        // Split the expanded command into program and args
        // Use shell-words style splitting to handle quoted arguments
        let (program, args) = parse_terminal_command(&expanded);
        if program.is_empty() {
            return Err(WslError::CommandFailed("Empty terminal command".to_string()));
        }

        log::debug!("Custom terminal expanded: {} {:?}", program, args);
        return wsl_command(&program)
            .args(&args)
            .spawn()
            .map(|_| ())
            .map_err(|e| {
                WslError::CommandFailed(format!(
                    "Failed to open terminal with command '{}': {}",
                    expanded, e
                ))
            });
    }

    // Legacy fallback: try common patterns for simple terminal names
    let distro_args = wsl_distro_args(distro, id);

    // Pattern 1: Terminal that can run wsl directly
    log::debug!("Trying custom terminal pattern 1: {} {} {} {} --cd ~", terminal_cmd, paths.wsl, distro_args[0], distro_args[1]);
    if wsl_command(terminal_cmd)
        .args([&paths.wsl, &distro_args[0], &distro_args[1], "--cd", "~"])
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    // Pattern 2: Terminal with -e to execute a command
    log::debug!("Trying custom terminal pattern 2: {} -e {} {} {} --cd ~", terminal_cmd, paths.wsl, distro_args[0], distro_args[1]);
    if wsl_command(terminal_cmd)
        .args(["-e", &paths.wsl, &distro_args[0], &distro_args[1], "--cd", "~"])
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    // Pattern 3: Terminal with --command or -c flag
    log::debug!("Trying custom terminal pattern 3: {} --command {} {} {} --cd ~", terminal_cmd, paths.wsl, distro_args[0], distro_args[1]);
    if wsl_command(terminal_cmd)
        .args(["--command", &paths.wsl, &distro_args[0], &distro_args[1], "--cd", "~"])
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    Err(WslError::CommandFailed(format!(
        "Failed to open terminal '{}'. Try using a template with placeholders, e.g.: {} -e $WSL --distribution-id $DISTRO_ID --cd ~",
        terminal_cmd, terminal_cmd
    )))
}

// === System Terminal Helper Functions ===

/// Auto-detect terminal for system shell: try Windows Terminal Preview, then Windows Terminal, fall back to cmd
fn open_system_terminal_auto() -> Result<(), WslError> {
    let cache = STORE_TERMINALS_CACHE.get_or_init(RealTerminalExecutor::detect_store_terminals_impl);

    // Try Windows Terminal Preview first if installed
    if let Some(preview) = cache.get("wt-preview").filter(|t| t.installed) {
        if open_system_terminal_wt_preview_with_package(&preview.package_family_name).is_ok() {
            return Ok(());
        }
    }

    // Try Windows Terminal (stable) if installed
    if cache.get("wt").map(|t| t.installed).unwrap_or(false) {
        if open_system_terminal_wt().is_ok() {
            return Ok(());
        }
    }

    // Fall back to cmd
    open_system_terminal_cmd()
}

/// Open Windows Terminal with WSL system shell
fn open_system_terminal_wt() -> Result<(), WslError> {
    let paths = get_executable_paths();
    log::debug!("Opening Windows Terminal for system shell: {} {} --system --cd ~", paths.windows_terminal, paths.wsl);
    wsl_command(&paths.windows_terminal)
        .args([&paths.wsl, "--system", "--cd", "~"])
        .spawn()
        .map_err(|e| {
            WslError::CommandFailed(format!(
                "Failed to open Windows Terminal: {}. Is it installed?",
                e
            ))
        })?;
    Ok(())
}

/// Open Windows Terminal Preview with WSL system shell
fn open_system_terminal_wt_preview() -> Result<(), WslError> {
    let package_family_name = get_cached_package_family_name("wt-preview")
        .unwrap_or_else(|| "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe".to_string());
    open_system_terminal_wt_preview_with_package(&package_family_name)
}

/// Open Windows Terminal Preview with a specific package family name for system shell
fn open_system_terminal_wt_preview_with_package(package_family_name: &str) -> Result<(), WslError> {
    let paths = get_executable_paths();
    let ps_command = format!(
        "Start-Process 'shell:AppsFolder\\{}!App' -ArgumentList 'wsl','--system','--cd','~'",
        package_family_name
    );

    log::debug!("Opening Windows Terminal Preview for system shell via PowerShell: {}", ps_command);
    wsl_command(&paths.powershell)
        .args(["-NoProfile", "-Command", &ps_command])
        .spawn()
        .map_err(|e| {
            WslError::CommandFailed(format!(
                "Failed to open Windows Terminal Preview: {}. Is it installed from the Microsoft Store?",
                e
            ))
        })?;
    Ok(())
}

/// Open cmd.exe with wsl --system
fn open_system_terminal_cmd() -> Result<(), WslError> {
    let paths = get_executable_paths();
    log::debug!("Opening cmd for system shell: {} /C start {} --system --cd ~", paths.cmd, paths.wsl);
    wsl_command(&paths.cmd)
        .args(["/C", "start", &paths.wsl, "--system", "--cd", "~"])
        .spawn()
        .map_err(|e| WslError::CommandFailed(e.to_string()))?;
    Ok(())
}

/// Open a custom terminal with wsl --system using template expansion or legacy patterns
fn open_system_terminal_custom(terminal_cmd: &str) -> Result<(), WslError> {
    let paths = get_executable_paths();
    log::debug!("Opening custom terminal '{}' for system shell", terminal_cmd);

    // If command contains template placeholders, expand and execute
    if has_template_placeholders(terminal_cmd) {
        let expanded = expand_template_system(terminal_cmd, &paths.wsl);

        let (program, args) = parse_terminal_command(&expanded);
        if program.is_empty() {
            return Err(WslError::CommandFailed("Empty terminal command".to_string()));
        }

        log::debug!("Custom system terminal expanded: {} {:?}", program, args);
        return wsl_command(&program)
            .args(&args)
            .spawn()
            .map(|_| ())
            .map_err(|e| {
                WslError::CommandFailed(format!(
                    "Failed to open terminal with command '{}': {}",
                    expanded, e
                ))
            });
    }

    // Legacy fallback: try common patterns for simple terminal names
    // Pattern 1: Terminal that can run wsl directly
    log::debug!("Trying custom system terminal pattern 1: {} {} --system --cd ~", terminal_cmd, paths.wsl);
    if wsl_command(terminal_cmd)
        .args([&paths.wsl, "--system", "--cd", "~"])
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    // Pattern 2: Terminal with -e to execute a command
    log::debug!("Trying custom system terminal pattern 2: {} -e {} --system --cd ~", terminal_cmd, paths.wsl);
    if wsl_command(terminal_cmd)
        .args(["-e", &paths.wsl, "--system", "--cd", "~"])
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    // Pattern 3: Terminal with --command or -c flag
    log::debug!("Trying custom system terminal pattern 3: {} --command {} --system --cd ~", terminal_cmd, paths.wsl);
    if wsl_command(terminal_cmd)
        .args(["--command", &paths.wsl, "--system", "--cd", "~"])
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    Err(WslError::CommandFailed(format!(
        "Failed to open terminal '{}'. Try using a template, e.g.: {} -e $WSL $DISTRO_ARGS",
        terminal_cmd, terminal_cmd
    )))
}

// === Terminal with Command Helper Functions ===

/// Encode user code before crossing cmd.exe, PowerShell, and WT parsers.
/// Bash decodes the UTF-8 bytes in its own process, preserving shell syntax.
fn bash_action_script(command: &str) -> String {
    let script = format!(
        "{} && echo && echo Done. Press Enter to close... && read || (echo && echo Command failed. Press Enter to close... && read)",
        command,
    );
    // Keep common text compact; escape bytes that any intervening shell could
    // interpret, plus non-ASCII bytes to preserve UTF-8 across code pages.
    let encoded: String = script.bytes().map(|byte| {
        if byte.is_ascii_alphanumeric() || b" _-/.:,=+".contains(&byte) {
            char::from(byte).to_string()
        } else {
            format!(r"\x{byte:02x}")
        }
    }).collect();
    // Keep eval outside an AND/OR list: testing its status would suppress
    // `set -e` inside user code. Encode the existing completion prompt too.
    format!("eval -- $'{}'", encoded)
}

/// Quote a single native Windows argument, including backslashes before quotes.
fn quote_windows_arg(value: &str) -> String {
    let mut quoted = String::from("\"");
    let mut backslashes = 0;
    for character in value.chars() {
        if character == '\\' {
            backslashes += 1;
            continue;
        }
        quoted.extend(std::iter::repeat('\\').take(if character == '"' { backslashes * 2 + 1 } else { backslashes }));
        quoted.push(character);
        backslashes = 0;
    }
    quoted.extend(std::iter::repeat('\\').take(backslashes * 2));
    quoted.push('"');
    quoted
}

fn terminal_action_args(wsl: &str, distro_args: &[String], profile: Option<&str>, command: &str) -> String {
    let mut args = Vec::new();
    if let Some(profile) = profile {
        args.extend(["-p".to_string(), profile.to_string()]);
    }
    args.push(wsl.to_string());
    args.extend_from_slice(distro_args);
    args.extend(["--cd", "~", "--", "bash", "-c"].map(String::from));
    args.push(bash_action_script(command));
    args.iter().map(|arg| quote_windows_arg(arg)).collect::<Vec<_>>().join(" ")
}
fn terminal_preview_script(package: &str, args: &str) -> String {
    format!("Start-Process 'shell:AppsFolder\\{}!App' -ArgumentList '{}'",
        package.replace('\'', "''"), args.replace('\'', "''"))
}

fn validate_terminal_command_length(program: &str, args: &str, limit: usize, terminal: &str) -> Result<(), WslError> {
    // Include the quoted executable, separator, and terminating NUL. Windows
    // limits UTF-16 code units rather than UTF-8 bytes or Unicode characters.
    let length = quote_windows_arg(program).encode_utf16().count() + 1 + args.encode_utf16().count() + 1;
    if length > limit {
        return Err(WslError::CommandFailed(format!(
            "This action is too long for {terminal} ({length} command-line characters; limit {limit}). Save the command in a script inside WSL and run that script from the action."
        )));
    }
    Ok(())
}
/// Auto-detect terminal and run command
fn open_terminal_with_command_auto(distro: &str, id: Option<&str>, command: &str) -> Result<(), WslError> {
    let cache = STORE_TERMINALS_CACHE.get_or_init(RealTerminalExecutor::detect_store_terminals_impl);

    // Try Windows Terminal Preview first if installed
    if let Some(preview) = cache.get("wt-preview").filter(|t| t.installed) {
        if open_terminal_with_command_wt_preview_with_package(distro, id, command, &preview.package_family_name).is_ok() {
            return Ok(());
        }
    }

    // Try Windows Terminal (stable) if installed
    if cache.get("wt").map(|t| t.installed).unwrap_or(false) {
        if open_terminal_with_command_wt(distro, id, command).is_ok() {
            return Ok(());
        }
    }

    // Fall back to cmd
    open_terminal_with_command_cmd(distro, id, command)
}

/// Open Windows Terminal and execute a command
fn open_terminal_with_command_wt(distro: &str, id: Option<&str>, command: &str) -> Result<(), WslError> {
    let paths = get_executable_paths();
    let distro_args = wsl_distro_args(distro, id);

    let settings_path = get_wt_settings_path();
    let profile = wt_profile_exists(distro, &settings_path).then_some(distro);
    let wt_args = terminal_action_args(&paths.wsl, &distro_args, profile, command);
    validate_terminal_command_length(&paths.windows_terminal, &wt_args, 32767, "Windows Terminal")?;
    log::debug!("Opening Windows Terminal for action in {}", distro);
    wsl_command(&paths.windows_terminal)
        .raw_arg(&wt_args)
        .spawn()
        .map_err(|e| {
            WslError::CommandFailed(format!(
                "Failed to open Windows Terminal: {}. Is it installed?",
                e
            ))
        })?;
    Ok(())
}

/// Open Windows Terminal Preview and execute a command
fn open_terminal_with_command_wt_preview(distro: &str, id: Option<&str>, command: &str) -> Result<(), WslError> {
    let package_family_name = get_cached_package_family_name("wt-preview")
        .unwrap_or_else(|| "Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe".to_string());
    open_terminal_with_command_wt_preview_with_package(distro, id, command, &package_family_name)
}

/// Open Windows Terminal Preview with specific package and execute a command
fn open_terminal_with_command_wt_preview_with_package(distro: &str, id: Option<&str>, command: &str, package_family_name: &str) -> Result<(), WslError> {
    let paths = get_executable_paths();
    let distro_args = wsl_distro_args(distro, id);

    let settings_path = get_wt_preview_settings_path();
    let profile = wt_profile_exists(distro, &settings_path).then_some(distro);
    let wt_args = terminal_action_args(&paths.wsl, &distro_args, profile, command);
    let ps_command = terminal_preview_script(package_family_name, &wt_args);
    let ps_args = ["-NoProfile", "-Command", &ps_command].map(quote_windows_arg).join(" ");
    validate_terminal_command_length(&paths.powershell, &ps_args, 32767, "Windows Terminal Preview")?;

    log::debug!("Opening Windows Terminal Preview for action in {}", distro);
    wsl_command(&paths.powershell)
        .args(["-NoProfile", "-Command", &ps_command])
        .spawn()
        .map_err(|e| {
            WslError::CommandFailed(format!(
                "Failed to open Windows Terminal Preview: {}. Is it installed from the Microsoft Store?",
                e
            ))
        })?;
    Ok(())
}

/// Open cmd.exe and execute a command in WSL
fn open_terminal_with_command_cmd(distro: &str, id: Option<&str>, command: &str) -> Result<(), WslError> {
    let paths = get_executable_paths();
    let distro_args = wsl_distro_args(distro, id);
    log::debug!("Opening cmd for action in {}", distro);
    cmd_action_command(&paths.cmd, &paths.wsl, &distro_args, command)?
        .spawn()
        .map_err(|e| WslError::CommandFailed(e.to_string()))?;
    Ok(())
}

fn cmd_action_command(cmd: &str, wsl: &str, distro_args: &[String], command: &str) -> Result<std::process::Command, WslError> {
    const CREATE_NEW_CONSOLE: u32 = 0x00000010;
    let args = format!("/D /S /K \"{}\"", terminal_action_args(wsl, distro_args, None, command));
    validate_terminal_command_length(cmd, &args, 8191, "Command Prompt")?;
    let mut process = wsl_command(cmd);
    // This process is the requested interactive terminal. Replace the helper's
    // CREATE_NO_WINDOW flag so cmd and its WSL child get a visible console.
    process.creation_flags(CREATE_NEW_CONSOLE);
    process.raw_arg(args);
    Ok(process)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_terminal_action_keeps_long_plain_commands_under_cmd_limit() {
        let source = format!("echo {}", "a".repeat(6000));
        let args = terminal_action_args("wsl.exe", &["-d".into(), "Ubuntu".into()], None, &source);
        assert!(args.encode_utf16().count() < 8000, "ordinary action expanded beyond cmd capacity");
        assert_eq!(action_source(windows_arguments(&args).last().unwrap()), source);
        assert!(cmd_action_command("cmd.exe", "wsl.exe", &["-d".into(), "Ubuntu".into()], &source).is_ok());
    }

    #[test]
    fn test_cmd_action_rejects_oversized_encoded_command_before_spawn() {
        let error = cmd_action_command("cmd.exe", "wsl.exe", &["-d".into(), "Ubuntu".into()], &"'".repeat(2100)).unwrap_err().to_string();
        assert!(error.contains("too long for Command Prompt"));
        assert!(error.contains("script inside WSL"));
        assert!(!error.contains("''''"));
    }

    #[test]
    fn test_terminal_length_guard_counts_serialized_utf16_and_terminator() {
        // Quoted x, separator, surrogate pair, NUL = seven UTF-16 units.
        assert!(validate_terminal_command_length("x", "😀", 7, "test terminal").is_ok());
        assert!(validate_terminal_command_length("x", "😀", 6, "test terminal").is_err());
        assert!(validate_terminal_command_length("wt.exe", &"x".repeat(32767), 32767, "Windows Terminal").is_err());
    }

    #[test]
    fn test_terminal_action_transport_preserves_every_non_nul_ascii_byte() {
        let source: String = (1u8..=127).map(char::from).collect();
        let args = terminal_action_args("wsl.exe", &["-d".into(), "Ubuntu".into()], None, &source);
        assert_eq!(action_source(windows_arguments(&args).last().unwrap()), source);
    }

    #[test]
    fn test_cmd_action_builder_keeps_interactive_arguments_and_utf8_environment() {
        let process = cmd_action_command("cmd.exe", r"C:\Program Files\WSL\wsl.exe", &["-d".into(), "Ubuntu 22.04 LTS".into()], "echo 'hello'").unwrap();
        assert_eq!(process.get_program(), "cmd.exe");
        assert!(process.get_envs().any(|(name, value)| name == "WSL_UTF8" && value == Some(std::ffi::OsStr::new("1"))));
        let args: Vec<_> = process.get_args().map(|arg| arg.to_string_lossy().into_owned()).collect();
        assert_eq!(args.len(), 1);
        let inner = args[0].strip_prefix("/D /S /K \"").unwrap().strip_suffix('"').unwrap();
        let parsed = windows_arguments(inner);
        assert_eq!(&parsed[..8], &[r"C:\Program Files\WSL\wsl.exe", "-d", "Ubuntu 22.04 LTS", "--cd", "~", "--", "bash", "-c"]);
        assert_eq!(action_source(&parsed[8]), "echo 'hello'");
        assert!(!args[0].contains("echo 'hello'"));
        assert!(args[0].contains("eval --"));
    }

    #[cfg(windows)]
    fn windows_arguments(command: &str) -> Vec<String> {
        use std::os::windows::ffi::OsStrExt;
        #[link(name = "shell32", kind = "raw-dylib")]
        extern "system" { fn CommandLineToArgvW(command: *const u16, count: *mut i32) -> *mut *mut u16; }
        #[link(name = "kernel32", kind = "raw-dylib")]
        extern "system" { fn LocalFree(memory: *mut std::ffi::c_void) -> *mut std::ffi::c_void; }
        let wide: Vec<u16> = std::ffi::OsStr::new(&format!("terminal.exe {command}")).encode_wide().chain(Some(0)).collect();
        let mut count = 0;
        unsafe {
            let args = CommandLineToArgvW(wide.as_ptr(), &mut count);
            assert!(!args.is_null());
            let result = std::slice::from_raw_parts(args, count as usize).iter().skip(1).map(|&arg| {
                let mut len = 0;
                while *arg.add(len) != 0 { len += 1; }
                String::from_utf16(std::slice::from_raw_parts(arg, len)).unwrap()
            }).collect();
            LocalFree(args.cast());
            result
        }
    }

    // Decode the transport independently to check the bytes Bash receives.
    fn action_source(script: &str) -> String {
        let decoded = if let Some(encoded) = script.strip_prefix("eval -- $'").and_then(|s| s.strip_suffix('\'')) {
            let mut bytes = Vec::new();
            let mut remaining = encoded;
            while !remaining.is_empty() {
                if remaining.starts_with(r"\x") {
                    bytes.push(u8::from_str_radix(&remaining[2..4], 16).unwrap());
                    remaining = &remaining[4..];
                } else {
                    bytes.push(remaining.as_bytes()[0]);
                    remaining = &remaining[1..];
                }
            }
            String::from_utf8(bytes).unwrap()
        } else {
            script.to_string()
        };
        decoded.split(" && echo && echo Done.").next().unwrap().to_string()
    }

    #[cfg(windows)]
    #[test]
    fn test_terminal_action_keeps_distro_and_executable_paths_as_single_arguments() {
        let args = terminal_action_args(r"C:\Program Files\WSL\wsl.exe", &["-d".into(), "Ubuntu 22.04 LTS".into()], Some("Ubuntu 22.04 LTS"), "echo hello");
        let parsed = windows_arguments(&args);
        assert_eq!(&parsed[..10], &["-p", "Ubuntu 22.04 LTS", r"C:\Program Files\WSL\wsl.exe", "-d", "Ubuntu 22.04 LTS", "--cd", "~", "--", "bash", "-c"]);
    }

    #[cfg(windows)]
    #[test]
    fn test_terminal_action_preserves_bash_source_through_windows_arguments() {
        for command in ["echo 'hi'", r#"awk '{print $1}' /etc/hostname"#, r#"printf '%s\n' "hello"; echo %PATH% !VAR! & echo café"#] {
            let args = terminal_action_args("wsl", &["-d".into(), "Ubuntu".into()], None, command);
            let parsed = windows_arguments(&args);
            assert_eq!(action_source(parsed.last().unwrap()), command);
        }
    }

    #[test]
    fn test_custom_terminal_template_preserves_quoted_paths_and_distro_name() {
        let expanded = expand_template(
            r#""C:\Program Files\Terminal\terminal.exe" -e "$WSL" -d "$DISTRO_NAME""#,
            "Ubuntu 22.04 LTS", None, r"C:\Program Files\WSL\wsl.exe",
        );
        assert_eq!(parse_terminal_command(&expanded), (
            r"C:\Program Files\Terminal\terminal.exe".into(),
            vec!["-e".into(), r"C:\Program Files\WSL\wsl.exe".into(), "-d".into(), "Ubuntu 22.04 LTS".into()],
        ));
    }

    #[test]
    fn test_custom_terminal_template_preserves_unquoted_placeholders_with_spaces() {
        let expanded = expand_template(
            "terminal -e $WSL $DISTRO_ARGS", "My Distro", None, r"C:\Program Files\WSL\wsl.exe",
        );
        assert_eq!(parse_terminal_command(&expanded).1, ["-e", r"C:\Program Files\WSL\wsl.exe", "-d", "My Distro", "--cd", "~"]);
    }

    #[test]
    fn test_custom_system_terminal_template_preserves_quoted_program_and_wsl_path() {
        let expanded = expand_template_system(
            r#""C:\Program Files\Terminal\terminal.exe" -e $WSL $DISTRO_ARGS"#,
            r"C:\Program Files\WSL\wsl.exe",
        );
        assert_eq!(parse_terminal_command(&expanded), (
            r"C:\Program Files\Terminal\terminal.exe".into(),
            vec!["-e".into(), r"C:\Program Files\WSL\wsl.exe".into(), "--system".into(), "--cd".into(), "~".into()],
        ));
    }

    #[test]
    fn test_strip_guid_braces_with_braces() {
        assert_eq!(
            strip_guid_braces("{3c002dba-d670-4eed-b0c2-97e6eb929d06}"),
            "3c002dba-d670-4eed-b0c2-97e6eb929d06"
        );
    }

    #[test]
    fn test_strip_guid_braces_without_braces() {
        assert_eq!(
            strip_guid_braces("3c002dba-d670-4eed-b0c2-97e6eb929d06"),
            "3c002dba-d670-4eed-b0c2-97e6eb929d06"
        );
    }

    #[test]
    fn test_strip_guid_braces_uppercase() {
        assert_eq!(
            strip_guid_braces("{3C002DBA-D670-4EED-B0C2-97E6EB929D06}"),
            "3C002DBA-D670-4EED-B0C2-97E6EB929D06"
        );
    }

    /// Write a WT settings.json to a temp file and return its path.
    /// The caller must keep the returned `PathBuf` alive; the file is cleaned
    /// up when `_guard` (the temp dir path) is removed via `TempSettingsGuard`.
    struct TempSettingsGuard(PathBuf);
    impl Drop for TempSettingsGuard {
        fn drop(&mut self) { let _ = std::fs::remove_dir_all(&self.0); }
    }

    fn write_settings(content: &str) -> (TempSettingsGuard, PathBuf) {
        use std::time::{SystemTime, UNIX_EPOCH};
        let ts = SystemTime::now().duration_since(UNIX_EPOCH).unwrap().subsec_nanos();
        let dir = std::env::temp_dir().join(format!("wsl-ui-test-{}", ts));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("settings.json");
        std::fs::write(&path, content).unwrap();
        (TempSettingsGuard(dir), path)
    }

    // --- wt_profile_exists ---

    #[test]
    fn test_wt_profile_exists_found_with_space() {
        let (_dir, path) = write_settings(
            r#"{"profiles":{"list":[{"name": "Ubuntu 22.04 LTS"}]}}"#,
        );
        assert!(wt_profile_exists("Ubuntu 22.04 LTS", &path));
    }

    #[test]
    fn test_wt_profile_exists_found_simple() {
        let (_dir, path) = write_settings(r#"{"profiles":[{"name": "DevBox"}]}"#);
        assert!(wt_profile_exists("DevBox", &path));
    }

    #[test]
    fn test_wt_profile_exists_not_found() {
        let (_dir, path) = write_settings(r#"{"profiles":[{"name": "OtherDistro"}]}"#);
        assert!(!wt_profile_exists("DevBox", &path));
    }

    #[test]
    fn test_wt_profile_exists_missing_file() {
        let path = PathBuf::from("/nonexistent/settings.json");
        assert!(!wt_profile_exists("DevBox", &path));
    }

    #[test]
    fn test_wt_profile_exists_compact_json() {
        let (_dir, path) = write_settings(r#"{"profiles":[{"name":"Ubuntu 22.04"}]}"#);
        assert!(wt_profile_exists("Ubuntu 22.04", &path));
    }

    #[cfg(windows)]
    #[test]
    fn test_preview_script_preserves_argument_list_through_powershell() {
        let args = terminal_action_args("wsl", &["-d".into(), "Ubuntu 22.04 LTS".into()], Some("Ubuntu 22.04 LTS"), "echo 'hi'");
        let script = terminal_preview_script("Microsoft.WindowsTerminalPreview_8wekyb3d8bbwe", &args);
        // Capture the real PowerShell parameter binding without opening a terminal.
        let probe = format!("function Start-Process {{ param($FilePath, $ArgumentList) Write-Output $ArgumentList }}; {}", script);
        let output = hidden_command("powershell.exe").args(["-NoProfile", "-Command", &probe]).output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
        assert_eq!(String::from_utf8_lossy(&output.stdout).trim(), args);
        assert_eq!(action_source(windows_arguments(&args).last().unwrap()), "echo 'hi'");
    }
}
