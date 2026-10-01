//! Recovery bundles own the outer tar; Linux filesystem archives remain opaque.
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::BTreeMap,
    fs, io,
    path::{Path, PathBuf},
};
pub type RecoveryResult<T> = Result<T, RecoveryError>;
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveryError {
    pub code: String,
    pub message: String,
}
impl RecoveryError {
    fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
impl From<io::Error> for RecoveryError {
    fn from(_: io::Error) -> Self {
        Self::new(
            "io",
            "Recovery file operation failed; check permissions and free space.",
        )
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SourceIdentity {
    pub session_id: String,
    pub container_id: String,
    pub name: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MemberDigest {
    pub bytes: u64,
    pub sha256: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct VolumeRecord {
    pub key: String,
    pub source_name: String,
    pub target: String,
    pub read_only: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct Manifest {
    pub schema_version: u32,
    pub complete: bool,
    pub app_version: String,
    pub runtime_version: String,
    pub platform: String,
    pub created_at: String,
    pub source: SourceIdentity,
    pub volumes: Vec<VolumeRecord>,
    pub members: BTreeMap<String, MemberDigest>,
    pub exclusions: Vec<String>,
}
#[derive(Clone, Debug)]
pub struct Snapshot {
    pub source: SourceIdentity,
    pub stopped: bool,
    pub configuration: Option<Value>,
    pub unsupported_fields: Vec<String>,
    pub volumes: Vec<VolumeRecord>,
    pub unsupported_mounts: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Coverage {
    pub supported: bool,
    pub root_filesystem: bool,
    pub configuration: bool,
    pub named_volumes: Vec<String>,
    pub blockers: Vec<String>,
    pub warnings: Vec<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupResult {
    pub path: String,
    pub bytes: u64,
    pub manifest_version: u32,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RestoreResult {
    pub container_id: String,
    pub name: String,
    pub volume_names: Vec<String>,
    pub warning: Option<String>,
}
#[derive(Clone, Copy, Debug)]
pub struct Limits {
    pub member_bytes: u64,
    pub total_bytes: u64,
    pub metadata_bytes: u64,
    pub members: usize,
}
impl Default for Limits {
    fn default() -> Self {
        Self {
            member_bytes: 16 * 1024 * 1024 * 1024,
            total_bytes: 64 * 1024 * 1024 * 1024,
            metadata_bytes: 1024 * 1024,
            members: 66,
        }
    }
}
/// The runtime must revalidate the captured session on every operation. Resource
/// creation must return only identities created by this attempt; cleanup may use only those.
pub trait RecoveryRuntime {
    fn inspect(&self, id: &str) -> RecoveryResult<Snapshot>;
    fn named_volumes_supported(&self) -> bool;
    fn free_bytes(&self, directory: &Path) -> RecoveryResult<u64>;
    fn validate_configuration(&self, value: &Value) -> RecoveryResult<()>;
    fn export_rootfs(&self, id: &str, path: &Path) -> RecoveryResult<()>;
    fn export_volume(&self, volume: &VolumeRecord, path: &Path) -> RecoveryResult<()>;
    fn container_name_exists(&self, name: &str) -> RecoveryResult<bool>;
    fn image_name_exists(&self, name: &str) -> RecoveryResult<bool>;
    fn volume_name_exists(&self, name: &str) -> RecoveryResult<bool>;
    fn import_image(&self, path: &Path, name: &str) -> RecoveryResult<String>;
    fn create_volume(&self, name: &str) -> RecoveryResult<String>;
    fn import_volume(&self, id: &str, path: &Path) -> RecoveryResult<()>;
    fn create_container(
        &self,
        config: &Value,
        image: &str,
        name: &str,
        volumes: &BTreeMap<String, String>,
    ) -> RecoveryResult<String>;
    fn remove_container(&self, id: &str) -> RecoveryResult<()>;
    fn remove_volume(&self, id: &str) -> RecoveryResult<()>;
    fn remove_image(&self, id: &str) -> RecoveryResult<()>;
}
pub fn preflight<R: RecoveryRuntime>(runtime: &R, id: &str) -> RecoveryResult<Coverage> {
    coverage(runtime, &runtime.inspect(id)?)
}
fn coverage<R: RecoveryRuntime>(runtime: &R, snapshot: &Snapshot) -> RecoveryResult<Coverage> {
    let mut blockers = vec![];
    if !snapshot.stopped {
        blockers.push("Stop the container before backup. Running or unknown state cannot provide a consistent snapshot.".into());
    }
    blockers.extend(
        snapshot
            .unsupported_fields
            .iter()
            .map(|x| format!("Unsupported configuration: {x}")),
    );
    blockers.extend(
        snapshot
            .unsupported_mounts
            .iter()
            .map(|x| format!("Unsupported mount: {x}")),
    );
    let configuration = if let Some(c) = &snapshot.configuration {
        match validate_config(c).and_then(|_| runtime.validate_configuration(c)) {
            Ok(()) => true,
            Err(e) => {
                blockers.push(e.message);
                false
            }
        }
    } else {
        blockers.push("Effective container configuration cannot be reconstructed.".into());
        false
    };
    if !snapshot.volumes.is_empty() && !runtime.named_volumes_supported() {
        blockers.push("Named-volume backup helper has not passed the stable-runtime metadata and restore verification gate.".into());
    }
    if let Err(e) = validate_volumes(&snapshot.volumes, snapshot.configuration.as_ref()) {
        blockers.push(e.message);
    }
    Ok(Coverage{supported:blockers.is_empty(),root_filesystem:snapshot.stopped,configuration,named_volumes:snapshot.volumes.iter().map(|v|v.source_name.clone()).collect(),blockers,warnings:vec!["Backups contain environment secrets and application data; store them privately.".into(),"Original image history, signatures and provenance are not retained. Restore creates a stopped container.".into()]})
}
fn invalid(message: &str) -> RecoveryError {
    RecoveryError::new("invalidBackup", message)
}
fn valid_name(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 80
        && s.as_bytes()[0].is_ascii_alphanumeric()
        && s.bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'_' | b'-' | b'.'))
}
fn valid_key(s: &str) -> bool {
    s.len() == 4 && s.starts_with('v') && s.as_bytes()[1..].iter().all(u8::is_ascii_digit)
}
fn validate_config(v: &Value) -> RecoveryResult<()> {
    let o = v
        .as_object()
        .ok_or_else(|| invalid("Container configuration must be an object."))?;
    let fields = [
        "name",
        "image",
        "start",
        "ports",
        "mounts",
        "environment",
        "command",
        "entrypoint",
        "workingDirectory",
        "user",
        "cpus",
        "memoryMb",
    ];
    if o.len() != fields.len() || o.keys().any(|k| !fields.contains(&k.as_str())) {
        return Err(invalid(
            "Container configuration has missing or unsupported fields.",
        ));
    }
    if !o["name"].as_str().is_some_and(valid_name)
        || !o["image"].as_str().is_some_and(|s| {
            !s.is_empty() && !s.starts_with('-') && !s.chars().any(char::is_control)
        })
        || !o["start"].is_boolean()
    {
        return Err(invalid("Invalid container identity or start setting."));
    }
    for k in ["ports", "mounts", "environment", "command"] {
        if !o[k].is_array() {
            return Err(invalid("Invalid container configuration arrays."));
        }
    }
    if o["command"]
        .as_array()
        .unwrap()
        .iter()
        .any(|v| !v.as_str().is_some_and(|s| !s.contains('\0')))
    {
        return Err(invalid("Invalid process arguments."));
    }
    for k in ["entrypoint", "workingDirectory", "user"] {
        if !o[k].is_null() && !o[k].as_str().is_some_and(|s| !s.contains('\0')) {
            return Err(invalid("Invalid process configuration."));
        }
    }
    for k in ["cpus", "memoryMb"] {
        if !o[k].is_null() && !o[k].as_f64().is_some_and(|n| n.is_finite() && n > 0.) {
            return Err(invalid("Invalid resource limits."));
        }
    }
    for e in o["environment"].as_array().unwrap() {
        let e = e
            .as_object()
            .ok_or_else(|| invalid("Invalid environment entry."))?;
        if e.len() != 2
            || !e
                .get("key")
                .and_then(Value::as_str)
                .is_some_and(|s| !s.is_empty() && !s.contains(['\0', '=']))
            || !e
                .get("value")
                .and_then(Value::as_str)
                .is_some_and(|s| !s.contains('\0'))
        {
            return Err(invalid("Invalid environment entry."));
        }
    }
    for p in o["ports"].as_array().unwrap() {
        let p = p
            .as_object()
            .ok_or_else(|| invalid("Invalid published port."))?;
        if p.len() != 4
            || !p
                .get("hostIp")
                .and_then(Value::as_str)
                .is_some_and(|s| s.parse::<std::net::IpAddr>().is_ok())
            || !["hostPort", "containerPort"].iter().all(|k| {
                p.get(*k)
                    .and_then(Value::as_u64)
                    .is_some_and(|n| n > 0 && n <= 65535)
            })
            || !p
                .get("protocol")
                .and_then(Value::as_str)
                .is_some_and(|s| s == "tcp" || s == "udp")
        {
            return Err(invalid("Invalid published port."));
        }
    }
    for m in o["mounts"].as_array().unwrap() {
        let m = m
            .as_object()
            .ok_or_else(|| invalid("Invalid named volume mount."))?;
        if m.len() != 5
            || m.get("kind").and_then(Value::as_str) != Some("volume")
            || !m
                .get("source")
                .and_then(Value::as_str)
                .is_some_and(valid_name)
            || !m
                .get("name")
                .and_then(Value::as_str)
                .is_some_and(valid_name)
            || !m.get("target").and_then(Value::as_str).is_some_and(|s| {
                s.starts_with('/') && !s.contains('\0') && !s.split('/').any(|p| p == "..")
            })
            || !m.get("readOnly").is_some_and(Value::is_boolean)
        {
            return Err(invalid(
                "Only explicit local named-volume mounts are supported.",
            ));
        }
    }
    Ok(())
}
fn validate_volumes(volumes: &[VolumeRecord], config: Option<&Value>) -> RecoveryResult<()> {
    let mut keys = std::collections::BTreeSet::new();
    let mut targets = std::collections::BTreeSet::new();
    let mut sources = std::collections::BTreeSet::new();
    for v in volumes {
        if !valid_key(&v.key)
            || !valid_name(&v.source_name)
            || !v.target.starts_with('/')
            || v.target.contains('\0')
            || v.target.split('/').any(|s| s == "..")
            || !keys.insert(&v.key)
            || !targets.insert(&v.target)
            || !sources.insert(&v.source_name)
        {
            return Err(invalid(
                "Invalid, duplicate or unsupported volume inventory.",
            ));
        }
    }
    let mounts = config
        .and_then(|c| c.get("mounts"))
        .and_then(Value::as_array)
        .ok_or_else(|| invalid("Missing mount coverage inventory."))?;
    if mounts.len() != volumes.len()
        || volumes.iter().any(|v| {
            !mounts.iter().any(|m| {
                m["kind"] == "volume"
                    && m["source"] == v.source_name
                    && m["name"] == v.source_name
                    && m["target"] == v.target
                    && m["readOnly"] == v.read_only
            })
        })
    {
        return Err(invalid(
            "Named-volume inventory does not exactly cover configuration mounts.",
        ));
    }
    Ok(())
}
#[cfg(windows)]
mod windows_staging {
    use std::{ffi::c_void, io, os::windows::ffi::OsStrExt, path::Path};
    #[repr(C)]
    struct SecurityAttributes {
        length: u32,
        descriptor: *mut c_void,
        inherit: i32,
    }
    #[link(name = "advapi32")]
    extern "system" {
        fn OpenProcessToken(process: *mut c_void, access: u32, token: *mut *mut c_void) -> i32;
        fn GetTokenInformation(
            token: *mut c_void,
            class: u32,
            info: *mut c_void,
            len: u32,
            needed: *mut u32,
        ) -> i32;
        fn ConvertSidToStringSidW(sid: *mut c_void, string: *mut *mut u16) -> i32;
        fn ConvertStringSecurityDescriptorToSecurityDescriptorW(
            string: *const u16,
            revision: u32,
            descriptor: *mut *mut c_void,
            size: *mut u32,
        ) -> i32;
        fn GetNamedSecurityInfoW(
            name: *mut u16,
            kind: u32,
            information: u32,
            owner: *mut *mut c_void,
            group: *mut *mut c_void,
            dacl: *mut *mut c_void,
            sacl: *mut *mut c_void,
            descriptor: *mut *mut c_void,
        ) -> u32;
        fn ConvertSecurityDescriptorToStringSecurityDescriptorW(
            descriptor: *mut c_void,
            revision: u32,
            information: u32,
            string: *mut *mut u16,
            length: *mut u32,
        ) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> *mut c_void;
        fn CloseHandle(handle: *mut c_void) -> i32;
        fn LocalFree(memory: *mut c_void) -> *mut c_void;
        fn CreateDirectoryW(path: *const u16, attributes: *const SecurityAttributes) -> i32;
    }
    struct Allocation(*mut c_void);
    impl Drop for Allocation {
        fn drop(&mut self) {
            unsafe {
                LocalFree(self.0);
            }
        }
    }
    unsafe fn wide_string(pointer: *const u16) -> io::Result<String> {
        let mut length = 0;
        while length < 4096 && *pointer.add(length) != 0 {
            length += 1;
        }
        if length == 4096 {
            return Err(io::Error::other("Oversized Windows security identifier"));
        }
        String::from_utf16(std::slice::from_raw_parts(pointer, length))
            .map_err(|_| io::Error::other("Invalid Windows security identifier"))
    }
    pub(super) fn current_sid() -> io::Result<String> {
        unsafe {
            let mut token = std::ptr::null_mut();
            if OpenProcessToken(GetCurrentProcess(), 8, &mut token) == 0 {
                return Err(io::Error::last_os_error());
            }
            struct Token(*mut c_void);
            impl Drop for Token {
                fn drop(&mut self) {
                    unsafe {
                        CloseHandle(self.0);
                    }
                }
            }
            let token = Token(token);
            let mut needed = 0;
            GetTokenInformation(token.0, 1, std::ptr::null_mut(), 0, &mut needed);
            if needed == 0 || needed > 65536 {
                return Err(io::Error::other("Windows token identity unavailable"));
            }
            let mut buffer = vec![
                0usize;
                (needed as usize + std::mem::size_of::<usize>() - 1)
                    / std::mem::size_of::<usize>()
            ];
            if GetTokenInformation(token.0, 1, buffer.as_mut_ptr().cast(), needed, &mut needed) == 0
            {
                return Err(io::Error::last_os_error());
            }
            let sid = *(buffer.as_ptr() as *const *mut c_void);
            let mut string = std::ptr::null_mut();
            if ConvertSidToStringSidW(sid, &mut string) == 0 {
                return Err(io::Error::last_os_error());
            }
            let _owned = Allocation(string.cast());
            wide_string(string)
        }
    }
    pub(super) fn create_with_sddl(path: &Path, sddl: &str) -> io::Result<()> {
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        let sddl: Vec<u16> = sddl.encode_utf16().chain(Some(0)).collect();
        unsafe {
            let mut descriptor = std::ptr::null_mut();
            if ConvertStringSecurityDescriptorToSecurityDescriptorW(
                sddl.as_ptr(),
                1,
                &mut descriptor,
                std::ptr::null_mut(),
            ) == 0
            {
                return Err(io::Error::last_os_error());
            }
            let _descriptor = Allocation(descriptor);
            let attributes = SecurityAttributes {
                length: std::mem::size_of::<SecurityAttributes>() as u32,
                descriptor,
                inherit: 0,
            };
            if CreateDirectoryW(wide.as_ptr(), &attributes) == 0 {
                return Err(io::Error::last_os_error());
            }
            Ok(())
        }
    }
    pub(super) fn create_private(path: &Path) -> io::Result<()> {
        let sid = current_sid()?;
        let expected = format!("D:P(A;OICI;FA;;;{sid})");
        create_with_sddl(path, &format!("O:{sid}{expected}"))?;
        // Some filesystems cannot preserve Windows ACLs. Check the effective
        // descriptor before any secrets or filesystem contents are written.
        match dacl_sddl(path) {
            Ok(actual) if actual == expected => Ok(()),
            _ => {
                let _ = std::fs::remove_dir(path);
                Err(io::Error::new(
                    io::ErrorKind::PermissionDenied,
                    "Private staging ACL could not be verified",
                ))
            }
        }
    }
    pub(super) fn dacl_sddl(path: &Path) -> io::Result<String> {
        let mut name: Vec<u16> = path.as_os_str().encode_wide().chain(Some(0)).collect();
        unsafe {
            let mut descriptor = std::ptr::null_mut();
            let result = GetNamedSecurityInfoW(
                name.as_mut_ptr(),
                1,
                4,
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                std::ptr::null_mut(),
                &mut descriptor,
            );
            if result != 0 {
                return Err(io::Error::from_raw_os_error(result as i32));
            }
            let _descriptor = Allocation(descriptor);
            let mut string = std::ptr::null_mut();
            if ConvertSecurityDescriptorToStringSecurityDescriptorW(
                descriptor,
                1,
                4,
                &mut string,
                std::ptr::null_mut(),
            ) == 0
            {
                return Err(io::Error::last_os_error());
            }
            let _string = Allocation(string.cast());
            wide_string(string)
        }
    }
}

#[cfg(windows)]
fn create_private_directory(path: &Path) -> io::Result<()> {
    windows_staging::create_private(path)
}
#[cfg(unix)]
fn create_private_directory(path: &Path) -> io::Result<()> {
    use std::os::unix::fs::DirBuilderExt;
    fs::DirBuilder::new().mode(0o700).create(path)
}
#[cfg(not(any(windows, unix)))]
fn create_private_directory(_: &Path) -> io::Result<()> {
    Err(io::Error::other(
        "Private recovery staging is unavailable on this platform",
    ))
}
struct WorkDir(PathBuf);
impl WorkDir {
    fn finish<T>(&self, result: RecoveryResult<T>, completed: &str) -> RecoveryResult<T> {
        match fs::remove_dir_all(&self.0) {
            Ok(()) => result,
            Err(error) if error.kind() == io::ErrorKind::NotFound => result,
            Err(_) => {
                let detail = format!(" Staging cleanup failed; private recovery data may remain at {}. Remove only this owned directory after its files are released.", self.0.display());
                match result {
                    Ok(_) => Err(RecoveryError::new(
                        "cleanupFailed",
                        &format!("{completed}{detail}"),
                    )),
                    Err(mut error) => {
                        error.message.push_str(&detail);
                        Err(error)
                    }
                }
            }
        }
    }
    fn new(parent: &Path) -> RecoveryResult<Self> {
        static SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        for _ in 0..32 {
            let n = SEQ.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let t = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map_err(|_| invalid("System clock unavailable."))?
                .as_nanos();
            let p = parent.join(format!(".wslc-recovery-{}-{t}-{n}", std::process::id()));
            match create_private_directory(&p) {
                Ok(()) => return Ok(Self(p)),
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(e.into()),
            }
        }
        Err(invalid("Cannot allocate a private recovery directory."))
    }
}
impl Drop for WorkDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}
fn check_capacity<R: RecoveryRuntime>(r: &R, p: &Path, bytes: u64) -> RecoveryResult<()> {
    if r.free_bytes(p)? < bytes {
        return Err(RecoveryError::new(
            "capacity",
            "Insufficient free space for recovery staging.",
        ));
    }
    Ok(())
}
fn digest_file(path: &Path, max: u64) -> RecoveryResult<MemberDigest> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut f = fs::File::open(path)?;
    let n = f.metadata()?.len();
    if n == 0 || n > max {
        return Err(invalid(
            "Recovery member is empty or exceeds the size limit.",
        ));
    }
    let mut hash = Sha256::new();
    let mut bytes = 0u64;
    let mut buf = [0u8; 65536];
    loop {
        let n = f.read(&mut buf)?;
        if n == 0 {
            break;
        }
        bytes = bytes
            .checked_add(n as u64)
            .ok_or_else(|| invalid("Size overflow."))?;
        if bytes > max {
            return Err(invalid("Recovery member exceeds the size limit."));
        }
        hash.update(&buf[..n]);
    }
    Ok(MemberDigest {
        bytes,
        sha256: hex::encode(hash.finalize()),
    })
}
pub fn backup<R: RecoveryRuntime>(
    runtime: &R,
    id: &str,
    path: &Path,
    runtime_version: &str,
    limits: Limits,
) -> RecoveryResult<BackupResult> {
    if !path.is_absolute() || path.extension().and_then(|s| s.to_str()) != Some("wslcbackup") {
        return Err(RecoveryError::new(
            "validation",
            "Select an absolute .wslcbackup output path.",
        ));
    }
    if path.try_exists()? {
        return Err(RecoveryError::new(
            "conflict",
            "The selected backup file already exists.",
        ));
    }
    let parent = path
        .parent()
        .ok_or_else(|| invalid("Missing output directory."))?;
    check_capacity(runtime, parent, 64 * 1024 * 1024)?;
    let snapshot = runtime.inspect(id)?;
    let c = coverage(runtime, &snapshot)?;
    if !c.supported {
        return Err(RecoveryError::new("unsupported", &c.blockers.join(" ")));
    }
    let config = snapshot.configuration.as_ref().unwrap();
    let work = WorkDir::new(parent)?;
    let result: RecoveryResult<BackupResult> = (|| {
        let config_bytes =
            serde_json::to_vec(config).map_err(|_| invalid("Cannot encode configuration."))?;
        if config_bytes.len() as u64 > limits.metadata_bytes {
            return Err(invalid("Configuration exceeds metadata size limit."));
        }
        fs::write(work.0.join("container.json"), config_bytes)?;
        runtime.export_rootfs(id, &work.0.join("rootfs.tar"))?;
        fs::create_dir(work.0.join("volumes"))?;
        let mut names = vec!["container.json".to_string(), "rootfs.tar".to_string()];
        for v in &snapshot.volumes {
            let name = format!("volumes/{}.tar", v.key);
            runtime.export_volume(v, &work.0.join(&name))?;
            names.push(name);
        }
        let after = runtime.inspect(id)?;
        if !after.stopped
            || after.source.container_id != snapshot.source.container_id
            || after.source.session_id != snapshot.source.session_id
            || after.configuration != snapshot.configuration
        {
            return Err(RecoveryError::new(
                "conflict",
                "Container or session changed during backup; no bundle was published.",
            ));
        }
        let mut members = BTreeMap::new();
        let mut total = 0u64;
        for name in &names {
            let max = if name == "container.json" {
                limits.metadata_bytes
            } else {
                limits.member_bytes
            };
            let digest = digest_file(&work.0.join(name), max)?;
            total = total
                .checked_add(digest.bytes)
                .ok_or_else(|| invalid("Size overflow."))?;
            members.insert(name.clone(), digest);
        }
        if total > limits.total_bytes || names.len() + 1 > limits.members {
            return Err(invalid("Backup exceeds bundle limits."));
        }
        check_capacity(runtime, parent, total.saturating_add(2 * 1024 * 1024))?;
        let created_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| invalid("System clock unavailable."))?
            .as_secs()
            .to_string();
        let manifest = Manifest {
            schema_version: 1,
            complete: true,
            app_version: env!("CARGO_PKG_VERSION").into(),
            runtime_version: runtime_version.into(),
            platform: format!("linux/{}", std::env::consts::ARCH),
            created_at,
            source: snapshot.source,
            volumes: snapshot.volumes,
            members,
            exclusions: vec![],
        };
        let bytes =
            serde_json::to_vec(&manifest).map_err(|_| invalid("Cannot encode manifest."))?;
        if bytes.len() as u64 > limits.metadata_bytes {
            return Err(invalid("Manifest exceeds metadata limit."));
        }
        fs::write(work.0.join("manifest.json"), bytes)?;
        let partial = work.0.join("bundle.partial");
        let f = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&partial)?;
        let mut archive = tar::Builder::new(f);
        append_regular(&mut archive, "manifest.json", &work.0.join("manifest.json"))?;
        for n in &names {
            append_regular(&mut archive, n, &work.0.join(n))?;
        }
        archive.finish()?;
        let f = archive.into_inner()?;
        f.sync_all()?;
        let bytes = f.metadata()?.len();
        drop(f);
        // hard_link publishes atomically with create-if-absent semantics, including on Windows.
        // Filesystems without hardlink support fail safely, retaining any existing destination.
        fs::hard_link(&partial, path).map_err(|e| {
            if e.kind() == io::ErrorKind::AlreadyExists {
                RecoveryError::new(
                    "conflict",
                    "Backup destination was created by another operation.",
                )
            } else {
                e.into()
            }
        })?;
        Ok(BackupResult {
            path: path.to_string_lossy().into(),
            bytes,
            manifest_version: 1,
        })
    })();
    work.finish(
        result,
        &format!("Backup was created at {}.", path.display()),
    )
}
fn append_regular(b: &mut tar::Builder<fs::File>, name: &str, path: &Path) -> RecoveryResult<()> {
    let mut f = fs::File::open(path)?;
    let mut h = tar::Header::new_ustar();
    h.set_size(f.metadata()?.len());
    h.set_mode(0o600);
    h.set_entry_type(tar::EntryType::Regular);
    h.set_cksum();
    b.append_data(&mut h, name, &mut f)?;
    Ok(())
}
fn allowed_member(s: &str) -> bool {
    s == "manifest.json"
        || s == "container.json"
        || s == "rootfs.tar"
        || s.strip_prefix("volumes/")
            .and_then(|s| s.strip_suffix(".tar"))
            .is_some_and(valid_key)
}
fn validate_bundle(
    path: &Path,
    directory: &Path,
    limits: Limits,
) -> RecoveryResult<(Manifest, Value)> {
    use std::io::Read;
    let f = fs::File::open(path)?;
    if f.metadata()?.len() > limits.total_bytes.saturating_add(2 * 1024 * 1024) {
        return Err(invalid("Bundle exceeds total size limit."));
    }
    let mut archive = tar::Archive::new(f);
    let mut observed = BTreeMap::new();
    let mut total = 0u64;
    fs::create_dir(directory.join("volumes"))?;
    // Raw entries reject PAX/GNU extensions, sparse entries and links instead of interpreting paths.
    for e in archive.entries()?.raw(true) {
        let mut e = e.map_err(|_| invalid("Malformed outer archive."))?;
        let raw = e.path_bytes();
        let name = std::str::from_utf8(raw.as_ref())
            .map_err(|_| invalid("Non-UTF8 archive path."))?
            .to_string();
        if !allowed_member(&name)
            || !e.header().entry_type().is_file()
            || observed.contains_key(&name)
        {
            return Err(invalid("Unsafe, duplicate or unsupported archive member."));
        }
        if observed.len() >= limits.members {
            return Err(invalid("Too many archive members."));
        }
        let n = e.size();
        let max = if name.ends_with(".json") {
            limits.metadata_bytes
        } else {
            limits.member_bytes
        };
        if n == 0 || n > max {
            return Err(invalid("Archive member exceeds size limit or is empty."));
        }
        total = total
            .checked_add(n)
            .ok_or_else(|| invalid("Size overflow."))?;
        if total > limits.total_bytes {
            return Err(invalid("Bundle exceeds total size limit."));
        }
        let target = directory.join(&name);
        let mut out = fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&target)?;
        let copied = io::copy(&mut e.by_ref().take(n + 1), &mut out)?;
        if copied != n {
            return Err(invalid("Truncated archive member."));
        }
        out.sync_all()?;
        drop(out);
        observed.insert(name, digest_file(&target, max)?);
    }
    let manifest_bytes = fs::read(directory.join("manifest.json"))
        .map_err(|_| invalid("Missing backup manifest."))?;
    let manifest: Manifest = serde_json::from_slice(&manifest_bytes)
        .map_err(|_| invalid("Unsupported or malformed backup manifest."))?;
    if manifest.platform != format!("linux/{}", std::env::consts::ARCH) {
        return Err(invalid(
            "Backup platform does not match this machine; emulated restoration is unsupported.",
        ));
    }
    if manifest.schema_version != 1
        || !manifest.complete
        || !manifest.exclusions.is_empty()
        || manifest.source.container_id.is_empty()
        || manifest.source.session_id.is_empty()
    {
        return Err(invalid(
            "Backup is incomplete, unsupported or excludes required data.",
        ));
    }
    observed.remove("manifest.json");
    if observed.len() != manifest.members.len()
        || !manifest.members.contains_key("container.json")
        || !manifest.members.contains_key("rootfs.tar")
    {
        return Err(invalid("Backup inventory is incomplete."));
    }
    for (name, d) in &manifest.members {
        if !allowed_member(name)
            || name == "manifest.json"
            || !observed
                .get(name)
                .is_some_and(|o| o.bytes == d.bytes && o.sha256 == d.sha256)
        {
            return Err(invalid("Backup checksum or inventory mismatch."));
        }
    }
    let config: Value = serde_json::from_slice(&fs::read(directory.join("container.json"))?)
        .map_err(|_| invalid("Malformed container configuration."))?;
    validate_config(&config)?;
    validate_volumes(&manifest.volumes, Some(&config))?;
    if manifest.members.len() != 2 + manifest.volumes.len()
        || manifest.volumes.iter().any(|v| {
            !manifest
                .members
                .contains_key(&format!("volumes/{}.tar", v.key))
        })
    {
        return Err(invalid("Persistent data inventory is incomplete."));
    }
    Ok((manifest, config))
}
pub fn restore<R: RecoveryRuntime>(
    runtime: &R,
    path: &Path,
    name: &str,
    limits: Limits,
) -> RecoveryResult<RestoreResult> {
    if !path.is_absolute()
        || path.extension().and_then(|s| s.to_str()) != Some("wslcbackup")
        || !valid_name(name)
    {
        return Err(RecoveryError::new(
            "validation",
            "Select an absolute .wslcbackup file and a valid new container name.",
        ));
    }
    if runtime.container_name_exists(name)? {
        return Err(RecoveryError::new(
            "conflict",
            "A container already uses the requested name.",
        ));
    }
    let temp = std::env::temp_dir();
    let bytes = fs::metadata(path)?.len();
    if bytes > limits.total_bytes.saturating_add(2 * 1024 * 1024) {
        return Err(invalid("Bundle exceeds total size limit."));
    }
    check_capacity(runtime, &temp, bytes.saturating_add(64 * 1024 * 1024))?;
    let work = WorkDir::new(&temp)?;
    let result: RecoveryResult<RestoreResult> = (|| {
        let (manifest, config) = validate_bundle(path, &work.0, limits)?;
        runtime.validate_configuration(&config)?;
        if !manifest.volumes.is_empty() && !runtime.named_volumes_supported() {
            return Err(RecoveryError::new(
                "unsupported",
                "Named-volume restore helper has not passed the stable-runtime verification gate.",
            ));
        }
        let nonce = work.0.file_name().unwrap().to_string_lossy();
        let image_name = format!("wsl-ui-recovery/{}:snapshot", nonce.trim_start_matches('.'));
        if runtime.image_name_exists(&image_name)? {
            return Err(RecoveryError::new(
                "conflict",
                "Restore image identity already exists.",
            ));
        }
        let mut mapping = BTreeMap::new();
        for v in &manifest.volumes {
            let vn = format!("{}-{}", nonce.trim_start_matches('.'), v.key);
            if runtime.volume_name_exists(&vn)? {
                return Err(RecoveryError::new(
                    "conflict",
                    "A new restore volume identity already exists.",
                ));
            }
            mapping.insert(v.source_name.clone(), vn);
        }
        let mut created_image = None;
        let mut created_volumes = vec![];
        let mut created_container = None;
        let attempt: RecoveryResult<RestoreResult> = (|| {
            let image = runtime.import_image(&work.0.join("rootfs.tar"), &image_name)?;
            created_image = Some(image.clone());
            for v in &manifest.volumes {
                let id = runtime.create_volume(&mapping[&v.source_name])?;
                created_volumes.push(id.clone());
                runtime.import_volume(&id, &work.0.join(format!("volumes/{}.tar", v.key)))?;
            }
            let id = runtime.create_container(&config, &image, name, &mapping)?;
            created_container = Some(id.clone());
            Ok(RestoreResult{container_id:id,name:name.into(),volume_names:mapping.values().cloned().collect(),warning:Some("Restored stopped. Original image history, signatures and provenance are not retained.".into())})
        })();
        match attempt {
            Ok(result) => Ok(result),
            Err(mut e) => {
                let mut cleanup_failed = false;
                if let Some(id) = created_container {
                    cleanup_failed |= runtime.remove_container(&id).is_err();
                }
                for id in created_volumes.iter().rev() {
                    cleanup_failed |= runtime.remove_volume(id).is_err();
                }
                if let Some(id) = created_image {
                    cleanup_failed |= runtime.remove_image(&id).is_err();
                }
                if cleanup_failed {
                    e.message.push_str(" Cleanup was incomplete; inspect resources created by this restore before retrying.");
                }
                Err(e)
            }
        }
    })();
    let completed = match &result {
        Ok(r) => format!(
            "Restored stopped container {} ({}); its runtime resources were retained.",
            r.name, r.container_id
        ),
        Err(_) => String::new(),
    };
    work.finish(result, &completed)
}
#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        cell::RefCell,
        sync::atomic::{AtomicU64, Ordering},
    };
    static SEQ: AtomicU64 = AtomicU64::new(0);
    struct TestDir(PathBuf);
    impl TestDir {
        fn new() -> Self {
            let p = std::env::temp_dir().join(format!(
                "wslc-recovery-test-{}-{}",
                std::process::id(),
                SEQ.fetch_add(1, Ordering::SeqCst)
            ));
            fs::create_dir(&p).unwrap();
            Self(p)
        }
    }
    impl Drop for TestDir {
        fn drop(&mut self) {
            fs::remove_dir_all(&self.0).unwrap();
        }
    }
    fn config() -> Value {
        serde_json::json!({"name":"original","image":"alpine:latest","start":false,"ports":[],"mounts":[],"environment":[{"key":"SECRET","value":"retained"}],"command":["/bin/service","--flag"],"entrypoint":null,"workingDirectory":"/data","user":"1000","cpus":null,"memoryMb":null})
    }
    fn snapshot() -> Snapshot {
        Snapshot {
            source: SourceIdentity {
                session_id: "session-a".into(),
                container_id: "a".repeat(64),
                name: "original".into(),
            },
            stopped: true,
            configuration: Some(config()),
            unsupported_fields: vec![],
            volumes: vec![],
            unsupported_mounts: vec![],
        }
    }
    struct Fake {
        snapshot: RefCell<Snapshot>,
        files: RefCell<BTreeMap<String, Vec<u8>>>,
        resources: RefCell<BTreeMap<String, String>>,
        restored: RefCell<Option<Value>>,
        fail_create: bool,
        support_volumes: bool,
        free: u64,
        #[cfg(windows)]
        lock_export: bool,
        #[cfg(windows)]
        fail_export: bool,
        #[cfg(windows)]
        held_files: RefCell<Vec<fs::File>>,
    }
    impl Fake {
        fn new() -> Self {
            Self {
                snapshot: RefCell::new(snapshot()),
                files: RefCell::new(BTreeMap::new()),
                resources: RefCell::new(BTreeMap::from([(
                    "existing-data".into(),
                    "volume".into(),
                )])),
                restored: RefCell::new(None),
                fail_create: false,
                support_volumes: true,
                free: u64::MAX,
                #[cfg(windows)]
                lock_export: false,
                #[cfg(windows)]
                fail_export: false,
                #[cfg(windows)]
                held_files: RefCell::new(vec![]),
            }
        }
    }
    impl RecoveryRuntime for Fake {
        fn inspect(&self, _: &str) -> RecoveryResult<Snapshot> {
            Ok(self.snapshot.borrow().clone())
        }
        fn named_volumes_supported(&self) -> bool {
            self.support_volumes
        }
        fn free_bytes(&self, _: &Path) -> RecoveryResult<u64> {
            Ok(self.free)
        }
        fn validate_configuration(&self, v: &Value) -> RecoveryResult<()> {
            if v.get("privileged").is_some() {
                Err(RecoveryError::new("unsupported", "privileged"))
            } else {
                Ok(())
            }
        }
        fn export_rootfs(&self, _: &str, p: &Path) -> RecoveryResult<()> {
            fs::write(p, b"opaque linux rootfs with ownership")?;
            #[cfg(windows)]
            if self.lock_export {
                use std::os::windows::fs::OpenOptionsExt;
                // Permit archive readers, but hold a real Windows sharing lock
                // preventing deletion until the simulated exporter releases it.
                let file = fs::OpenOptions::new().read(true).share_mode(1).open(p)?;
                self.held_files.borrow_mut().push(file);
                if self.fail_export {
                    return Err(RecoveryError::new(
                        "commandFailed",
                        "Injected exporter failure.",
                    ));
                }
            }
            Ok(())
        }
        fn export_volume(&self, _: &VolumeRecord, p: &Path) -> RecoveryResult<()> {
            fs::write(p, b"database bytes").map_err(Into::into)
        }
        fn container_name_exists(&self, n: &str) -> RecoveryResult<bool> {
            Ok(self
                .resources
                .borrow()
                .get(n)
                .is_some_and(|v| v == "container"))
        }
        fn image_name_exists(&self, n: &str) -> RecoveryResult<bool> {
            Ok(self.resources.borrow().get(n).is_some_and(|v| v == "image"))
        }
        fn volume_name_exists(&self, n: &str) -> RecoveryResult<bool> {
            Ok(self.resources.borrow().contains_key(n))
        }
        fn import_image(&self, p: &Path, n: &str) -> RecoveryResult<String> {
            self.files
                .borrow_mut()
                .insert("rootfs".into(), fs::read(p)?);
            self.resources.borrow_mut().insert(n.into(), "image".into());
            Ok(n.into())
        }
        fn create_volume(&self, n: &str) -> RecoveryResult<String> {
            self.resources
                .borrow_mut()
                .insert(n.into(), "volume".into());
            Ok(n.into())
        }
        fn import_volume(&self, n: &str, p: &Path) -> RecoveryResult<()> {
            self.files.borrow_mut().insert(n.into(), fs::read(p)?);
            Ok(())
        }
        fn create_container(
            &self,
            c: &Value,
            _: &str,
            n: &str,
            v: &BTreeMap<String, String>,
        ) -> RecoveryResult<String> {
            if self.fail_create {
                return Err(RecoveryError::new(
                    "commandFailed",
                    "injected create failure",
                ));
            }
            self.resources
                .borrow_mut()
                .insert(n.into(), "container".into());
            let mut c = c.clone();
            c["newVolumes"] = serde_json::to_value(v).unwrap();
            *self.restored.borrow_mut() = Some(c);
            Ok(n.into())
        }
        fn remove_container(&self, n: &str) -> RecoveryResult<()> {
            self.resources.borrow_mut().remove(n);
            Ok(())
        }
        fn remove_volume(&self, n: &str) -> RecoveryResult<()> {
            self.resources.borrow_mut().remove(n);
            Ok(())
        }
        fn remove_image(&self, n: &str) -> RecoveryResult<()> {
            self.resources.borrow_mut().remove(n);
            Ok(())
        }
    }
    fn archive(p: &Path, entries: &[(&str, &[u8])]) {
        let mut b = tar::Builder::new(fs::File::create(p).unwrap());
        for (name, bytes) in entries {
            let mut h = tar::Header::new_ustar();
            h.set_size(bytes.len() as u64);
            h.set_mode(0o600);
            h.as_mut_bytes()[..100].fill(0);
            h.as_mut_bytes()[..name.len()].copy_from_slice(name.as_bytes());
            h.set_cksum();
            b.append(&h, *bytes).unwrap();
        }
        b.finish().unwrap();
    }
    #[test]
    fn unsupported_coverage_and_running_container_refuse_export() {
        let r = Fake::new();
        r.snapshot
            .borrow_mut()
            .unsupported_mounts
            .push("bind:/host".into());
        let c = preflight(&r, "a").unwrap();
        assert!(!c.supported);
        assert!(c.blockers.iter().any(|x| x.contains("bind")));
        r.snapshot.borrow_mut().unsupported_mounts.clear();
        r.snapshot.borrow_mut().stopped = false;
        assert!(!preflight(&r, "a").unwrap().supported);
    }
    #[test]
    fn unverified_volume_helper_blocks_complete_backup() {
        let mut r = Fake::new();
        r.support_volumes = false;
        r.snapshot.borrow_mut().volumes.push(VolumeRecord {
            key: "v000".into(),
            source_name: "data".into(),
            target: "/data".into(),
            read_only: false,
        });
        assert!(!preflight(&r, "a").unwrap().supported);
    }
    #[test]
    fn bundle_roundtrip_retains_configuration_and_opaque_data_under_new_identities() {
        let d = TestDir::new();
        let r = Fake::new();
        r.snapshot.borrow_mut().volumes.push(VolumeRecord {
            key: "v000".into(),
            source_name: "existing-data".into(),
            target: "/data".into(),
            read_only: false,
        });
        r.snapshot.borrow_mut().configuration.as_mut().unwrap()["mounts"] = serde_json::json!([{"kind":"volume","source":"existing-data","target":"/data","readOnly":false,"name":"existing-data"}]);
        let p = d.0.join("complete.wslcbackup");
        backup(&r, "a", &p, "3.0.1", Limits::default()).unwrap();
        let out = restore(&r, &p, "recovered", Limits::default()).unwrap();
        assert_eq!(out.name, "recovered");
        assert_eq!(
            r.files.borrow()["rootfs"],
            b"opaque linux rootfs with ownership"
        );
        assert_eq!(out.volume_names.len(), 1);
        assert_ne!(out.volume_names[0], "existing-data");
        assert_eq!(r.files.borrow()[&out.volume_names[0]], b"database bytes");
        assert_eq!(
            r.restored.borrow().as_ref().unwrap()["environment"][0]["value"],
            "retained"
        );
        assert_eq!(r.resources.borrow()["existing-data"], "volume");
    }
    #[test]
    fn restore_failure_removes_only_resources_created_by_attempt() {
        let d = TestDir::new();
        let mut r = Fake::new();
        let p = d.0.join("backup.wslcbackup");
        backup(&r, "a", &p, "3.0.1", Limits::default()).unwrap();
        r.fail_create = true;
        assert!(restore(&r, &p, "failed", Limits::default()).is_err());
        assert_eq!(
            *r.resources.borrow(),
            BTreeMap::from([("existing-data".into(), "volume".into())])
        );
    }
    #[test]
    fn conflicts_and_option_like_names_do_not_create_resources() {
        let d = TestDir::new();
        let r = Fake::new();
        let p = d.0.join("backup.wslcbackup");
        backup(&r, "a", &p, "3.0.1", Limits::default()).unwrap();
        r.resources
            .borrow_mut()
            .insert("taken".into(), "container".into());
        for n in ["taken", "--remove-all", "../oops", "name;command"] {
            assert!(restore(&r, &p, n, Limits::default()).is_err());
        }
        assert_eq!(r.resources.borrow().len(), 2);
    }
    #[test]
    fn duplicate_manifest_unknown_member_and_link_are_rejected() {
        let d = TestDir::new();
        let p = d.0.join("hostile.wslcbackup");
        for entries in [
            vec![
                ("manifest.json", b"{}".as_slice()),
                ("manifest.json", b"{}".as_slice()),
            ],
            vec![("C:/escape", b"evil".as_slice())],
            vec![("volumes/../escape.tar", b"evil".as_slice())],
        ] {
            archive(&p, &entries);
            let tmp = d.0.join("validation");
            fs::create_dir(&tmp).unwrap();
            assert!(validate_bundle(&p, &tmp, Limits::default()).is_err());
            fs::remove_dir_all(tmp).unwrap();
        }
        let mut b = tar::Builder::new(fs::File::create(&p).unwrap());
        let mut h = tar::Header::new_ustar();
        h.set_entry_type(tar::EntryType::Symlink);
        h.set_size(0);
        h.set_mode(0o600);
        h.set_link_name("../escape").unwrap();
        h.set_cksum();
        b.append_data(&mut h, "rootfs.tar", io::empty()).unwrap();
        b.finish().unwrap();
        let tmp = d.0.join("links");
        fs::create_dir(&tmp).unwrap();
        assert!(validate_bundle(&p, &tmp, Limits::default()).is_err());
    }
    #[test]
    fn checksum_mismatch_and_incomplete_bundle_rejected_before_mutation() {
        let d = TestDir::new();
        let r = Fake::new();
        let p = d.0.join("original.wslcbackup");
        backup(&r, "a", &p, "3.0.1", Limits::default()).unwrap();
        let mut entries = Vec::new();
        for e in tar::Archive::new(fs::File::open(&p).unwrap())
            .entries()
            .unwrap()
        {
            use std::io::Read;
            let mut e = e.unwrap();
            let n = e.path().unwrap().to_str().unwrap().to_string();
            let mut v = vec![];
            e.read_to_end(&mut v).unwrap();
            entries.push((n, v));
        }
        let root = entries.iter_mut().find(|(n, _)| n == "rootfs.tar").unwrap();
        root.1[0] ^= 1;
        let corrupt = d.0.join("corrupt.wslcbackup");
        archive(
            &corrupt,
            &entries
                .iter()
                .map(|(n, v)| (n.as_str(), v.as_slice()))
                .collect::<Vec<_>>(),
        );
        assert!(restore(&r, &corrupt, "corrupt", Limits::default()).is_err());
        entries.retain(|(n, _)| n != "rootfs.tar");
        archive(
            &corrupt,
            &entries
                .iter()
                .map(|(n, v)| (n.as_str(), v.as_slice()))
                .collect::<Vec<_>>(),
        );
        assert!(restore(&r, &corrupt, "missing", Limits::default()).is_err());
        assert_eq!(r.resources.borrow().len(), 1);
    }
    #[test]
    fn byte_limits_and_low_capacity_leave_no_completed_output() {
        let d = TestDir::new();
        let mut r = Fake::new();
        let p = d.0.join("limited.wslcbackup");
        let l = Limits {
            member_bytes: 8,
            total_bytes: 1024,
            metadata_bytes: 1024,
            members: 8,
        };
        assert!(backup(&r, "a", &p, "3.0.1", l).is_err());
        assert!(!p.exists());
        r.free = 1;
        assert!(backup(&r, "a", &p, "3.0.1", Limits::default()).is_err());
        assert!(!p.exists());
        assert_eq!(fs::read_dir(&d.0).unwrap().count(), 0);
    }
    #[test]
    fn existing_destination_is_never_overwritten() {
        let d = TestDir::new();
        let r = Fake::new();
        let p = d.0.join("existing.wslcbackup");
        fs::write(&p, b"keep existing").unwrap();
        assert!(backup(&r, "a", &p, "3.0.1", Limits::default()).is_err());
        assert_eq!(fs::read(p).unwrap(), b"keep existing");
    }
    #[test]
    fn incompatible_platform_rejected_before_import() {
        let d = TestDir::new();
        let r = Fake::new();
        let p = d.0.join("original.wslcbackup");
        backup(&r, "a", &p, "3.0.1", Limits::default()).unwrap();
        let mut entries = vec![];
        for e in tar::Archive::new(fs::File::open(&p).unwrap())
            .entries()
            .unwrap()
        {
            use std::io::Read;
            let mut e = e.unwrap();
            let n = e.path().unwrap().to_str().unwrap().to_string();
            let mut bytes = vec![];
            e.read_to_end(&mut bytes).unwrap();
            if n == "manifest.json" {
                let mut m: Value = serde_json::from_slice(&bytes).unwrap();
                m["platform"] = Value::String("linux/unverified-architecture".into());
                bytes = serde_json::to_vec(&m).unwrap();
            }
            entries.push((n, bytes));
        }
        let bad = d.0.join("platform.wslcbackup");
        archive(
            &bad,
            &entries
                .iter()
                .map(|(n, v)| (n.as_str(), v.as_slice()))
                .collect::<Vec<_>>(),
        );
        assert!(restore(&r, &bad, "new-platform", Limits::default()).is_err());
        assert_eq!(r.resources.borrow().len(), 1);
    }
    #[test]
    fn unknown_effective_configuration_blocks_complete_backup() {
        let r = Fake::new();
        r.snapshot.borrow_mut().configuration.as_mut().unwrap()["capAdd"] =
            serde_json::json!(["NET_ADMIN"]);
        assert!(!preflight(&r, "a").unwrap().supported);
        let d = TestDir::new();
        assert!(backup(
            &r,
            "a",
            &d.0.join("unsupported.wslcbackup"),
            "3.0.1",
            Limits::default()
        )
        .is_err());
        assert_eq!(fs::read_dir(&d.0).unwrap().count(), 0);
    }
    #[test]
    fn restore_oversize_member_is_rejected_before_mutation() {
        let d = TestDir::new();
        let r = Fake::new();
        let p = d.0.join("original.wslcbackup");
        backup(&r, "a", &p, "3.0.1", Limits::default()).unwrap();
        assert!(restore(
            &r,
            &p,
            "oversize",
            Limits {
                member_bytes: 8,
                total_bytes: 65536,
                metadata_bytes: 65536,
                members: 8
            }
        )
        .is_err());
        assert_eq!(r.resources.borrow().len(), 1);
    }
    #[cfg(windows)]
    #[test]
    fn permissive_parent_cannot_expose_staging_or_its_files() {
        let d = TestDir::new();
        let parent = d.0.join("public-parent");
        windows_staging::create_with_sddl(&parent, "D:P(A;OICI;FA;;;WD)").unwrap();
        assert!(windows_staging::dacl_sddl(&parent)
            .unwrap()
            .contains(";;;WD)"));
        let work = WorkDir::new(&parent).unwrap();
        let sid = windows_staging::current_sid().unwrap();
        let acl = windows_staging::dacl_sddl(&work.0).unwrap();
        assert_eq!(acl, format!("D:P(A;OICI;FA;;;{sid})"));
        let config = work.0.join("container.json");
        fs::write(&config, b"secret bytes").unwrap();
        let file_acl = windows_staging::dacl_sddl(&config).unwrap();
        assert!(!file_acl.contains(";;;WD)"));
        assert!(file_acl.contains(&format!(";;;{sid})")));
        work.finish(Ok(()), "Test staging complete.").unwrap();
    }
    #[cfg(windows)]
    #[test]
    fn locked_staging_file_reports_owned_path_on_success_and_error() {
        use std::os::windows::fs::OpenOptionsExt;
        let d = TestDir::new();
        for failure in [false, true] {
            let work = WorkDir::new(&d.0).unwrap();
            let path = work.0.clone();
            let f = fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .read(true)
                .share_mode(0)
                .open(path.join("container.json"))
                .unwrap();
            let operation = if failure {
                Err(RecoveryError::new(
                    "commandFailed",
                    "Injected export error.",
                ))
            } else {
                Ok(())
            };
            let error = work
                .finish(operation, "Backup already completed.")
                .unwrap_err();
            assert_eq!(
                error.code,
                if failure {
                    "commandFailed"
                } else {
                    "cleanupFailed"
                }
            );
            assert!(error.message.contains(&path.display().to_string()));
            assert!(error.message.contains(if failure {
                "Injected export error"
            } else {
                "Backup already completed"
            }));
            assert!(path.exists());
            drop(f);
            work.finish(Ok(()), "Unlocked staging.").unwrap();
            assert!(!path.exists());
        }
    }
    #[cfg(windows)]
    #[test]
    fn backup_exporter_lock_reports_cleanup_failure_after_publication_and_error() {
        let d = TestDir::new();
        for fail in [false, true] {
            let mut runtime = Fake::new();
            runtime.lock_export = true;
            runtime.fail_export = fail;
            let destination = d.0.join(if fail {
                "failed.wslcbackup"
            } else {
                "published.wslcbackup"
            });
            let error =
                backup(&runtime, "a", &destination, "3.0.1", Limits::default()).unwrap_err();
            let staging = fs::read_dir(&d.0)
                .unwrap()
                .map(|entry| entry.unwrap().path())
                .find(|p| p.is_dir())
                .unwrap();
            assert_eq!(
                error.code,
                if fail {
                    "commandFailed"
                } else {
                    "cleanupFailed"
                }
            );
            assert!(error.message.contains(&staging.display().to_string()));
            assert!(error.message.contains(if fail {
                "Injected exporter failure"
            } else {
                "Backup was created at"
            }));
            assert!(!error.message.contains("retained"));
            assert_eq!(destination.exists(), !fail);
            assert!(staging.join("rootfs.tar").exists());
            runtime.held_files.borrow_mut().clear();
            fs::remove_dir_all(&staging).unwrap();
            assert!(!staging.exists());
        }
        assert_eq!(fs::read_dir(&d.0).unwrap().count(), 1);
    }
}
