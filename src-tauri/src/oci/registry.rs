//! Container registry client
//!
//! Implements the Docker Registry HTTP API V2 for pulling images.

use reqwest::blocking::Client;
use reqwest::header::{ACCEPT, AUTHORIZATION, WWW_AUTHENTICATE};
use sha2::{Digest, Sha256};
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

        // When the manifest was requested by digest (pinned reference or the
        // amd64 child of a manifest list), verify the returned bytes match it.
        // A poisoned manifest would otherwise dictate which layers we pull.
        if let Some(ref requested_digest) = image.digest {
            let actual_hex = format!("{:x}", Sha256::digest(body.as_bytes()));
            verify_digest(requested_digest, &actual_hex)?;
        }

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
    ///
    /// The streamed bytes are verified against the content-addressable `digest`
    /// (`sha256:<hex>`) and, when `expected_size` is non-zero, against the size
    /// declared in the manifest. On any mismatch the partial file is deleted and
    /// an error is returned so the import fails loudly rather than silently
    /// producing a broken distro from a truncated or tampered layer.
    pub fn download_blob(
        &self,
        image: &ImageReference,
        digest: &str,
        expected_size: u64,
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

        // Hash the bytes as they stream so we never buffer the whole layer.
        let mut hasher = Sha256::new();

        let mut buffer = [0u8; 8192];
        loop {
            let bytes_read = std::io::Read::read(&mut reader, &mut buffer)
                .map_err(|e| OciError::NetworkError(e.to_string()))?;

            if bytes_read == 0 {
                break;
            }

            file.write_all(&buffer[..bytes_read])?;
            hasher.update(&buffer[..bytes_read]);
            downloaded += bytes_read as u64;

            if let Some(ref cb) = progress {
                cb(downloaded, total_size, digest);
            }
        }

        file.flush()?;

        // Verify declared size first (cheap; catches truncation early).
        if expected_size != 0 && downloaded != expected_size {
            let _ = std::fs::remove_file(output_path);
            return Err(OciError::RegistryError(format!(
                "Blob size mismatch for {}: expected {} bytes, got {} bytes",
                digest, expected_size, downloaded
            )));
        }

        // Verify content-addressable digest.
        let actual_hex = format!("{:x}", hasher.finalize());
        if let Err(e) = verify_digest(digest, &actual_hex) {
            let _ = std::fs::remove_file(output_path);
            return Err(e);
        }

        Ok(())
    }
}

/// Verify that a computed SHA-256 hex string matches an OCI digest reference.
///
/// `expected` must be of the form `sha256:<hex>`. Only SHA-256 is supported;
/// any other algorithm is rejected rather than silently accepted, so a
/// tampered or malformed digest can never bypass verification.
fn verify_digest(expected: &str, actual_sha256_hex: &str) -> Result<(), OciError> {
    let expected = expected.trim();
    let hex = match expected.split_once(':') {
        Some(("sha256", hex)) => hex,
        Some((algo, _)) => {
            return Err(OciError::RegistryError(format!(
                "Unsupported digest algorithm '{}': only sha256 is supported",
                algo
            )));
        }
        None => {
            return Err(OciError::RegistryError(format!(
                "Malformed digest '{}': expected 'sha256:<hex>'",
                expected
            )));
        }
    };

    if !actual_sha256_hex.eq_ignore_ascii_case(hex) {
        return Err(OciError::RegistryError(format!(
            "Digest mismatch: expected sha256:{}, computed sha256:{}",
            hex, actual_sha256_hex
        )));
    }

    Ok(())
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

    // Tests for verify_digest (content-integrity verification).
    // `Sha256`/`Digest` are already in scope via `use super::*`.
    fn sha256_hex(data: &[u8]) -> String {
        format!("{:x}", Sha256::digest(data))
    }

    #[test]
    fn test_verify_digest_matches() {
        let hex = sha256_hex(b"payload");
        assert!(verify_digest(&format!("sha256:{}", hex), &hex).is_ok());
    }

    #[test]
    fn test_verify_digest_case_insensitive() {
        let hex = sha256_hex(b"payload");
        // Registry may present the digest in upper case
        assert!(verify_digest(&format!("sha256:{}", hex.to_uppercase()), &hex).is_ok());
    }

    #[test]
    fn test_verify_digest_mismatch() {
        let hex = sha256_hex(b"honest bytes");
        assert!(verify_digest("sha256:0000000000000000000000000000000000000000000000000000000000000000", &hex).is_err());
    }

    #[test]
    fn test_verify_digest_rejects_unsupported_algorithm() {
        // A non-sha256 algorithm must be rejected, never silently accepted
        let hex = sha256_hex(b"payload");
        assert!(verify_digest(&format!("sha512:{}", hex), &hex).is_err());
    }

    #[test]
    fn test_verify_digest_rejects_malformed() {
        let hex = sha256_hex(b"payload");
        assert!(verify_digest("not-a-digest", &hex).is_err());
    }

    // Integration tests for download_blob content verification.
    //
    // download_blob uses a blocking reqwest client, so it must run off the tokio
    // worker thread (spawn_blocking) while wiremock serves the mock registry.
    fn mock_image(registry_uri: String) -> ImageReference {
        ImageReference {
            registry: registry_uri, // includes the http:// scheme from wiremock
            repository: "library/test".to_string(),
            tag: "latest".to_string(),
            digest: None,
        }
    }

    #[tokio::test]
    async fn test_download_blob_accepts_matching_digest() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        let body = b"a genuine oci layer".to_vec();
        let digest = format!("sha256:{}", sha256_hex(&body));
        let size = body.len() as u64;

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(body.clone()))
            .mount(&server)
            .await;

        let uri = server.uri();
        let out = std::env::temp_dir().join(format!("oci-blob-ok-{}.bin", std::process::id()));
        let out_thread = out.clone();

        let result = tokio::task::spawn_blocking(move || {
            let client = RegistryClient::new();
            let image = mock_image(uri);
            client.download_blob(&image, &digest, size, &out_thread, None)
        })
        .await
        .unwrap();

        assert!(result.is_ok(), "expected Ok, got {:?}", result);
        assert_eq!(std::fs::read(&out).unwrap(), body);
        let _ = std::fs::remove_file(&out);
    }

    #[tokio::test]
    async fn test_download_blob_rejects_digest_mismatch() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        // Registry serves tampered bytes but the manifest promised a different digest.
        let served = b"tampered / MITM'd layer bytes".to_vec();
        let expected_digest = format!("sha256:{}", sha256_hex(b"the honest layer the manifest points at"));
        let size = served.len() as u64; // size matches so the digest check is what fires

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(served))
            .mount(&server)
            .await;

        let uri = server.uri();
        let out = std::env::temp_dir().join(format!("oci-blob-digest-mismatch-{}.bin", std::process::id()));
        let out_thread = out.clone();

        let result = tokio::task::spawn_blocking(move || {
            let client = RegistryClient::new();
            let image = mock_image(uri);
            client.download_blob(&image, &expected_digest, size, &out_thread, None)
        })
        .await
        .unwrap();

        assert!(result.is_err(), "digest mismatch must be rejected");
        // Partial/tampered file must be deleted so a broken layer is never imported
        assert!(!out.exists(), "partial file should be removed on digest mismatch");
    }

    #[tokio::test]
    async fn test_download_blob_rejects_size_mismatch() {
        use wiremock::matchers::method;
        use wiremock::{Mock, MockServer, ResponseTemplate};

        // Truncated download: bytes hash fine but fall short of the declared size.
        let body = b"short layer".to_vec();
        let digest = format!("sha256:{}", sha256_hex(&body));
        let declared_size = body.len() as u64 + 100; // manifest promised more bytes

        let server = MockServer::start().await;
        Mock::given(method("GET"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(body))
            .mount(&server)
            .await;

        let uri = server.uri();
        let out = std::env::temp_dir().join(format!("oci-blob-size-mismatch-{}.bin", std::process::id()));
        let out_thread = out.clone();

        let result = tokio::task::spawn_blocking(move || {
            let client = RegistryClient::new();
            let image = mock_image(uri);
            client.download_blob(&image, &digest, declared_size, &out_thread, None)
        })
        .await
        .unwrap();

        assert!(result.is_err(), "size mismatch must be rejected");
        assert!(!out.exists(), "partial file should be removed on size mismatch");
    }
}
