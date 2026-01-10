//! RAII guard for temporary file cleanup

use std::path::{Path, PathBuf};

/// RAII guard to ensure cleanup of temporary files
/// This will automatically delete the file when dropped, even on panic
pub struct TempFileGuard {
    path: PathBuf,
    keep: bool,
}

impl TempFileGuard {
    /// Create a new guard for the given path
    pub fn new(path: impl Into<PathBuf>) -> Self {
        Self {
            path: path.into(),
            keep: false,
        }
    }

    /// Keep the file (don't delete on drop)
    #[allow(dead_code)]
    pub fn keep(&mut self) {
        self.keep = true;
    }

    /// Get the path
    #[allow(dead_code)]
    pub fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TempFileGuard {
    fn drop(&mut self) {
        if !self.keep && self.path.exists() {
            let _ = std::fs::remove_file(&self.path);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_temp_file_guard_removes_file_on_drop() {
        let temp_dir = std::env::temp_dir();
        let temp_path = temp_dir.join("test_guard_cleanup.dat");

        // Create file and guard
        {
            std::fs::write(&temp_path, b"test data").unwrap();
            assert!(temp_path.exists(), "File should exist after creation");

            let _guard = TempFileGuard::new(&temp_path);
            assert!(temp_path.exists(), "File should exist while guard is in scope");
        } // Guard dropped here

        // File should be removed after guard is dropped
        assert!(!temp_path.exists(), "File should be removed after guard is dropped");
    }

    #[test]
    fn test_temp_file_guard_keeps_file_when_requested() {
        let temp_dir = std::env::temp_dir();
        let temp_path = temp_dir.join("test_guard_keep.dat");

        // Create file and guard, then call keep()
        {
            std::fs::write(&temp_path, b"test data").unwrap();
            let mut guard = TempFileGuard::new(&temp_path);
            guard.keep();
        } // Guard dropped here

        // File should still exist because we called keep()
        assert!(temp_path.exists(), "File should exist after guard with keep() is dropped");

        // Cleanup
        let _ = std::fs::remove_file(&temp_path);
    }

    #[test]
    fn test_temp_file_guard_handles_nonexistent_file() {
        let temp_dir = std::env::temp_dir();
        let temp_path = temp_dir.join("nonexistent_file.dat");

        // Ensure file doesn't exist
        let _ = std::fs::remove_file(&temp_path);

        // Create guard for nonexistent file - should not panic on drop
        {
            let _guard = TempFileGuard::new(&temp_path);
        } // Should not panic even though file doesn't exist

        assert!(!temp_path.exists());
    }

    #[test]
    fn test_temp_file_guard_panic_safety() {
        let temp_dir = std::env::temp_dir();
        let temp_path = temp_dir.join("test_guard_panic.dat");

        std::fs::write(&temp_path, b"test data").unwrap();
        assert!(temp_path.exists());

        // Simulate panic with catch_unwind
        let result = std::panic::catch_unwind(|| {
            let _guard = TempFileGuard::new(&temp_path);
            panic!("Simulated panic");
        });

        assert!(result.is_err(), "Should have panicked");
        assert!(!temp_path.exists(), "File should be cleaned up even after panic");
    }

    #[test]
    fn test_temp_file_guard_path_accessor() {
        let temp_dir = std::env::temp_dir();
        let temp_path = temp_dir.join("test_guard_path.dat");

        std::fs::write(&temp_path, b"test data").unwrap();

        let guard = TempFileGuard::new(&temp_path);
        assert_eq!(guard.path(), temp_path.as_path());

        drop(guard);
        assert!(!temp_path.exists());
    }

    #[test]
    fn test_temp_file_guard_multiple_guards() {
        let temp_dir = std::env::temp_dir();
        let temp_path1 = temp_dir.join("test_guard_multi1.dat");
        let temp_path2 = temp_dir.join("test_guard_multi2.dat");

        std::fs::write(&temp_path1, b"test data 1").unwrap();
        std::fs::write(&temp_path2, b"test data 2").unwrap();

        {
            let _guard1 = TempFileGuard::new(&temp_path1);
            let mut guard2 = TempFileGuard::new(&temp_path2);
            guard2.keep(); // Keep second file

            assert!(temp_path1.exists());
            assert!(temp_path2.exists());
        }

        // First file should be removed, second should remain
        assert!(!temp_path1.exists(), "First file should be removed");
        assert!(temp_path2.exists(), "Second file should be kept");

        // Cleanup
        let _ = std::fs::remove_file(&temp_path2);
    }
}
