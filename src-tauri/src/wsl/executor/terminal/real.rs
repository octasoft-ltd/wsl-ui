//! Real terminal executor - launches actual terminal/IDE/explorer/download/container applications

use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::OnceLock;
#[cfg(windows)]
use std::os::windows::process::CommandExt;

use super::{ContainerRuntime, InstalledTerminal, TerminalExecutor};
use crate::settings::get_executable_paths;
use crate::utils::hidden_command;
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
        if hidden_command(&paths.wsl)
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

/// Generate WSL arguments for identifying a distribution
/// Uses --distribution-id when available for reliable identification
fn wsl_distro_args(name: &str, id: Option<&str>) -> Vec<String> {
    match id {
        Some(guid) => vec!["--distribution-id".to_string(), guid.to_string()],
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

    // When we have a distribution ID, always use wsl --distribution-id to ensure
    // we target the correct distribution even when duplicate profile names exist
    let args: Vec<String> = if id.is_some() {
        let mut args = vec![paths.wsl.clone()];
        args.extend(wsl_distro_args(distro, id));
        args.extend(["--cd".to_string(), "~".to_string()]);
        args
    } else {
        // Fallback: only use profile matching when no ID is available
        let settings_path = get_wt_settings_path();
        let use_profile = wt_profile_exists(distro, &settings_path);
        if use_profile {
            vec!["-p".to_string(), distro.to_string()]
        } else {
            let mut args = vec![paths.wsl.clone()];
            args.extend(wsl_distro_args(distro, id));
            args.extend(["--cd".to_string(), "~".to_string()]);
            args
        }
    };

    log::debug!("Opening Windows Terminal: {} {:?}", paths.windows_terminal, args);
    hidden_command(&paths.windows_terminal)
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

    // When we have a distribution ID, always use wsl --distribution-id to ensure
    // we target the correct distribution even when duplicate profile names exist
    let ps_command = if id.is_some() {
        let distro_args = wsl_distro_args(distro, id);
        format!(
            "Start-Process 'shell:AppsFolder\\{}!App' -ArgumentList 'wsl','{}','{}','--cd','~'",
            package_family_name, distro_args[0], distro_args[1]
        )
    } else {
        // Fallback: only use profile matching when no ID is available
        let settings_path = get_wt_preview_settings_path();
        let use_profile = wt_profile_exists(distro, &settings_path);
        if use_profile {
            format!(
                "Start-Process 'shell:AppsFolder\\{}!App' -ArgumentList '-p','{}'",
                package_family_name, distro
            )
        } else {
            let distro_args = wsl_distro_args(distro, id);
            format!(
                "Start-Process 'shell:AppsFolder\\{}!App' -ArgumentList 'wsl','{}','{}','--cd','~'",
                package_family_name, distro_args[0], distro_args[1]
            )
        }
    };

    log::debug!("Opening Windows Terminal Preview via PowerShell: {}", ps_command);
    hidden_command(&paths.powershell)
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
    hidden_command(&paths.cmd)
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
///   $DISTRO_ID - distribution GUID (legacy)
///   $DISTRO_NAME - distribution name (legacy)
fn expand_template(template: &str, distro: &str, id: Option<&str>, wsl_path: &str) -> String {
    let result = template.replace("$WSL", wsl_path);

    // $DISTRO_ARGS expands to the full distribution identification args
    let distro_args = match id {
        Some(guid) => format!("--distribution-id {} --cd ~", guid),
        None => format!("-d {} --cd ~", distro),
    };
    let result = result.replace("$DISTRO_ARGS", &distro_args);

    // Legacy placeholders for backwards compatibility
    let result = result.replace("$DISTRO_NAME", distro);
    let distro_id = id.unwrap_or(distro);
    result.replace("$DISTRO_ID", distro_id)
}

/// Expand template placeholders for system terminal
/// $DISTRO_ARGS expands to "--system --cd ~"
fn expand_template_system(template: &str, wsl_path: &str) -> String {
    let result = template.replace("$WSL", wsl_path);
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
        let parts: Vec<&str> = expanded.split_whitespace().collect();
        if parts.is_empty() {
            return Err(WslError::CommandFailed("Empty terminal command".to_string()));
        }

        let program = parts[0];
        let args: Vec<&str> = parts[1..].to_vec();

        log::debug!("Custom terminal expanded: {} {:?}", program, args);
        return hidden_command(program)
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
    if hidden_command(terminal_cmd)
        .args([&paths.wsl, &distro_args[0], &distro_args[1], "--cd", "~"])
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    // Pattern 2: Terminal with -e to execute a command
    log::debug!("Trying custom terminal pattern 2: {} -e {} {} {} --cd ~", terminal_cmd, paths.wsl, distro_args[0], distro_args[1]);
    if hidden_command(terminal_cmd)
        .args(["-e", &paths.wsl, &distro_args[0], &distro_args[1], "--cd", "~"])
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    // Pattern 3: Terminal with --command or -c flag
    log::debug!("Trying custom terminal pattern 3: {} --command {} {} {} --cd ~", terminal_cmd, paths.wsl, distro_args[0], distro_args[1]);
    if hidden_command(terminal_cmd)
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
    hidden_command(&paths.windows_terminal)
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
    hidden_command(&paths.powershell)
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
    hidden_command(&paths.cmd)
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

        let parts: Vec<&str> = expanded.split_whitespace().collect();
        if parts.is_empty() {
            return Err(WslError::CommandFailed("Empty terminal command".to_string()));
        }

        let program = parts[0];
        let args: Vec<&str> = parts[1..].to_vec();

        log::debug!("Custom system terminal expanded: {} {:?}", program, args);
        return hidden_command(program)
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
    if hidden_command(terminal_cmd)
        .args([&paths.wsl, "--system", "--cd", "~"])
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    // Pattern 2: Terminal with -e to execute a command
    log::debug!("Trying custom system terminal pattern 2: {} -e {} --system --cd ~", terminal_cmd, paths.wsl);
    if hidden_command(terminal_cmd)
        .args(["-e", &paths.wsl, "--system", "--cd", "~"])
        .spawn()
        .is_ok()
    {
        return Ok(());
    }

    // Pattern 3: Terminal with --command or -c flag
    log::debug!("Trying custom system terminal pattern 3: {} --command {} --system --cd ~", terminal_cmd, paths.wsl);
    if hidden_command(terminal_cmd)
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

/// Escape a command for use in bash -c "..."
/// Escapes single quotes by replacing ' with '\''
fn escape_for_bash(cmd: &str) -> String {
    cmd.replace('\'', "'\\''")
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

    // For Windows Terminal, we need to be careful about argument parsing.
    // WT treats `;` as a command separator for multiple tabs.
    // Solution: Use `&&` for command chaining instead of `;`
    // Also escape the command for bash by replacing ' with '\''
    let escaped_cmd = escape_for_bash(command);

    // Build bash script using && to avoid WT's ; parsing
    // The final `&& read || read` ensures we wait for Enter regardless of command success
    let bash_script = format!(
        "{} && echo && echo Done. Press Enter to close... && read || (echo && echo Command failed. Press Enter to close... && read)",
        escaped_cmd
    );

    // Escape backslashes and double quotes for the command line
    let cmd_escaped = bash_script
        .replace('\\', "\\\\")
        .replace('"', "\\\"");

    // Build the command line for wt.exe directly
    // Using double quotes for the bash -c argument
    let wt_args = format!(
        "{} {} {} --cd ~ -- bash -c \"{}\"",
        paths.wsl,
        distro_args[0],
        distro_args[1],
        cmd_escaped
    );

    log::debug!("Opening Windows Terminal with command: {} {}", paths.windows_terminal, wt_args);
    hidden_command(&paths.windows_terminal)
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

    // Escape for bash: replace single quotes with '\''
    let escaped_cmd = escape_for_bash(command);

    // Build bash script using && to avoid WT's ; parsing
    // The final `&& read || read` ensures we wait for Enter regardless of command success
    let bash_script = format!(
        "{} && echo && echo Done. Press Enter to close... && read || (echo && echo Command failed. Press Enter to close... && read)",
        escaped_cmd
    );

    // Escape backslashes and double quotes for the command line
    let cmd_escaped = bash_script
        .replace('\\', "\\\\")
        .replace('"', "\\\"");

    // Build the argument list as a single string
    // Use double quotes for bash -c argument
    let wt_args = format!(
        "wsl {} {} --cd ~ -- bash -c \"{}\"",
        distro_args[0],
        distro_args[1],
        cmd_escaped
    );

    // Escape for PowerShell string (escape single quotes by doubling them)
    let ps_escaped_args = wt_args.replace('\'', "''");

    // Build PowerShell command - use shell:AppsFolder to launch store app
    let ps_command = format!(
        "Start-Process 'shell:AppsFolder\\{}!App' -ArgumentList '{}'",
        package_family_name,
        ps_escaped_args
    );

    log::debug!("Opening Windows Terminal Preview with command via PowerShell: {}", ps_command);
    hidden_command(&paths.powershell)
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

    // Escape for bash: replace single quotes with '\''
    let escaped_cmd = escape_for_bash(command);

    // Build bash script using && to chain commands
    // The final `&& read || read` ensures we wait for Enter regardless of command success
    let bash_script = format!(
        "{} && echo && echo Done. Press Enter to close... && read || (echo && echo Command failed. Press Enter to close... && read)",
        escaped_cmd
    );

    // Escape backslashes and double quotes for the command line
    let cmd_escaped = bash_script
        .replace('\\', "\\\\")
        .replace('"', "\\\"");

    // Build the command line for cmd.exe
    // cmd /K keeps window open, using double quotes for bash -c argument
    let cmd_args = format!(
        "/K {} {} {} --cd ~ -- bash -c \"{}\"",
        paths.wsl,
        distro_args[0],
        distro_args[1],
        cmd_escaped
    );

    log::debug!("Opening cmd with command: cmd {}", cmd_args);
    hidden_command(&paths.cmd)
        .raw_arg(&cmd_args)
        .spawn()
        .map_err(|e| WslError::CommandFailed(e.to_string()))?;
    Ok(())
}
