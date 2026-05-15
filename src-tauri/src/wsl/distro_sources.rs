//! WSL Distribution Sources management
//!
//! Manages the HKLM registry values that point WSL's native install flow
//! (`wsl --list --online` / `wsl --install <name>`) at custom community
//! distribution manifests.
//!
//! Microsoft documents two registry values under
//! `HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Windows\CurrentVersion\Lxss`:
//!
//! - `DistributionListUrl` (REG_SZ)        — **replaces** the default manifest URL
//! - `DistributionListUrlAppend` (REG_SZ)  — **adds** distros from that URL
//!
//! Reads of HKLM do not require elevation; writes do. We use the existing
//! `Start-Process -Verb RunAs` PowerShell pattern (see `executor/resource/real.rs`)
//! to perform writes and clears.

use serde::{Deserialize, Serialize};

use crate::utils::is_mock_mode;
use crate::wsl::types::WslError;

/// Always treat tests as mock mode (avoids touching the real registry / network).
fn effective_mock_mode() -> bool {
    is_mock_mode() || cfg!(test)
}

/// Registry path under `HKEY_LOCAL_MACHINE` for the WSL distribution list values.
pub const HKLM_LXSS_PATH: &str =
    r"SOFTWARE\Microsoft\Windows\CurrentVersion\Lxss";

/// Registry value name for the override URL (replaces the default list).
pub const VALUE_DISTRIBUTION_LIST_URL: &str = "DistributionListUrl";
/// Registry value name for the append URL (additive to the default list).
pub const VALUE_DISTRIBUTION_LIST_URL_APPEND: &str = "DistributionListUrlAppend";

/// How a custom manifest URL relates to the default Microsoft list.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum DistroSourceMode {
    /// Add the manifest's distros to the default list (recommended).
    Append,
    /// Replace the default list entirely with this manifest.
    Replace,
}

impl DistroSourceMode {
    pub fn registry_value_name(&self) -> &'static str {
        match self {
            DistroSourceMode::Append => VALUE_DISTRIBUTION_LIST_URL_APPEND,
            DistroSourceMode::Replace => VALUE_DISTRIBUTION_LIST_URL,
        }
    }
}

/// A custom distribution source registered in HKLM.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistroSource {
    pub url: String,
    pub mode: DistroSourceMode,
}

/// Hash variant of an entry in the manifest preview.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntryPreview {
    /// Flavor (the JSON object key under `ModernDistributions`, e.g. "Ubuntu")
    pub flavor: String,
    /// Version name (e.g. "Ubuntu-26.04")
    pub name: String,
    /// Friendly display name (e.g. "Ubuntu 26.04 LTS")
    pub friendly_name: String,
    /// Whether this entry is marked default for its flavor.
    pub default: bool,
    /// Whether an Amd64 download URL is present.
    pub has_amd64: bool,
    /// Whether an Arm64 download URL is present.
    pub has_arm64: bool,
}

/// Parsed preview of a `ModernDistributions` manifest.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ManifestPreview {
    pub url: String,
    pub entries: Vec<ManifestEntryPreview>,
}

// ---------------------------------------------------------------------------
// Manifest JSON shape (see Microsoft Learn / "build-custom-distro")
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct ModernDistributionsRoot {
    #[serde(rename = "ModernDistributions")]
    modern_distributions: serde_json::Map<String, serde_json::Value>,
}

#[derive(Debug, Deserialize)]
struct ModernDistributionEntry {
    #[serde(rename = "Name")]
    name: String,
    #[serde(rename = "FriendlyName", default)]
    friendly_name: Option<String>,
    #[serde(rename = "Default", default)]
    default: bool,
    #[serde(rename = "Amd64Url", default)]
    amd64_url: Option<ModernUrl>,
    #[serde(rename = "Arm64Url", default)]
    arm64_url: Option<ModernUrl>,
}

#[derive(Debug, Deserialize)]
struct ModernUrl {
    #[serde(rename = "Url", default)]
    url: Option<String>,
}

/// Parse a `ModernDistributions` manifest JSON into a UI preview.
///
/// Validates the top-level `ModernDistributions` key exists and that each
/// listed entry has a `Name`. Empty flavor arrays produce no entries but are
/// not an error (a manifest author may legitimately ship an empty version of
/// a flavor).
pub fn parse_manifest(url: &str, body: &str) -> Result<ManifestPreview, WslError> {
    let root: ModernDistributionsRoot = serde_json::from_str(body).map_err(|e| {
        WslError::ParseError(format!(
            "Manifest is not valid ModernDistributions JSON: {}",
            e
        ))
    })?;

    let mut entries = Vec::new();
    for (flavor, value) in &root.modern_distributions {
        let arr: Vec<ModernDistributionEntry> =
            serde_json::from_value(value.clone()).map_err(|e| {
                WslError::ParseError(format!(
                    "Manifest flavor '{}' is not a list of distributions: {}",
                    flavor, e
                ))
            })?;
        for entry in arr {
            if entry.name.trim().is_empty() {
                return Err(WslError::ParseError(format!(
                    "Manifest flavor '{}' has an entry with an empty Name",
                    flavor
                )));
            }
            let has_amd64 = entry
                .amd64_url
                .as_ref()
                .and_then(|u| u.url.as_deref())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);
            let has_arm64 = entry
                .arm64_url
                .as_ref()
                .and_then(|u| u.url.as_deref())
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);
            entries.push(ManifestEntryPreview {
                flavor: flavor.clone(),
                friendly_name: entry.friendly_name.unwrap_or_else(|| entry.name.clone()),
                name: entry.name,
                default: entry.default,
                has_amd64,
                has_arm64,
            });
        }
    }

    Ok(ManifestPreview {
        url: url.to_string(),
        entries,
    })
}

/// Validate a candidate manifest URL. Accepts only `http://`, `https://`, and
/// `file://` (the last requires WSL >= 2.4.4 at install time; we don't gate
/// here because reads of the URL don't depend on WSL).
pub fn validate_url(url: &str) -> Result<(), WslError> {
    let trimmed = url.trim();
    if trimmed.is_empty() {
        return Err(WslError::ParseError("Manifest URL is empty".to_string()));
    }
    let lower = trimmed.to_lowercase();
    if !(lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("file://"))
    {
        return Err(WslError::ParseError(format!(
            "Unsupported manifest URL scheme: '{}' (expected http://, https://, or file://)",
            trimmed
        )));
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Mock state (used in non-Windows / WSL_MOCK builds and tests)
// ---------------------------------------------------------------------------

#[cfg(any(not(target_os = "windows"), test))]
use std::sync::Mutex;

#[cfg(any(not(target_os = "windows"), test))]
lazy_static::lazy_static! {
    static ref MOCK_SOURCE: Mutex<Option<DistroSource>> = Mutex::new(None);
}

/// Reset the in-memory mock distro source. Used by tests and the mock-mode
/// reset command. No-op on real Windows builds.
pub fn reset_mock_distro_source() {
    #[cfg(any(not(target_os = "windows"), test))]
    {
        if let Ok(mut g) = MOCK_SOURCE.lock() {
            *g = None;
        }
    }
}

// ---------------------------------------------------------------------------
// Read current source
// ---------------------------------------------------------------------------

/// Read the currently registered distribution source from HKLM.
///
/// Returns `Ok(None)` when neither value is set. Returns an error when both
/// `DistributionListUrl` and `DistributionListUrlAppend` are set — that state
/// is invalid per Microsoft's spec and should be reset by the user.
pub fn read_current_source() -> Result<Option<DistroSource>, WslError> {
    if effective_mock_mode() {
        return Ok(read_mock_source());
    }
    #[cfg(target_os = "windows")]
    {
        return read_current_source_windows();
    }
    #[cfg(not(target_os = "windows"))]
    {
        Ok(read_mock_source())
    }
}

#[cfg(any(not(target_os = "windows"), test))]
fn read_mock_source() -> Option<DistroSource> {
    MOCK_SOURCE.lock().ok().and_then(|g| g.clone())
}

#[cfg(all(target_os = "windows", not(test)))]
fn read_mock_source() -> Option<DistroSource> {
    None
}

#[cfg(target_os = "windows")]
fn read_current_source_windows() -> Result<Option<DistroSource>, WslError> {
    use winreg::enums::*;
    use winreg::RegKey;

    let hklm = RegKey::predef(HKEY_LOCAL_MACHINE);
    let key = match hklm.open_subkey_with_flags(HKLM_LXSS_PATH, KEY_READ) {
        Ok(k) => k,
        Err(_) => return Ok(None),
    };

    let replace: Option<String> = key.get_value(VALUE_DISTRIBUTION_LIST_URL).ok();
    let append: Option<String> = key.get_value(VALUE_DISTRIBUTION_LIST_URL_APPEND).ok();

    match (replace, append) {
        (Some(r), Some(a)) if !r.trim().is_empty() && !a.trim().is_empty() => Err(
            WslError::ParseError(
                "Both DistributionListUrl and DistributionListUrlAppend are set in the registry. \
                 Reset distribution sources to clear this conflict."
                    .to_string(),
            ),
        ),
        (Some(r), _) if !r.trim().is_empty() => Ok(Some(DistroSource {
            url: r,
            mode: DistroSourceMode::Replace,
        })),
        (_, Some(a)) if !a.trim().is_empty() => Ok(Some(DistroSource {
            url: a,
            mode: DistroSourceMode::Append,
        })),
        _ => Ok(None),
    }
}

// ---------------------------------------------------------------------------
// Apply / clear (write paths — require elevation on real Windows)
// ---------------------------------------------------------------------------

/// Persist a distribution source to HKLM. Requires elevation; prompts the user
/// via UAC. Clears the opposite registry value so we never leave both set.
pub fn apply_source(source: &DistroSource) -> Result<(), WslError> {
    validate_url(&source.url)?;

    if effective_mock_mode() {
        store_mock_source(Some(source.clone()));
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        return apply_source_windows(source);
    }
    #[cfg(not(target_os = "windows"))]
    {
        store_mock_source(Some(source.clone()));
        Ok(())
    }
}

/// Remove both distribution source registry values from HKLM. Requires
/// elevation on real Windows.
pub fn clear_source() -> Result<(), WslError> {
    if effective_mock_mode() {
        store_mock_source(None);
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        return clear_source_windows();
    }
    #[cfg(not(target_os = "windows"))]
    {
        store_mock_source(None);
        Ok(())
    }
}

#[cfg(any(not(target_os = "windows"), test))]
fn store_mock_source(value: Option<DistroSource>) {
    if let Ok(mut g) = MOCK_SOURCE.lock() {
        *g = value;
    }
}

#[cfg(all(target_os = "windows", not(test)))]
fn store_mock_source(_value: Option<DistroSource>) {}

#[cfg(target_os = "windows")]
fn apply_source_windows(source: &DistroSource) -> Result<(), WslError> {
    // Escape single quotes in the URL for embedding inside a PowerShell single-quoted string.
    let escaped_url = source.url.replace('\'', "''");
    let value_name = source.mode.registry_value_name();
    let opposite_name = match source.mode {
        DistroSourceMode::Append => VALUE_DISTRIBUTION_LIST_URL,
        DistroSourceMode::Replace => VALUE_DISTRIBUTION_LIST_URL_APPEND,
    };

    // Inner script: clear opposite value, set chosen value as REG_SZ.
    let inner = format!(
        "Remove-ItemProperty -Path 'HKLM:\\{path}' -Name '{opposite}' -ErrorAction SilentlyContinue; \
         Set-ItemProperty -Path 'HKLM:\\{path}' -Name '{name}' -Value '{url}' -Type String -Force",
        path = HKLM_LXSS_PATH,
        opposite = opposite_name,
        name = value_name,
        url = escaped_url,
    );

    run_elevated_powershell(&inner, "apply_distro_source")
}

#[cfg(target_os = "windows")]
fn clear_source_windows() -> Result<(), WslError> {
    let inner = format!(
        "Remove-ItemProperty -Path 'HKLM:\\{path}' -Name '{a}' -ErrorAction SilentlyContinue; \
         Remove-ItemProperty -Path 'HKLM:\\{path}' -Name '{b}' -ErrorAction SilentlyContinue",
        path = HKLM_LXSS_PATH,
        a = VALUE_DISTRIBUTION_LIST_URL,
        b = VALUE_DISTRIBUTION_LIST_URL_APPEND,
    );
    run_elevated_powershell(&inner, "clear_distro_source")
}

/// Run a PowerShell script with UAC elevation. Captures stderr/stdout from
/// the elevated process via a temp file so we can surface meaningful errors.
#[cfg(target_os = "windows")]
fn run_elevated_powershell(inner_script: &str, op_tag: &str) -> Result<(), WslError> {
    use crate::settings::get_executable_paths;
    use crate::utils::hidden_command;

    let paths = get_executable_paths();

    let temp_dir = std::env::temp_dir();
    let output_file = temp_dir.join(format!("wsl_distro_sources_{}.txt", op_tag));
    let output_path = output_file.to_str().unwrap_or("").replace('\'', "''");

    // Inner script gets embedded inside the outer PowerShell single-quoted
    // -Command string. Escape ' -> ''. The inner script writes its own
    // stderr/stdout to a temp file so we can read it back after UAC.
    let escaped_inner = inner_script.replace('\'', "''");

    let outer = format!(
        r#"try {{
                $proc = Start-Process -FilePath 'powershell' -ArgumentList '-NoProfile','-Command','try {{ {inner} 2>&1 | Out-File -FilePath ''{out}'' -Encoding UTF8; exit 0 }} catch {{ $_.Exception.Message | Out-File -FilePath ''{out}'' -Encoding UTF8; exit 1 }}' -Verb RunAs -Wait -PassThru -WindowStyle Hidden
                exit $proc.ExitCode
            }} catch {{
                exit 1223
            }}"#,
        inner = escaped_inner,
        out = output_path,
    );

    log::info!(
        "Running distro_sources op '{}' with elevation - UAC dialog will appear",
        op_tag
    );

    let output = hidden_command(&paths.powershell)
        .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", &outer])
        .output()
        .map_err(|e| WslError::CommandFailed(format!("Failed to start PowerShell: {}", e)))?;

    let captured = std::fs::read_to_string(&output_file).unwrap_or_default();
    let _ = std::fs::remove_file(&output_file);

    if output.status.code() == Some(1223) {
        return Err(WslError::CommandFailed(
            "Operation cancelled - administrator approval was not granted".to_string(),
        ));
    }

    if !output.status.success() {
        let msg = if !captured.trim().is_empty() {
            captured.trim().to_string()
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let stdout = String::from_utf8_lossy(&output.stdout);
            if !stderr.trim().is_empty() {
                stderr.to_string()
            } else {
                stdout.to_string()
            }
        };
        return Err(WslError::CommandFailed(msg));
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Manifest fetch + preview
// ---------------------------------------------------------------------------

/// Fetch a manifest URL and return a parsed preview. Does **not** require
/// elevation. In mock mode, returns a canned preview so the UI is testable
/// without network access.
pub fn fetch_and_preview(url: &str) -> Result<ManifestPreview, WslError> {
    validate_url(url)?;
    if effective_mock_mode() {
        return Ok(mock_preview(url));
    }
    let body = fetch_url_body(url)?;
    parse_manifest(url, &body)
}

#[cfg(any(not(target_os = "windows"), test))]
fn mock_preview(url: &str) -> ManifestPreview {
    ManifestPreview {
        url: url.to_string(),
        entries: vec![
            ManifestEntryPreview {
                flavor: "Ubuntu".to_string(),
                name: "Ubuntu-26.04".to_string(),
                friendly_name: "Ubuntu 26.04 LTS (Mock)".to_string(),
                default: true,
                has_amd64: true,
                has_arm64: true,
            },
            ManifestEntryPreview {
                flavor: "Rocky".to_string(),
                name: "Rocky-10.1".to_string(),
                friendly_name: "Rocky Linux 10.1 (Mock)".to_string(),
                default: false,
                has_amd64: true,
                has_arm64: false,
            },
        ],
    }
}

#[cfg(all(target_os = "windows", not(test)))]
fn mock_preview(url: &str) -> ManifestPreview {
    ManifestPreview {
        url: url.to_string(),
        entries: Vec::new(),
    }
}

fn fetch_url_body(url: &str) -> Result<String, WslError> {
    // file:// is supported by reqwest only via a custom implementation.
    // For local testing convenience we read the file directly.
    if let Some(path) = url.strip_prefix("file://") {
        // On Windows file URLs look like "file:///C:/path/to/file.json".
        // Strip the leading slash so std::fs::read_to_string accepts the path.
        let p = path.trim_start_matches('/');
        return std::fs::read_to_string(p)
            .map_err(|e| WslError::CommandFailed(format!("Failed to read manifest file: {}", e)));
    }

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| WslError::CommandFailed(format!("Failed to build HTTP client: {}", e)))?;

    let resp = client
        .get(url)
        .send()
        .map_err(|e| WslError::CommandFailed(format!("Failed to fetch manifest: {}", e)))?;

    if !resp.status().is_success() {
        return Err(WslError::CommandFailed(format!(
            "Manifest fetch returned HTTP {}",
            resp.status()
        )));
    }

    resp.text()
        .map_err(|e| WslError::CommandFailed(format!("Failed to read manifest body: {}", e)))
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_MANIFEST: &str = r#"{
        "ModernDistributions": {
            "Ubuntu": [
                {
                    "Name": "Ubuntu-26.04",
                    "FriendlyName": "Ubuntu 26.04 LTS",
                    "Default": true,
                    "Amd64Url": { "Url": "https://example.test/ubuntu-26.04-amd64.wsl", "Sha256": "0xdead" },
                    "Arm64Url": { "Url": "https://example.test/ubuntu-26.04-arm64.wsl", "Sha256": "0xbeef" }
                },
                {
                    "Name": "Ubuntu-25.10",
                    "FriendlyName": "Ubuntu 25.10",
                    "Amd64Url": { "Url": "https://example.test/ubuntu-25.10-amd64.wsl", "Sha256": "0x01" }
                }
            ],
            "Rocky": [
                {
                    "Name": "Rocky-10.1",
                    "FriendlyName": "Rocky Linux 10.1",
                    "Amd64Url": { "Url": "https://example.test/rocky-10.1-amd64.wsl", "Sha256": "0x02" }
                }
            ]
        }
    }"#;

    #[test]
    fn parses_modern_distributions_sample() {
        let p = parse_manifest("https://example.test/m.json", SAMPLE_MANIFEST)
            .expect("manifest must parse");
        assert_eq!(p.url, "https://example.test/m.json");
        assert_eq!(p.entries.len(), 3);
        let ubuntu_26 = p
            .entries
            .iter()
            .find(|e| e.name == "Ubuntu-26.04")
            .expect("Ubuntu-26.04 present");
        assert_eq!(ubuntu_26.friendly_name, "Ubuntu 26.04 LTS");
        assert!(ubuntu_26.default);
        assert!(ubuntu_26.has_amd64);
        assert!(ubuntu_26.has_arm64);

        let rocky = p
            .entries
            .iter()
            .find(|e| e.name == "Rocky-10.1")
            .expect("Rocky-10.1 present");
        assert!(rocky.has_amd64);
        assert!(!rocky.has_arm64);
        assert!(!rocky.default);
    }

    #[test]
    fn rejects_missing_modern_distributions_root() {
        let err = parse_manifest("u", r#"{"Something": []}"#).unwrap_err();
        assert!(matches!(err, WslError::ParseError(_)));
    }

    #[test]
    fn rejects_entry_with_empty_name() {
        let body = r#"{"ModernDistributions":{"Ubuntu":[{"Name":""}]}}"#;
        let err = parse_manifest("u", body).unwrap_err();
        assert!(matches!(err, WslError::ParseError(_)));
    }

    #[test]
    fn empty_flavor_array_is_ok_but_yields_no_entries() {
        let body = r#"{"ModernDistributions":{"Ubuntu":[]}}"#;
        let p = parse_manifest("u", body).unwrap();
        assert!(p.entries.is_empty());
    }

    #[test]
    fn rejects_invalid_json() {
        let err = parse_manifest("u", "not-json").unwrap_err();
        assert!(matches!(err, WslError::ParseError(_)));
    }

    #[test]
    fn validate_url_accepts_http_https_file() {
        validate_url("https://example.test/m.json").unwrap();
        validate_url("http://example.test/m.json").unwrap();
        validate_url("file:///C:/tmp/m.json").unwrap();
    }

    #[test]
    fn validate_url_rejects_bad_schemes() {
        assert!(validate_url("").is_err());
        assert!(validate_url("ftp://example.test/m.json").is_err());
        assert!(validate_url("just-a-string").is_err());
    }

    #[test]
    fn mock_round_trip_apply_read_clear() {
        reset_mock_distro_source();
        assert!(read_current_source().unwrap().is_none());

        let src = DistroSource {
            url: "https://example.test/m.json".to_string(),
            mode: DistroSourceMode::Append,
        };
        apply_source(&src).unwrap();
        let read = read_current_source().unwrap().expect("should have a source");
        assert_eq!(read.url, src.url);
        assert_eq!(read.mode, DistroSourceMode::Append);

        clear_source().unwrap();
        assert!(read_current_source().unwrap().is_none());
    }

    #[test]
    fn mock_fetch_returns_canned_preview() {
        let p = fetch_and_preview("https://example.test/m.json").unwrap();
        assert!(!p.entries.is_empty());
        assert_eq!(p.url, "https://example.test/m.json");
    }

    #[test]
    fn apply_rejects_invalid_url() {
        reset_mock_distro_source();
        let src = DistroSource {
            url: "ftp://nope".to_string(),
            mode: DistroSourceMode::Append,
        };
        assert!(apply_source(&src).is_err());
    }

    #[test]
    fn append_and_replace_map_to_distinct_registry_values() {
        assert_eq!(
            DistroSourceMode::Append.registry_value_name(),
            VALUE_DISTRIBUTION_LIST_URL_APPEND
        );
        assert_eq!(
            DistroSourceMode::Replace.registry_value_name(),
            VALUE_DISTRIBUTION_LIST_URL
        );
    }
}
