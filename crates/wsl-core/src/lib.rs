//! WSL Core - Core WSL management logic
//!
//! This crate provides parsing and types for WSL management,
//! separated from the Tauri integration for testability.

mod parser;
mod types;

pub use parser::{decode_wsl_output, parse_wsl_list_output};
pub use types::{Distribution, DistroState, WslError};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_standard_output() {
        let output = r#"  NAME                   STATE           VERSION
* Ubuntu                 Running         2
  docker-desktop         Stopped         2
  docker-desktop-data    Stopped         2
"#;

        let distributions = parse_wsl_list_output(output);

        assert_eq!(distributions.len(), 3);

        assert_eq!(distributions[0].name, "Ubuntu");
        assert_eq!(distributions[0].state, DistroState::Running);
        assert_eq!(distributions[0].version, 2);
        assert!(distributions[0].is_default);

        assert_eq!(distributions[1].name, "docker-desktop");
        assert_eq!(distributions[1].state, DistroState::Stopped);
        assert!(!distributions[1].is_default);

        assert_eq!(distributions[2].name, "docker-desktop-data");
        assert_eq!(distributions[2].state, DistroState::Stopped);
    }

    #[test]
    fn test_parse_empty_output() {
        let distributions = parse_wsl_list_output("");
        assert!(distributions.is_empty());
    }

    #[test]
    fn test_parse_distro_with_spaces_in_name() {
        let output = r#"  NAME                   STATE           VERSION
  Ubuntu 22.04 LTS       Running         2
"#;

        let distributions = parse_wsl_list_output(output);

        assert_eq!(distributions.len(), 1);
        assert_eq!(distributions[0].name, "Ubuntu 22.04 LTS");
    }

    #[test]
    fn test_parse_all_states() {
        let output = r#"  NAME        STATE           VERSION
  Running1    Running         2
  Stopped1    Stopped         2
  Install1    Installing      2
  Unknown1    SomeOther       1
"#;

        let distributions = parse_wsl_list_output(output);

        assert_eq!(distributions.len(), 4);
        assert_eq!(distributions[0].state, DistroState::Running);
        assert_eq!(distributions[1].state, DistroState::Stopped);
        assert_eq!(distributions[2].state, DistroState::Installing);
        assert_eq!(distributions[3].state, DistroState::Unknown);
    }

    #[test]
    fn test_parse_wsl1_and_wsl2() {
        let output = r#"  NAME        STATE           VERSION
  Ubuntu      Running         2
  OldDistro   Stopped         1
"#;

        let distributions = parse_wsl_list_output(output);

        assert_eq!(distributions.len(), 2);
        assert_eq!(distributions[0].version, 2);
        assert_eq!(distributions[1].version, 1);
    }

    #[test]
    fn test_default_marker_variations() {
        // Test with asterisk directly at start
        let output1 = r#"  NAME        STATE           VERSION
*Ubuntu      Running         2
"#;

        let distributions1 = parse_wsl_list_output(output1);
        assert!(distributions1[0].is_default);

        // Test with space before asterisk
        let output2 = r#"  NAME        STATE           VERSION
 * Ubuntu     Running         2
"#;

        let distributions2 = parse_wsl_list_output(output2);
        assert!(distributions2[0].is_default);
    }

    #[test]
    fn test_id_is_none_after_parsing() {
        let output = r#"  NAME        STATE           VERSION
  Ubuntu      Running         2
"#;

        let distributions = parse_wsl_list_output(output);
        assert_eq!(distributions.len(), 1);
        assert!(distributions[0].id.is_none());
    }

    #[test]
    fn test_distribution_with_id() {
        let distro = Distribution {
            id: Some("{2aa80b0d-f814-48c6-872f-3a554e572505}".to_string()),
            name: "DevBox".to_string(),
            state: DistroState::Running,
            version: 2,
            is_default: true,
        };

        assert_eq!(distro.id, Some("{2aa80b0d-f814-48c6-872f-3a554e572505}".to_string()));
        assert_eq!(distro.name, "DevBox");
    }
}

