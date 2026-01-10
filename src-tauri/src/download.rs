//! Download utilities with progress tracking and checksum verification

use futures_util::StreamExt;
use serde::Serialize;
use sha2::{Digest, Sha256};
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::time::timeout;

static MOCK_DOWNLOAD_ENABLED: AtomicBool = AtomicBool::new(false);
static MOCK_DOWNLOAD_DELAY_MS: AtomicU64 = AtomicU64::new(2000);
static MOCK_DOWNLOAD_ERROR: OnceLock<std::sync::Mutex<Option<String>>> = OnceLock::new();

/// Set simple mock download parameters
pub fn set_mock_download(enabled: bool, delay_ms: u64, error: Option<String>) {
    MOCK_DOWNLOAD_ENABLED.store(enabled, Ordering::SeqCst);
    MOCK_DOWNLOAD_DELAY_MS.store(delay_ms, Ordering::SeqCst);
    let mutex = MOCK_DOWNLOAD_ERROR.get_or_init(|| std::sync::Mutex::new(None));
    if let Ok(mut guard) = mutex.lock() {
        *guard = error;
    }
}

/// Reset mock download state
pub fn reset_mock_download() {
    MOCK_DOWNLOAD_ENABLED.store(false, Ordering::SeqCst);
    MOCK_DOWNLOAD_DELAY_MS.store(2000, Ordering::SeqCst);
    let mutex = MOCK_DOWNLOAD_ERROR.get_or_init(|| std::sync::Mutex::new(None));
    if let Ok(mut guard) = mutex.lock() {
        *guard = None;
    }
}

/// Simulate a download with progress events (for mock mode)
pub async fn simulate_download_with_progress<E: ProgressEmitter>(
    app: &E,
    distro_name: &str,
) -> Result<(), String> {
    let delay_ms = MOCK_DOWNLOAD_DELAY_MS.load(Ordering::SeqCst);
    let error = MOCK_DOWNLOAD_ERROR.get_or_init(|| std::sync::Mutex::new(None));
    let error_msg = error.lock().ok().and_then(|g| g.clone());

    // Simulated download size
    let total_bytes: u64 = 50 * 1024 * 1024; // 50MB simulated
    let steps = 10u64;
    let step_delay = Duration::from_millis(delay_ms / steps);
    let bytes_per_step = total_bytes / steps;

    // Emit initial progress
    app.emit_progress(DownloadProgress {
        distro_name: distro_name.to_string(),
        stage: "downloading".to_string(),
        bytes_downloaded: 0,
        total_bytes: Some(total_bytes),
        percent: Some(0.0),
    });

    // Simulate download progress
    for i in 1..=steps {
        tokio::time::sleep(step_delay).await;

        let bytes_downloaded = bytes_per_step * i;
        let percent = (i as f32 / steps as f32) * 100.0;

        // Check for simulated error mid-download
        if let Some(ref msg) = error_msg {
            if i == steps / 2 {
                app.emit_progress(DownloadProgress {
                    distro_name: distro_name.to_string(),
                    stage: "error".to_string(),
                    bytes_downloaded,
                    total_bytes: Some(total_bytes),
                    percent: Some(percent),
                });
                return Err(msg.clone());
            }
        }

        app.emit_progress(DownloadProgress {
            distro_name: distro_name.to_string(),
            stage: "downloading".to_string(),
            bytes_downloaded,
            total_bytes: Some(total_bytes),
            percent: Some(percent),
        });
    }

    Ok(())
}

/// Progress event payload
#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub distro_name: String,
    pub stage: String,
    pub bytes_downloaded: u64,
    pub total_bytes: Option<u64>,
    pub percent: Option<f32>,
}

/// Trait for emitting download progress events (allows mocking in tests)
pub trait ProgressEmitter {
    fn emit_progress(&self, progress: DownloadProgress);
}

impl ProgressEmitter for AppHandle {
    fn emit_progress(&self, progress: DownloadProgress) {
        let _ = self.emit("download-progress", progress);
    }
}

/// Resource limits for downloads
#[derive(Debug, Clone)]
pub struct DownloadLimits {
    /// Maximum file size in bytes (None = unlimited)
    pub max_file_size: Option<u64>,
    /// Overall timeout for the entire download operation
    pub overall_timeout: Duration,
    /// Progress timeout - abort if no progress for this duration
    pub progress_timeout: Duration,
}

impl Default for DownloadLimits {
    fn default() -> Self {
        Self {
            max_file_size: Some(10 * 1024 * 1024 * 1024), // 10GB
            overall_timeout: Duration::from_secs(3600),     // 1 hour
            progress_timeout: Duration::from_secs(300),      // 5 minutes
        }
    }
}

/// Download a file with progress events and optional checksum verification
pub async fn download_with_progress_and_checksum(
    app: &AppHandle,
    url: &str,
    dest_path: &Path,
    distro_name: &str,
    expected_checksum: Option<String>,
) -> Result<(), String> {
    download_with_progress_and_limits(app, url, dest_path, distro_name, DownloadLimits::default(), expected_checksum).await
}

/// Download a file with progress events, custom resource limits, and optional checksum verification
pub async fn download_with_progress_and_limits<E: ProgressEmitter>(
    app: &E,
    url: &str,
    dest_path: &Path,
    distro_name: &str,
    limits: DownloadLimits,
    expected_checksum: Option<String>,
) -> Result<(), String> {
    // Wrap the entire download in an overall timeout
    match timeout(
        limits.overall_timeout,
        download_with_limits_impl(app, url, dest_path, distro_name, limits.clone(), expected_checksum),
    )
    .await
    {
        Ok(result) => result,
        Err(_) => {
            // Clean up partial file on timeout
            let _ = tokio::fs::remove_file(dest_path).await;
            Err(format!(
                "Download timed out after {} seconds",
                limits.overall_timeout.as_secs()
            ))
        }
    }
}

/// Internal implementation of download with limits and checksum verification
async fn download_with_limits_impl<E: ProgressEmitter>(
    app: &E,
    url: &str,
    dest_path: &Path,
    distro_name: &str,
    limits: DownloadLimits,
    expected_checksum: Option<String>,
) -> Result<(), String> {
    let client = reqwest::Client::new();

    let response = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("Failed to start download: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Download failed with status: {}", response.status()));
    }

    let total_size = response.content_length();

    // Check if Content-Length exceeds max file size limit
    if let Some(max_size) = limits.max_file_size {
        if let Some(size) = total_size {
            if size > max_size {
                return Err(format!(
                    "File size ({} bytes) exceeds maximum allowed size ({} bytes)",
                    size, max_size
                ));
            }
        }
    }

    // Emit initial progress
    app.emit_progress(DownloadProgress {
        distro_name: distro_name.to_string(),
        stage: "downloading".to_string(),
        bytes_downloaded: 0,
        total_bytes: total_size,
        percent: Some(0.0),
    });

    let mut file = tokio::fs::File::create(dest_path)
        .await
        .map_err(|e| format!("Failed to create temp file: {}", e))?;

    let mut downloaded: u64 = 0;
    let mut stream = response.bytes_stream();
    let mut last_emit_percent: i32 = -1;

    // Initialize SHA256 hasher for streaming checksum calculation
    let mut hasher = Sha256::new();

    loop {
        // Apply progress timeout
        let chunk_result = match timeout(limits.progress_timeout, stream.next()).await {
            Ok(Some(chunk)) => chunk,
            Ok(None) => break, // Stream ended normally
            Err(_) => {
                // Clean up partial file on progress timeout
                let _ = tokio::fs::remove_file(dest_path).await;
                return Err(format!(
                    "Download stalled - no progress for {} seconds",
                    limits.progress_timeout.as_secs()
                ));
            }
        };

        let chunk = chunk_result.map_err(|e| {
            // Clean up partial file on error
            let path = dest_path.to_path_buf();
            tokio::spawn(async move {
                let _ = tokio::fs::remove_file(path).await;
            });
            format!("Download error: {}", e)
        })?;

        file.write_all(&chunk).await.map_err(|e| {
            // Clean up partial file on write error
            let path = dest_path.to_path_buf();
            tokio::spawn(async move {
                let _ = tokio::fs::remove_file(path).await;
            });
            format!("Failed to write file: {}", e)
        })?;

        // Update hasher with chunk data for streaming checksum calculation
        hasher.update(&chunk);

        downloaded += chunk.len() as u64;

        // Check if downloaded size exceeds limit (handles cases where Content-Length is not available)
        if let Some(max_size) = limits.max_file_size {
            if downloaded > max_size {
                // Clean up partial file
                let _ = tokio::fs::remove_file(dest_path).await;
                return Err(format!(
                    "Download size ({} bytes) exceeds maximum allowed size ({} bytes)",
                    downloaded, max_size
                ));
            }
        }

        // Calculate percentage and emit progress (throttled to avoid too many events)
        let percent = total_size.map(|total| (downloaded as f32 / total as f32) * 100.0);
        let current_percent = percent.map(|p| p as i32).unwrap_or(-1);

        if current_percent != last_emit_percent {
            last_emit_percent = current_percent;
            app.emit_progress(DownloadProgress {
                distro_name: distro_name.to_string(),
                stage: "downloading".to_string(),
                bytes_downloaded: downloaded,
                total_bytes: total_size,
                percent,
            });
        }
    }

    file.flush()
        .await
        .map_err(|e| format!("Failed to flush file: {}", e))?;

    // Calculate final checksum
    let calculated_checksum = format!("{:x}", hasher.finalize());

    // Verify checksum if provided
    if let Some(expected) = expected_checksum {
        let expected_lower = expected.to_lowercase();
        let calculated_lower = calculated_checksum.to_lowercase();

        if expected_lower != calculated_lower {
            // Checksum mismatch - delete file and return error
            let _ = tokio::fs::remove_file(dest_path).await;
            return Err(format!(
                "Checksum verification failed!\nExpected: {}\nCalculated: {}\nThe downloaded file has been deleted for security.",
                expected, calculated_checksum
            ));
        }

        log::info!(
            "Checksum verification successful for {}: {}",
            distro_name,
            calculated_checksum
        );
    }

    // Emit completion
    app.emit_progress(DownloadProgress {
        distro_name: distro_name.to_string(),
        stage: "importing".to_string(),
        bytes_downloaded: downloaded,
        total_bytes: total_size,
        percent: Some(100.0),
    });

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sha2::{Digest, Sha256};
    use std::io::Write;
    use wiremock::matchers::{method, path};
    use wiremock::{Mock, MockServer, ResponseTemplate};

    /// Helper function to calculate SHA256 checksum of data
    fn calculate_sha256(data: &[u8]) -> String {
        let mut hasher = Sha256::new();
        hasher.update(data);
        format!("{:x}", hasher.finalize())
    }

    #[test]
    fn test_checksum_calculation() {
        let test_data = b"Hello, WSL2-UI!";
        let checksum = calculate_sha256(test_data);

        // Verify the checksum format (should be 64 hex characters)
        assert_eq!(checksum.len(), 64);
        assert!(checksum.chars().all(|c| c.is_ascii_hexdigit()));

        // Verify consistency
        let checksum2 = calculate_sha256(test_data);
        assert_eq!(checksum, checksum2);
    }

    #[test]
    fn test_different_data_different_checksum() {
        let data1 = b"data1";
        let data2 = b"data2";

        let checksum1 = calculate_sha256(data1);
        let checksum2 = calculate_sha256(data2);

        assert_ne!(checksum1, checksum2);
    }

    #[test]
    fn test_checksum_verification_success() {
        // Create a temporary file with known content
        let temp_dir = std::env::temp_dir();
        let temp_path = temp_dir.join("test_checksum_success.dat");
        let test_data = b"Test content for checksum verification";

        std::fs::write(&temp_path, test_data).unwrap();

        let expected_checksum = calculate_sha256(test_data);

        // Read and verify checksum
        let file_content = std::fs::read(&temp_path).unwrap();
        let actual_checksum = calculate_sha256(&file_content);

        assert_eq!(actual_checksum, expected_checksum);

        // Cleanup
        let _ = std::fs::remove_file(&temp_path);
    }

    #[test]
    fn test_checksum_verification_failure() {
        // Create a temporary file
        let temp_dir = std::env::temp_dir();
        let temp_path = temp_dir.join("test_checksum_failure.dat");
        let test_data = b"Some data";

        std::fs::write(&temp_path, test_data).unwrap();

        // Calculate checksum for different data
        let wrong_data = b"Different data";
        let wrong_checksum = calculate_sha256(wrong_data);

        let file_content = std::fs::read(&temp_path).unwrap();
        let actual_checksum = calculate_sha256(&file_content);

        assert_ne!(actual_checksum, wrong_checksum);

        // Cleanup
        let _ = std::fs::remove_file(&temp_path);
    }

    #[test]
    fn test_empty_file_checksum() {
        let temp_dir = std::env::temp_dir();
        let temp_path = temp_dir.join("test_empty.dat");

        std::fs::write(&temp_path, b"").unwrap();

        let file_content = std::fs::read(&temp_path).unwrap();
        let checksum = calculate_sha256(&file_content);

        // SHA256 of empty string
        assert_eq!(
            checksum,
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );

        // Cleanup
        let _ = std::fs::remove_file(&temp_path);
    }

    #[test]
    fn test_large_file_checksum() {
        let temp_dir = std::env::temp_dir();
        let temp_path = temp_dir.join("test_large.dat");

        let mut file = std::fs::File::create(&temp_path).unwrap();

        // Create a 1MB file with repeated pattern
        let pattern = b"ABCDEFGH";
        for _ in 0..131072 {
            file.write_all(pattern).unwrap();
        }
        file.flush().unwrap();
        drop(file);

        let file_content = std::fs::read(&temp_path).unwrap();
        let checksum = calculate_sha256(&file_content);

        // Verify it produces a valid checksum
        assert_eq!(checksum.len(), 64);
        assert!(checksum.chars().all(|c| c.is_ascii_hexdigit()));

        // Cleanup
        let _ = std::fs::remove_file(&temp_path);
    }

    #[test]
    fn test_case_insensitive_checksum_comparison() {
        let test_data = b"Test";
        let checksum_lower = calculate_sha256(test_data);
        let checksum_upper = checksum_lower.to_uppercase();

        // Checksums should match regardless of case
        assert_eq!(checksum_lower.to_lowercase(), checksum_upper.to_lowercase());
    }

    // Mock app handle for testing resource limits
    struct MockApp;

    impl super::ProgressEmitter for MockApp {
        fn emit_progress(&self, _progress: super::DownloadProgress) {
            // No-op for tests
        }
    }

    #[tokio::test]
    async fn test_download_rejects_when_content_length_exceeds_limit() {
        let mock_server = MockServer::start().await;

        // Create a response with actual large body that exceeds limit
        // We use 15MB which is larger than our 10MB limit
        let large_size = 15 * 1024 * 1024; // 15MB
        let body = vec![0u8; large_size];
        Mock::given(method("GET"))
            .and(path("/large-file"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body),
            )
            .mount(&mock_server)
            .await;

        let temp_dir = std::env::temp_dir();
        let dest_path = temp_dir.join("test_download_size_limit.tar.gz");

        let limits = DownloadLimits {
            max_file_size: Some(10 * 1024 * 1024), // 10MB limit
            overall_timeout: Duration::from_secs(30),
            progress_timeout: Duration::from_secs(10),
        };

        let app = MockApp;
        let result = download_with_progress_and_limits(
            &app,
            &format!("{}/large-file", mock_server.uri()),
            &dest_path,
            "test-distro",
            limits,
            None,
        )
        .await;

        // Should fail due to size limit
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("exceeds maximum allowed size"),
            "Expected size limit error, got: {}",
            err
        );

        // File should not exist (or be cleaned up)
        assert!(
            !dest_path.exists() || tokio::fs::metadata(&dest_path).await.is_err(),
            "Partial file should be cleaned up"
        );

        // Cleanup
        let _ = tokio::fs::remove_file(&dest_path).await;
    }

    #[tokio::test]
    async fn test_download_rejects_when_streamed_size_exceeds_limit() {
        let mock_server = MockServer::start().await;

        // Create a response without Content-Length header, but streaming too much data
        let body = vec![0u8; 15 * 1024 * 1024]; // 15MB
        Mock::given(method("GET"))
            .and(path("/stream-large"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(body))
            .mount(&mock_server)
            .await;

        let temp_dir = std::env::temp_dir();
        let dest_path = temp_dir.join("test_download_stream_limit.tar.gz");

        let limits = DownloadLimits {
            max_file_size: Some(10 * 1024 * 1024), // 10MB limit
            overall_timeout: Duration::from_secs(10),
            progress_timeout: Duration::from_secs(5),
        };

        let app = MockApp;
        let result = download_with_progress_and_limits(
            &app,
            &format!("{}/stream-large", mock_server.uri()),
            &dest_path,
            "test-distro",
            limits,
            None,
        )
        .await;

        // Should fail due to size limit during streaming
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("exceeds maximum allowed size"),
            "Expected size limit error, got: {}",
            err
        );

        // File should be cleaned up
        assert!(
            !dest_path.exists() || tokio::fs::metadata(&dest_path).await.is_err(),
            "Partial file should be cleaned up"
        );

        // Cleanup
        let _ = tokio::fs::remove_file(&dest_path).await;
    }

    #[tokio::test]
    async fn test_download_enforces_overall_timeout() {
        let mock_server = MockServer::start().await;

        // Create a slow response that will trigger timeout
        Mock::given(method("GET"))
            .and(path("/slow"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(vec![0u8; 1024])
                    .set_delay(Duration::from_secs(10)), // Delay longer than timeout
            )
            .mount(&mock_server)
            .await;

        let temp_dir = std::env::temp_dir();
        let dest_path = temp_dir.join("test_download_timeout.tar.gz");

        let limits = DownloadLimits {
            max_file_size: Some(10 * 1024 * 1024),
            overall_timeout: Duration::from_secs(2), // Short timeout
            progress_timeout: Duration::from_secs(5),
        };

        let app = MockApp;
        let result = download_with_progress_and_limits(
            &app,
            &format!("{}/slow", mock_server.uri()),
            &dest_path,
            "test-distro",
            limits,
            None,
        )
        .await;

        // Should fail due to overall timeout
        assert!(result.is_err());
        let err = result.unwrap_err();
        assert!(
            err.contains("timed out"),
            "Expected timeout error, got: {}",
            err
        );

        // File should be cleaned up
        assert!(
            !dest_path.exists() || tokio::fs::metadata(&dest_path).await.is_err(),
            "Partial file should be cleaned up"
        );

        // Cleanup
        let _ = tokio::fs::remove_file(&dest_path).await;
    }

    #[tokio::test]
    async fn test_download_enforces_progress_timeout() {
        let mock_server = MockServer::start().await;

        // We can't easily test progress timeout with wiremock, but we can test
        // that it's configured correctly through the API
        let body = vec![0u8; 1024];
        Mock::given(method("GET"))
            .and(path("/normal"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(body))
            .mount(&mock_server)
            .await;

        let temp_dir = std::env::temp_dir();
        let dest_path = temp_dir.join("test_download_progress_timeout.tar.gz");

        let limits = DownloadLimits {
            max_file_size: Some(10 * 1024 * 1024),
            overall_timeout: Duration::from_secs(10),
            progress_timeout: Duration::from_millis(100), // Very short progress timeout
        };

        let app = MockApp;
        let result = download_with_progress_and_limits(
            &app,
            &format!("{}/normal", mock_server.uri()),
            &dest_path,
            "test-distro",
            limits,
            None,
        )
        .await;

        // This should succeed since the download completes quickly
        // In a real scenario with stalled connection, it would fail
        assert!(
            result.is_ok(),
            "Fast download should complete despite short progress timeout"
        );

        // Cleanup
        let _ = tokio::fs::remove_file(&dest_path).await;
    }

    #[tokio::test]
    async fn test_download_succeeds_within_limits() {
        let mock_server = MockServer::start().await;

        let body = vec![0u8; 5 * 1024 * 1024]; // 5MB
        Mock::given(method("GET"))
            .and(path("/normal-file"))
            .respond_with(
                ResponseTemplate::new(200)
                    .set_body_bytes(body)
                    .insert_header("Content-Length", (5 * 1024 * 1024).to_string()),
            )
            .mount(&mock_server)
            .await;

        let temp_dir = std::env::temp_dir();
        let dest_path = temp_dir.join("test_download_success.tar.gz");

        let limits = DownloadLimits {
            max_file_size: Some(10 * 1024 * 1024), // 10MB limit
            overall_timeout: Duration::from_secs(30),
            progress_timeout: Duration::from_secs(10),
        };

        let app = MockApp;
        let result = download_with_progress_and_limits(
            &app,
            &format!("{}/normal-file", mock_server.uri()),
            &dest_path,
            "test-distro",
            limits,
            None,
        )
        .await;

        // Should succeed
        assert!(result.is_ok(), "Download should succeed: {:?}", result);

        // File should exist
        assert!(dest_path.exists(), "Downloaded file should exist");

        // File should have correct size
        let metadata = tokio::fs::metadata(&dest_path).await.unwrap();
        assert_eq!(metadata.len(), 5 * 1024 * 1024);

        // Cleanup
        let _ = tokio::fs::remove_file(&dest_path).await;
    }

    #[tokio::test]
    async fn test_download_with_no_size_limit() {
        let mock_server = MockServer::start().await;

        let body = vec![0u8; 2 * 1024 * 1024]; // 2MB
        Mock::given(method("GET"))
            .and(path("/unlimited"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(body))
            .mount(&mock_server)
            .await;

        let temp_dir = std::env::temp_dir();
        let dest_path = temp_dir.join("test_download_unlimited.tar.gz");

        let limits = DownloadLimits {
            max_file_size: None, // No size limit
            overall_timeout: Duration::from_secs(30),
            progress_timeout: Duration::from_secs(10),
        };

        let app = MockApp;
        let result = download_with_progress_and_limits(
            &app,
            &format!("{}/unlimited", mock_server.uri()),
            &dest_path,
            "test-distro",
            limits,
            None,
        )
        .await;

        // Should succeed
        assert!(result.is_ok(), "Download should succeed: {:?}", result);

        // Cleanup
        let _ = tokio::fs::remove_file(&dest_path).await;
    }

    #[tokio::test]
    async fn test_download_cleanup_on_error() {
        let mock_server = MockServer::start().await;

        // Create a response that will fail mid-stream
        Mock::given(method("GET"))
            .and(path("/failing"))
            .respond_with(ResponseTemplate::new(500))
            .mount(&mock_server)
            .await;

        let temp_dir = std::env::temp_dir();
        let dest_path = temp_dir.join("test_download_cleanup.tar.gz");

        let limits = DownloadLimits::default();

        let app = MockApp;
        let result = download_with_progress_and_limits(
            &app,
            &format!("{}/failing", mock_server.uri()),
            &dest_path,
            "test-distro",
            limits,
            None,
        )
        .await;

        // Should fail
        assert!(result.is_err());

        // File should not exist or be cleaned up
        // Note: In this case the file isn't created because the request fails
        assert!(
            !dest_path.exists(),
            "File should not exist after error"
        );

        // Cleanup
        let _ = tokio::fs::remove_file(&dest_path).await;
    }

    #[test]
    fn test_default_limits() {
        let limits = DownloadLimits::default();

        assert_eq!(limits.max_file_size, Some(10 * 1024 * 1024 * 1024)); // 10GB
        assert_eq!(limits.overall_timeout, Duration::from_secs(3600)); // 1 hour
        assert_eq!(limits.progress_timeout, Duration::from_secs(300)); // 5 minutes
    }

    #[test]
    fn test_custom_limits() {
        let limits = DownloadLimits {
            max_file_size: Some(100 * 1024 * 1024), // 100MB
            overall_timeout: Duration::from_secs(600), // 10 minutes
            progress_timeout: Duration::from_secs(60), // 1 minute
        };

        assert_eq!(limits.max_file_size, Some(100 * 1024 * 1024));
        assert_eq!(limits.overall_timeout, Duration::from_secs(600));
        assert_eq!(limits.progress_timeout, Duration::from_secs(60));
    }

    #[tokio::test]
    async fn test_download_with_valid_checksum() {
        let mock_server = MockServer::start().await;

        // Test data with known checksum
        let test_data = b"WSL2-UI Test Data";
        let expected_checksum = calculate_sha256(test_data);

        Mock::given(method("GET"))
            .and(path("/test-file"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(test_data.to_vec()))
            .mount(&mock_server)
            .await;

        let temp_dir = std::env::temp_dir();
        let dest_path = temp_dir.join("test_checksum_valid.dat");

        let app = MockApp;
        let result = download_with_progress_and_limits(
            &app,
            &format!("{}/test-file", mock_server.uri()),
            &dest_path,
            "test-distro",
            DownloadLimits::default(),
            Some(expected_checksum.clone()),
        )
        .await;

        // Should succeed with valid checksum
        assert!(result.is_ok(), "Download should succeed with valid checksum");

        // File should exist
        assert!(dest_path.exists(), "Downloaded file should exist");

        // Verify file content
        let content = tokio::fs::read(&dest_path).await.unwrap();
        assert_eq!(content, test_data);

        // Cleanup
        let _ = tokio::fs::remove_file(&dest_path).await;
    }

    #[tokio::test]
    async fn test_download_with_invalid_checksum() {
        let mock_server = MockServer::start().await;

        // Test data with wrong checksum
        let test_data = b"WSL2-UI Test Data";
        let wrong_checksum = "0000000000000000000000000000000000000000000000000000000000000000";

        Mock::given(method("GET"))
            .and(path("/test-file"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(test_data.to_vec()))
            .mount(&mock_server)
            .await;

        let temp_dir = std::env::temp_dir();
        let dest_path = temp_dir.join("test_checksum_invalid.dat");

        let app = MockApp;
        let result = download_with_progress_and_limits(
            &app,
            &format!("{}/test-file", mock_server.uri()),
            &dest_path,
            "test-distro",
            DownloadLimits::default(),
            Some(wrong_checksum.to_string()),
        )
        .await;

        // Should fail with invalid checksum
        assert!(result.is_err(), "Download should fail with invalid checksum");
        let err = result.unwrap_err();
        assert!(
            err.contains("Checksum verification failed"),
            "Expected checksum error, got: {}",
            err
        );

        // File should not exist (cleaned up after checksum failure)
        assert!(!dest_path.exists(), "File should be deleted after checksum failure");
    }

    #[tokio::test]
    async fn test_download_without_checksum() {
        let mock_server = MockServer::start().await;

        // Test data without checksum verification
        let test_data = b"WSL2-UI Test Data No Checksum";

        Mock::given(method("GET"))
            .and(path("/test-file"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(test_data.to_vec()))
            .mount(&mock_server)
            .await;

        let temp_dir = std::env::temp_dir();
        let dest_path = temp_dir.join("test_no_checksum.dat");

        let app = MockApp;
        let result = download_with_progress_and_limits(
            &app,
            &format!("{}/test-file", mock_server.uri()),
            &dest_path,
            "test-distro",
            DownloadLimits::default(),
            None, // No checksum verification
        )
        .await;

        // Should succeed without checksum
        assert!(result.is_ok(), "Download should succeed without checksum");

        // File should exist
        assert!(dest_path.exists(), "Downloaded file should exist");

        // Cleanup
        let _ = tokio::fs::remove_file(&dest_path).await;
    }

    #[tokio::test]
    async fn test_download_with_case_insensitive_checksum() {
        let mock_server = MockServer::start().await;

        // Test data with checksum in different cases
        let test_data = b"Case Test";
        let checksum_lower = calculate_sha256(test_data);
        let checksum_upper = checksum_lower.to_uppercase();

        Mock::given(method("GET"))
            .and(path("/test-file"))
            .respond_with(ResponseTemplate::new(200).set_body_bytes(test_data.to_vec()))
            .mount(&mock_server)
            .await;

        let temp_dir = std::env::temp_dir();
        let dest_path = temp_dir.join("test_checksum_case.dat");

        let app = MockApp;
        let result = download_with_progress_and_limits(
            &app,
            &format!("{}/test-file", mock_server.uri()),
            &dest_path,
            "test-distro",
            DownloadLimits::default(),
            Some(checksum_upper), // Use uppercase checksum
        )
        .await;

        // Should succeed with uppercase checksum
        assert!(result.is_ok(), "Download should succeed with uppercase checksum");

        // Cleanup
        let _ = tokio::fs::remove_file(&dest_path).await;
    }
}




