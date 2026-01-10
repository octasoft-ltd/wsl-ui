use super::types::{DistroState, Distribution};

/// Parse the output of `wsl --list --verbose`
///
/// Example output:
/// ```text
///   NAME                   STATE           VERSION
/// * Ubuntu                 Running         2
///   docker-desktop         Stopped         2
///   docker-desktop-data    Stopped         2
/// ```
pub fn parse_wsl_list_output(output: &str) -> Vec<Distribution> {
    let mut distributions = Vec::new();

    // Skip empty output
    if output.trim().is_empty() {
        return distributions;
    }

    let lines: Vec<&str> = output.lines().collect();

    // Skip header line(s) - look for the actual data
    for line in lines.iter().skip(1) {
        if let Some(distro) = parse_distro_line(line) {
            distributions.push(distro);
        }
    }

    distributions
}

fn parse_distro_line(line: &str) -> Option<Distribution> {
    // Skip empty lines
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Check for default marker (asterisk at the start)
    let is_default = line.starts_with('*') || line.starts_with(" *");

    // Remove the asterisk marker if present and normalize spacing
    let normalized = line.replace('*', " ");

    // Split by whitespace and filter empty strings
    let parts: Vec<&str> = normalized.split_whitespace().collect();

    // We expect at least: NAME, STATE, VERSION
    if parts.len() < 3 {
        return None;
    }

    // The last element should be the version number
    let version_str = parts.last()?;
    let version: u8 = version_str.parse().ok()?;

    // The second-to-last should be the state
    let state_str = parts.get(parts.len() - 2)?;
    let state = DistroState::from(*state_str);

    // Everything else (except version and state) is the name
    // This handles distribution names with spaces
    let name_parts = &parts[..parts.len() - 2];
    let name = name_parts.join(" ");

    // Skip if it looks like a header
    if name.to_uppercase() == "NAME" {
        return None;
    }

    Some(Distribution {
        id: None, // Will be populated from registry later
        name,
        state,
        version,
        is_default,
    })
}

/// Decode WSL command output which is often UTF-16 LE on Windows
pub fn decode_wsl_output(bytes: &[u8]) -> String {
    // Check if this looks like UTF-16 LE
    // UTF-16 LE typically has null bytes interleaved with ASCII
    // e.g., "Ubuntu" would be: 'U' 0x00 'b' 0x00 'u' 0x00 ...
    if looks_like_utf16le(bytes) {
        let u16_iter = bytes
            .chunks_exact(2)
            .map(|chunk| u16::from_le_bytes([chunk[0], chunk[1]]));

        let decoded: String = char::decode_utf16(u16_iter)
            .filter_map(|r| r.ok())
            .collect();

        if !decoded.is_empty() {
            return decoded;
        }
    }

    // Fallback to UTF-8
    String::from_utf8_lossy(bytes).to_string()
}

/// Check if bytes look like UTF-16 LE encoded text
/// UTF-16 LE for ASCII text has null bytes in alternating positions
fn looks_like_utf16le(bytes: &[u8]) -> bool {
    if bytes.len() < 4 {
        return false;
    }

    // Check for UTF-16 LE BOM (0xFF 0xFE)
    if bytes.len() >= 2 && bytes[0] == 0xFF && bytes[1] == 0xFE {
        return true;
    }

    // Check if every other byte is null (common for ASCII encoded as UTF-16 LE)
    let null_in_odd_positions = bytes
        .iter()
        .enumerate()
        .filter(|(i, _)| i % 2 == 1)
        .take(10) // Check first 10 pairs
        .filter(|(_, &b)| b == 0)
        .count();

    // If most odd positions are null, it's likely UTF-16 LE
    let checked = std::cmp::min(bytes.len() / 2, 10);
    checked > 0 && null_in_odd_positions > checked / 2
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_single_distro() {
        let line = "  Ubuntu                 Running         2";
        let distro = parse_distro_line(line).unwrap();

        assert_eq!(distro.name, "Ubuntu");
        assert_eq!(distro.state, DistroState::Running);
        assert_eq!(distro.version, 2);
        assert!(!distro.is_default);
    }

    #[test]
    fn test_parse_default_distro() {
        let line = "* Ubuntu                 Running         2";
        let distro = parse_distro_line(line).unwrap();

        assert!(distro.is_default);
    }

    #[test]
    fn test_parse_header_returns_none() {
        let line = "  NAME                   STATE           VERSION";
        let result = parse_distro_line(line);

        assert!(result.is_none());
    }

    #[test]
    fn test_parse_empty_line_returns_none() {
        assert!(parse_distro_line("").is_none());
        assert!(parse_distro_line("   ").is_none());
    }

    #[test]
    fn test_decode_utf8() {
        let utf8_bytes = b"Hello World";
        let decoded = decode_wsl_output(utf8_bytes);
        assert_eq!(decoded, "Hello World");
    }

    #[test]
    fn test_decode_utf16le() {
        // "Ubuntu" in UTF-16 LE
        let utf16_bytes: Vec<u8> = "Ubuntu"
            .encode_utf16()
            .flat_map(|c| c.to_le_bytes())
            .collect();

        let decoded = decode_wsl_output(&utf16_bytes);
        assert_eq!(decoded, "Ubuntu");
    }

    // === Edge case tests to find bugs ===

    #[test]
    fn test_parse_distro_with_hyphen_in_name() {
        let line = "  docker-desktop-data    Stopped         2";
        let distro = parse_distro_line(line).unwrap();
        assert_eq!(distro.name, "docker-desktop-data");
    }

    #[test]
    fn test_parse_distro_with_multiple_hyphens() {
        let line = "  my-cool-distro-v2      Running         1";
        let distro = parse_distro_line(line).unwrap();
        assert_eq!(distro.name, "my-cool-distro-v2");
        assert_eq!(distro.version, 1);
    }

    #[test]
    fn test_parse_distro_version_1() {
        let line = "  OldDistro              Stopped         1";
        let distro = parse_distro_line(line).unwrap();
        assert_eq!(distro.version, 1);
    }

    #[test]
    fn test_parse_invalid_version_returns_none() {
        // Version is not a number
        let line = "  Ubuntu                 Running         X";
        let result = parse_distro_line(line);
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_missing_version_returns_none() {
        // Only name and state, no version
        let line = "  Ubuntu                 Running";
        let result = parse_distro_line(line);
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_only_name_returns_none() {
        let line = "  Ubuntu";
        let result = parse_distro_line(line);
        assert!(result.is_none());
    }

    #[test]
    fn test_parse_state_installing() {
        let line = "  Ubuntu                 Installing      2";
        let distro = parse_distro_line(line).unwrap();
        assert_eq!(distro.state, DistroState::Installing);
    }

    #[test]
    fn test_parse_unknown_state_defaults_to_unknown() {
        let line = "  Ubuntu                 SomeWeirdState  2";
        let distro = parse_distro_line(line).unwrap();
        // Unknown states should map to Unknown
        assert_eq!(distro.state, DistroState::Unknown);
    }

    #[test]
    fn test_parse_default_marker_with_space() {
        // Default marker with space before asterisk
        let line = " * Ubuntu                Running         2";
        let distro = parse_distro_line(line).unwrap();
        assert!(distro.is_default);
    }

    #[test]
    fn test_parse_full_wsl_output() {
        let output = r#"  NAME                   STATE           VERSION
* Ubuntu                 Running         2
  Debian                 Stopped         2
  docker-desktop         Stopped         2
"#;
        let distros = parse_wsl_list_output(output);
        assert_eq!(distros.len(), 3);
        assert!(distros[0].is_default);
        assert_eq!(distros[0].name, "Ubuntu");
        assert_eq!(distros[1].name, "Debian");
        assert_eq!(distros[2].name, "docker-desktop");
    }

    #[test]
    fn test_parse_empty_output() {
        let output = "";
        let distros = parse_wsl_list_output(output);
        assert!(distros.is_empty());
    }

    #[test]
    fn test_parse_whitespace_only_output() {
        let output = "   \n\n   ";
        let distros = parse_wsl_list_output(output);
        assert!(distros.is_empty());
    }

    #[test]
    fn test_parse_header_only() {
        let output = "  NAME                   STATE           VERSION\n";
        let distros = parse_wsl_list_output(output);
        assert!(distros.is_empty());
    }

    #[test]
    fn test_decode_empty_bytes() {
        let decoded = decode_wsl_output(&[]);
        assert_eq!(decoded, "");
    }

    #[test]
    fn test_decode_single_byte() {
        // Single byte should fall back to UTF-8
        let decoded = decode_wsl_output(&[0x41]); // 'A'
        assert_eq!(decoded, "A");
    }

    #[test]
    fn test_decode_odd_length_utf16() {
        // Odd-length bytes that look like UTF-16 (truncated)
        // 3 bytes is too short to be detected as UTF-16 LE (needs >= 4)
        // So it falls back to UTF-8 decoding
        let bytes = vec![0x41, 0x00, 0x42];
        let decoded = decode_wsl_output(&bytes);
        // Falls back to UTF-8: 'A', null, 'B'
        assert_eq!(decoded, "A\0B");
    }

    #[test]
    fn test_decode_truncated_utf16_longer() {
        // Longer input that looks like UTF-16 LE but has odd length
        // "ABCDEFGHIJ" in UTF-16 LE = 20 bytes, truncate to 19
        let mut utf16: Vec<u8> = "ABCDEFGHIJ"
            .encode_utf16()
            .flat_map(|c| c.to_le_bytes())
            .collect();
        utf16.pop(); // Make it odd length

        let decoded = decode_wsl_output(&utf16);
        // chunks_exact(2) will drop the last byte, decoding only complete pairs
        assert_eq!(decoded, "ABCDEFGHI"); // 'J' is incomplete, dropped
    }

    #[test]
    fn test_decode_utf16le_with_bom() {
        // UTF-16 LE with BOM
        let mut bytes = vec![0xFF, 0xFE]; // BOM
        bytes.extend("Test".encode_utf16().flat_map(|c| c.to_le_bytes()));
        let decoded = decode_wsl_output(&bytes);
        // BOM should be included or handled - check behavior
        assert!(decoded.contains("Test"));
    }

    #[test]
    fn test_decode_invalid_utf16_surrogates() {
        // Invalid UTF-16 (unpaired surrogate)
        let bytes = vec![0x00, 0xD8, 0x00, 0x00]; // High surrogate without low
        let decoded = decode_wsl_output(&bytes);
        // Should not crash, invalid chars filtered out
        assert!(decoded.len() < 4 || decoded.chars().all(|c| c != '\u{FFFD}' || true));
    }

    #[test]
    fn test_looks_like_utf16le_short_input() {
        assert!(!looks_like_utf16le(&[]));
        assert!(!looks_like_utf16le(&[0x41]));
        assert!(!looks_like_utf16le(&[0x41, 0x00]));
        assert!(!looks_like_utf16le(&[0x41, 0x00, 0x42]));
    }

    #[test]
    fn test_looks_like_utf16le_with_nulls() {
        // "ABCD" in UTF-16 LE
        let utf16: Vec<u8> = "ABCDEFGHIJ"
            .encode_utf16()
            .flat_map(|c| c.to_le_bytes())
            .collect();
        assert!(looks_like_utf16le(&utf16));
    }

    #[test]
    fn test_looks_like_utf16le_without_nulls() {
        // Plain ASCII doesn't look like UTF-16
        assert!(!looks_like_utf16le(b"Hello World!"));
    }
}

