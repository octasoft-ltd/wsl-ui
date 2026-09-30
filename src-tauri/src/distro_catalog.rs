//! Distribution catalog management
//!
//! Provides config-driven distribution definitions for all installation modes:
//! - Microsoft Store metadata (display info for `wsl --list --online` results)
//! - Direct download distributions (rootfs URLs)
//! - Container images (Podman/Docker)

use crate::utils::get_config_file;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;

/// Config file name for user catalog overrides
const CATALOG_CONFIG_FILE: &str = "distro-catalog.json";

/// Default catalog embedded in the binary
const DEFAULT_CATALOG_JSON: &str = include_str!("default_catalog.json");

/// Metadata for Microsoft Store distributions
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MsStoreDistroInfo {
    pub description: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
}

/// Direct download distribution entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadDistro {
    pub id: String,
    pub name: String,
    pub description: String,
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub is_built_in: bool,
}

/// Container image entry
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerImage {
    pub id: String,
    pub name: String,
    pub description: String,
    pub image: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default)]
    pub is_built_in: bool,
}

fn default_true() -> bool {
    true
}

/// Full distribution catalog
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistroCatalog {
    pub version: String,
    pub ms_store_distros: HashMap<String, MsStoreDistroInfo>,
    pub download_distros: Vec<DownloadDistro>,
    pub container_images: Vec<ContainerImage>,
}

impl Default for DistroCatalog {
    fn default() -> Self {
        Self {
            version: "1.0".to_string(),
            ms_store_distros: HashMap::new(),
            download_distros: Vec::new(),
            container_images: Vec::new(),
        }
    }
}

/// Load the default catalog embedded in the binary
pub fn get_default_catalog() -> DistroCatalog {
    serde_json::from_str(DEFAULT_CATALOG_JSON).unwrap_or_default()
}

/// Load user catalog overrides from config file
fn load_user_catalog() -> Option<DistroCatalog> {
    let path = get_config_file(CATALOG_CONFIG_FILE);
    if !path.exists() {
        return None;
    }

    fs::read_to_string(&path)
        .ok()
        .and_then(|content| serde_json::from_str(&content).ok())
}

/// Save user catalog to config file
fn save_user_catalog(catalog: &DistroCatalog) -> Result<(), String> {
    let path = get_config_file(CATALOG_CONFIG_FILE);
    let content = serde_json::to_string_pretty(catalog)
        .map_err(|e| format!("Failed to serialize catalog: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write catalog file: {}", e))
}

/// Load merged catalog (defaults + user overrides)
pub fn load_catalog() -> DistroCatalog {
    let mut catalog = get_default_catalog();

    // Mark all default entries as built-in
    for distro in &mut catalog.download_distros {
        distro.is_built_in = true;
    }
    for image in &mut catalog.container_images {
        image.is_built_in = true;
    }

    // Merge user overrides if present
    if let Some(user_catalog) = load_user_catalog() {
        // Merge MS Store distros (user entries override defaults)
        for (key, value) in user_catalog.ms_store_distros {
            catalog.ms_store_distros.insert(key, value);
        }

        // Merge download distros (user entries override by ID, or add new)
        for user_distro in user_catalog.download_distros {
            if let Some(existing) = catalog
                .download_distros
                .iter_mut()
                .find(|d| d.id == user_distro.id)
            {
                // Override existing (keep is_built_in from default)
                let is_built_in = existing.is_built_in;
                *existing = user_distro;
                existing.is_built_in = is_built_in;
            } else {
                // Add new user entry
                catalog.download_distros.push(user_distro);
            }
        }

        // Merge container images (user entries override by ID, or add new)
        for user_image in user_catalog.container_images {
            if let Some(existing) = catalog
                .container_images
                .iter_mut()
                .find(|i| i.id == user_image.id)
            {
                // Override existing (keep is_built_in from default)
                let is_built_in = existing.is_built_in;
                *existing = user_image;
                existing.is_built_in = is_built_in;
            } else {
                // Add new user entry
                catalog.container_images.push(user_image);
            }
        }
    }

    catalog
}

/// Get the full catalog
pub fn get_catalog() -> DistroCatalog {
    load_catalog()
}

/// Reset catalog to defaults (removes user overrides)
pub fn reset_to_defaults() -> Result<DistroCatalog, String> {
    let path = get_config_file(CATALOG_CONFIG_FILE);
    if path.exists() {
        fs::remove_file(&path).map_err(|e| format!("Failed to remove user catalog: {}", e))?;
    }
    Ok(load_catalog())
}

/// Reset only download distros to defaults
pub fn reset_download_distros() -> Result<DistroCatalog, String> {
    let mut user_catalog = load_user_catalog().unwrap_or_default();
    user_catalog.download_distros.clear();
    save_user_catalog(&user_catalog)?;
    Ok(load_catalog())
}

/// Reset only container images to defaults
pub fn reset_container_images() -> Result<DistroCatalog, String> {
    let mut user_catalog = load_user_catalog().unwrap_or_default();
    user_catalog.container_images.clear();
    save_user_catalog(&user_catalog)?;
    Ok(load_catalog())
}

/// Reset only MS Store metadata to defaults
pub fn reset_ms_store_distros() -> Result<DistroCatalog, String> {
    let mut user_catalog = load_user_catalog().unwrap_or_default();
    user_catalog.ms_store_distros.clear();
    save_user_catalog(&user_catalog)?;
    Ok(load_catalog())
}

// ==================== Download Distros CRUD ====================

/// Add a new download distro
pub fn add_download_distro(distro: DownloadDistro) -> Result<DistroCatalog, String> {
    let catalog = load_catalog();

    // Check for duplicate ID
    if catalog.download_distros.iter().any(|d| d.id == distro.id) {
        return Err(format!("Download distro '{}' already exists", distro.id));
    }

    // Load or create user catalog
    let mut user_catalog = load_user_catalog().unwrap_or_default();
    user_catalog.download_distros.push(distro);
    save_user_catalog(&user_catalog)?;

    Ok(load_catalog())
}

/// Update an existing download distro
pub fn update_download_distro(distro: DownloadDistro) -> Result<DistroCatalog, String> {
    let mut user_catalog = load_user_catalog().unwrap_or_default();

    // Check if it's a user entry we can update directly
    if let Some(existing) = user_catalog
        .download_distros
        .iter_mut()
        .find(|d| d.id == distro.id)
    {
        *existing = distro;
    } else {
        // It's a built-in entry; add override to user catalog
        user_catalog.download_distros.push(distro);
    }

    save_user_catalog(&user_catalog)?;
    Ok(load_catalog())
}

/// Delete a download distro (only user-added entries can be fully deleted)
pub fn delete_download_distro(id: &str) -> Result<DistroCatalog, String> {
    let catalog = load_catalog();
    let is_built_in = catalog
        .download_distros
        .iter()
        .find(|d| d.id == id)
        .map(|d| d.is_built_in)
        .unwrap_or(false);

    if is_built_in {
        return Err(format!(
            "Cannot delete built-in distro '{}'. You can disable it instead.",
            id
        ));
    }

    let mut user_catalog = load_user_catalog().unwrap_or_default();
    user_catalog.download_distros.retain(|d| d.id != id);
    save_user_catalog(&user_catalog)?;

    Ok(load_catalog())
}

// ==================== Container Images CRUD ====================

/// Add a new container image
pub fn add_container_image(image: ContainerImage) -> Result<DistroCatalog, String> {
    let catalog = load_catalog();

    // Check for duplicate ID
    if catalog.container_images.iter().any(|i| i.id == image.id) {
        return Err(format!("Container image '{}' already exists", image.id));
    }

    let mut user_catalog = load_user_catalog().unwrap_or_default();
    user_catalog.container_images.push(image);
    save_user_catalog(&user_catalog)?;

    Ok(load_catalog())
}

/// Update an existing container image
pub fn update_container_image(image: ContainerImage) -> Result<DistroCatalog, String> {
    let mut user_catalog = load_user_catalog().unwrap_or_default();

    if let Some(existing) = user_catalog
        .container_images
        .iter_mut()
        .find(|i| i.id == image.id)
    {
        *existing = image;
    } else {
        // It's a built-in entry; add override to user catalog
        user_catalog.container_images.push(image);
    }

    save_user_catalog(&user_catalog)?;
    Ok(load_catalog())
}

/// Delete a container image (only user-added entries can be fully deleted)
pub fn delete_container_image(id: &str) -> Result<DistroCatalog, String> {
    let catalog = load_catalog();
    let is_built_in = catalog
        .container_images
        .iter()
        .find(|i| i.id == id)
        .map(|i| i.is_built_in)
        .unwrap_or(false);

    if is_built_in {
        return Err(format!(
            "Cannot delete built-in image '{}'. You can disable it instead.",
            id
        ));
    }

    let mut user_catalog = load_user_catalog().unwrap_or_default();
    user_catalog.container_images.retain(|i| i.id != id);
    save_user_catalog(&user_catalog)?;

    Ok(load_catalog())
}

// ==================== MS Store Metadata CRUD ====================

/// Update MS Store distro metadata
pub fn update_ms_store_distro(
    distro_id: String,
    info: MsStoreDistroInfo,
) -> Result<DistroCatalog, String> {
    let mut user_catalog = load_user_catalog().unwrap_or_default();
    user_catalog.ms_store_distros.insert(distro_id, info);
    save_user_catalog(&user_catalog)?;
    Ok(load_catalog())
}

/// Delete MS Store distro metadata override (reverts to default if exists)
pub fn delete_ms_store_distro(distro_id: &str) -> Result<DistroCatalog, String> {
    let mut user_catalog = load_user_catalog().unwrap_or_default();
    user_catalog.ms_store_distros.remove(distro_id);
    save_user_catalog(&user_catalog)?;
    Ok(load_catalog())
}

// ==================== Helper Functions ====================

/// Get download URL for a distro by ID
pub fn get_download_url(distro_id: &str) -> Option<String> {
    let catalog = load_catalog();
    catalog
        .download_distros
        .iter()
        .find(|d| d.id == distro_id && d.enabled)
        .map(|d| d.url.clone())
}

const MAX_CHECKSUM_BYTES: usize = 1024 * 1024;

/// Publisher metadata is bound to the embedded URL, never an editable URL.
fn checksum_source(distro_id: &str, download_url: &str) -> Result<Option<String>, String> {
    let Some(default) = get_default_catalog()
        .download_distros
        .into_iter()
        .find(|d| d.id == distro_id)
    else {
        return Ok(None);
    };
    if download_url != default.url {
        return Err(
            "A modified built-in download URL requires an explicit SHA-256 checksum".into(),
        );
    }
    let basename = match distro_id {
        "Ubuntu-24.04" => "SHA256SUMS",
        "VoidLinux" => "sha256sum.txt",
        "ArchLinux" => "sha256sums.txt",
        "Alpine" | "NixOS" => return Ok(Some(format!("{}.sha256", default.url))),
        _ => {
            return Err(format!(
                "No publisher checksum source configured for '{distro_id}'"
            ))
        }
    };
    let (directory, _) = default
        .url
        .rsplit_once('/')
        .ok_or("Invalid built-in download URL")?;
    Ok(Some(format!("{directory}/{basename}")))
}

fn valid_sha256(hash: &str) -> bool {
    hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit())
}

/// Accept GNU sha256sum and BSD SHA256 output, requiring an exact filename.
fn parse_checksum_manifest(manifest: &str, filename: &str) -> Result<String, String> {
    let mut selected: Option<String> = None;
    for line in manifest.lines() {
        let line = line.trim();
        let entry = if let Some(bsd) = line.strip_prefix("SHA256 (") {
            bsd.rsplit_once(") = ").map(|(name, hash)| (hash, name))
        } else {
            line.split_once(char::is_whitespace).map(|(hash, name)| {
                (
                    hash,
                    name.trim_start()
                        .strip_prefix('*')
                        .unwrap_or(name.trim_start()),
                )
            })
        };
        let Some((hash, name)) = entry else { continue };
        if name != filename {
            continue;
        }
        if !valid_sha256(hash) {
            return Err(format!(
                "Invalid publisher SHA-256 checksum for '{filename}'"
            ));
        }
        let hash = hash.to_ascii_lowercase();
        if selected.as_ref().is_some_and(|previous| previous != &hash) {
            return Err(format!("Conflicting publisher checksums for '{filename}'"));
        }
        selected = Some(hash);
    }
    selected.ok_or_else(|| format!("Publisher checksum file has no SHA-256 entry for '{filename}'"))
}

async fn fetch_publisher_checksum(
    client: &reqwest::Client,
    source: &str,
    filename: &str,
) -> Result<String, String> {
    use futures_util::StreamExt;
    let response = client
        .get(source)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch publisher checksum: {e}"))?
        .error_for_status()
        .map_err(|e| format!("Failed to fetch publisher checksum: {e}"))?;
    if response
        .content_length()
        .is_some_and(|length| length > MAX_CHECKSUM_BYTES as u64)
    {
        return Err("Publisher checksum file exceeds size limit".into());
    }
    let mut bytes = Vec::new();
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Failed to read publisher checksum: {e}"))?;
        if chunk.len() > MAX_CHECKSUM_BYTES - bytes.len() {
            return Err("Publisher checksum file exceeds size limit".into());
        }
        bytes.extend_from_slice(&chunk);
    }
    let manifest =
        std::str::from_utf8(&bytes).map_err(|_| "Publisher checksum file is not UTF-8")?;
    parse_checksum_manifest(manifest, filename)
}

/// Resolve moving publisher metadata before downloading; built-ins fail closed.
pub async fn resolve_download_checksum(
    distro_id: &str,
    download_url: &str,
) -> Result<Option<String>, String> {
    let distro = load_catalog()
        .download_distros
        .into_iter()
        .find(|d| d.id == distro_id && d.enabled && d.url == download_url)
        .ok_or("Download catalog entry changed; retry the download")?;
    if let Some(hash) = distro.sha256 {
        if !valid_sha256(&hash) {
            return Err("Invalid configured SHA-256 checksum".into());
        }
        return Ok(Some(hash.to_ascii_lowercase()));
    }
    let Some(source) = checksum_source(distro_id, download_url)? else {
        return Ok(None);
    };
    let filename = download_url
        .rsplit('/')
        .next()
        .ok_or("Invalid download filename")?;
    let client = reqwest::Client::builder()
        .https_only(true)
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .map_err(|e| format!("Failed to create checksum client: {e}"))?;
    fetch_publisher_checksum(&client, &source, filename)
        .await
        .map(Some)
}

/// Get list of enabled download distro IDs
pub fn list_enabled_download_distros() -> Vec<String> {
    let catalog = load_catalog();
    catalog
        .download_distros
        .iter()
        .filter(|d| d.enabled)
        .map(|d| d.id.clone())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_catalog_parses() {
        let catalog = get_default_catalog();
        assert!(!catalog.ms_store_distros.is_empty());
        assert!(!catalog.download_distros.is_empty());
        assert!(!catalog.container_images.is_empty());
    }

    #[test]
    fn test_get_download_url() {
        let url = get_download_url("Ubuntu-24.04");
        assert!(url.is_some());
        assert!(url.unwrap().contains("ubuntu"));
    }

    #[test]
    fn builtin_checksums_cover_each_default_and_exact_filename() {
        for distro in get_default_catalog().download_distros {
            assert!(
                checksum_source(&distro.id, &distro.url).unwrap().is_some(),
                "{}",
                distro.id
            );
            assert!(checksum_source(&distro.id, "https://example.com/custom.tar").is_err());
        }
        assert!(checksum_source("custom", "https://example.com/custom.tar")
            .unwrap()
            .is_none());
        let fixtures = [
            ("bb415d824822c4b878125729af451a5d18fb13d1cf5cbed9a7393ad64ac6039e *noble-wsl-amd64.wsl", "noble-wsl-amd64.wsl"),
            ("55ea3e5a7c2c35e6268c5dcbb8e45a9cd5b0e372e7b4e798499a526834f7ed90  alpine-minirootfs-3.21.0-x86_64.tar.gz", "alpine-minirootfs-3.21.0-x86_64.tar.gz"),
            ("576f2dda94b0dde278cd9ebbdf04b53bd9c174fba5dd4e98bd9af227dd97fc24  nixos-wsl.tar.gz", "nixos-wsl.tar.gz"),
            ("SHA256 (void-x86_64-ROOTFS-20250202.tar.xz) = 3f48e6673ac5907a897d913c97eb96edbfb230162731b4016562c51b3b8f1876", "void-x86_64-ROOTFS-20250202.tar.xz"),
            ("895661bdf6c64e91b7725874165fd05dd30c438d3ffec661671ab5cfb261ca58  archlinux-bootstrap-x86_64.tar.zst", "archlinux-bootstrap-x86_64.tar.zst"),
        ];
        for (manifest, filename) in fixtures {
            assert_eq!(
                parse_checksum_manifest(manifest, filename).unwrap().len(),
                64
            );
            assert!(parse_checksum_manifest(manifest, &format!("{filename}.sig")).is_err());
        }
    }

    #[test]
    fn checksum_manifest_rejects_missing_malformed_and_conflicting_entries() {
        let hash = "a".repeat(64);
        assert!(parse_checksum_manifest("invalid  archive.tar", "archive.tar").is_err());
        assert!(
            parse_checksum_manifest(&format!("{hash}  archive.tar.old"), "archive.tar").is_err()
        );
        assert!(parse_checksum_manifest(
            &format!("{hash}  archive.tar\n{}  archive.tar", "b".repeat(64)),
            "archive.tar"
        )
        .is_err());
        assert_eq!(
            parse_checksum_manifest(
                &format!("{hash}  archive.tar\r\n{hash} *archive.tar"),
                "archive.tar"
            )
            .unwrap(),
            hash
        );
    }

    #[tokio::test]
    async fn publisher_checksum_fetch_fails_closed_on_http_missing_and_oversized_metadata() {
        use wiremock::matchers::path;
        use wiremock::{Mock, MockServer, ResponseTemplate};
        let server = MockServer::start().await;
        let hash = "c".repeat(64);
        let fixtures = [
            (
                "/valid",
                ResponseTemplate::new(200).set_body_string(format!("{hash}  archive.tar")),
                true,
            ),
            (
                "/missing",
                ResponseTemplate::new(200).set_body_string(format!("{hash}  other.tar")),
                false,
            ),
            ("/error", ResponseTemplate::new(404), false),
            (
                "/large",
                ResponseTemplate::new(200).set_body_bytes(vec![b'a'; MAX_CHECKSUM_BYTES + 1]),
                false,
            ),
        ];
        let client = reqwest::Client::new();
        for (route, response, succeeds) in fixtures {
            Mock::given(path(route))
                .respond_with(response)
                .mount(&server)
                .await;
            let result = fetch_publisher_checksum(
                &client,
                &format!("{}{route}", server.uri()),
                "archive.tar",
            )
            .await;
            assert_eq!(result.is_ok(), succeeds, "{route}: {result:?}");
            if succeeds {
                assert_eq!(result.unwrap(), hash);
            }
        }
        let https_client = reqwest::Client::builder().https_only(true).build().unwrap();
        assert!(fetch_publisher_checksum(
            &https_client,
            &format!("{}/valid", server.uri()),
            "archive.tar"
        )
        .await
        .is_err());
    }
}
