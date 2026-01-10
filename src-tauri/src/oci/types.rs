//! OCI types and error handling

use serde::Deserialize;
use thiserror::Error;

/// Error types for OCI operations
#[derive(Error, Debug)]
pub enum OciError {
    #[error("Invalid image reference: {0}")]
    InvalidReference(String),

    #[error("Registry error: {0}")]
    RegistryError(String),

    #[error("Authentication required for {0}")]
    AuthRequired(String),

    #[error("Image not found: {0}")]
    NotFound(String),

    #[error("Unsupported manifest type: {0}")]
    UnsupportedManifest(String),

    #[error("Layer extraction failed: {0}")]
    LayerError(String),

    #[error("IO error: {0}")]
    IoError(#[from] std::io::Error),

    #[error("Network error: {0}")]
    NetworkError(String),
}

/// Parsed container image reference
/// Format: [registry/]repository[:tag|@digest]
#[derive(Debug, Clone)]
pub struct ImageReference {
    /// Registry host (e.g., "docker.io", "ghcr.io")
    pub registry: String,
    /// Repository path (e.g., "library/alpine", "ubuntu")
    pub repository: String,
    /// Tag (e.g., "latest", "3.19")
    pub tag: String,
    /// Optional digest for pinned versions
    pub digest: Option<String>,
}

impl ImageReference {
    /// Parse an image reference string
    /// Examples:
    /// - "alpine" -> docker.io/library/alpine:latest
    /// - "alpine:3.19" -> docker.io/library/alpine:3.19
    /// - "ubuntu:22.04" -> docker.io/library/ubuntu:22.04
    /// - "ghcr.io/owner/repo:tag" -> ghcr.io/owner/repo:tag
    /// - "nginx" -> docker.io/library/nginx:latest
    pub fn parse(reference: &str) -> Result<Self, OciError> {
        let reference = reference.trim();
        if reference.is_empty() {
            return Err(OciError::InvalidReference("Empty reference".to_string()));
        }

        // Check for digest
        let (ref_part, digest) = if let Some(idx) = reference.find('@') {
            let (r, d) = reference.split_at(idx);
            (r, Some(d[1..].to_string()))
        } else {
            (reference, None)
        };

        // Split by tag
        let (repo_part, tag) = if let Some(idx) = ref_part.rfind(':') {
            // Make sure this : is not part of a port number
            let before_colon = &ref_part[..idx];
            if before_colon.contains('/') || !before_colon.chars().last().map(|c| c.is_ascii_digit()).unwrap_or(false) {
                let (r, t) = ref_part.split_at(idx);
                (r, t[1..].to_string())
            } else {
                (ref_part, "latest".to_string())
            }
        } else {
            (ref_part, "latest".to_string())
        };

        // Parse registry and repository
        let parts: Vec<&str> = repo_part.splitn(2, '/').collect();

        let (registry, repository) = if parts.len() == 1 {
            // No slash - official Docker Hub image (e.g., "alpine")
            ("docker.io".to_string(), format!("library/{}", parts[0]))
        } else if parts[0].contains('.') || parts[0].contains(':') || parts[0] == "localhost" {
            // First part looks like a registry (has dot, colon, or is localhost)
            (parts[0].to_string(), parts[1].to_string())
        } else {
            // Docker Hub user image (e.g., "user/repo")
            ("docker.io".to_string(), repo_part.to_string())
        };

        Ok(Self {
            registry,
            repository,
            tag,
            digest,
        })
    }

    /// Get the full reference string
    pub fn full_reference(&self) -> String {
        if let Some(ref digest) = self.digest {
            format!("{}/{}@{}", self.registry, self.repository, digest)
        } else {
            format!("{}/{}:{}", self.registry, self.repository, self.tag)
        }
    }

    /// Get a suggested distribution name based on the image
    pub fn suggested_name(&self) -> String {
        // Extract the last part of the repository
        let repo_name = self.repository
            .rsplit('/')
            .next()
            .unwrap_or(&self.repository);

        // Clean up the name
        let clean_name: String = repo_name
            .chars()
            .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
            .collect();

        // Add tag if not "latest"
        if self.tag != "latest" {
            let clean_tag: String = self.tag
                .chars()
                .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '-' })
                .collect();
            format!("{}-{}", clean_name, clean_tag)
        } else {
            clean_name
        }
    }
}

/// OCI Image Manifest (v2 schema 2)
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
pub struct ImageManifest {
    pub schema_version: u32,
    pub media_type: Option<String>,
    pub config: Descriptor,
    pub layers: Vec<Descriptor>,
}

/// OCI Manifest List (for multi-arch images)
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
pub struct ManifestList {
    pub schema_version: u32,
    pub media_type: Option<String>,
    pub manifests: Vec<ManifestDescriptor>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
pub struct ManifestDescriptor {
    pub media_type: String,
    pub digest: String,
    pub size: u64,
    pub platform: Option<Platform>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
pub struct Platform {
    pub architecture: String,
    pub os: String,
    pub variant: Option<String>,
}

/// Content descriptor (for layers and config)
#[derive(Debug, Deserialize)]
#[allow(dead_code)]
#[serde(rename_all = "camelCase")]
pub struct Descriptor {
    pub media_type: String,
    pub digest: String,
    pub size: u64,
}

/// Progress callback for download operations
pub type ProgressCallback = Box<dyn Fn(u64, u64, &str) + Send + Sync>;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_simple() {
        let ref1 = ImageReference::parse("alpine").unwrap();
        assert_eq!(ref1.registry, "docker.io");
        assert_eq!(ref1.repository, "library/alpine");
        assert_eq!(ref1.tag, "latest");
    }

    #[test]
    fn test_parse_with_tag() {
        let ref1 = ImageReference::parse("alpine:3.19").unwrap();
        assert_eq!(ref1.registry, "docker.io");
        assert_eq!(ref1.repository, "library/alpine");
        assert_eq!(ref1.tag, "3.19");
    }

    #[test]
    fn test_parse_user_repo() {
        let ref1 = ImageReference::parse("myuser/myrepo:v1").unwrap();
        assert_eq!(ref1.registry, "docker.io");
        assert_eq!(ref1.repository, "myuser/myrepo");
        assert_eq!(ref1.tag, "v1");
    }

    #[test]
    fn test_parse_custom_registry() {
        let ref1 = ImageReference::parse("ghcr.io/owner/repo:latest").unwrap();
        assert_eq!(ref1.registry, "ghcr.io");
        assert_eq!(ref1.repository, "owner/repo");
        assert_eq!(ref1.tag, "latest");
    }

    #[test]
    fn test_suggested_name() {
        let ref1 = ImageReference::parse("alpine:3.19").unwrap();
        assert_eq!(ref1.suggested_name(), "alpine-3-19");

        let ref2 = ImageReference::parse("ubuntu").unwrap();
        assert_eq!(ref2.suggested_name(), "ubuntu");
    }
}
