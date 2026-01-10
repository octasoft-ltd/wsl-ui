//! OCI image pulling and rootfs creation
//!
//! Downloads container image layers and creates a rootfs tarball for WSL import.
//!
//! IMPORTANT: On Windows, we cannot extract layers to the filesystem because Windows
//! doesn't support Linux symlinks. Instead, we merge layers directly in tar format,
//! which preserves symlinks for WSL to handle correctly.

use std::collections::{HashMap, HashSet};
use std::fs::File;
use std::io::{Read, BufReader, BufWriter};
use std::path::{Path, PathBuf};
use flate2::read::GzDecoder;
use tar::{Archive, Builder, Header, EntryType};

use super::registry::RegistryClient;
use super::types::*;

/// Pull an OCI image and create a rootfs tarball
///
/// Returns the path to the created tarball
pub fn pull_and_create_rootfs(
    image_ref: &str,
    output_dir: &Path,
    progress: Option<ProgressCallback>,
) -> Result<PathBuf, OciError> {
    let image = ImageReference::parse(image_ref)?;
    let mut client = RegistryClient::new();

    // Report progress
    if let Some(ref cb) = progress {
        cb(0, 0, &format!("Fetching manifest for {}", image.full_reference()));
    }

    // Get the manifest
    let manifest = client.get_manifest(&image)?;

    // Create temp directory for layers
    let temp_dir = output_dir.join(format!("oci-layers-{}", std::process::id()));
    std::fs::create_dir_all(&temp_dir)?;

    // Calculate total size
    let total_size: u64 = manifest.layers.iter().map(|l| l.size).sum();
    let mut downloaded_total: u64 = 0;

    // Download all layers
    let mut layer_paths = Vec::new();
    for (i, layer) in manifest.layers.iter().enumerate() {
        let layer_filename = format!("layer-{}.tar.gz", i);
        let layer_path = temp_dir.join(&layer_filename);

        if let Some(ref cb) = progress {
            cb(
                downloaded_total,
                total_size,
                &format!("Downloading layer {}/{}", i + 1, manifest.layers.len()),
            );
        }

        // Download without per-byte progress (progress reported at layer level)
        client.download_blob(&image, &layer.digest, &layer_path, None)?;
        downloaded_total += layer.size;

        layer_paths.push(layer_path);
    }

    // Create merged rootfs tarball
    if let Some(ref cb) = progress {
        cb(total_size, total_size, "Creating rootfs...");
    }

    let output_path = output_dir.join(format!("{}.tar", image.suggested_name()));
    merge_layers_to_tar(&layer_paths, &output_path)?;

    // Cleanup temp directory
    let _ = std::fs::remove_dir_all(&temp_dir);

    if let Some(ref cb) = progress {
        cb(total_size, total_size, "Complete");
    }

    Ok(output_path)
}

/// Represents a tar entry that we're tracking for merging
struct TarEntry {
    header: Header,
    data: Vec<u8>,
    link_name: Option<String>,
}

/// Merge OCI layers directly into a single tar file
///
/// This approach never extracts to the filesystem, preserving symlinks
/// that Windows cannot represent but WSL needs.
fn merge_layers_to_tar(layer_paths: &[PathBuf], output_path: &Path) -> Result<(), OciError> {
    // Track all entries by path - later layers override earlier ones
    let mut entries: HashMap<String, TarEntry> = HashMap::new();
    // Track deleted paths (whiteouts)
    let mut deleted: HashSet<String> = HashSet::new();

    // Process each layer in order (base layer first)
    for layer_path in layer_paths {
        process_layer(layer_path, &mut entries, &mut deleted)?;
    }

    // Write merged entries to output tar
    let output_file = File::create(output_path)?;
    let mut tar_builder = Builder::new(BufWriter::new(output_file));

    // Sort entries by path for deterministic output
    let mut paths: Vec<_> = entries.keys().cloned().collect();
    paths.sort();

    for path in paths {
        if let Some(entry) = entries.remove(&path) {
            // Skip if this path was deleted by a whiteout
            if deleted.contains(&path) {
                continue;
            }

            // Write the entry
            if let Some(link_name) = &entry.link_name {
                // For symlinks and hardlinks, we need to set the link name
                let mut header = entry.header.clone();
                tar_builder.append_link(&mut header, &path, link_name)
                    .map_err(|e| OciError::LayerError(format!("Failed to write link {}: {}", path, e)))?;
            } else if entry.header.entry_type() == EntryType::Directory {
                // Directory
                let mut header = entry.header.clone();
                tar_builder.append_data(&mut header, &path, &[] as &[u8])
                    .map_err(|e| OciError::LayerError(format!("Failed to write dir {}: {}", path, e)))?;
            } else {
                // Regular file or other
                let mut header = entry.header.clone();
                tar_builder.append_data(&mut header, &path, entry.data.as_slice())
                    .map_err(|e| OciError::LayerError(format!("Failed to write file {}: {}", path, e)))?;
            }
        }
    }

    tar_builder.finish()
        .map_err(|e| OciError::LayerError(format!("Failed to finish tar: {}", e)))?;

    Ok(())
}

/// Process a single layer, updating the entries map and deleted set
fn process_layer(
    layer_path: &Path,
    entries: &mut HashMap<String, TarEntry>,
    deleted: &mut HashSet<String>,
) -> Result<(), OciError> {
    let file = File::open(layer_path)?;
    let buf_reader = BufReader::new(file);

    // Decompress if gzipped
    let tar_reader: Box<dyn Read> = if is_gzipped(layer_path)? {
        Box::new(GzDecoder::new(buf_reader))
    } else {
        Box::new(buf_reader)
    };

    let mut archive = Archive::new(tar_reader);

    for entry_result in archive.entries().map_err(|e| OciError::LayerError(e.to_string()))? {
        let mut entry = entry_result.map_err(|e| OciError::LayerError(e.to_string()))?;
        let path = entry.path().map_err(|e| OciError::LayerError(e.to_string()))?;
        let path_str = normalize_path(&path.to_string_lossy());

        // Skip empty paths
        if path_str.is_empty() || path_str == "." {
            continue;
        }

        // Check for whiteout files
        if let Some(filename) = path.file_name() {
            let filename_str = filename.to_string_lossy();

            // Opaque whiteout - marks directory as opaque (delete all contents)
            if filename_str == ".wh..wh..opq" {
                if let Some(parent) = path.parent() {
                    let parent_str = normalize_path(&parent.to_string_lossy());
                    // Mark all entries under this directory as deleted
                    let to_delete: Vec<_> = entries.keys()
                        .filter(|k| k.starts_with(&format!("{}/", parent_str)) || *k == &parent_str)
                        .cloned()
                        .collect();
                    for k in to_delete {
                        deleted.insert(k);
                    }
                }
                continue;
            }

            // Regular whiteout - delete specific file
            if filename_str.starts_with(".wh.") {
                let target_name = &filename_str[4..]; // Remove ".wh." prefix
                if let Some(parent) = path.parent() {
                    let target_path = if parent.to_string_lossy().is_empty() {
                        target_name.to_string()
                    } else {
                        format!("{}/{}", normalize_path(&parent.to_string_lossy()), target_name)
                    };
                    deleted.insert(target_path.clone());
                    entries.remove(&target_path);

                    // Also delete any entries under this path (if it was a directory)
                    let prefix = format!("{}/", target_path);
                    let to_delete: Vec<_> = entries.keys()
                        .filter(|k| k.starts_with(&prefix))
                        .cloned()
                        .collect();
                    for k in to_delete {
                        deleted.insert(k.clone());
                        entries.remove(&k);
                    }
                }
                continue;
            }
        }

        // Skip special whiteout markers
        if path_str.contains(".wh..wh.") {
            continue;
        }

        // Read the entry data
        let header = entry.header().clone();
        let entry_type = header.entry_type();

        let link_name = if entry_type == EntryType::Symlink || entry_type == EntryType::Link {
            entry.link_name()
                .ok()
                .flatten()
                .map(|p| p.to_string_lossy().to_string())
        } else {
            None
        };

        let data = if entry_type == EntryType::Regular || entry_type == EntryType::Continuous {
            let mut data = Vec::new();
            entry.read_to_end(&mut data)
                .map_err(|e| OciError::LayerError(format!("Failed to read {}: {}", path_str, e)))?;
            data
        } else {
            Vec::new()
        };

        // Remove from deleted set if this layer is adding it back
        deleted.remove(&path_str);

        // Add or replace entry
        entries.insert(path_str, TarEntry {
            header,
            data,
            link_name,
        });
    }

    Ok(())
}

/// Normalize a path string (remove leading ./ and trailing /)
fn normalize_path(path: &str) -> String {
    let mut p = path.trim_start_matches("./").trim_end_matches('/').to_string();
    // Also handle paths that start with /
    if p.starts_with('/') {
        p = p[1..].to_string();
    }
    // Handle the case where path is just "."
    if p == "." {
        p = String::new();
    }
    p
}

/// Check if a file is gzip compressed
fn is_gzipped(path: &Path) -> Result<bool, OciError> {
    let mut file = File::open(path)?;
    let mut magic = [0u8; 2];
    file.read_exact(&mut magic).ok();
    Ok(magic == [0x1f, 0x8b])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_image_reference_suggested_name() {
        let ref1 = ImageReference::parse("alpine:3.19").unwrap();
        assert!(!ref1.suggested_name().is_empty());

        let ref2 = ImageReference::parse("ubuntu:22.04").unwrap();
        assert!(ref2.suggested_name().contains("ubuntu"));
    }

    #[test]
    fn test_normalize_path() {
        assert_eq!(normalize_path("./foo/bar"), "foo/bar");
        assert_eq!(normalize_path("foo/bar/"), "foo/bar");
        assert_eq!(normalize_path("/foo/bar"), "foo/bar");
        assert_eq!(normalize_path("./"), "");
        assert_eq!(normalize_path("."), "");
    }
}
