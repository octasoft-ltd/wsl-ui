//! Container registry client
//!
//! Implements the Docker Registry HTTP API V2 for pulling images.

use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, AUTHORIZATION, WWW_AUTHENTICATE};
use std::io::Write;
use std::path::Path;

use super::types::*;

const MANIFEST_V2: &str = "application/vnd.docker.distribution.manifest.v2+json";
const MANIFEST_LIST: &str = "application/vnd.docker.distribution.manifest.list.v2+json";
const OCI_MANIFEST: &str = "application/vnd.oci.image.manifest.v1+json";
const OCI_INDEX: &str = "application/vnd.oci.image.index.v1+json";

/// Registry client for pulling images
pub struct RegistryClient {
    client: Client,
    token: Option<String>,
}

impl RegistryClient {
    pub fn new() -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .expect("Failed to create HTTP client");

        Self {
            client,
            token: None,
        }
    }

    /// Get the registry URL for API calls
    fn registry_url(&self, registry: &str) -> String {
        // Docker Hub uses a different domain for the registry API
        if registry == "docker.io" {
            "https://registry-1.docker.io".to_string()
        } else if registry.starts_with("http://") || registry.starts_with("https://") {
            registry.to_string()
        } else {
            format!("https://{}", registry)
        }
    }

    /// Authenticate with the registry if needed
    fn authenticate(&mut self, registry: &str, repository: &str) -> Result<(), OciError> {
        let base_url = self.registry_url(registry);

        // Try to access the manifest to trigger auth challenge
        let url = format!("{}/v2/{}/manifests/latest", base_url, repository);
        let response = self.client.get(&url)
            .header(ACCEPT, MANIFEST_V2)
            .send()
            .map_err(|e| OciError::NetworkError(e.to_string()))?;

        if response.status() == reqwest::StatusCode::UNAUTHORIZED {
            // Parse WWW-Authenticate header
            if let Some(auth_header) = response.headers().get(WWW_AUTHENTICATE) {
                let auth_str = auth_header.to_str().unwrap_or("");
                if let Some(token) = self.get_bearer_token(auth_str, repository)? {
                    self.token = Some(token);
                }
            }
        }

        Ok(())
    }

    /// Get a bearer token from the auth service
    fn get_bearer_token(&self, www_auth: &str, repository: &str) -> Result<Option<String>, OciError> {
        // Parse: Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/alpine:pull"
        if !www_auth.starts_with("Bearer ") {
            return Ok(None);
        }

        let params: std::collections::HashMap<String, String> = www_auth[7..]
            .split(',')
            .filter_map(|part| {
                let mut kv = part.splitn(2, '=');
                let key = kv.next()?.trim();
                let value = kv.next()?.trim().trim_matches('"');
                Some((key.to_string(), value.to_string()))
            })
            .collect();

        let realm = params.get("realm").ok_or_else(|| {
            OciError::AuthRequired("No realm in auth header".to_string())
        })?;

        let mut url = format!("{}?", realm);
        if let Some(service) = params.get("service") {
            url.push_str(&format!("service={}&", service));
        }
        // Request pull scope
        url.push_str(&format!("scope=repository:{}:pull", repository));

        let response = self.client.get(&url)
            .send()
            .map_err(|e| OciError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(OciError::AuthRequired(format!(
                "Token request failed: {}",
                response.status()
            )));
        }

        #[derive(serde::Deserialize)]
        struct TokenResponse {
            token: Option<String>,
            access_token: Option<String>,
        }

        let token_resp: TokenResponse = response.json()
            .map_err(|e| OciError::AuthRequired(format!("Failed to parse token: {}", e)))?;

        Ok(token_resp.token.or(token_resp.access_token))
    }

    /// Fetch the image manifest
    pub fn get_manifest(&mut self, image: &ImageReference) -> Result<ImageManifest, OciError> {
        // Ensure we're authenticated
        self.authenticate(&image.registry, &image.repository)?;

        let base_url = self.registry_url(&image.registry);
        let reference = image.digest.as_ref().unwrap_or(&image.tag);
        let url = format!("{}/v2/{}/manifests/{}", base_url, image.repository, reference);

        let mut request = self.client.get(&url)
            .header(ACCEPT, format!("{}, {}, {}, {}", MANIFEST_V2, OCI_MANIFEST, MANIFEST_LIST, OCI_INDEX));

        if let Some(ref token) = self.token {
            request = request.header(AUTHORIZATION, format!("Bearer {}", token));
        }

        let response = request.send()
            .map_err(|e| OciError::NetworkError(e.to_string()))?;

        if response.status() == reqwest::StatusCode::NOT_FOUND {
            return Err(OciError::NotFound(image.full_reference()));
        }

        if !response.status().is_success() {
            return Err(OciError::RegistryError(format!(
                "Failed to get manifest: {} - {}",
                response.status(),
                response.text().unwrap_or_default()
            )));
        }

        let content_type = response.headers()
            .get("content-type")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("")
            .to_string();

        let body = response.text()
            .map_err(|e| OciError::NetworkError(e.to_string()))?;

        // Check if it's a manifest list (multi-arch)
        if content_type.contains("manifest.list") || content_type.contains("image.index") {
            let list: ManifestList = serde_json::from_str(&body)
                .map_err(|e| OciError::RegistryError(format!("Failed to parse manifest list: {}", e)))?;

            // Find amd64/linux manifest
            let amd64_manifest = list.manifests.iter()
                .find(|m| {
                    m.platform.as_ref().map(|p| {
                        p.architecture == "amd64" && p.os == "linux"
                    }).unwrap_or(false)
                })
                .ok_or_else(|| OciError::UnsupportedManifest(
                    "No amd64/linux manifest found".to_string()
                ))?;

            // Fetch the actual manifest using digest
            let mut child_image = image.clone();
            child_image.digest = Some(amd64_manifest.digest.clone());
            return self.get_manifest(&child_image);
        }

        // Parse as regular manifest
        let manifest: ImageManifest = serde_json::from_str(&body)
            .map_err(|e| OciError::RegistryError(format!("Failed to parse manifest: {}", e)))?;

        Ok(manifest)
    }

    /// Download a blob (layer) to a file
    pub fn download_blob(
        &self,
        image: &ImageReference,
        digest: &str,
        output_path: &Path,
        progress: Option<&ProgressCallback>,
    ) -> Result<(), OciError> {
        let base_url = self.registry_url(&image.registry);
        let url = format!("{}/v2/{}/blobs/{}", base_url, image.repository, digest);

        let mut request = self.client.get(&url);
        if let Some(ref token) = self.token {
            request = request.header(AUTHORIZATION, format!("Bearer {}", token));
        }

        let response = request.send()
            .map_err(|e| OciError::NetworkError(e.to_string()))?;

        if !response.status().is_success() {
            return Err(OciError::RegistryError(format!(
                "Failed to download blob: {}",
                response.status()
            )));
        }

        let total_size = response.content_length().unwrap_or(0);
        let mut downloaded: u64 = 0;

        let mut file = std::fs::File::create(output_path)?;
        let mut reader = response;

        let mut buffer = [0u8; 8192];
        loop {
            let bytes_read = std::io::Read::read(&mut reader, &mut buffer)
                .map_err(|e| OciError::NetworkError(e.to_string()))?;

            if bytes_read == 0 {
                break;
            }

            file.write_all(&buffer[..bytes_read])?;
            downloaded += bytes_read as u64;

            if let Some(ref cb) = progress {
                cb(downloaded, total_size, digest);
            }
        }

        Ok(())
    }
}

/// Parse WWW-Authenticate Bearer header into parameters (extracted for testing)
#[cfg(test)]
fn parse_www_authenticate(www_auth: &str) -> Option<std::collections::HashMap<String, String>> {
    if !www_auth.starts_with("Bearer ") {
        return None;
    }

    let params: std::collections::HashMap<String, String> = www_auth[7..]
        .split(',')
        .filter_map(|part| {
            let mut kv = part.splitn(2, '=');
            let key = kv.next()?.trim();
            let value = kv.next()?.trim().trim_matches('"');
            Some((key.to_string(), value.to_string()))
        })
        .collect();

    Some(params)
}

/// Get registry URL for API calls (extracted for testing)
#[cfg(test)]
fn get_registry_url(registry: &str) -> String {
    if registry == "docker.io" {
        "https://registry-1.docker.io".to_string()
    } else if registry.starts_with("http://") || registry.starts_with("https://") {
        registry.to_string()
    } else {
        format!("https://{}", registry)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // Tests for get_registry_url
    #[test]
    fn test_registry_url_docker_hub() {
        assert_eq!(get_registry_url("docker.io"), "https://registry-1.docker.io");
    }

    #[test]
    fn test_registry_url_ghcr() {
        assert_eq!(get_registry_url("ghcr.io"), "https://ghcr.io");
    }

    #[test]
    fn test_registry_url_already_https() {
        assert_eq!(get_registry_url("https://myregistry.com"), "https://myregistry.com");
    }

    #[test]
    fn test_registry_url_http_preserved() {
        // Insecure registries keep http://
        assert_eq!(get_registry_url("http://localhost:5000"), "http://localhost:5000");
    }

    #[test]
    fn test_registry_url_adds_https() {
        assert_eq!(get_registry_url("quay.io"), "https://quay.io");
        assert_eq!(get_registry_url("mcr.microsoft.com"), "https://mcr.microsoft.com");
    }

    #[test]
    fn test_registry_url_localhost() {
        assert_eq!(get_registry_url("localhost:5000"), "https://localhost:5000");
    }

    // Tests for parse_www_authenticate
    #[test]
    fn test_parse_www_authenticate_docker_hub() {
        let header = r#"Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/alpine:pull""#;
        let params = parse_www_authenticate(header).unwrap();

        assert_eq!(params.get("realm").unwrap(), "https://auth.docker.io/token");
        assert_eq!(params.get("service").unwrap(), "registry.docker.io");
        assert_eq!(params.get("scope").unwrap(), "repository:library/alpine:pull");
    }

    #[test]
    fn test_parse_www_authenticate_ghcr() {
        let header = r#"Bearer realm="https://ghcr.io/token",service="ghcr.io",scope="repository:owner/repo:pull""#;
        let params = parse_www_authenticate(header).unwrap();

        assert_eq!(params.get("realm").unwrap(), "https://ghcr.io/token");
        assert_eq!(params.get("service").unwrap(), "ghcr.io");
    }

    #[test]
    fn test_parse_www_authenticate_not_bearer() {
        let header = "Basic realm=\"something\"";
        assert!(parse_www_authenticate(header).is_none());
    }

    #[test]
    fn test_parse_www_authenticate_empty() {
        let header = "";
        assert!(parse_www_authenticate(header).is_none());
    }

    #[test]
    fn test_parse_www_authenticate_minimal() {
        let header = r#"Bearer realm="https://example.com/token""#;
        let params = parse_www_authenticate(header).unwrap();

        assert_eq!(params.get("realm").unwrap(), "https://example.com/token");
        assert!(params.get("service").is_none());
    }

    #[test]
    fn test_parse_www_authenticate_with_spaces() {
        let header = r#"Bearer realm = "https://example.com/token" , service = "example.com""#;
        let params = parse_www_authenticate(header).unwrap();

        assert_eq!(params.get("realm").unwrap(), "https://example.com/token");
        assert_eq!(params.get("service").unwrap(), "example.com");
    }

    // Tests for manifest content type detection
    #[test]
    fn test_manifest_content_types() {
        // Verify the constants are correct
        assert!(MANIFEST_V2.contains("manifest"));
        assert!(MANIFEST_LIST.contains("manifest.list"));
        assert!(OCI_MANIFEST.contains("manifest"));
        assert!(OCI_INDEX.contains("index"));
    }

    #[test]
    fn test_is_manifest_list() {
        let content_type = "application/vnd.docker.distribution.manifest.list.v2+json";
        assert!(content_type.contains("manifest.list"));

        let content_type2 = "application/vnd.oci.image.index.v1+json";
        assert!(content_type2.contains("image.index"));
    }

    #[test]
    fn test_is_not_manifest_list() {
        let content_type = "application/vnd.docker.distribution.manifest.v2+json";
        assert!(!content_type.contains("manifest.list") && !content_type.contains("image.index"));
    }

    // Tests for RegistryClient creation
    #[test]
    fn test_registry_client_creation() {
        let client = RegistryClient::new();
        assert!(client.token.is_none());
    }

    #[test]
    fn test_registry_client_registry_url() {
        let client = RegistryClient::new();

        assert_eq!(client.registry_url("docker.io"), "https://registry-1.docker.io");
        assert_eq!(client.registry_url("ghcr.io"), "https://ghcr.io");
        assert_eq!(client.registry_url("http://localhost:5000"), "http://localhost:5000");
    }
}
