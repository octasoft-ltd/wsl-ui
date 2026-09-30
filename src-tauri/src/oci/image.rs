//! OCI image pulling and rootfs creation
//!
//! Downloads container image layers and creates a rootfs tarball for WSL import.
//!
//! IMPORTANT: On Windows, we cannot extract layers to the filesystem because Windows
//! doesn't support Linux symlinks. Instead, we merge layers directly in tar format,
//! which preserves symlinks for WSL to handle correctly.

use flate2::read::GzDecoder;
use std::collections::HashMap;
use std::fs::File;
use std::io::{BufRead, BufReader, BufWriter, Read};
use std::path::{Path, PathBuf};
use tar::{Archive, Builder, EntryType, Header};

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
        cb(
            0,
            0,
            &format!("Fetching manifest for {}", image.full_reference()),
        );
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

        // Download with SHA-256 digest + size verification (progress reported at layer level)
        client.download_blob(&image, &layer.digest, layer.size, &layer_path, None)?;
        downloaded_total += layer.size;

        layer_paths.push(LayerArchive {
            path: layer_path,
            media_type: layer.media_type.clone(),
        });
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

struct LayerArchive {
    path: PathBuf,
    media_type: String,
}

/// Merge OCI layers directly into a single tar file
///
/// This approach never extracts to the filesystem, preserving symlinks
/// that Windows cannot represent but WSL needs.
fn merge_layers_to_tar(layers: &[LayerArchive], output_path: &Path) -> Result<(), OciError> {
    // Track all entries by path - later layers override earlier ones
    let mut entries: HashMap<String, TarEntry> = HashMap::new();
    // Process each layer in order (base layer first)
    for layer in layers {
        process_layer(layer, &mut entries)?;
    }

    // Do not emit an archive that asks the importer to write through a symlink.
    // Normal Linux symlinks (including absolute targets) remain archive metadata.
    for (path, entry) in &entries {
        validate_entry_ancestors(path, &entries)?;
        if entry.header.entry_type().is_hard_link() {
            let target = entry
                .link_name
                .as_deref()
                .ok_or_else(|| OciError::LayerError("Hardlink has no target".into()))?;
            validate_archive_path(target)?;
            let target = normalize_path(target);
            if target.is_empty() {
                return Err(OciError::LayerError("Hardlink target is empty".into()));
            }
            validate_entry_ancestors(&target, &entries)?;
        }
    }

    // Write merged entries to output tar
    let output_file = File::create(output_path)?;
    let mut tar_builder = Builder::new(BufWriter::new(output_file));

    // Sort entries by path for deterministic output
    let mut paths: Vec<_> = entries.keys().cloned().collect();
    paths.sort();

    for path in paths {
        if let Some(entry) = entries.remove(&path) {
            // Write the entry
            if let Some(link_name) = &entry.link_name {
                // For symlinks and hardlinks, we need to set the link name
                let mut header = entry.header.clone();
                tar_builder
                    .append_link(&mut header, &path, link_name)
                    .map_err(|e| {
                        OciError::LayerError(format!("Failed to write link {}: {}", path, e))
                    })?;
            } else if entry.header.entry_type() == EntryType::Directory {
                // Directory
                let mut header = entry.header.clone();
                tar_builder
                    .append_data(&mut header, &path, &[] as &[u8])
                    .map_err(|e| {
                        OciError::LayerError(format!("Failed to write dir {}: {}", path, e))
                    })?;
            } else {
                // Regular file or other
                let mut header = entry.header.clone();
                tar_builder
                    .append_data(&mut header, &path, entry.data.as_slice())
                    .map_err(|e| {
                        OciError::LayerError(format!("Failed to write file {}: {}", path, e))
                    })?;
            }
        }
    }

    tar_builder
        .finish()
        .map_err(|e| OciError::LayerError(format!("Failed to finish tar: {}", e)))?;

    Ok(())
}

/// Apply whiteouts to lower layers, then overlay this layer's additions.
/// OCI whiteouts never remove entries from their own layer, regardless of order.
fn process_layer(
    layer: &LayerArchive,
    entries: &mut HashMap<String, TarEntry>,
) -> Result<(), OciError> {
    let tar_reader = layer_reader(layer)?;
    let mut archive = Archive::new(tar_reader);
    let mut additions = HashMap::new();

    for entry_result in archive
        .entries()
        .map_err(|e| OciError::LayerError(e.to_string()))?
    {
        let mut entry = entry_result.map_err(|e| OciError::LayerError(e.to_string()))?;
        let path_bytes = entry.path_bytes();
        let path = std::str::from_utf8(&path_bytes)
            .map_err(|e| OciError::LayerError(format!("Archive path is not UTF-8: {}", e)))?;
        validate_archive_path(path)?;
        let path_str = normalize_path(path);

        // Skip empty paths
        if path_str.is_empty() || path_str == "." {
            continue;
        }

        let (parent, filename) = path_str.rsplit_once('/').unwrap_or(("", &path_str));
        if filename == ".wh..wh..opq" {
            // Preserve the directory and its attributes; only hide descendants.
            let prefix = format!("{}/", parent);
            entries.retain(|path, _| !parent.is_empty() && !path.starts_with(&prefix));
            continue;
        }
        if let Some(target_name) = filename.strip_prefix(".wh.") {
            if target_name.is_empty() || target_name == "." || target_name == ".." {
                return Err(OciError::LayerError(format!(
                    "Invalid whiteout: {}",
                    path_str
                )));
            }
            let target = if parent.is_empty() {
                target_name.to_string()
            } else {
                format!("{}/{}", parent, target_name)
            };
            let prefix = format!("{}/", target);
            entries.retain(|path, _| path != &target && !path.starts_with(&prefix));
            continue;
        }

        // Read the entry data
        let header = entry.header().clone();
        let entry_type = header.entry_type();

        let link_name = if entry_type == EntryType::Symlink || entry_type == EntryType::Link {
            entry
                .link_name()
                .ok()
                .flatten()
                .map(|p| p.to_string_lossy().to_string())
        } else {
            None
        };

        let data = if entry_type == EntryType::Regular || entry_type == EntryType::Continuous {
            let mut data = Vec::new();
            entry
                .read_to_end(&mut data)
                .map_err(|e| OciError::LayerError(format!("Failed to read {}: {}", path_str, e)))?;
            data
        } else {
            Vec::new()
        };

        // Add or replace entry
        additions.insert(
            path_str,
            TarEntry {
                header,
                data,
                link_name,
            },
        );
    }

    // Replacing a lower directory with a file/symlink also removes its children.
    for (path, entry) in &additions {
        if !entry.header.entry_type().is_dir() {
            let prefix = format!("{}/", path);
            entries.retain(|old_path, _| !old_path.starts_with(&prefix));
        }
    }
    entries.extend(additions);

    Ok(())
}

/// Normalize a path string (remove leading ./ and trailing /)
fn normalize_path(path: &str) -> String {
    path.split('/')
        .filter(|part| !part.is_empty() && *part != ".")
        .collect::<Vec<_>>()
        .join("/")
}

/// Layer entry names are rootfs-relative POSIX paths, never host paths.
/// Symlink targets are preserved separately and are not followed on Windows.
fn validate_archive_path(path: &str) -> Result<(), OciError> {
    if path.starts_with('/')
        || path.contains('\\')
        || path.as_bytes().get(1) == Some(&b':')
        || path.split('/').any(|part| part == "..")
    {
        return Err(OciError::LayerError(format!(
            "Unsafe archive entry path: {}",
            path
        )));
    }
    Ok(())
}

fn validate_entry_ancestors(
    path: &str,
    entries: &HashMap<String, TarEntry>,
) -> Result<(), OciError> {
    let mut ancestor = path;
    while let Some((parent, _)) = ancestor.rsplit_once('/') {
        if entries
            .get(parent)
            .is_some_and(|entry| !entry.header.entry_type().is_dir())
        {
            return Err(OciError::LayerError(format!(
                "Archive entry {} traverses non-directory {}",
                path, parent
            )));
        }
        ancestor = parent;
    }
    Ok(())
}

fn layer_reader(layer: &LayerArchive) -> Result<Box<dyn Read>, OciError> {
    let declared_compression = match layer.media_type.as_str() {
        ""
        | "application/vnd.oci.image.layer.v1.tar"
        | "application/vnd.oci.image.layer.nondistributable.v1.tar"
        | "application/vnd.docker.image.rootfs.diff.tar" => "tar",
        "application/vnd.oci.image.layer.v1.tar+gzip"
        | "application/vnd.oci.image.layer.nondistributable.v1.tar+gzip"
        | "application/vnd.docker.image.rootfs.diff.tar.gzip"
        | "application/vnd.docker.image.rootfs.foreign.diff.tar.gzip" => "gzip",
        "application/vnd.oci.image.layer.v1.tar+zstd"
        | "application/vnd.oci.image.layer.nondistributable.v1.tar+zstd" => "zstd",
        other => {
            return Err(OciError::LayerError(format!(
                "Unsupported layer media type: {}",
                other
            )))
        }
    };
    let mut reader = BufReader::new(File::open(&layer.path)?);
    let magic = reader.fill_buf()?;
    // Recognize compressed bytes even when a registry labels a layer as plain tar.
    let compression = if magic.starts_with(&[0x1f, 0x8b]) {
        "gzip"
    } else if magic.starts_with(&[0x28, 0xb5, 0x2f, 0xfd])
        || (magic.len() >= 4
            && (0x50..=0x5f).contains(&magic[0])
            && magic[1..4] == [0x2a, 0x4d, 0x18])
    {
        "zstd"
    } else {
        declared_compression
    };
    match compression {
        "gzip" => Ok(Box::new(GzDecoder::new(reader))),
        "zstd" => Ok(Box::new(ZstdReader {
            source: reader,
            decoder: ruzstd::decoding::FrameDecoder::new(),
            in_frame: false,
        })),
        _ => Ok(Box::new(reader)),
    }
}

/// ruzstd's StreamingDecoder reads one frame; an OCI blob may contain several.
/// Keep frame boundaries transparent to the tar reader, including skippable frames.
struct ZstdReader {
    source: BufReader<File>,
    decoder: ruzstd::decoding::FrameDecoder,
    in_frame: bool,
}

impl Read for ZstdReader {
    fn read(&mut self, output: &mut [u8]) -> std::io::Result<usize> {
        use ruzstd::decoding::{
            errors::{FrameDecoderError, ReadFrameHeaderError},
            BlockDecodingStrategy,
        };
        if output.is_empty() {
            return Ok(0);
        }
        loop {
            if !self.in_frame {
                if self.source.fill_buf()?.is_empty() {
                    return Ok(0);
                }
                match self.decoder.init(&mut self.source) {
                    Ok(()) => self.in_frame = true,
                    Err(FrameDecoderError::ReadFrameHeaderError(
                        ReadFrameHeaderError::SkipFrame { length, .. },
                    )) => {
                        let copied = std::io::copy(
                            &mut self.source.by_ref().take(length as u64),
                            &mut std::io::sink(),
                        )?;
                        if copied != length as u64 {
                            return Err(std::io::Error::new(
                                std::io::ErrorKind::UnexpectedEof,
                                "Truncated zstd skippable frame",
                            ));
                        }
                        continue;
                    }
                    Err(error) => return Err(std::io::Error::other(error)),
                }
            }
            if self.decoder.can_collect() > 0 {
                return self.decoder.read(output);
            }
            if self.decoder.is_finished() {
                self.in_frame = false;
                continue;
            }
            self.decoder
                .decode_blocks(
                    &mut self.source,
                    BlockDecodingStrategy::UptoBytes(output.len()),
                )
                .map_err(std::io::Error::other)?;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn merge_paths(paths: &[PathBuf], output: &Path) -> Result<(), OciError> {
        let layers = paths
            .iter()
            .map(|path| LayerArchive {
                path: path.clone(),
                media_type: String::new(),
            })
            .collect::<Vec<_>>();
        merge_layers_to_tar(&layers, output)
    }

    struct LayerFixture(PathBuf);

    impl LayerFixture {
        fn new() -> Self {
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let path = std::env::temp_dir().join(format!(
                "wsl-oci-layer-tests-{}-{}",
                std::process::id(),
                NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed)
            ));
            std::fs::create_dir_all(&path).unwrap();
            Self(path)
        }

        fn layer(&self, name: &str, entries: &[(&str, EntryType, &str, u32)]) -> PathBuf {
            let path = self.0.join(name);
            let mut archive = Builder::new(File::create(&path).unwrap());
            for &(name, kind, content, mode) in entries {
                let mut header = Header::new_gnu();
                // Raw name bytes also let the safety tests create hostile archives.
                header.as_mut_bytes()[..name.len()].copy_from_slice(name.as_bytes());
                header.set_entry_type(kind);
                header.set_mode(mode);
                header.set_uid(123);
                header.set_gid(456);
                let data = if kind.is_file() {
                    content.as_bytes()
                } else {
                    &[]
                };
                header.set_size(data.len() as u64);
                if kind.is_symlink() || kind.is_hard_link() {
                    header.set_link_name(content).unwrap();
                }
                header.set_cksum();
                archive.append(&header, data).unwrap();
            }
            archive.finish().unwrap();
            path
        }

        fn merge(&self, layers: &[PathBuf]) -> HashMap<String, TarEntry> {
            let output = self.0.join("merged.tar");
            merge_paths(layers, &output).unwrap();
            let mut archive = Archive::new(File::open(output).unwrap());
            archive
                .entries()
                .unwrap()
                .map(|entry| {
                    let mut entry = entry.unwrap();
                    let path = normalize_path(&entry.path().unwrap().to_string_lossy());
                    let header = entry.header().clone();
                    let link_name = entry
                        .link_name()
                        .unwrap()
                        .map(|p| p.to_string_lossy().into_owned());
                    let mut data = Vec::new();
                    entry.read_to_end(&mut data).unwrap();
                    (
                        path,
                        TarEntry {
                            header,
                            link_name,
                            data,
                        },
                    )
                })
                .collect()
        }
    }

    impl Drop for LayerFixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[test]
    fn opaque_whiteout_preserves_directory_and_same_layer_files_in_either_order() {
        for marker_first in [false, true] {
            let fixture = LayerFixture::new();
            let base = fixture.layer(
                "base.tar",
                &[
                    ("etc/", EntryType::Directory, "", 0o700),
                    ("etc/old", EntryType::Regular, "old", 0o600),
                    ("etc/nested/old", EntryType::Regular, "nested", 0o600),
                    ("etc-other/keep", EntryType::Regular, "unrelated", 0o600),
                ],
            );
            let mut additions = vec![
                ("etc/", EntryType::Directory, "", 0o750),
                ("etc/new", EntryType::Regular, "new", 0o640),
                ("etc/nested/new", EntryType::Regular, "nested new", 0o600),
            ];
            let marker = ("etc/.wh..wh..opq", EntryType::Regular, "", 0o600);
            if marker_first {
                additions.insert(0, marker);
            } else {
                additions.push(marker);
            }
            let layer = fixture.layer("next.tar", &additions);
            let merged = fixture.merge(&[base, layer]);
            assert!(
                merged.contains_key("etc"),
                "opaque marker must preserve its directory"
            );
            assert_eq!(merged["etc"].header.mode().unwrap(), 0o750);
            assert_eq!(merged["etc"].header.uid().unwrap(), 123);
            assert_eq!(merged["etc"].header.gid().unwrap(), 456);
            assert_eq!(merged["etc/new"].data, b"new");
            assert_eq!(merged["etc/nested/new"].data, b"nested new");
            assert!(merged.contains_key("etc-other/keep"));
            assert!(!merged.contains_key("etc/old"));
            assert!(!merged.contains_key("etc/nested/old"));
            assert!(merged.keys().all(|p| !p.contains(".wh.")));
        }
    }

    #[test]
    fn ordinary_whiteout_only_removes_lower_layer_entries_in_either_order() {
        for marker_first in [false, true] {
            let fixture = LayerFixture::new();
            let base = fixture.layer(
                "base.tar",
                &[
                    ("data/", EntryType::Directory, "", 0o700),
                    ("data/old", EntryType::Regular, "old", 0o600),
                ],
            );
            let mut additions = vec![
                ("data/", EntryType::Directory, "", 0o755),
                ("data/new", EntryType::Regular, "replacement", 0o600),
            ];
            let marker = (".wh.data", EntryType::Regular, "", 0o600);
            if marker_first {
                additions.insert(0, marker);
            } else {
                additions.push(marker);
            }
            let layer = fixture.layer("next.tar", &additions);
            let merged = fixture.merge(&[base, layer]);
            assert!(merged.contains_key("data"));
            assert_eq!(merged["data/new"].data, b"replacement");
            assert!(!merged.contains_key("data/old"));
        }
    }

    #[test]
    fn root_opaque_whiteout_hides_all_lower_entries_and_allows_later_recreation() {
        let fixture = LayerFixture::new();
        let base = fixture.layer("base.tar", &[("old", EntryType::Regular, "old", 0o600)]);
        let opaque = fixture.layer(
            "opaque.tar",
            &[
                ("new", EntryType::Regular, "new", 0o600),
                (".wh..wh..opq", EntryType::Regular, "", 0o600),
            ],
        );
        let merged = fixture.merge(&[base.clone(), opaque.clone()]);
        assert!(!merged.contains_key("old"));
        assert_eq!(merged["new"].data, b"new");
        let later = fixture.layer(
            "later.tar",
            &[("old", EntryType::Regular, "recreated", 0o600)],
        );
        assert_eq!(
            fixture.merge(&[base, opaque, later])["old"].data,
            b"recreated"
        );
    }

    #[test]
    fn layer_merge_preserves_linux_symlinks_without_extracting_them() {
        let fixture = LayerFixture::new();
        let layer = fixture.layer(
            "links.tar",
            &[
                ("bin", EntryType::Symlink, "usr/bin", 0o777),
                ("usr/bin/tool", EntryType::Regular, "tool", 0o755),
                (
                    "lib/libc.so",
                    EntryType::Symlink,
                    "../usr/lib/libc.so",
                    0o777,
                ),
                ("absolute", EntryType::Symlink, "/usr/lib", 0o777),
            ],
        );
        let merged = fixture.merge(&[layer]);
        assert_eq!(merged["bin"].link_name.as_deref(), Some("usr/bin"));
        assert_eq!(
            merged["lib/libc.so"].link_name.as_deref(),
            Some("../usr/lib/libc.so")
        );
        assert_eq!(merged["absolute"].link_name.as_deref(), Some("/usr/lib"));
        assert!(!fixture.0.join("bin").exists());
    }

    #[test]
    fn layer_merge_rejects_traversal_and_absolute_entry_paths() {
        let fixture = LayerFixture::new();
        for name in [
            "../escape",
            "etc/../../escape",
            "/absolute",
            "C:/escape",
            "etc/.wh...",
        ] {
            let layer = fixture.layer("hostile.tar", &[(name, EntryType::Regular, "", 0o600)]);
            assert!(
                merge_paths(&[layer], &fixture.0.join("merged.tar")).is_err(),
                "unsafe archive entry {name} must be rejected"
            );
        }
    }

    #[test]
    fn zstd_layer_merges_files_and_whiteouts() {
        let fixture = LayerFixture::new();
        let base = fixture.layer("base.tar", &[("old", EntryType::Regular, "old", 0o600)]);
        let next = fixture.layer(
            "next.tar",
            &[
                (".wh.old", EntryType::Regular, "", 0o600),
                ("new", EntryType::Regular, "zstd content", 0o644),
            ],
        );
        let tar = std::fs::read(&next).unwrap();
        let compressed = ruzstd::encoding::compress_to_vec(
            tar.as_slice(),
            ruzstd::encoding::CompressionLevel::Fastest,
        );
        let zstd_path = fixture.0.join("next.tar.zst");
        std::fs::write(&zstd_path, compressed).unwrap();
        let merged = fixture.merge(&[base, zstd_path]);
        assert_eq!(merged["new"].data, b"zstd content");
        assert!(!merged.contains_key("old"));
    }

    #[test]
    fn layer_merge_rejects_writes_through_symlinks_and_escaping_hardlinks() {
        let fixture = LayerFixture::new();
        let traversal = fixture.layer(
            "symlink.tar",
            &[
                ("escape", EntryType::Symlink, "../../outside", 0o777),
                ("escape/file", EntryType::Regular, "unsafe", 0o600),
            ],
        );
        assert!(merge_paths(&[traversal], &fixture.0.join("merged.tar")).is_err());
        let hardlink = fixture.layer(
            "hardlink.tar",
            &[("file", EntryType::Link, "../../outside", 0o600)],
        );
        assert!(merge_paths(&[hardlink], &fixture.0.join("merged.tar")).is_err());
    }

    #[test]
    fn replacing_lower_directory_with_symlink_removes_old_children() {
        let fixture = LayerFixture::new();
        let base = fixture.layer(
            "base.tar",
            &[
                ("bin/", EntryType::Directory, "", 0o755),
                ("bin/old", EntryType::Regular, "old", 0o755),
            ],
        );
        let next = fixture.layer(
            "next.tar",
            &[
                ("bin", EntryType::Symlink, "usr/bin", 0o777),
                ("usr/bin/new", EntryType::Regular, "new", 0o755),
            ],
        );
        let merged = fixture.merge(&[base, next]);
        assert_eq!(merged["bin"].link_name.as_deref(), Some("usr/bin"));
        assert!(!merged.contains_key("bin/old"));
        assert_eq!(merged["usr/bin/new"].data, b"new");
    }

    #[test]
    fn layer_readers_support_declared_formats_multiframe_zstd_and_skippable_frames() {
        let fixture = LayerFixture::new();
        let tar_path = fixture.layer(
            "base.tar",
            &[("file", EntryType::Regular, "payload", 0o644)],
        );
        let tar = std::fs::read(&tar_path).unwrap();
        let mut gzip = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::default());
        std::io::Write::write_all(&mut gzip, &tar).unwrap();
        let gzip = gzip.finish().unwrap();
        let mut zstd = vec![0x50, 0x2a, 0x4d, 0x18, 3, 0, 0, 0, b's', b'k', b'p'];
        for part in tar.chunks(777) {
            zstd.extend(ruzstd::encoding::compress_to_vec(
                part,
                ruzstd::encoding::CompressionLevel::Fastest,
            ));
        }
        for (media_type, encoded) in [
            ("application/vnd.oci.image.layer.v1.tar", tar.clone()),
            ("application/vnd.docker.image.rootfs.diff.tar.gzip", gzip),
            ("application/vnd.oci.image.layer.v1.tar+zstd", zstd),
        ] {
            let path = fixture.0.join("compressed");
            std::fs::write(&path, encoded).unwrap();
            let mut reader = layer_reader(&LayerArchive {
                path,
                media_type: media_type.into(),
            })
            .unwrap();
            let mut decoded = Vec::new();
            reader.read_to_end(&mut decoded).unwrap();
            assert_eq!(decoded, tar, "failed format {media_type}");
        }
    }

    #[test]
    fn unsupported_layer_type_and_truncated_zstd_fail_clearly() {
        let fixture = LayerFixture::new();
        let path = fixture.layer("base.tar", &[]);
        let unknown = LayerArchive {
            path: path.clone(),
            media_type: "application/example+lz4".into(),
        };
        let error = match layer_reader(&unknown) {
            Err(error) => error,
            Ok(_) => panic!("unsupported type accepted"),
        };
        assert!(error.to_string().contains("application/example+lz4"));
        for bytes in [
            vec![0x28, 0xb5, 0x2f, 0xfd],
            vec![0x50, 0x2a, 0x4d, 0x18, 8, 0, 0, 0, b'x'],
        ] {
            std::fs::write(&path, bytes).unwrap();
            let mut reader = layer_reader(&LayerArchive {
                path: path.clone(),
                media_type: "application/vnd.oci.image.layer.v1.tar+zstd".into(),
            })
            .unwrap();
            assert!(reader.read_to_end(&mut Vec::new()).is_err());
        }
    }

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
