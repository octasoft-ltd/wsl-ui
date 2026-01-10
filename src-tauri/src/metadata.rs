//! Distribution metadata storage for tracking installation sources
//!
//! Stores information about how distributions were installed (Store, Container, Download, etc.)
//! to enable color coding and tooltips in the UI.
//!
//! ## Architecture Alignment
//! This module is designed to migrate cleanly to the target Hexagonal Architecture:
//! - `DistroMetadata` → wsl2-ui-domain/entities/distro_metadata.rs
//! - `InstallSource` → wsl2-ui-domain/entities/install_source.rs
//! - Storage functions → wsl2-ui-infra/adapters/filesystem/metadata_repo.rs (implements DistroRepository port)

use crate::utils::{get_config_file, is_mock_mode};
use crate::wsl::executor::resource_monitor;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::sync::Mutex;
use log::{info, warn};

/// Metadata configuration file
const METADATA_CONFIG_FILE: &str = "distro-metadata.json";

/// Current metadata store version
const CURRENT_VERSION: &str = "2.0";

/// Installation source types
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum InstallSource {
    /// Installed via Microsoft Store (wsl --install)
    Store,
    /// Installed from container image (Docker/Podman/OCI)
    Container,
    /// Installed from direct download URL
    Download,
    /// Installed from LXC community catalog
    Lxc,
    /// Imported from tar file
    Import,
    /// Cloned from existing distribution
    Clone,
    /// Unknown/external installation
    Unknown,
}

impl Default for InstallSource {
    fn default() -> Self {
        InstallSource::Unknown
    }
}

/// Metadata for a single distribution
///
/// Designed as a domain entity with immutable identity (distro_id).
/// The distro_id (GUID) never changes, while distro_name can be updated via rename.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DistroMetadata {
    /// Distribution ID (GUID from Windows Registry) - primary key, immutable
    pub distro_id: String,
    /// Distribution name (can change via rename)
    pub distro_name: String,
    /// How the distribution was installed
    #[serde(default)]
    pub install_source: InstallSource,
    /// ISO 8601 timestamp of installation
    pub installed_at: String,
    /// Container image reference (e.g., "docker.io/gitlab/gitlab-runner:latest")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image_reference: Option<String>,
    /// Download URL for download/lxc sources
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
    /// Reference to catalog entry ID if applicable
    #[serde(skip_serializing_if = "Option::is_none")]
    pub catalog_entry: Option<String>,
    /// Source distribution ID for cloned distros
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cloned_from: Option<String>,
    /// Original tar file path for imported distros
    #[serde(skip_serializing_if = "Option::is_none")]
    pub import_path: Option<String>,
}

impl DistroMetadata {
    /// Create new metadata for a distribution
    pub fn new(distro_id: String, distro_name: String, install_source: InstallSource) -> Self {
        Self {
            distro_id,
            distro_name,
            install_source,
            installed_at: chrono::Utc::now().to_rfc3339(),
            image_reference: None,
            download_url: None,
            catalog_entry: None,
            cloned_from: None,
            import_path: None,
        }
    }

    /// Create metadata for a cloned distribution
    pub fn new_clone(distro_id: String, distro_name: String, source_id: String) -> Self {
        Self {
            distro_id,
            distro_name,
            install_source: InstallSource::Clone,
            installed_at: chrono::Utc::now().to_rfc3339(),
            image_reference: None,
            download_url: None,
            catalog_entry: None,
            cloned_from: Some(source_id),
            import_path: None,
        }
    }

    /// Create metadata for an imported distribution
    pub fn new_import(distro_id: String, distro_name: String, tar_path: Option<String>) -> Self {
        Self {
            distro_id,
            distro_name,
            install_source: InstallSource::Import,
            installed_at: chrono::Utc::now().to_rfc3339(),
            image_reference: None,
            download_url: None,
            catalog_entry: None,
            cloned_from: None,
            import_path: tar_path,
        }
    }
}

/// Legacy v1 metadata format (name-keyed)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyDistroMetadata {
    name: String,
    #[serde(default)]
    install_source: InstallSource,
    #[serde(skip_serializing_if = "Option::is_none")]
    image_reference: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    download_url: Option<String>,
    installed_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    catalog_entry: Option<String>,
}

/// Legacy v1 store format
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyMetadataStore {
    #[serde(default = "default_legacy_version")]
    version: String,
    #[serde(default)]
    distros: HashMap<String, LegacyDistroMetadata>,
}

fn default_legacy_version() -> String {
    "1.0".to_string()
}

/// Container for all distro metadata (v2 - GUID-keyed)
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MetadataStore {
    /// Version for migrations
    #[serde(default = "default_version")]
    pub version: String,
    /// Map of distro ID (GUID) to metadata
    #[serde(default)]
    pub distros: HashMap<String, DistroMetadata>,
}

fn default_version() -> String {
    CURRENT_VERSION.to_string()
}

impl Default for MetadataStore {
    fn default() -> Self {
        Self {
            version: default_version(),
            distros: HashMap::new(),
        }
    }
}

lazy_static::lazy_static! {
    static ref METADATA: Mutex<MetadataStore> = Mutex::new(load_and_migrate_metadata());
    /// Dynamic mock metadata store for E2E testing
    /// This allows tests to create metadata that persists within a test session
    static ref MOCK_METADATA: Mutex<MetadataStore> = Mutex::new(MetadataStore {
        version: CURRENT_VERSION.to_string(),
        distros: get_initial_mock_metadata(),
    });
}

/// Get initial mock metadata (static baseline for mock mode)
/// Matches the distributions in wsl_command/mock.rs
fn get_initial_mock_metadata() -> HashMap<String, DistroMetadata> {
    let mut mock = HashMap::new();

    // Ubuntu - WSL 2 - Running - Store install (default)
    mock.insert(
        "{mock-guid-0000-0000-0000-000000000000}".to_string(),
        DistroMetadata {
            distro_id: "{mock-guid-0000-0000-0000-000000000000}".to_string(),
            distro_name: "Ubuntu".to_string(),
            install_source: InstallSource::Store,
            image_reference: None,
            download_url: None,
            installed_at: "2024-01-15T10:30:00Z".to_string(),
            catalog_entry: Some("Ubuntu".to_string()),
            cloned_from: None,
            import_path: None,
        },
    );

    // Debian - WSL 2 - Stopped - LXC install
    mock.insert(
        "{mock-guid-0001-0000-0000-000000000001}".to_string(),
        DistroMetadata {
            distro_id: "{mock-guid-0001-0000-0000-000000000001}".to_string(),
            distro_name: "Debian".to_string(),
            install_source: InstallSource::Lxc,
            image_reference: None,
            download_url: Some("https://images.linuxcontainers.org/images/debian/bookworm/amd64/default/".to_string()),
            installed_at: "2024-02-10T08:00:00Z".to_string(),
            catalog_entry: Some("debian/bookworm".to_string()),
            cloned_from: None,
            import_path: None,
        },
    );

    // Alpine - WSL 2 - Stopped - Container install
    mock.insert(
        "{mock-guid-0002-0000-0000-000000000002}".to_string(),
        DistroMetadata {
            distro_id: "{mock-guid-0002-0000-0000-000000000002}".to_string(),
            distro_name: "Alpine".to_string(),
            install_source: InstallSource::Container,
            image_reference: Some("docker.io/library/alpine:latest".to_string()),
            download_url: None,
            installed_at: "2024-02-20T14:00:00Z".to_string(),
            catalog_entry: None,
            cloned_from: None,
            import_path: None,
        },
    );

    // Ubuntu-22.04 - WSL 2 - Running - Download install
    mock.insert(
        "{mock-guid-0003-0000-0000-000000000003}".to_string(),
        DistroMetadata {
            distro_id: "{mock-guid-0003-0000-0000-000000000003}".to_string(),
            distro_name: "Ubuntu-22.04".to_string(),
            install_source: InstallSource::Download,
            image_reference: None,
            download_url: Some("https://cloud-images.ubuntu.com/wsl/jammy/current/ubuntu-jammy-wsl-amd64-wsl.rootfs.tar.gz".to_string()),
            installed_at: "2024-03-05T16:30:00Z".to_string(),
            catalog_entry: None,
            cloned_from: None,
            import_path: None,
        },
    );

    // Fedora - WSL 2 - Stopped - Import
    mock.insert(
        "{mock-guid-0004-0000-0000-000000000004}".to_string(),
        DistroMetadata {
            distro_id: "{mock-guid-0004-0000-0000-000000000004}".to_string(),
            distro_name: "Fedora".to_string(),
            install_source: InstallSource::Import,
            image_reference: None,
            download_url: None,
            installed_at: "2024-03-10T09:00:00Z".to_string(),
            catalog_entry: None,
            cloned_from: None,
            import_path: Some("C:\\WSL\\Backups\\fedora-backup.tar".to_string()),
        },
    );

    // Ubuntu-legacy - WSL 1 - Stopped - Clone
    mock.insert(
        "{mock-guid-0005-0000-0000-000000000005}".to_string(),
        DistroMetadata {
            distro_id: "{mock-guid-0005-0000-0000-000000000005}".to_string(),
            distro_name: "Ubuntu-legacy".to_string(),
            install_source: InstallSource::Clone,
            image_reference: None,
            download_url: None,
            installed_at: "2024-03-15T11:00:00Z".to_string(),
            catalog_entry: None,
            cloned_from: Some("{mock-guid-0000-0000-0000-000000000000}".to_string()),
            import_path: None,
        },
    );

    // Arch - WSL 1 - Running - Unknown source (external installation)
    mock.insert(
        "{mock-guid-0006-0000-0000-000000000006}".to_string(),
        DistroMetadata {
            distro_id: "{mock-guid-0006-0000-0000-000000000006}".to_string(),
            distro_name: "Arch".to_string(),
            install_source: InstallSource::Unknown,
            image_reference: None,
            download_url: None,
            installed_at: "2024-01-01T00:00:00Z".to_string(),
            catalog_entry: None,
            cloned_from: None,
            import_path: None,
        },
    );

    mock
}

/// Load metadata from file, migrating from v1 if necessary
fn load_and_migrate_metadata() -> MetadataStore {
    let path = get_config_file(METADATA_CONFIG_FILE);

    // Try to read the file
    let content = match fs::read_to_string(&path) {
        Ok(c) => c,
        Err(_) => return MetadataStore::default(),
    };

    // First, try to detect version by parsing as generic JSON
    let json: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return MetadataStore::default(),
    };

    let version = json.get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("1.0");

    if version.starts_with("2.") {
        // Already v2, parse directly
        match serde_json::from_str(&content) {
            Ok(store) => store,
            Err(e) => {
                warn!("Failed to parse v2 metadata store: {}", e);
                MetadataStore::default()
            }
        }
    } else {
        // v1 format, need to migrate
        match serde_json::from_str::<LegacyMetadataStore>(&content) {
            Ok(legacy) => migrate_v1_to_v2(legacy),
            Err(e) => {
                warn!("Failed to parse v1 metadata store: {}", e);
                MetadataStore::default()
            }
        }
    }
}

/// Migrate v1 (name-keyed) metadata to v2 (GUID-keyed)
fn migrate_v1_to_v2(legacy: LegacyMetadataStore) -> MetadataStore {
    info!("Migrating metadata from v1 to v2 (name-keyed → GUID-keyed)");

    // Get current distro registry info to map names to GUIDs
    let registry_info = resource_monitor().get_all_distro_registry_info();

    let mut new_distros = HashMap::new();
    let mut migrated_count = 0;
    let mut orphaned_count = 0;

    for (name, legacy_meta) in legacy.distros {
        // Find the GUID for this distro name
        if let Some(info) = registry_info.get(&name) {
            let new_meta = DistroMetadata {
                distro_id: info.id.clone(),
                distro_name: name.clone(),
                install_source: legacy_meta.install_source,
                installed_at: legacy_meta.installed_at,
                image_reference: legacy_meta.image_reference,
                download_url: legacy_meta.download_url,
                catalog_entry: legacy_meta.catalog_entry,
                cloned_from: None,
                import_path: None,
            };
            new_distros.insert(info.id.clone(), new_meta);
            migrated_count += 1;
        } else {
            // Distro no longer exists, skip (orphaned metadata)
            warn!("Skipping orphaned metadata for '{}' - distro not found in registry", name);
            orphaned_count += 1;
        }
    }

    info!(
        "Migration complete: {} migrated, {} orphaned (skipped)",
        migrated_count, orphaned_count
    );

    let store = MetadataStore {
        version: CURRENT_VERSION.to_string(),
        distros: new_distros,
    };

    // Save the migrated store
    if let Err(e) = save_metadata_to_file(&store) {
        warn!("Failed to save migrated metadata: {}", e);
    }

    store
}

/// Save metadata to file
fn save_metadata_to_file(store: &MetadataStore) -> Result<(), String> {
    let path = get_config_file(METADATA_CONFIG_FILE);
    let content = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize metadata: {}", e))?;

    fs::write(&path, content).map_err(|e| format!("Failed to write metadata file: {}", e))
}

// === Public API (trait-like signatures for future port extraction) ===

/// Get all distro metadata (keyed by GUID)
pub fn get_all_metadata() -> HashMap<String, DistroMetadata> {
    if is_mock_mode() {
        return get_mock_metadata();
    }

    METADATA
        .lock()
        .map(|guard| guard.distros.clone())
        .unwrap_or_else(|poisoned| {
            warn!("Metadata mutex was poisoned, recovering");
            poisoned.into_inner().distros.clone()
        })
}

/// Get metadata for a specific distribution by ID (GUID)
pub fn get_metadata(id: &str) -> Option<DistroMetadata> {
    if is_mock_mode() {
        return get_mock_metadata().get(id).cloned();
    }

    METADATA
        .lock()
        .map(|guard| guard.distros.get(id).cloned())
        .unwrap_or_else(|poisoned| {
            warn!("Metadata mutex was poisoned, recovering");
            poisoned.into_inner().distros.get(id).cloned()
        })
}

/// Get metadata by distribution name (for backwards compatibility during transition)
pub fn get_metadata_by_name(name: &str) -> Option<DistroMetadata> {
    if is_mock_mode() {
        return get_mock_metadata().values().find(|m| m.distro_name == name).cloned();
    }

    METADATA
        .lock()
        .map(|guard| guard.distros.values().find(|m| m.distro_name == name).cloned())
        .unwrap_or_else(|poisoned| {
            warn!("Metadata mutex was poisoned, recovering");
            poisoned.into_inner().distros.values().find(|m| m.distro_name == name).cloned()
        })
}

/// Save metadata for a distribution (uses distro_id as key)
pub fn save_metadata(metadata: DistroMetadata) -> Result<(), String> {
    if is_mock_mode() {
        // In mock mode, store in dynamic mock metadata store
        let result = MOCK_METADATA.lock();
        return match result {
            Ok(mut guard) => {
                guard.distros.insert(metadata.distro_id.clone(), metadata);
                Ok(())
            }
            Err(poisoned) => {
                warn!("Mock metadata mutex was poisoned, recovering");
                let mut store = poisoned.into_inner();
                store.distros.insert(metadata.distro_id.clone(), metadata);
                Ok(())
            }
        };
    }

    let result = METADATA.lock();
    match result {
        Ok(mut guard) => {
            guard.distros.insert(metadata.distro_id.clone(), metadata);
            save_metadata_to_file(&guard)?;
            Ok(())
        }
        Err(poisoned) => {
            warn!("Metadata mutex was poisoned, recovering");
            let mut store = poisoned.into_inner();
            store.distros.insert(metadata.distro_id.clone(), metadata);
            save_metadata_to_file(&store)?;
            Ok(())
        }
    }
}

/// Update the distribution name in metadata (for rename operations)
/// The GUID key stays the same, only the distro_name field is updated
pub fn update_distro_name(id: &str, new_name: &str) -> Result<(), String> {
    if is_mock_mode() {
        // In mock mode, update in dynamic mock metadata store
        let result = MOCK_METADATA.lock();
        return match result {
            Ok(mut guard) => {
                if let Some(metadata) = guard.distros.get_mut(id) {
                    metadata.distro_name = new_name.to_string();
                }
                Ok(())
            }
            Err(poisoned) => {
                warn!("Mock metadata mutex was poisoned, recovering");
                let mut store = poisoned.into_inner();
                if let Some(metadata) = store.distros.get_mut(id) {
                    metadata.distro_name = new_name.to_string();
                }
                Ok(())
            }
        };
    }

    let result = METADATA.lock();
    match result {
        Ok(mut guard) => {
            if let Some(metadata) = guard.distros.get_mut(id) {
                metadata.distro_name = new_name.to_string();
                save_metadata_to_file(&guard)?;
                Ok(())
            } else {
                // No metadata for this distro, nothing to update
                Ok(())
            }
        }
        Err(poisoned) => {
            warn!("Metadata mutex was poisoned, recovering");
            let mut store = poisoned.into_inner();
            if let Some(metadata) = store.distros.get_mut(id) {
                metadata.distro_name = new_name.to_string();
                save_metadata_to_file(&store)?;
            }
            Ok(())
        }
    }
}

/// Delete metadata for a distribution by ID (GUID)
pub fn delete_metadata(id: &str) -> Result<(), String> {
    if is_mock_mode() {
        // In mock mode, delete from dynamic mock metadata store
        let result = MOCK_METADATA.lock();
        return match result {
            Ok(mut guard) => {
                guard.distros.remove(id);
                Ok(())
            }
            Err(poisoned) => {
                warn!("Mock metadata mutex was poisoned, recovering");
                let mut store = poisoned.into_inner();
                store.distros.remove(id);
                Ok(())
            }
        };
    }

    let result = METADATA.lock();
    match result {
        Ok(mut guard) => {
            guard.distros.remove(id);
            save_metadata_to_file(&guard)?;
            Ok(())
        }
        Err(poisoned) => {
            warn!("Metadata mutex was poisoned, recovering");
            let mut store = poisoned.into_inner();
            store.distros.remove(id);
            save_metadata_to_file(&store)?;
            Ok(())
        }
    }
}

/// Delete metadata by distribution name (legacy compatibility)
pub fn delete_metadata_by_name(name: &str) -> Result<(), String> {
    if is_mock_mode() {
        // In mock mode, delete from dynamic mock metadata store
        let result = MOCK_METADATA.lock();
        return match result {
            Ok(mut guard) => {
                let id_to_remove: Option<String> = guard.distros.iter()
                    .find(|(_, m)| m.distro_name == name)
                    .map(|(id, _)| id.clone());
                if let Some(id) = id_to_remove {
                    guard.distros.remove(&id);
                }
                Ok(())
            }
            Err(poisoned) => {
                warn!("Mock metadata mutex was poisoned, recovering");
                let mut store = poisoned.into_inner();
                let id_to_remove: Option<String> = store.distros.iter()
                    .find(|(_, m)| m.distro_name == name)
                    .map(|(id, _)| id.clone());
                if let Some(id) = id_to_remove {
                    store.distros.remove(&id);
                }
                Ok(())
            }
        };
    }

    let result = METADATA.lock();
    match result {
        Ok(mut guard) => {
            // Find and remove by name
            let id_to_remove: Option<String> = guard.distros.iter()
                .find(|(_, m)| m.distro_name == name)
                .map(|(id, _)| id.clone());

            if let Some(id) = id_to_remove {
                guard.distros.remove(&id);
                save_metadata_to_file(&guard)?;
            }
            Ok(())
        }
        Err(poisoned) => {
            warn!("Metadata mutex was poisoned, recovering");
            let mut store = poisoned.into_inner();
            let id_to_remove: Option<String> = store.distros.iter()
                .find(|(_, m)| m.distro_name == name)
                .map(|(id, _)| id.clone());

            if let Some(id) = id_to_remove {
                store.distros.remove(&id);
                save_metadata_to_file(&store)?;
            }
            Ok(())
        }
    }
}

/// Get the GUID for a distribution by name (utility for callers that only have the name)
pub fn get_distro_id_by_name(name: &str) -> Option<String> {
    let registry_info = resource_monitor().get_all_distro_registry_info();
    registry_info.get(name).map(|info| info.id.clone())
}

// === Mock Data ===

/// Get mock metadata from the dynamic store
fn get_mock_metadata() -> HashMap<String, DistroMetadata> {
    MOCK_METADATA
        .lock()
        .map(|guard| guard.distros.clone())
        .unwrap_or_else(|poisoned| {
            warn!("Mock metadata mutex was poisoned, recovering");
            poisoned.into_inner().distros.clone()
        })
}

/// Reset mock metadata to initial state (for E2E test cleanup)
pub fn reset_mock_metadata() {
    if let Ok(mut guard) = MOCK_METADATA.lock() {
        guard.distros = get_initial_mock_metadata();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_install_source_serialization() {
        let store = InstallSource::Store;
        let json = serde_json::to_string(&store).unwrap();
        assert_eq!(json, "\"store\"");

        let container = InstallSource::Container;
        let json = serde_json::to_string(&container).unwrap();
        assert_eq!(json, "\"container\"");

        // New variants
        let import = InstallSource::Import;
        let json = serde_json::to_string(&import).unwrap();
        assert_eq!(json, "\"import\"");

        let clone = InstallSource::Clone;
        let json = serde_json::to_string(&clone).unwrap();
        assert_eq!(json, "\"clone\"");
    }

    #[test]
    fn test_distro_metadata_serialization() {
        let metadata = DistroMetadata {
            distro_id: "{abc-123}".to_string(),
            distro_name: "test-distro".to_string(),
            install_source: InstallSource::Container,
            image_reference: Some("docker.io/library/alpine:latest".to_string()),
            download_url: None,
            installed_at: "2024-01-01T00:00:00Z".to_string(),
            catalog_entry: None,
            cloned_from: None,
            import_path: None,
        };

        let json = serde_json::to_string_pretty(&metadata).unwrap();
        assert!(json.contains("\"distroId\": \"{abc-123}\""));
        assert!(json.contains("\"distroName\": \"test-distro\""));
        assert!(json.contains("\"installSource\": \"container\""));
        assert!(json.contains("\"imageReference\":"));
        // Optional fields should be skipped when None
        assert!(!json.contains("downloadUrl"));
        assert!(!json.contains("catalogEntry"));
        assert!(!json.contains("clonedFrom"));
        assert!(!json.contains("importPath"));
    }

    #[test]
    fn test_distro_metadata_with_clone_fields() {
        let metadata = DistroMetadata::new_clone(
            "{new-guid}".to_string(),
            "my-clone".to_string(),
            "{source-guid}".to_string(),
        );

        assert_eq!(metadata.install_source, InstallSource::Clone);
        assert_eq!(metadata.cloned_from, Some("{source-guid}".to_string()));

        let json = serde_json::to_string_pretty(&metadata).unwrap();
        assert!(json.contains("\"clonedFrom\": \"{source-guid}\""));
    }

    #[test]
    fn test_distro_metadata_with_import_fields() {
        let metadata = DistroMetadata::new_import(
            "{new-guid}".to_string(),
            "my-import".to_string(),
            Some("C:\\backup\\distro.tar".to_string()),
        );

        assert_eq!(metadata.install_source, InstallSource::Import);
        assert_eq!(metadata.import_path, Some("C:\\backup\\distro.tar".to_string()));

        let json = serde_json::to_string_pretty(&metadata).unwrap();
        assert!(json.contains("\"importPath\":"));
    }

    #[test]
    fn test_metadata_store_default() {
        let store = MetadataStore::default();
        assert_eq!(store.version, "2.0");
        assert!(store.distros.is_empty());
    }

    #[test]
    fn test_install_source_default() {
        let source: InstallSource = Default::default();
        assert_eq!(source, InstallSource::Unknown);
    }

    #[test]
    fn test_legacy_metadata_deserialization() {
        // Ensure we can still deserialize v1 format
        let v1_json = r#"{
            "version": "1.0",
            "distros": {
                "Ubuntu": {
                    "name": "Ubuntu",
                    "installSource": "store",
                    "installedAt": "2024-01-15T10:30:00Z"
                }
            }
        }"#;

        let legacy: LegacyMetadataStore = serde_json::from_str(v1_json).unwrap();
        assert_eq!(legacy.version, "1.0");
        assert!(legacy.distros.contains_key("Ubuntu"));
        assert_eq!(legacy.distros["Ubuntu"].install_source, InstallSource::Store);
    }
}
