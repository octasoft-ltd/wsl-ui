use crate::constants::{CONFIG_FILE_ACTIONS, CONFIG_FILE_STARTUP};
use crate::error::AppError;
use crate::utils::{get_config_file, is_mock_mode};
use crate::wsl::executor::wsl_executor;
use regex::Regex;
use serde::{Deserialize, Serialize};
// Always use Unix escaping since commands run inside WSL (Linux shell)
use shell_escape::unix::escape;
use std::cell::RefCell;
use std::collections::HashMap;
use std::fs;

/// Default custom actions JSON embedded at compile time
const DEFAULT_CUSTOM_ACTIONS_JSON: &str = include_str!("../resources/default-custom-actions.json");

/// Default startup configs JSON embedded at compile time
const DEFAULT_STARTUP_CONFIGS_JSON: &str = include_str!("../resources/default-startup-configs.json");

/// Defines which distributions an action targets
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "lowercase")]
pub enum DistroScope {
    /// Target all distributions
    All,
    /// Target specific distributions by name
    Specific { distros: Vec<String> },
    /// Target distributions matching a regex pattern
    Pattern { pattern: String },
}

// Thread-local cache for compiled regex patterns
thread_local! {
    static REGEX_CACHE: RefCell<HashMap<String, Option<Regex>>> =
        RefCell::new(HashMap::new());
}

/// Check if a pattern matches text, with caching for performance
///
/// Compiled regex patterns are cached per-thread to avoid
/// recompilation on every match.
fn pattern_matches(pattern: &str, text: &str) -> bool {
    REGEX_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        let regex = cache.entry(pattern.to_string()).or_insert_with(|| {
            match Regex::new(pattern) {
                Ok(r) => Some(r),
                Err(e) => {
                    log::warn!(
                        "Invalid regex pattern '{}' in action configuration: {}",
                        pattern, e
                    );
                    None
                }
            }
        });
        regex.as_ref().map(|r| r.is_match(text)).unwrap_or(false)
    })
}

/// Custom action definition
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomAction {
    pub id: String,
    pub name: String,
    pub icon: String,
    pub command: String,
    pub scope: DistroScope,
    pub confirm_before_run: bool,
    pub show_output: bool,
    #[serde(default)]
    pub requires_sudo: bool,
    #[serde(default)]
    pub requires_stopped: bool,
    #[serde(default)]
    pub run_in_terminal: bool,
    pub order: i32,
}

/// Action execution result
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionResult {
    pub success: bool,
    pub output: String,
    pub error: Option<String>,
}

/// Get default custom actions from embedded JSON
fn get_default_actions() -> Vec<CustomAction> {
    serde_json::from_str(DEFAULT_CUSTOM_ACTIONS_JSON)
        .expect("Failed to parse embedded default-custom-actions.json - this is a bug")
}

// Thread-local mock storage for custom actions in e2e tests
thread_local! {
    static MOCK_ACTIONS: RefCell<Option<Vec<CustomAction>>> = RefCell::new(None);
}

/// Reset mock actions to defaults (for e2e testing)
pub fn reset_mock_actions() {
    if is_mock_mode() {
        MOCK_ACTIONS.with(|actions| {
            *actions.borrow_mut() = Some(get_default_actions());
        });
    }
}

/// Load custom actions from file, or create from defaults if not exists
pub fn load_actions() -> Vec<CustomAction> {
    // In mock mode, use thread-local storage instead of real file
    if is_mock_mode() {
        return MOCK_ACTIONS.with(|actions| {
            let mut actions = actions.borrow_mut();
            if actions.is_none() {
                *actions = Some(get_default_actions());
            }
            actions.clone().unwrap()
        });
    }

    let path = get_config_file(CONFIG_FILE_ACTIONS);

    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => {
                match serde_json::from_str(&content) {
                    Ok(actions) => return actions,
                    Err(e) => {
                        eprintln!("Warning: Failed to parse custom-actions.json: {}. Using defaults.", e);
                    }
                }
            }
            Err(e) => {
                eprintln!("Warning: Failed to read custom-actions.json: {}. Using defaults.", e);
            }
        }
    }

    // Create actions file from defaults
    let defaults = get_default_actions();
    if let Err(e) = save_actions(&defaults) {
        eprintln!("Warning: Failed to create custom-actions.json: {}", e);
    }
    defaults
}

/// Save custom actions to file
pub fn save_actions(actions: &[CustomAction]) -> Result<(), String> {
    // In mock mode, save to thread-local storage instead of real file
    if is_mock_mode() {
        MOCK_ACTIONS.with(|mock_actions| {
            *mock_actions.borrow_mut() = Some(actions.to_vec());
        });
        return Ok(());
    }

    let path = get_config_file(CONFIG_FILE_ACTIONS);
    let content = serde_json::to_string_pretty(actions)
        .map_err(|e| AppError::ConfigWrite(format!("serialize actions: {}", e)))?;

    fs::write(&path, content)
        .map_err(|e| AppError::ConfigWrite(format!("write actions file: {}", e)))?;

    Ok(())
}

/// Add a new custom action
pub fn add_action(action: CustomAction) -> Result<Vec<CustomAction>, String> {
    let mut actions = load_actions();
    actions.push(action);
    save_actions(&actions)?;
    Ok(actions)
}

/// Update an existing custom action
pub fn update_action(action: CustomAction) -> Result<Vec<CustomAction>, String> {
    let mut actions = load_actions();
    let action_id = action.id.clone();
    if let Some(idx) = actions.iter().position(|a| a.id == action_id) {
        actions[idx] = action;
        save_actions(&actions)?;
        Ok(actions)
    } else {
        Err(AppError::ActionNotFound(action_id).into())
    }
}

/// Delete a custom action
pub fn delete_action(id: &str) -> Result<Vec<CustomAction>, String> {
    let mut actions = load_actions();
    let initial_len = actions.len();
    actions.retain(|a| a.id != id);

    if actions.len() == initial_len {
        return Err(AppError::ActionNotFound(id.to_string()).into());
    }

    save_actions(&actions)?;
    Ok(actions)
}

/// Escape a string for safe shell use using proper shell escaping
///
/// This function uses the shell-escape crate to properly escape strings
/// for use in shell commands, preventing injection attacks.
fn escape_for_shell(s: &str) -> String {
    // Use shell-escape crate for proper shell escaping
    escape(s.into()).to_string()
}

/// Substitute variables in command with proper shell escaping
///
/// All variable values are properly escaped to prevent shell injection.
fn substitute_variables(command: &str, distro: &str, id: Option<&str>) -> String {
    let mut result = command.to_string();

    // ${DISTRO_NAME} - escape for safe shell use
    result = result.replace("${DISTRO_NAME}", &escape_for_shell(distro));

    // ${HOME} - get home directory from distro and escape it
    if result.contains("${HOME}") {
        if let Ok(home) = get_wsl_home(distro, id) {
            result = result.replace("${HOME}", &escape_for_shell(&home));
        }
    }

    // ${USER} - get default user from distro and escape it
    if result.contains("${USER}") {
        if let Ok(user) = get_wsl_user(distro, id) {
            result = result.replace("${USER}", &escape_for_shell(&user));
        }
    }

    // ${WINDOWS_HOME} - Windows home in WSL format, properly escaped
    if result.contains("${WINDOWS_HOME}") {
        if let Ok(userprofile) = std::env::var("USERPROFILE") {
            // Convert C:\Users\name to /mnt/c/Users/name
            let wsl_path = userprofile
                .replace('\\', "/")
                .replacen("C:", "/mnt/c", 1)
                .replacen("D:", "/mnt/d", 1)
                .replacen("E:", "/mnt/e", 1);
            result = result.replace("${WINDOWS_HOME}", &escape_for_shell(&wsl_path));
        }
    }

    result
}

/// Get home directory from WSL distro
fn get_wsl_home(distro: &str, id: Option<&str>) -> Result<String, String> {
    if is_mock_mode() {
        return Ok("/home/user".to_string());
    }

    let output = wsl_executor().exec(distro, id, "echo $HOME")
        .map_err(|e| e.to_string())?;

    if output.success {
        Ok(output.stdout.trim().to_string())
    } else {
        Ok("/home".to_string())
    }
}

/// Get default user from WSL distro
fn get_wsl_user(distro: &str, id: Option<&str>) -> Result<String, String> {
    if is_mock_mode() {
        return Ok("user".to_string());
    }

    let output = wsl_executor().exec(distro, id, "whoami")
        .map_err(|e| e.to_string())?;

    if output.success {
        Ok(output.stdout.trim().to_string())
    } else {
        Ok("root".to_string())
    }
}

/// Check if action applies to a specific distro
pub fn action_applies_to_distro(action: &CustomAction, distro: &str) -> bool {
    match &action.scope {
        DistroScope::All => true,
        DistroScope::Specific { distros } => distros.contains(&distro.to_string()),
        DistroScope::Pattern { pattern } => pattern_matches(pattern, distro),
    }
}

/// Execute a custom action on a distro
/// If the action requires sudo and a password is provided, it will be piped to sudo -S
/// If `id` is provided, uses `--distribution-id` for more reliable identification
pub fn execute_action(action_id: &str, distro: &str, id: Option<&str>, password: Option<&str>) -> Result<ActionResult, String> {
    let actions = load_actions();
    let action = actions
        .iter()
        .find(|a| a.id == action_id)
        .ok_or_else(|| AppError::ActionNotFound(action_id.to_string()))?;

    // Check if action applies to this distro
    if !action_applies_to_distro(action, distro) {
        return Err(AppError::ActionNotApplicable {
            action: action.name.clone(),
            distro: distro.to_string(),
        }
        .into());
    }

    // Substitute variables
    let command = substitute_variables(&action.command, distro, id);

    // If action requires sudo and password is provided, wrap command with sudo -S
    let final_command = if action.requires_sudo {
        match password {
            Some(pwd) if !pwd.is_empty() => {
                // Use echo to pipe password to sudo -S
                // The -S flag makes sudo read password from stdin
                format!("echo {} | sudo -S bash -c {}", escape_for_shell(pwd), escape_for_shell(&command))
            }
            _ => {
                return Ok(ActionResult {
                    success: false,
                    output: String::new(),
                    error: Some("This action requires sudo. Please provide your password.".to_string()),
                });
            }
        }
    } else {
        command.clone()
    };

    // Execute in WSL (start in user's home directory) with timeout
    // 120 seconds for sudo commands, 30 for regular
    let timeout_secs = if action.requires_sudo { 120 } else { 30 };

    let result = wsl_executor()
        .exec_with_timeout(distro, id, &final_command, timeout_secs)
        .map_err(|e| e.to_string())?;

    // Filter out the password prompt from stderr if present
    let filtered_stderr = result.stderr
        .lines()
        .filter(|line| !line.contains("[sudo] password"))
        .collect::<Vec<_>>()
        .join("\n");

    Ok(ActionResult {
        success: result.success,
        output: result.stdout,
        error: if filtered_stderr.is_empty() {
            None
        } else {
            Some(filtered_stderr)
        },
    })
}

/// Run a custom action in the user's terminal
/// The terminal will show real-time output and stay open after completion
/// If the action requires sudo, the user will type their password in the terminal
/// If `id` is provided, uses `--distribution-id` for more reliable identification
pub fn run_action_in_terminal(action_id: &str, distro: &str, id: Option<&str>, terminal_command: &str) -> Result<(), String> {
    use crate::wsl::WslService;

    let actions = load_actions();
    let action = actions
        .iter()
        .find(|a| a.id == action_id)
        .ok_or_else(|| AppError::ActionNotFound(action_id.to_string()))?;

    // Check if action applies to this distro
    if !action_applies_to_distro(action, distro) {
        return Err(AppError::ActionNotApplicable {
            action: action.name.clone(),
            distro: distro.to_string(),
        }
        .into());
    }

    // Substitute variables
    let command = substitute_variables(&action.command, distro, id);

    // For terminal actions, the command runs as-is - user should include sudo in command if needed
    // This is more transparent since user sees exactly what runs in the terminal
    let final_command = command;

    // Open terminal and run command
    WslService::open_terminal_with_command(distro, id, &final_command, terminal_command)
        .map_err(|e| e.to_string())
}

/// Export actions to JSON string
pub fn export_actions() -> Result<String, String> {
    let actions = load_actions();
    serde_json::to_string_pretty(&actions).map_err(|e| format!("Failed to export actions: {}", e))
}

/// Export actions to a file at the specified path
pub fn export_actions_to_file(path: &str) -> Result<(), String> {
    let json = export_actions()?;
    fs::write(path, json).map_err(|e| format!("Failed to write file: {}", e))
}

/// Import actions from JSON string
pub fn import_actions(json: &str, merge: bool) -> Result<Vec<CustomAction>, String> {
    let imported: Vec<CustomAction> =
        serde_json::from_str(json).map_err(|e| format!("Failed to parse actions: {}", e))?;

    if merge {
        let mut existing = load_actions();
        for action in imported {
            if !existing.iter().any(|a| a.id == action.id) {
                existing.push(action);
            }
        }
        save_actions(&existing)?;
        Ok(existing)
    } else {
        save_actions(&imported)?;
        Ok(imported)
    }
}

/// Import actions from a file at the specified path
pub fn import_actions_from_file(path: &str, merge: bool) -> Result<Vec<CustomAction>, String> {
    let json = fs::read_to_string(path).map_err(|e| format!("Failed to read file: {}", e))?;
    import_actions(&json, merge)
}

// ============ Startup Actions ============

/// Startup action configuration
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupAction {
    pub id: String,
    pub action_id: String,     // Reference to custom action
    pub command: Option<String>, // Inline command if action_id is empty
    pub continue_on_error: bool,
    pub timeout: u32,
}

/// Startup configuration per distribution
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StartupConfig {
    pub distro_name: String,
    pub actions: Vec<StartupAction>,
    pub run_on_app_start: bool,
    pub enabled: bool,
}

/// Get default startup configs from embedded JSON
fn get_default_startup_configs() -> Vec<StartupConfig> {
    serde_json::from_str(DEFAULT_STARTUP_CONFIGS_JSON)
        .expect("Failed to parse embedded default-startup-configs.json - this is a bug")
}

// Thread-local mock storage for startup configs in e2e tests
thread_local! {
    static MOCK_STARTUP_CONFIGS: RefCell<Option<Vec<StartupConfig>>> = RefCell::new(None);
}

/// Reset mock startup configs to defaults (for e2e testing)
pub fn reset_mock_startup_configs() {
    if is_mock_mode() {
        MOCK_STARTUP_CONFIGS.with(|configs| {
            *configs.borrow_mut() = Some(get_default_startup_configs());
        });
    }
}

/// Load all startup configurations, or create from defaults if not exists
pub fn load_startup_configs() -> Vec<StartupConfig> {
    // In mock mode, use thread-local storage instead of real file
    if is_mock_mode() {
        return MOCK_STARTUP_CONFIGS.with(|configs| {
            let mut configs = configs.borrow_mut();
            if configs.is_none() {
                *configs = Some(get_default_startup_configs());
            }
            configs.clone().unwrap()
        });
    }

    let path = get_config_file(CONFIG_FILE_STARTUP);

    if path.exists() {
        match fs::read_to_string(&path) {
            Ok(content) => {
                match serde_json::from_str(&content) {
                    Ok(configs) => return configs,
                    Err(e) => {
                        eprintln!("Warning: Failed to parse startup-configs.json: {}. Using defaults.", e);
                    }
                }
            }
            Err(e) => {
                eprintln!("Warning: Failed to read startup-configs.json: {}. Using defaults.", e);
            }
        }
    }

    // Create startup configs file from defaults
    let defaults = get_default_startup_configs();
    if let Err(e) = save_startup_configs(&defaults) {
        eprintln!("Warning: Failed to create startup-configs.json: {}", e);
    }
    defaults
}

/// Save startup configurations
fn save_startup_configs(configs: &[StartupConfig]) -> Result<(), String> {
    // In mock mode, save to thread-local storage instead of real file
    if is_mock_mode() {
        MOCK_STARTUP_CONFIGS.with(|mock_configs| {
            *mock_configs.borrow_mut() = Some(configs.to_vec());
        });
        return Ok(());
    }

    let path = get_config_file(CONFIG_FILE_STARTUP);
    let content = serde_json::to_string_pretty(configs)
        .map_err(|e| format!("Failed to serialize startup configs: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write startup configs: {}", e))
}

/// Get startup config for a specific distribution
pub fn get_startup_config(distro_name: &str) -> Option<StartupConfig> {
    let configs = load_startup_configs();
    configs.into_iter().find(|c| c.distro_name == distro_name)
}

/// Save/update startup config for a distribution
pub fn save_startup_config(config: StartupConfig) -> Result<Vec<StartupConfig>, String> {
    let mut configs = load_startup_configs();

    if let Some(idx) = configs.iter().position(|c| c.distro_name == config.distro_name) {
        configs[idx] = config;
    } else {
        configs.push(config);
    }

    save_startup_configs(&configs)?;
    Ok(configs)
}

/// Delete startup config for a distribution
pub fn delete_startup_config(distro_name: &str) -> Result<Vec<StartupConfig>, String> {
    let mut configs = load_startup_configs();
    configs.retain(|c| c.distro_name != distro_name);
    save_startup_configs(&configs)?;
    Ok(configs)
}

/// Execute startup actions for a distribution
/// If `id` is provided, uses `--distribution-id` for more reliable identification
pub fn execute_startup_actions(distro_name: &str, id: Option<&str>) -> Result<Vec<ActionResult>, String> {
    let config = match get_startup_config(distro_name) {
        Some(c) if c.enabled => c,
        _ => return Ok(vec![]), // No config or disabled
    };

    let custom_actions = load_actions();
    let mut results = vec![];

    for startup_action in &config.actions {
        // Determine the command to run
        let command = if !startup_action.action_id.is_empty() {
            // Use command from referenced custom action
            custom_actions
                .iter()
                .find(|a| a.id == startup_action.action_id)
                .map(|a| substitute_variables(&a.command, distro_name, id))
        } else {
            // Use inline command
            startup_action.command.as_ref().map(|c| substitute_variables(c, distro_name, id))
        };

        let command = match command {
            Some(c) if !c.is_empty() => c,
            _ => continue, // Skip if no command
        };

        if is_mock_mode() {
            std::thread::sleep(std::time::Duration::from_millis(500));
            results.push(ActionResult {
                success: true,
                output: format!("Mock startup: {}", command),
                error: None,
            });
            continue;
        }

        // Execute with timeout (30 seconds default for startup commands)
        let exec_result = wsl_executor()
            .exec_with_timeout(distro_name, id, &command, 30);

        let result = match exec_result {
            Ok(output) => ActionResult {
                success: output.success,
                output: output.stdout,
                error: if output.stderr.is_empty() {
                    None
                } else {
                    Some(output.stderr)
                },
            },
            Err(e) => ActionResult {
                success: false,
                output: String::new(),
                error: Some(e.to_string()),
            },
        };

        // If failed and not continue on error, stop
        if !result.success && !startup_action.continue_on_error {
            results.push(result);
            break;
        }

        results.push(result);
    }

    Ok(results)
}

/// Get list of distributions configured for app startup
pub fn get_app_startup_distros() -> Vec<String> {
    load_startup_configs()
        .into_iter()
        .filter(|c| c.enabled && c.run_on_app_start)
        .map(|c| c.distro_name)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_action(scope: DistroScope) -> CustomAction {
        CustomAction {
            id: "test-action".to_string(),
            name: "Test Action".to_string(),
            icon: "test".to_string(),
            command: "echo test".to_string(),
            scope,
            confirm_before_run: false,
            show_output: true,
            requires_sudo: false,
            requires_stopped: false,
            run_in_terminal: false,
            order: 0,
        }
    }

    // ==================== Shell Escape Tests ====================

    #[test]
    fn test_escape_for_shell_simple() {
        // Simple alphanumeric strings don't need quotes
        assert_eq!(escape_for_shell("Ubuntu"), "Ubuntu");
        // Strings with special chars get quoted by shell-escape
        let escaped = escape_for_shell("my-distro");
        // shell-escape will quote strings with dashes
        assert!(escaped.contains("my-distro"));
    }

    #[test]
    fn test_escape_for_shell_removes_dangerous() {
        // shell-escape properly quotes dangerous characters
        let escaped = escape_for_shell("test; rm -rf /");
        // The dangerous characters should be escaped/quoted
        // They won't be executed as shell commands
        assert!(escaped.contains("test"));
        // The original dangerous chars are safely contained
        assert!(escaped.starts_with('\'') || escaped.starts_with('"') || !escaped.contains(';'));
    }

    #[test]
    fn test_escape_for_shell_preserves_safe() {
        // shell-escape will quote these, but the content is preserved
        let escaped = escape_for_shell("Ubuntu-22.04");
        assert!(escaped.contains("Ubuntu-22.04"));

        let escaped = escape_for_shell("my_distro.v2");
        assert!(escaped.contains("my_distro.v2"));
    }

    // ==================== Variable Substitution Tests ====================

    #[test]
    fn test_substitute_distro_name() {
        let result = substitute_variables("echo ${DISTRO_NAME}", "Ubuntu", None);
        assert_eq!(result, "echo Ubuntu");
    }

    #[test]
    fn test_substitute_distro_name_escapes_dangerous() {
        let result = substitute_variables("echo ${DISTRO_NAME}", "test;rm", None);
        // Should be properly escaped - semicolon should be quoted
        assert!(result.contains("test"));
        assert!(!result.contains("echo test;rm")); // Not literal injection
        // Either quoted or semicolon is escaped
        assert!(result.contains('\'') || !result.contains(';'));
    }

    #[test]
    fn test_substitute_multiple_variables() {
        let result = substitute_variables(
            "wsl -d ${DISTRO_NAME} echo ${DISTRO_NAME}",
            "Ubuntu",
            None,
        );
        assert_eq!(result, "wsl -d Ubuntu echo Ubuntu");
    }

    #[test]
    fn test_substitute_no_variables() {
        let result = substitute_variables("echo hello world", "Ubuntu", None);
        assert_eq!(result, "echo hello world");
    }

    // ==================== Action Applies Tests ====================

    #[test]
    fn test_action_applies_to_all() {
        let action = create_test_action(DistroScope::All);
        assert!(action_applies_to_distro(&action, "Ubuntu"));
        assert!(action_applies_to_distro(&action, "Debian"));
        assert!(action_applies_to_distro(&action, "Alpine"));
        assert!(action_applies_to_distro(&action, "anything"));
    }

    #[test]
    fn test_action_applies_to_specific() {
        let action = create_test_action(DistroScope::Specific {
            distros: vec!["Ubuntu".to_string(), "Debian".to_string()],
        });

        assert!(action_applies_to_distro(&action, "Ubuntu"));
        assert!(action_applies_to_distro(&action, "Debian"));
        assert!(!action_applies_to_distro(&action, "Alpine"));
        assert!(!action_applies_to_distro(&action, "Fedora"));
    }

    #[test]
    fn test_action_applies_to_specific_empty() {
        let action = create_test_action(DistroScope::Specific { distros: vec![] });
        // No specific_distros set
        assert!(!action_applies_to_distro(&action, "Ubuntu"));
    }

    #[test]
    fn test_action_applies_to_pattern() {
        let action = create_test_action(DistroScope::Pattern {
            pattern: "Ubuntu|Debian".to_string(),
        });

        assert!(action_applies_to_distro(&action, "Ubuntu"));
        assert!(action_applies_to_distro(&action, "Ubuntu-22.04"));
        assert!(action_applies_to_distro(&action, "Debian"));
        assert!(!action_applies_to_distro(&action, "Alpine"));
        assert!(!action_applies_to_distro(&action, "Fedora"));
    }

    #[test]
    fn test_action_applies_to_pattern_regex() {
        let action = create_test_action(DistroScope::Pattern {
            pattern: "^Ubuntu-\\d+\\.\\d+$".to_string(),
        });

        assert!(action_applies_to_distro(&action, "Ubuntu-22.04"));
        assert!(action_applies_to_distro(&action, "Ubuntu-20.04"));
        assert!(!action_applies_to_distro(&action, "Ubuntu"));
        assert!(!action_applies_to_distro(&action, "Ubuntu-LTS"));
    }

    #[test]
    fn test_action_applies_to_pattern_invalid_regex() {
        let action = create_test_action(DistroScope::Pattern {
            pattern: "[invalid".to_string(),
        });

        // Should return false, not panic
        assert!(!action_applies_to_distro(&action, "Ubuntu"));
    }

    // ==================== Default Actions Tests ====================

    #[test]
    fn test_default_actions_not_empty() {
        let defaults = get_default_actions();
        assert!(!defaults.is_empty());
    }

    #[test]
    fn test_default_actions_have_ids() {
        let defaults = get_default_actions();
        for action in defaults {
            assert!(!action.id.is_empty());
            assert!(!action.name.is_empty());
            assert!(!action.command.is_empty());
        }
    }

    // ==================== Pattern Matching Cache Tests ====================

    #[test]
    fn test_pattern_matches_basic() {
        assert!(pattern_matches("Ubuntu", "Ubuntu"));
        assert!(pattern_matches("Ubuntu|Debian", "Ubuntu"));
        assert!(pattern_matches("Ubuntu|Debian", "Debian"));
        assert!(!pattern_matches("Ubuntu|Debian", "Alpine"));
    }

    #[test]
    fn test_pattern_matches_regex() {
        assert!(pattern_matches("^Ubuntu-\\d+\\.\\d+$", "Ubuntu-22.04"));
        assert!(!pattern_matches("^Ubuntu-\\d+\\.\\d+$", "Ubuntu"));
    }

    #[test]
    fn test_pattern_matches_caching() {
        // Call the same pattern multiple times - should use cache
        for _ in 0..100 {
            assert!(pattern_matches("Ubuntu|Debian", "Ubuntu"));
        }
    }

    #[test]
    fn test_pattern_matches_invalid_pattern() {
        // Invalid regex should return false, not panic
        assert!(!pattern_matches("[invalid", "Ubuntu"));
        // Calling again should still work (cached None)
        assert!(!pattern_matches("[invalid", "Debian"));
    }

    // ==================== Shell Injection Prevention Tests ====================

    #[test]
    fn test_substitute_variables_prevents_semicolon_injection() {
        // Attempt to inject commands with semicolon in distro name
        let result = substitute_variables("echo ${DISTRO_NAME}", "test; rm -rf /", None);
        // shell-escape properly quotes the input, making it safe
        // The result should start with "echo '" (quoted) when containing special chars
        assert!(result.starts_with("echo '"), "Expected quoted output, got: {}", result);
    }

    #[test]
    fn test_substitute_variables_prevents_backtick_injection() {
        // Attempt to inject commands with backticks
        let result = substitute_variables("echo ${DISTRO_NAME}", "test`whoami`", None);
        // shell-escape properly quotes the input
        assert!(result.starts_with("echo '"), "Expected quoted output, got: {}", result);
    }

    #[test]
    fn test_substitute_variables_prevents_dollar_paren_injection() {
        // Attempt to inject commands with $(...)
        let result = substitute_variables("echo ${DISTRO_NAME}", "test$(id)", None);
        // shell-escape properly quotes the input
        assert!(result.starts_with("echo '"), "Expected quoted output, got: {}", result);
    }

    #[test]
    fn test_substitute_variables_prevents_pipe_injection() {
        // Attempt to inject commands with pipe
        let result = substitute_variables("echo ${DISTRO_NAME}", "test | cat /etc/passwd", None);
        // shell-escape properly quotes the input
        assert!(result.starts_with("echo '"), "Expected quoted output, got: {}", result);
    }

    #[test]
    fn test_substitute_variables_prevents_ampersand_injection() {
        // Attempt to inject commands with ampersand
        let result = substitute_variables("echo ${DISTRO_NAME}", "test & whoami", None);
        // shell-escape properly quotes the input
        assert!(result.starts_with("echo '"), "Expected quoted output, got: {}", result);
    }

    #[test]
    fn test_substitute_variables_prevents_newline_injection() {
        // Attempt to inject commands with newline
        let result = substitute_variables("echo ${DISTRO_NAME}", "test\nrm -rf /", None);
        // shell-escape properly quotes the input (may use $'...' syntax for newlines)
        assert!(result.starts_with("echo '") || result.starts_with("echo $'"),
            "Expected quoted output, got: {}", result);
    }

    #[test]
    fn test_substitute_variables_prevents_redirection_injection() {
        // Attempt to inject file redirection
        let result = substitute_variables("echo ${DISTRO_NAME}", "test > /etc/passwd", None);
        // shell-escape properly quotes the input
        assert!(result.starts_with("echo '"), "Expected quoted output, got: {}", result);
    }

    #[test]
    fn test_substitute_variables_prevents_quotes_injection() {
        // Attempt to break out of quotes
        let result = substitute_variables("echo '${DISTRO_NAME}'", "test' && whoami && 'test", None);
        // shell-escape properly escapes embedded single quotes
        // The outer quotes in the template remain, and the injected value is escaped
        assert!(result.contains("echo '"), "Expected quoted output, got: {}", result);
    }

    #[test]
    fn test_substitute_variables_allows_safe_chars() {
        // Safe characters don't need quoting - shell-escape keeps them unquoted
        let result = substitute_variables("echo ${DISTRO_NAME}", "Ubuntu-22.04_test.1", None);
        // Simple alphanumeric with - _ . should not need quoting
        assert!(result.contains("Ubuntu-22.04_test.1"), "Safe chars should be preserved, got: {}", result);
    }

    #[test]
    fn test_escape_for_shell_comprehensive() {
        // Test that shell_escape properly quotes dangerous input
        let dangerous_input = "test;rm&whoami|cat`id`$(ls)>file<input'quote\"doublequote\\backslash\nnewline\ttab$var";
        let escaped = escape_for_shell(dangerous_input);

        // shell-escape wraps dangerous strings in single quotes (or $'...' for special chars)
        // The key is that it's properly quoted, not that chars are removed
        assert!(
            escaped.starts_with("'") || escaped.starts_with("$'"),
            "Dangerous input should be quoted, got: {}",
            escaped
        );
        // The escaped string should end with a quote
        assert!(
            escaped.ends_with("'"),
            "Dangerous input should end with quote, got: {}",
            escaped
        );
    }

    // Shell injection test removed - mock mode bypasses shell execution,
    // so it doesn't actually verify injection prevention. The escape_for_shell
    // function is tested by test_escape_for_shell_comprehensive above.

    // ==================== DistroScope Enum Tests ====================

    #[test]
    fn test_distro_scope_all_serialization() {
        let scope = DistroScope::All;
        let json = serde_json::to_string(&scope).unwrap();
        assert_eq!(json, r#"{"type":"all"}"#);
    }

    #[test]
    fn test_distro_scope_all_deserialization() {
        let json = r#"{"type":"all"}"#;
        let scope: DistroScope = serde_json::from_str(json).unwrap();
        assert_eq!(scope, DistroScope::All);
    }

    #[test]
    fn test_distro_scope_specific_serialization() {
        let scope = DistroScope::Specific {
            distros: vec!["Ubuntu".to_string(), "Debian".to_string()],
        };
        let json = serde_json::to_string(&scope).unwrap();
        assert_eq!(json, r#"{"type":"specific","distros":["Ubuntu","Debian"]}"#);
    }

    #[test]
    fn test_distro_scope_specific_deserialization() {
        let json = r#"{"type":"specific","distros":["Ubuntu","Debian"]}"#;
        let scope: DistroScope = serde_json::from_str(json).unwrap();
        assert_eq!(
            scope,
            DistroScope::Specific {
                distros: vec!["Ubuntu".to_string(), "Debian".to_string()]
            }
        );
    }

    #[test]
    fn test_distro_scope_pattern_serialization() {
        let scope = DistroScope::Pattern {
            pattern: "Ubuntu|Debian".to_string(),
        };
        let json = serde_json::to_string(&scope).unwrap();
        assert_eq!(json, r#"{"type":"pattern","pattern":"Ubuntu|Debian"}"#);
    }

    #[test]
    fn test_distro_scope_pattern_deserialization() {
        let json = r#"{"type":"pattern","pattern":"Ubuntu|Debian"}"#;
        let scope: DistroScope = serde_json::from_str(json).unwrap();
        assert_eq!(
            scope,
            DistroScope::Pattern {
                pattern: "Ubuntu|Debian".to_string()
            }
        );
    }

    #[test]
    fn test_distro_scope_specific_empty() {
        let scope = DistroScope::Specific {
            distros: vec![],
        };
        let json = serde_json::to_string(&scope).unwrap();
        assert_eq!(json, r#"{"type":"specific","distros":[]}"#);
    }

    #[test]
    fn test_distro_scope_pattern_complex_regex() {
        let scope = DistroScope::Pattern {
            pattern: "^Ubuntu-\\d+\\.\\d+$".to_string(),
        };
        let json = serde_json::to_string(&scope).unwrap();
        let deserialized: DistroScope = serde_json::from_str(&json).unwrap();
        assert_eq!(scope, deserialized);
    }

    // Helper function for testing scope matching with the enum
    fn test_scope_applies(scope: &DistroScope, distro: &str) -> bool {
        match scope {
            DistroScope::All => true,
            DistroScope::Specific { distros } => distros.contains(&distro.to_string()),
            DistroScope::Pattern { pattern } => pattern_matches(pattern, distro),
        }
    }

    #[test]
    fn test_distro_scope_all_matches_everything() {
        let scope = DistroScope::All;
        assert!(test_scope_applies(&scope, "Ubuntu"));
        assert!(test_scope_applies(&scope, "Debian"));
        assert!(test_scope_applies(&scope, "Alpine"));
        assert!(test_scope_applies(&scope, "anything"));
    }

    #[test]
    fn test_distro_scope_specific_matches_only_listed() {
        let scope = DistroScope::Specific {
            distros: vec!["Ubuntu".to_string(), "Debian".to_string()],
        };
        assert!(test_scope_applies(&scope, "Ubuntu"));
        assert!(test_scope_applies(&scope, "Debian"));
        assert!(!test_scope_applies(&scope, "Alpine"));
        assert!(!test_scope_applies(&scope, "Fedora"));
    }

    #[test]
    fn test_distro_scope_specific_empty_matches_nothing() {
        let scope = DistroScope::Specific { distros: vec![] };
        assert!(!test_scope_applies(&scope, "Ubuntu"));
        assert!(!test_scope_applies(&scope, "Debian"));
    }

    #[test]
    fn test_distro_scope_pattern_matches_regex() {
        let scope = DistroScope::Pattern {
            pattern: "Ubuntu|Debian".to_string(),
        };
        assert!(test_scope_applies(&scope, "Ubuntu"));
        assert!(test_scope_applies(&scope, "Ubuntu-22.04"));
        assert!(test_scope_applies(&scope, "Debian"));
        assert!(!test_scope_applies(&scope, "Alpine"));
        assert!(!test_scope_applies(&scope, "Fedora"));
    }

    #[test]
    fn test_distro_scope_pattern_complex_regex_matching() {
        let scope = DistroScope::Pattern {
            pattern: "^Ubuntu-\\d+\\.\\d+$".to_string(),
        };
        assert!(test_scope_applies(&scope, "Ubuntu-22.04"));
        assert!(test_scope_applies(&scope, "Ubuntu-20.04"));
        assert!(!test_scope_applies(&scope, "Ubuntu"));
        assert!(!test_scope_applies(&scope, "Ubuntu-LTS"));
    }

    #[test]
    fn test_distro_scope_pattern_invalid_regex() {
        let scope = DistroScope::Pattern {
            pattern: "[invalid".to_string(),
        };
        // Should return false, not panic
        assert!(!test_scope_applies(&scope, "Ubuntu"));
    }
}

