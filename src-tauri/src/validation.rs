//! Input validation module for WSL2 Manager
//!
//! Provides validation functions for user inputs to prevent command injection,
//! invalid paths, and malformed configuration values.

use thiserror::Error;

/// Validation error types
#[derive(Debug, Error, PartialEq)]
pub enum ValidationError {
    #[error("Invalid distribution name: {0}")]
    InvalidDistroName(String),

    #[error("Invalid path: {0}")]
    InvalidPath(String),

    #[error("Value out of range: {field} must be between {min} and {max}")]
    OutOfRange { field: String, min: i64, max: i64 },

    #[error("Required field missing: {0}")]
    RequiredFieldMissing(String),

    #[error("Invalid action ID: {0}")]
    InvalidActionId(String),
}

/// Validate WSL distribution name
///
/// Rules:
/// - Not empty
/// - Max 64 characters
/// - Alphanumeric, hyphens, underscores, periods only
/// - Cannot start with hyphen (looks like command argument)
pub fn validate_distro_name(name: &str) -> Result<(), ValidationError> {
    if name.is_empty() {
        return Err(ValidationError::RequiredFieldMissing(
            "distribution name".into(),
        ));
    }

    if name.len() > 64 {
        return Err(ValidationError::InvalidDistroName(
            "name must be 64 characters or less".into(),
        ));
    }

    if !name
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_' || c == '.')
    {
        return Err(ValidationError::InvalidDistroName(
            "name can only contain letters, numbers, hyphens, underscores, and periods".into(),
        ));
    }

    // Prevent names that look like command arguments
    if name.starts_with('-') {
        return Err(ValidationError::InvalidDistroName(
            "name cannot start with a hyphen".into(),
        ));
    }

    Ok(())
}

/// Validate file path for use in WSL
///
/// Prevents path traversal and null byte injection with comprehensive checks:
/// - URL-encoded path traversal attempts
/// - Unicode variations of dots
/// - Backslash path separators
/// - Windows device names
/// - Trailing dots/spaces (Windows special handling)
/// - NTFS alternate data streams
pub fn validate_file_path(path: &str) -> Result<(), ValidationError> {
    if path.is_empty() {
        return Err(ValidationError::InvalidPath("path cannot be empty".into()));
    }

    // Decode URL-encoded characters to detect obfuscated path traversal
    let decoded_path = decode_url_encoded(path);

    // Check for path traversal attempts in both original and decoded paths
    if decoded_path.contains("..") {
        return Err(ValidationError::InvalidPath(
            "path cannot contain '..' (path traversal)".into(),
        ));
    }

    // Check for backslash path separators
    // Note: We normalize backslashes to forward slashes for Windows paths
    // but still check for traversal in the normalized path
    let normalized_path = decoded_path.replace('\\', "/");

    // Check for path traversal in normalized path as well
    if normalized_path.contains("..") {
        return Err(ValidationError::InvalidPath(
            "path cannot contain '..' (path traversal)".into(),
        ));
    }

    // Check for null bytes (can terminate strings in C)
    if path.contains('\0') {
        return Err(ValidationError::InvalidPath(
            "path cannot contain null bytes".into(),
        ));
    }

    // Check for control characters
    if path.chars().any(|c| c.is_control() && c != '\t') {
        return Err(ValidationError::InvalidPath(
            "path cannot contain control characters".into(),
        ));
    }

    // Check for Unicode variations of dots that could be used for traversal
    if contains_unicode_dots(path) {
        return Err(ValidationError::InvalidPath(
            "path cannot contain Unicode dot variations".into(),
        ));
    }

    // Check for Windows reserved device names (case-insensitive)
    if contains_windows_device_name(&normalized_path) {
        return Err(ValidationError::InvalidPath(
            "path cannot contain Windows device names".into(),
        ));
    }

    // Check for trailing dots or spaces (Windows treats these specially)
    if has_trailing_dots_or_spaces(&normalized_path) {
        return Err(ValidationError::InvalidPath(
            "path components cannot end with dots or spaces".into(),
        ));
    }

    // Check for NTFS alternate data streams
    if normalized_path.contains(':') && !is_valid_colon_usage(&normalized_path) {
        return Err(ValidationError::InvalidPath(
            "path cannot contain alternate data streams".into(),
        ));
    }

    Ok(())
}

/// Decode URL-encoded characters in a path
/// Handles both single (%2e) and double (%252e) encoding
fn decode_url_encoded(path: &str) -> String {
    let mut result = path.to_string();

    // Decode up to 2 levels of URL encoding
    for _ in 0..2 {
        let prev = result.clone();
        result = decode_single_level(&result);
        // Stop if no more changes (prevents infinite loops)
        if result == prev {
            break;
        }
    }

    result
}

/// Decode a single level of URL encoding
fn decode_single_level(input: &str) -> String {
    let mut result = String::new();
    let mut chars = input.chars().peekable();

    while let Some(ch) = chars.next() {
        if ch == '%' {
            // Try to read two hex digits
            let hex1 = chars.next();
            let hex2 = chars.next();

            if let (Some(h1), Some(h2)) = (hex1, hex2) {
                if let Ok(byte) = u8::from_str_radix(&format!("{}{}", h1, h2), 16) {
                    // Successfully decoded a byte
                    result.push(byte as char);
                    continue;
                }
                // If decoding failed, push the characters as-is
                result.push('%');
                result.push(h1);
                result.push(h2);
            } else {
                // Incomplete encoding, push as-is
                result.push('%');
                if let Some(h1) = hex1 {
                    result.push(h1);
                }
            }
        } else {
            result.push(ch);
        }
    }

    result
}

/// Check if path contains Unicode characters that look like dots
fn contains_unicode_dots(path: &str) -> bool {
    path.chars().any(|c| matches!(c,
        '\u{FF0E}' |  // Fullwidth full stop
        '\u{2024}' |  // One dot leader
        '\u{FE56}' |  // Small full stop
        '\u{FE52}' |  // Small full stop
        '\u{FF61}'    // Halfwidth ideographic full stop
    ))
}

/// Check if path contains Windows reserved device names
fn contains_windows_device_name(path: &str) -> bool {
    let devices = [
        "CON", "PRN", "AUX", "NUL",
        "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8", "COM9",
        "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
    ];

    // Split path into components and check each
    let path_upper = path.to_uppercase();
    for component in path_upper.split(&['/', '\\'][..]) {
        let component = component.trim();

        // Check if component is exactly a device name or starts with device name followed by extension
        for device in &devices {
            if component == *device || component.starts_with(&format!("{}.", device)) {
                return true;
            }
        }
    }

    false
}

/// Check if any path component ends with dots or spaces
fn has_trailing_dots_or_spaces(path: &str) -> bool {
    for component in path.split(&['/', '\\'][..]) {
        if component.is_empty() {
            continue;
        }

        let trimmed = component.trim_end_matches(&['.', ' '][..]);
        if trimmed.len() != component.len() && !component.is_empty() {
            // Component had trailing dots or spaces
            return true;
        }
    }

    false
}

/// Check if colon usage is valid (only for Windows drive letters)
fn is_valid_colon_usage(path: &str) -> bool {
    // Allow colons only in Windows drive letter format (e.g., C:, D:)
    // at the beginning of the path
    if path.len() >= 2 && path.chars().nth(1) == Some(':') {
        if let Some(first_char) = path.chars().next() {
            if first_char.is_ascii_alphabetic() {
                // Check if there are any other colons
                return !path[2..].contains(':');
            }
        }
    }

    // No colons is also valid
    !path.contains(':')
}

/// Validate WSL version (1 or 2)
pub fn validate_wsl_version(version: u8) -> Result<(), ValidationError> {
    if version != 1 && version != 2 {
        return Err(ValidationError::OutOfRange {
            field: "WSL version".into(),
            min: 1,
            max: 2,
        });
    }
    Ok(())
}

/// Validate action ID format
///
/// Action IDs should be safe identifiers: alphanumeric, hyphens, underscores
pub fn validate_action_id(id: &str) -> Result<(), ValidationError> {
    if id.is_empty() {
        return Err(ValidationError::RequiredFieldMissing("action ID".into()));
    }

    if id.len() > 64 {
        return Err(ValidationError::InvalidActionId(
            "ID must be 64 characters or less".into(),
        ));
    }

    if !id
        .chars()
        .all(|c| c.is_alphanumeric() || c == '-' || c == '_')
    {
        return Err(ValidationError::InvalidActionId(
            "ID can only contain letters, numbers, hyphens, and underscores".into(),
        ));
    }

    Ok(())
}

/// Validate a URL for rootfs downloads
pub fn validate_url(url: &str) -> Result<(), ValidationError> {
    if url.is_empty() {
        return Err(ValidationError::RequiredFieldMissing("URL".into()));
    }

    // Must start with https:// or http://
    if !url.starts_with("https://") && !url.starts_with("http://") {
        return Err(ValidationError::InvalidPath(
            "URL must start with http:// or https://".into(),
        ));
    }

    // Check for control characters
    if url.chars().any(|c| c.is_control()) {
        return Err(ValidationError::InvalidPath(
            "URL cannot contain control characters".into(),
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    // ==================== Distribution Name Tests ====================

    #[test]
    fn test_valid_distro_names() {
        assert!(validate_distro_name("Ubuntu").is_ok());
        assert!(validate_distro_name("Ubuntu-22.04").is_ok());
        assert!(validate_distro_name("my_distro").is_ok());
        assert!(validate_distro_name("Debian").is_ok());
        assert!(validate_distro_name("Alpine3.18").is_ok());
        assert!(validate_distro_name("test.distro.name").is_ok());
        assert!(validate_distro_name("a").is_ok());
    }

    #[test]
    fn test_empty_distro_name() {
        let result = validate_distro_name("");
        assert!(matches!(
            result,
            Err(ValidationError::RequiredFieldMissing(_))
        ));
    }

    #[test]
    fn test_distro_name_too_long() {
        let long_name = "a".repeat(65);
        let result = validate_distro_name(&long_name);
        assert!(matches!(result, Err(ValidationError::InvalidDistroName(_))));

        let valid_name = "a".repeat(64);
        assert!(validate_distro_name(&valid_name).is_ok());
    }

    #[test]
    fn test_distro_name_starts_with_hyphen() {
        let result = validate_distro_name("-invalid");
        assert!(matches!(result, Err(ValidationError::InvalidDistroName(_))));
    }

    #[test]
    fn test_distro_name_with_spaces() {
        let result = validate_distro_name("name with spaces");
        assert!(matches!(result, Err(ValidationError::InvalidDistroName(_))));
    }

    #[test]
    fn test_distro_name_with_special_chars() {
        assert!(validate_distro_name("name;rm").is_err());
        assert!(validate_distro_name("name$(cmd)").is_err());
        assert!(validate_distro_name("name`cmd`").is_err());
        assert!(validate_distro_name("name|pipe").is_err());
        assert!(validate_distro_name("name&bg").is_err());
        assert!(validate_distro_name("name>file").is_err());
        assert!(validate_distro_name("name<file").is_err());
    }

    // ==================== File Path Tests ====================

    #[test]
    fn test_valid_file_paths() {
        assert!(validate_file_path("/home/user").is_ok());
        assert!(validate_file_path("/home/user/documents").is_ok());
        assert!(validate_file_path("~").is_ok());
        assert!(validate_file_path("/").is_ok());
        assert!(validate_file_path("/mnt/c/Users").is_ok());
        assert!(validate_file_path("relative/path").is_ok());
        // Windows absolute paths with drive letters (forward slash)
        assert!(validate_file_path("C:/Users").is_ok());
        assert!(validate_file_path("D:/Documents").is_ok());
        // Windows absolute paths with backslashes
        assert!(validate_file_path("C:\\Users").is_ok());
        assert!(validate_file_path("D:\\Documents\\Projects").is_ok());
    }

    #[test]
    fn test_empty_file_path() {
        let result = validate_file_path("");
        assert!(matches!(result, Err(ValidationError::InvalidPath(_))));
    }

    #[test]
    fn test_path_traversal() {
        assert!(validate_file_path("/home/user/../../../etc/passwd").is_err());
        assert!(validate_file_path("..").is_err());
        assert!(validate_file_path("../secret").is_err());
        assert!(validate_file_path("/home/..").is_err());
    }

    #[test]
    fn test_path_with_null_byte() {
        assert!(validate_file_path("/home/user\0/file").is_err());
    }

    #[test]
    fn test_path_with_control_chars() {
        assert!(validate_file_path("/home/user\x07/file").is_err());
        assert!(validate_file_path("/home/user\x1b[31m").is_err());
    }

    // ==================== Path Traversal Attack Tests ====================

    #[test]
    fn test_url_encoded_path_traversal() {
        // URL-encoded ".."
        assert!(validate_file_path("/home/%2e%2e/etc/passwd").is_err());
        assert!(validate_file_path("/home/%2E%2E/etc/passwd").is_err());

        // Mixed encoding
        assert!(validate_file_path("/home/%2e./etc/passwd").is_err());
        assert!(validate_file_path("/home/.%2e/etc/passwd").is_err());

        // Double URL encoding
        assert!(validate_file_path("/home/%252e%252e/etc/passwd").is_err());

        // URL-encoded forward slash with ..
        assert!(validate_file_path("/home/..%2fetc%2fpasswd").is_err());
        assert!(validate_file_path("/home%2f..%2fetc%2fpasswd").is_err());
    }

    #[test]
    fn test_backslash_path_traversal() {
        // Windows-style paths attempting traversal should be blocked
        assert!(validate_file_path("..\\..\\windows\\system32").is_err());
        assert!(validate_file_path("/home/..\\etc\\passwd").is_err());
        assert!(validate_file_path("C:\\..\\..\\etc\\passwd").is_err());

        // But legitimate Windows paths should work
        assert!(validate_file_path("C:\\Users\\Documents").is_ok());
        assert!(validate_file_path("D:\\Projects\\myapp").is_ok());
    }

    #[test]
    fn test_dot_slash_patterns() {
        // Various ./ and ../ patterns
        assert!(validate_file_path("./../../etc/passwd").is_err());
        assert!(validate_file_path("/home/./../../etc/passwd").is_err());
        assert!(validate_file_path("/home/user/./../secret").is_err());
    }

    #[test]
    fn test_unicode_path_traversal() {
        // Unicode variations of dots
        assert!(validate_file_path("/home/\u{FF0E}\u{FF0E}/etc/passwd").is_err()); // fullwidth period
        assert!(validate_file_path("/home/\u{2024}\u{2024}/etc/passwd").is_err()); // one dot leader

        // Overlong UTF-8 encoding attempts
        assert!(validate_file_path("/home/\u{FE56}\u{FE56}/etc/passwd").is_err()); // small full stop
    }

    #[test]
    fn test_absolute_path_escape() {
        // These should be allowed by simple string checks but could escape to system paths
        // We'll handle these with canonicalization
        assert!(validate_file_path("/etc/passwd").is_ok()); // This is a valid absolute path
        assert!(validate_file_path("/etc/shadow").is_ok()); // This is a valid absolute path
    }

    #[test]
    fn test_mixed_encoding_attacks() {
        // Combining different encoding techniques
        assert!(validate_file_path("/home/%2e%2e%5c..%2fetc").is_err());
        assert!(validate_file_path("/home/\u{FF0E}./etc/passwd").is_err());
    }

    #[test]
    fn test_legitimate_dotfiles() {
        // Legitimate paths with dots that should be allowed
        assert!(validate_file_path("/home/user/.bashrc").is_ok());
        assert!(validate_file_path("/home/user/.config/app.conf").is_ok());
        assert!(validate_file_path(".hidden").is_ok());
        assert!(validate_file_path("/path/file.txt").is_ok());
        assert!(validate_file_path("/path/archive.tar.gz").is_ok());
    }

    #[test]
    fn test_path_with_spaces_and_encoded_traversal() {
        assert!(validate_file_path("/home/my documents/%2e%2e/etc").is_err());
        assert!(validate_file_path("/home/my%20documents/../etc").is_err());
    }

    #[test]
    fn test_legitimate_url_encoded_paths() {
        // Paths with URL-encoded spaces should work if they don't contain traversal
        assert!(validate_file_path("/home/my%20documents/file.txt").is_ok());
        assert!(validate_file_path("/path/with%20spaces/file").is_ok());
    }

    #[test]
    fn test_windows_device_paths() {
        // Windows special device paths
        assert!(validate_file_path("CON").is_err());
        assert!(validate_file_path("PRN").is_err());
        assert!(validate_file_path("AUX").is_err());
        assert!(validate_file_path("NUL").is_err());
        assert!(validate_file_path("COM1").is_err());
        assert!(validate_file_path("LPT1").is_err());
        assert!(validate_file_path("/path/CON/file").is_err());
        assert!(validate_file_path("/path/con").is_err()); // case insensitive
    }

    #[test]
    fn test_trailing_dots_and_spaces() {
        // Windows treats trailing dots/spaces specially
        assert!(validate_file_path("/home/user. .").is_err());
        assert!(validate_file_path("/home/user..").is_err());
        assert!(validate_file_path("/home/user... ").is_err());
    }

    #[test]
    fn test_alternate_data_streams() {
        // NTFS alternate data streams
        assert!(validate_file_path("/path/file.txt:hidden").is_err());
        assert!(validate_file_path("/path/file::$DATA").is_err());
    }

    // ==================== Helper Function Tests ====================

    #[test]
    fn test_url_decoding() {
        assert_eq!(decode_url_encoded("/home/%2e%2e/etc"), "/home/../etc");
        assert_eq!(decode_url_encoded("/home/%2E%2E/etc"), "/home/../etc");
        assert_eq!(decode_url_encoded("/home/%252e%252e/etc"), "/home/../etc");
        assert_eq!(decode_url_encoded("/path/%2f"), "/path//");
        assert_eq!(decode_url_encoded("/normal/path"), "/normal/path");
    }

    #[test]
    fn test_unicode_dots_detection() {
        assert!(contains_unicode_dots("/home/\u{FF0E}\u{FF0E}/etc"));
        assert!(contains_unicode_dots("/home/\u{2024}\u{2024}/etc"));
        assert!(contains_unicode_dots("/home/\u{FE56}/etc"));
        assert!(!contains_unicode_dots("/home/../etc"));
        assert!(!contains_unicode_dots("/normal/path"));
    }

    #[test]
    fn test_windows_device_detection() {
        assert!(contains_windows_device_name("CON"));
        assert!(contains_windows_device_name("con"));
        assert!(contains_windows_device_name("/path/CON"));
        assert!(contains_windows_device_name("/path/con/file"));
        assert!(contains_windows_device_name("PRN"));
        assert!(contains_windows_device_name("AUX"));
        assert!(contains_windows_device_name("NUL"));
        assert!(contains_windows_device_name("COM1"));
        assert!(contains_windows_device_name("LPT1"));
        assert!(!contains_windows_device_name("/normal/path"));
        assert!(!contains_windows_device_name("console")); // Should not match partial
    }

    #[test]
    fn test_trailing_dots_spaces_detection() {
        assert!(has_trailing_dots_or_spaces("/home/user.."));
        assert!(has_trailing_dots_or_spaces("/home/user "));
        assert!(has_trailing_dots_or_spaces("/home/user. ."));
        assert!(has_trailing_dots_or_spaces("/home/user... "));
        assert!(!has_trailing_dots_or_spaces("/home/user"));
        assert!(!has_trailing_dots_or_spaces("/home/user.txt"));
        assert!(!has_trailing_dots_or_spaces("/.bashrc"));
    }

    #[test]
    fn test_valid_colon_usage_check() {
        assert!(is_valid_colon_usage("C:/Users"));
        assert!(is_valid_colon_usage("D:/Documents"));
        assert!(is_valid_colon_usage("/normal/path"));
        assert!(!is_valid_colon_usage("/path/file:stream"));
        assert!(!is_valid_colon_usage("/path:bad"));
        assert!(!is_valid_colon_usage("C:/path:stream"));
    }

    // ==================== Integration Tests ====================

    #[test]
    fn test_comprehensive_attack_defense() {
        // Comprehensive test of various attack vectors
        let attacks = vec![
            // URL encoding attacks
            "/home/%2e%2e/etc/passwd",
            "/home/%2E%2E/etc/passwd",
            "/home/%252e%252e/etc/passwd",
            "/home/%2e./etc/passwd",
            "/home/.%2e/etc/passwd",
            // Unicode attacks
            "/home/\u{FF0E}\u{FF0E}/etc/passwd",
            "/home/\u{2024}\u{2024}/etc/passwd",
            // Backslash traversal
            "..\\..\\windows\\system32",
            "/home/..\\etc\\passwd",
            "C:\\..\\..\\etc\\passwd",
            // Mixed attacks
            "/home/%2e%2e%5c..%2fetc",
            "/home/\u{FF0E}./etc/passwd",
            // Windows devices
            "CON", "PRN", "AUX", "NUL",
            "/path/CON/file",
            "/path/con",
            // Trailing dots/spaces
            "/home/user..",
            "/home/user ",
            "/home/user. .",
            // NTFS ADS
            "/path/file.txt:hidden",
            "/path/file::$DATA",
            // Literal traversal
            "/home/../../../etc/passwd",
            "..",
            "../secret",
        ];

        for attack in attacks {
            assert!(
                validate_file_path(attack).is_err(),
                "Attack vector not blocked: {}",
                attack
            );
        }
    }

    #[test]
    fn test_comprehensive_legitimate_paths() {
        // Comprehensive test of legitimate paths
        let valid_paths = vec![
            // Unix paths
            "/home/user",
            "/home/user/documents",
            "/",
            "~",
            "/mnt/c/Users",
            "relative/path",
            // Dotfiles
            "/home/user/.bashrc",
            "/home/user/.config/app.conf",
            ".hidden",
            // Multiple dots in filename
            "/path/file.txt",
            "/path/archive.tar.gz",
            // Windows paths (forward slash)
            "C:/Users",
            "D:/Documents",
            // Windows paths (backslash)
            "C:\\Users",
            "D:\\Documents\\Projects",
            "C:\\Users\\Documents",
            // URL-encoded spaces (no traversal)
            "/home/my%20documents/file.txt",
            "/path/with%20spaces/file",
        ];

        for path in valid_paths {
            assert!(
                validate_file_path(path).is_ok(),
                "Legitimate path rejected: {}",
                path
            );
        }
    }

    // ==================== WSL Version Tests ====================

    #[test]
    fn test_valid_wsl_versions() {
        assert!(validate_wsl_version(1).is_ok());
        assert!(validate_wsl_version(2).is_ok());
    }

    #[test]
    fn test_invalid_wsl_versions() {
        assert!(validate_wsl_version(0).is_err());
        assert!(validate_wsl_version(3).is_err());
        assert!(validate_wsl_version(255).is_err());
    }

    // ==================== Action ID Tests ====================

    #[test]
    fn test_valid_action_ids() {
        assert!(validate_action_id("update-system").is_ok());
        assert!(validate_action_id("disk_usage").is_ok());
        assert!(validate_action_id("action123").is_ok());
        assert!(validate_action_id("a").is_ok());
    }

    #[test]
    fn test_invalid_action_ids() {
        assert!(validate_action_id("").is_err());
        assert!(validate_action_id("action with spaces").is_err());
        assert!(validate_action_id("action.with.dots").is_err());
        assert!(validate_action_id(&"a".repeat(65)).is_err());
    }

    // ==================== URL Validation Tests ====================

    #[test]
    fn test_valid_urls() {
        assert!(validate_url("https://example.com/file.tar.gz").is_ok());
        assert!(validate_url("http://example.com/file.tar.gz").is_ok());
        assert!(validate_url("https://dl-cdn.alpinelinux.org/alpine/v3.20/releases/x86_64/alpine-minirootfs-3.20.3-x86_64.tar.gz").is_ok());
    }

    #[test]
    fn test_invalid_urls() {
        assert!(validate_url("").is_err());
        assert!(validate_url("ftp://example.com/file").is_err());
        assert!(validate_url("file:///etc/passwd").is_err());
        assert!(validate_url("/local/path").is_err());
        assert!(validate_url("example.com/file").is_err());
    }
}
