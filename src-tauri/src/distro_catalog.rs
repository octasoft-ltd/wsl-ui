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

/// Get checksum for a distro by ID
pub fn get_download_checksum(distro_id: &str) -> Option<String> {
    let catalog = load_catalog();
    catalog
        .download_distros
        .iter()
        .find(|d| d.id == distro_id && d.enabled)
        .and_then(|d| d.sha256.clone())
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
}




