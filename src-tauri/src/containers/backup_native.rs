//! Source-backed WSLc 3.0.1 recovery adapter. Volume helpers remain gated.
use super::{
    backup::*,
    executor::Executor,
    lifecycle::{create_args, success, Service},
    types::*,
};
use serde_json::Value;
use std::{collections::BTreeMap, path::Path, time::Duration};
impl From<ContainerError> for RecoveryError {
    fn from(e: ContainerError) -> Self {
        Self {
            code: e.code,
            message: e.message,
        }
    }
}
impl From<RecoveryError> for ContainerError {
    fn from(e: RecoveryError) -> Self {
        Self {
            code: e.code,
            message: e.message,
        }
    }
}
pub struct NativeRecovery<'a, E: Executor> {
    pub service: &'a Service<E>,
    pub connection: &'a ContainerConnection,
}
fn unsupported() -> RecoveryError {
    RecoveryError{code:"unsupported".into(),message:"Named-volume recovery requires a pinned helper and a verified Linux ownership, permissions and restore round trip.".into()}
}
impl<'a, E: Executor> NativeRecovery<'a, E> {
    fn command(&self, args: Vec<String>, timeout: Duration) -> RecoveryResult<Vec<u8>> {
        let output = self
            .service
            .execute_scoped(self.connection, &args, timeout)?;
        success(&output)?;
        Ok(output.stdout)
    }
    fn image_inventory(&self) -> RecoveryResult<Vec<Value>> {
        let bytes = self.command(
            vec![
                "image".into(),
                "list".into(),
                "--format".into(),
                "json".into(),
                "--no-trunc".into(),
            ],
            Duration::from_secs(30),
        )?;
        let text = std::str::from_utf8(&bytes).map_err(|_| RecoveryError {
            code: "malformedOutput".into(),
            message: "Invalid image inventory encoding.".into(),
        })?;
        text.lines()
            .filter(|s| !s.trim().is_empty())
            .map(|s| {
                serde_json::from_str(s).map_err(|_| RecoveryError {
                    code: "malformedOutput".into(),
                    message: "Invalid image inventory; recovery was stopped.".into(),
                })
            })
            .collect()
    }
    fn cleanup_import_error(&self, name: &str, mut error: RecoveryError) -> RecoveryError {
        match self.image_name_exists(name){Ok(true)=>{if self.remove_image(name).is_err(){error.message.push_str(" Imported image cleanup failed; inspect the restore image before retrying.");}},Ok(false)=>{},Err(_)=>error.message.push_str(" Import outcome could not be reconciled with the captured session; inspect restore resources before retrying.")};
        error
    }
}
impl<'a, E: Executor> RecoveryRuntime for NativeRecovery<'a, E> {
    fn inspect(&self, id: &str) -> RecoveryResult<Snapshot> {
        let c = self.service.inspect(self.connection, id)?;
        let mut volumes = vec![];
        let mut unsupported_mounts = vec![];
        for (index, m) in c.data_mounts.iter().enumerate() {
            if m.kind == "volume" && m.name.as_ref().is_some_and(|n| !n.is_empty()) {
                volumes.push(VolumeRecord {
                    key: format!("v{index:03}"),
                    source_name: m.name.clone().unwrap(),
                    target: m.target.clone(),
                    read_only: m.read_only,
                });
            } else {
                unsupported_mounts.push(format!("{} at {}", m.kind, m.target));
            }
        }
        let configuration = c
            .configuration
            .map(|mut s| {
                for mount in &mut s.mounts {
                    if mount.kind == "volume" {
                        if let Some(name) = &mount.name {
                            mount.source = name.clone();
                        }
                    }
                }
                serde_json::to_value(s)
            })
            .transpose()
            .map_err(|_| RecoveryError {
                code: "unsupported".into(),
                message: "Effective configuration cannot be encoded.".into(),
            })?;
        Ok(Snapshot {
            source: SourceIdentity {
                session_id: self.connection.session_id.clone(),
                container_id: c.summary.id,
                name: c.summary.name,
            },
            stopped: matches!(
                c.summary.state,
                ContainerState::Created | ContainerState::Exited
            ),
            configuration,
            unsupported_fields: c.unsupported_fields,
            volumes,
            unsupported_mounts,
        })
    }
    fn named_volumes_supported(&self) -> bool {
        false
    }
    fn free_bytes(&self, directory: &Path) -> RecoveryResult<u64> {
        free_disk_bytes(directory)
    }
    fn validate_configuration(&self, value: &Value) -> RecoveryResult<()> {
        let mut spec: ContainerCreateSpec =
            serde_json::from_value(value.clone()).map_err(|_| RecoveryError {
                code: "unsupported".into(),
                message: "Unsupported effective container configuration.".into(),
            })?;
        spec.start = false;
        create_args(&spec)?;
        Ok(())
    }
    fn export_rootfs(&self, id: &str, path: &Path) -> RecoveryResult<()> {
        let path_arg = path.to_str().ok_or_else(|| RecoveryError {
            code: "validation".into(),
            message: "Invalid backup staging path.".into(),
        })?;
        let output = self.service.execute_scoped_file(
            self.connection,
            &[
                "container".into(),
                "export".into(),
                "--output".into(),
                path_arg.into(),
                id.into(),
            ],
            path,
            Limits::default().member_bytes,
            Duration::from_secs(1800),
        )?;
        success(&output)?;
        Ok(())
    }
    fn export_volume(&self, _: &VolumeRecord, _: &Path) -> RecoveryResult<()> {
        Err(unsupported())
    }
    fn container_name_exists(&self, name: &str) -> RecoveryResult<bool> {
        Ok(self
            .service
            .list(self.connection)?
            .iter()
            .any(|c| c.name.trim_start_matches('/') == name))
    }
    fn image_name_exists(&self, name: &str) -> RecoveryResult<bool> {
        for image in self.image_inventory()? {
            let repository = image
                .get("Repository")
                .and_then(Value::as_str)
                .ok_or_else(|| RecoveryError {
                    code: "malformedOutput".into(),
                    message: "Image repository missing from inventory.".into(),
                })?;
            let tag = image
                .get("Tag")
                .and_then(Value::as_str)
                .ok_or_else(|| RecoveryError {
                    code: "malformedOutput".into(),
                    message: "Image tag missing from inventory.".into(),
                })?;
            if format!("{repository}:{tag}") == name {
                return Ok(true);
            }
        }
        Ok(false)
    }
    fn volume_name_exists(&self, _: &str) -> RecoveryResult<bool> {
        Err(unsupported())
    }
    fn import_image(&self, path: &Path, name: &str) -> RecoveryResult<String> {
        let path = path.to_str().ok_or_else(|| RecoveryError {
            code: "validation".into(),
            message: "Invalid root filesystem path.".into(),
        })?;
        let result = self.command(
            vec![
                "image".into(),
                "import".into(),
                "--no-trunc".into(),
                path.into(),
                name.into(),
            ],
            Duration::from_secs(1800),
        );
        let bytes = match result {
            Ok(b) => b,
            Err(e) => return Err(self.cleanup_import_error(name, e)),
        };
        let id = std::str::from_utf8(&bytes).unwrap_or("").trim();
        let digest = id.strip_prefix("sha256:").unwrap_or(id);
        if digest.len() != 64 || !digest.bytes().all(|c| c.is_ascii_hexdigit()) {
            return Err(self.cleanup_import_error(
                name,
                RecoveryError {
                    code: "malformedOutput".into(),
                    message: "Imported image identity could not be verified.".into(),
                },
            ));
        }
        let exists = self
            .image_name_exists(name)
            .map_err(|e| self.cleanup_import_error(name, e))?;
        if !exists {
            return Err(self.cleanup_import_error(
                name,
                RecoveryError {
                    code: "commandFailed".into(),
                    message: "Imported image reference was not found in the captured session."
                        .into(),
                },
            ));
        }
        Ok(name.into())
    }
    fn create_volume(&self, _: &str) -> RecoveryResult<String> {
        Err(unsupported())
    }
    fn import_volume(&self, _: &str, _: &Path) -> RecoveryResult<()> {
        Err(unsupported())
    }
    fn create_container(
        &self,
        config: &Value,
        image: &str,
        name: &str,
        volumes: &BTreeMap<String, String>,
    ) -> RecoveryResult<String> {
        if !volumes.is_empty() {
            return Err(unsupported());
        }
        let mut spec: ContainerCreateSpec =
            serde_json::from_value(config.clone()).map_err(|_| RecoveryError {
                code: "unsupported".into(),
                message: "Invalid restore configuration.".into(),
            })?;
        spec.name = name.into();
        spec.image = image.into();
        spec.start = false;
        let result = self.service.create_existing_image(self.connection, &spec)?;
        let c = result.container.ok_or_else(|| RecoveryError {
            code: "commandFailed".into(),
            message: "Restored container could not be inspected.".into(),
        })?;
        Ok(c.summary.id)
    }
    fn remove_container(&self, id: &str) -> RecoveryResult<()> {
        self.service
            .action(self.connection, id, ContainerAction::Remove)?;
        Ok(())
    }
    fn remove_volume(&self, _: &str) -> RecoveryResult<()> {
        Err(unsupported())
    }
    fn remove_image(&self, name: &str) -> RecoveryResult<()> {
        self.command(
            vec![
                "image".into(),
                "rm".into(),
                "--no-prune".into(),
                name.into(),
            ],
            Duration::from_secs(60),
        )?;
        Ok(())
    }
}
#[cfg(windows)]
fn free_disk_bytes(directory: &Path) -> RecoveryResult<u64> {
    use std::os::windows::ffi::OsStrExt;
    #[link(name = "kernel32")]
    extern "system" {
        fn GetDiskFreeSpaceExW(
            directory: *const u16,
            available: *mut u64,
            total: *mut u64,
            free: *mut u64,
        ) -> i32;
    }
    let p: Vec<u16> = directory.as_os_str().encode_wide().chain(Some(0)).collect();
    let mut available = 0u64;
    let result = unsafe {
        GetDiskFreeSpaceExW(
            p.as_ptr(),
            &mut available,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if result == 0 {
        return Err(RecoveryError {
            code: "capacity".into(),
            message: "Free space could not be determined for recovery staging.".into(),
        });
    }
    Ok(available)
}
#[cfg(not(windows))]
fn free_disk_bytes(_: &Path) -> RecoveryResult<u64> {
    Err(RecoveryError {
        code: "unsupported".into(),
        message: "Native WSLc recovery requires Windows.".into(),
    })
}
#[cfg(test)]
mod tests {
    use super::super::executor::CommandOutput;
    use super::*;
    use std::sync::Mutex;
    struct Spy {
        calls: Mutex<Vec<Vec<String>>>,
        fail: bool,
    }
    impl Executor for Spy {
        fn execute(&self, a: &[String], _: Duration) -> Result<CommandOutput, ContainerError> {
            self.calls.lock().unwrap().push(a.to_vec());
            let (stdout, success) = if a[0] == "system" {
                (br#"{"Client":{"Version":"3.0.1"},"Server":{"Sessions":[{"ID":1,"Name":"wslc-cli-test"}]}}"#.to_vec(),true)
            } else if a[3] == "import" {
                (
                    format!("sha256:{}\n", "1".repeat(64)).into_bytes(),
                    !self.fail,
                )
            } else if a[2] == "image" {
                (br#"{"Repository":"wsl-ui-recovery/test","Tag":"snapshot","ID":"sha256:1111111111111111111111111111111111111111111111111111111111111111"}"#.to_vec(),!self.fail)
            } else {
                (vec![], !self.fail)
            };
            Ok(CommandOutput {
                stdout,
                stderr: vec![],
                success,
            })
        }
        fn terminal(&self, _: &[String]) -> Result<(), ContainerError> {
            panic!("Recovery must not launch a terminal")
        }
        fn default_session_name(&self) -> Result<String, ContainerError> {
            Ok("wslc-cli-test".into())
        }
        fn execute_with_file_limit(
            &self,
            a: &[String],
            _: &Path,
            max: u64,
            t: Duration,
        ) -> Result<CommandOutput, ContainerError> {
            assert_eq!(max, 16 * 1024 * 1024 * 1024);
            self.execute(a, t)
        }
    }
    fn connection() -> ContainerConnection {
        ContainerConnection {
            session_name: "wslc-cli-test".into(),
            session_id: "1".into(),
            runtime_version: "3.0.1".into(),
        }
    }
    #[test]
    fn failed_native_command_is_not_reported_as_success() {
        let s = Service::new(Spy {
            calls: Mutex::new(vec![]),
            fail: true,
        });
        let c = connection();
        let r = NativeRecovery {
            service: &s,
            connection: &c,
        };
        assert!(r
            .command(vec!["image".into(), "list".into()], Duration::from_secs(1))
            .is_err());
        assert!(r
            .export_rootfs(&"a".repeat(64), Path::new(r"C:\test-owned\rootfs.tar"))
            .is_err());
    }
    #[test]
    fn native_export_options_precede_anchored_container_id() {
        let s = Service::new(Spy {
            calls: Mutex::new(vec![]),
            fail: false,
        });
        let c = connection();
        let r = NativeRecovery {
            service: &s,
            connection: &c,
        };
        r.export_rootfs(&"a".repeat(64), Path::new(r"C:\test-owned\rootfs.tar"))
            .unwrap();
        let calls = s.executor.calls.lock().unwrap();
        let call = calls.iter().find(|a| a[0] == "--session").unwrap();
        assert_eq!(
            call,
            &vec![
                "--session".to_string(),
                "wslc-cli-test".into(),
                "container".into(),
                "export".into(),
                "--output".into(),
                r"C:\test-owned\rootfs.tar".into(),
                "a".repeat(64)
            ]
        );
    }
    #[test]
    fn native_import_options_precede_anchored_path_and_uses_unique_tag() {
        let s = Service::new(Spy {
            calls: Mutex::new(vec![]),
            fail: false,
        });
        let c = connection();
        let r = NativeRecovery {
            service: &s,
            connection: &c,
        };
        assert_eq!(
            r.import_image(
                Path::new(r"C:\test-owned\rootfs.tar"),
                "wsl-ui-recovery/test:snapshot"
            )
            .unwrap(),
            "wsl-ui-recovery/test:snapshot"
        );
        let calls = s.executor.calls.lock().unwrap();
        let call = calls
            .iter()
            .find(|a| a.get(3).is_some_and(|v| v == "import"))
            .unwrap();
        assert_eq!(
            call,
            &vec![
                "--session".to_string(),
                "wslc-cli-test".into(),
                "image".into(),
                "import".into(),
                "--no-trunc".into(),
                r"C:\test-owned\rootfs.tar".into(),
                "wsl-ui-recovery/test:snapshot".into()
            ]
        );
    }
}
#[cfg(all(test, windows))]
mod integration_tests {
    use super::super::mock::MockExecutor;
    use super::*;
    #[test]
    fn service_mock_roundtrip_uses_native_adapter_archive_and_parser() {
        let service = Service::new(MockExecutor::new());
        let connection = service.connect().unwrap();
        let original = service
            .create(
                &connection,
                &ContainerCreateSpec {
                    name: "recovery-source".into(),
                    image: "nginx:stable".into(),
                    start: false,
                    ports: vec![ContainerPort {
                        host_ip: "127.0.0.1".into(),
                        host_port: 12345,
                        container_port: 80,
                        protocol: "tcp".into(),
                    }],
                    mounts: vec![],
                    environment: vec![ContainerEnvironment {
                        key: "RECOVERY_TEST".into(),
                        value: "sensitive retained value".into(),
                    }],
                    command: vec!["/bin/service".into(), "--test".into()],
                    entrypoint: Some("/bin/entry".into()),
                    working_directory: Some("/data".into()),
                    user: Some("1000".into()),
                    cpus: Some(1.5),
                    memory_mb: Some(64),
                },
            )
            .unwrap()
            .container
            .unwrap();
        let runtime = NativeRecovery {
            service: &service,
            connection: &connection,
        };
        assert!(preflight(&runtime, &original.summary.id).unwrap().supported);
        let directory = std::env::temp_dir().join(format!(
            "wslc-native-adapter-test-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir(&directory).unwrap();
        struct Cleanup(std::path::PathBuf);
        impl Drop for Cleanup {
            fn drop(&mut self) {
                std::fs::remove_dir_all(&self.0).unwrap();
            }
        }
        let _cleanup = Cleanup(directory.clone());
        let path = directory.join("roundtrip.wslcbackup");
        backup(
            &runtime,
            &original.summary.id,
            &path,
            &connection.runtime_version,
            Limits::default(),
        )
        .unwrap();
        let out = restore(&runtime, &path, "recovery-restored", Limits::default()).unwrap();
        let restored = service.inspect(&connection, &out.container_id).unwrap();
        assert_ne!(out.container_id, original.summary.id);
        assert_eq!(restored.summary.state, ContainerState::Created);
        let original = original.configuration.unwrap();
        let restored = restored.configuration.unwrap();
        assert_eq!(restored.environment, original.environment);
        assert_eq!(restored.command, original.command);
        assert_eq!(restored.entrypoint, original.entrypoint);
        assert_eq!(restored.user, original.user);
        assert_eq!(restored.working_directory, original.working_directory);
        assert_eq!(restored.ports, original.ports);
        assert_eq!(restored.cpus, original.cpus);
        assert_eq!(restored.memory_mb, original.memory_mb);
        assert_eq!(service.list(&connection).unwrap().len(), 4);
        assert!(!preflight(&runtime, &"b".repeat(64)).unwrap().supported);
    }
}
