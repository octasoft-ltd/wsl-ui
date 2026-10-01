//! Direct trusted executable, bounded simultaneous pipe drains, owned child timeout.
use super::{inventory::MAX_OUTPUT, types::*};
use std::{
    io::Read,
    path::{Path, PathBuf},
    process::{Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc,
    },
    time::{Duration, Instant},
};
pub struct CommandOutput {
    pub stdout: Vec<u8>,
    pub stderr: Vec<u8>,
    pub success: bool,
}
pub trait Executor: Send + Sync {
    /// Native restore requires complete configuration coverage and a verified
    /// filesystem recovery round trip. The controlled emulator meets its own model.
    fn verified_restore(&self) -> bool {
        false
    }
    /// Only an executor whose controlled model exposes every effective setting can
    /// attest coverage. The native 3.0.1 inspect projection cannot do so.
    fn complete_configuration_model(&self) -> bool {
        false
    }
    fn execute(&self, args: &[String], timeout: Duration) -> Result<CommandOutput, ContainerError>;
    fn terminal(&self, args: &[String]) -> Result<(), ContainerError>;
    fn default_session_name(&self) -> Result<String, ContainerError>;
    fn execute_with_file_limit(
        &self,
        args: &[String],
        path: &Path,
        max: u64,
        timeout: Duration,
    ) -> Result<CommandOutput, ContainerError>;
}
fn drain<R: Read + Send + 'static>(
    mut pipe: R,
    cap: usize,
    over: Arc<AtomicBool>,
) -> mpsc::Receiver<Result<Vec<u8>, ()>> {
    let (tx, rx) = mpsc::channel();
    std::thread::spawn(move || {
        let mut out = Vec::new();
        let mut buf = [0; 8192];
        let result = loop {
            match pipe.read(&mut buf) {
                Ok(0) => break Ok(out),
                Ok(n) => {
                    if out.len() + n <= cap {
                        out.extend_from_slice(&buf[..n]);
                    } else {
                        over.store(true, Ordering::SeqCst);
                    }
                }
                Err(_) => break Err(()),
            }
        };
        let _ = tx.send(result);
    });
    rx
}
pub fn run_bounded(
    mut cmd: Command,
    timeout: Duration,
    cap: usize,
    file: Option<(&Path, u64)>,
) -> Result<CommandOutput, ContainerError> {
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let mut child = cmd.spawn().map_err(|_| {
        ContainerError::new("runtimeUnavailable", "Unable to launch the WSLc runtime.")
    })?;
    let start = Instant::now();
    let over = Arc::new(AtomicBool::new(false));
    let out = drain(child.stdout.take().unwrap(), cap, over.clone());
    let err = drain(child.stderr.take().unwrap(), cap, over.clone());
    let status = loop {
        let failure = if over.load(Ordering::SeqCst) {
            Some(ContainerError::new(
                "outputLimit",
                "WSLc output exceeded the safe capture limit.",
            ))
        } else if file
            .map(|(p, limit)| {
                std::fs::metadata(p)
                    .map(|m| m.len() > limit)
                    .unwrap_or(false)
            })
            .unwrap_or(false)
        {
            Some(ContainerError::new(
                "fileLimit",
                "Export exceeded the selected size limit.",
            ))
        } else if start.elapsed() >= timeout {
            Some(ContainerError::new(
                "timeout",
                "WSLc timed out. Refresh to verify the outcome before retrying.",
            ))
        } else {
            None
        };
        if let Some(e) = failure {
            let _ = child.kill();
            let _ = child.wait();
            return Err(e);
        }
        match child.try_wait() {
            Ok(Some(s)) => break s,
            Ok(None) => std::thread::sleep(Duration::from_millis(10)),
            Err(_) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(ContainerError::new(
                    "runtimeUnavailable",
                    "Unable to wait for WSLc.",
                ));
            }
        }
    };
    // A descendant retaining inherited pipes must not hold the operation indefinitely.
    let remaining = timeout
        .saturating_sub(start.elapsed())
        .min(Duration::from_secs(1));
    let stdout = out
        .recv_timeout(remaining)
        .map_err(|_| ContainerError::new("timeout", "WSLc output did not close."))?
        .map_err(|_| ContainerError::new("outputRead", "Could not read WSLc output."))?;
    let stderr = err
        .recv_timeout(remaining)
        .map_err(|_| ContainerError::new("timeout", "WSLc output did not close."))?
        .map_err(|_| ContainerError::new("outputRead", "Could not read WSLc output."))?;
    if over.load(Ordering::SeqCst) {
        return Err(ContainerError::new(
            "outputLimit",
            "WSLc output exceeded the safe capture limit.",
        ));
    }
    if file
        .map(|(p, limit)| {
            std::fs::metadata(p)
                .map(|m| m.len() > limit)
                .unwrap_or(false)
        })
        .unwrap_or(false)
    {
        return Err(ContainerError::new(
            "fileLimit",
            "Export exceeded the selected size limit.",
        ));
    }
    Ok(CommandOutput {
        stdout,
        stderr,
        success: status.success(),
    })
}
pub fn text(bytes: &[u8]) -> String {
    wsl_core::decode_wsl_output(bytes)
        .trim_start_matches('\u{feff}')
        .to_owned()
}
pub struct NativeExecutor;
impl NativeExecutor {
    pub fn executable() -> Result<PathBuf, ContainerError> {
        // Do not search PATH or accept executable paths from the webview.
        for p in [
            std::env::var_os("ProgramFiles").map(|p| PathBuf::from(p).join("WSL").join("wslc.exe")),
            std::env::var_os("LOCALAPPDATA").map(|p| {
                PathBuf::from(p)
                    .join("Microsoft")
                    .join("WindowsApps")
                    .join("wslc.exe")
            }),
        ]
        .into_iter()
        .flatten()
        {
            if p.is_file() {
                return Ok(p);
            }
        }
        Err(ContainerError::new(
            "runtimeUnavailable",
            "WSLc is not installed. WSL 3.0.1 or newer is required.",
        ))
    }
}
impl Executor for NativeExecutor {
    fn execute(&self, args: &[String], timeout: Duration) -> Result<CommandOutput, ContainerError> {
        let mut c = Command::new(Self::executable()?);
        c.args(args);
        run_bounded(c, timeout, MAX_OUTPUT, None)
    }
    fn execute_with_file_limit(
        &self,
        args: &[String],
        path: &Path,
        max: u64,
        timeout: Duration,
    ) -> Result<CommandOutput, ContainerError> {
        let mut c = Command::new(Self::executable()?);
        c.args(args);
        run_bounded(c, timeout, MAX_OUTPUT, Some((path, max)))
    }
    fn default_session_name(&self) -> Result<String, ContainerError> {
        default_session_name()
    }
    fn terminal(&self, args: &[String]) -> Result<(), ContainerError> {
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            let mut c = Command::new(Self::executable()?);
            c.args(args)
                .creation_flags(0x00000010)
                .spawn()
                .map_err(|_| {
                    ContainerError::new("terminalFailed", "Could not open the container console.")
                })?;
            Ok(())
        }
        #[cfg(not(windows))]
        {
            let _ = args;
            Err(ContainerError::new(
                "unsupportedPlatform",
                "Container terminals require Windows.",
            ))
        }
    }
}
#[cfg(windows)]
fn default_session_name() -> Result<String, ContainerError> {
    use std::ffi::c_void;
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
        fn LookupAccountSidW(
            system: *const u16,
            sid: *mut c_void,
            name: *mut u16,
            name_len: *mut u32,
            domain: *mut u16,
            domain_len: *mut u32,
            kind: *mut u32,
        ) -> i32;
    }
    #[link(name = "kernel32")]
    extern "system" {
        fn GetCurrentProcess() -> *mut c_void;
        fn CloseHandle(handle: *mut c_void) -> i32;
    }
    unsafe {
        let failure = || {
            ContainerError::new(
                "identityUnavailable",
                "Unable to resolve the current Windows user token.",
            )
        };
        let mut token = std::ptr::null_mut();
        if OpenProcessToken(GetCurrentProcess(), 8, &mut token) == 0 {
            return Err(failure());
        }
        struct Token(*mut c_void);
        impl Drop for Token {
            fn drop(&mut self) {
                unsafe {
                    CloseHandle(self.0);
                }
            }
        }
        let guard = Token(token);
        let mut needed = 0;
        GetTokenInformation(guard.0, 1, std::ptr::null_mut(), 0, &mut needed);
        if needed == 0 || needed > 65536 {
            return Err(failure());
        }
        let mut info = vec![
            0usize;
            (needed as usize + std::mem::size_of::<usize>() - 1)
                / std::mem::size_of::<usize>()
        ];
        if GetTokenInformation(
            guard.0,
            1,
            info.as_mut_ptr() as *mut c_void,
            needed,
            &mut needed,
        ) == 0
        {
            return Err(failure());
        }
        let sid = *(info.as_ptr() as *const *mut c_void);
        let mut name = vec![0u16; 257];
        let mut domain = vec![0u16; 257];
        let mut nl = 257;
        let mut dl = 257;
        let mut kind = 0;
        if LookupAccountSidW(
            std::ptr::null(),
            sid,
            name.as_mut_ptr(),
            &mut nl,
            domain.as_mut_ptr(),
            &mut dl,
            &mut kind,
        ) == 0
        {
            return Err(failure());
        }
        let user = String::from_utf16(&name[..nl as usize]).map_err(|_| failure())?;
        let mut elevation = 0u32;
        if GetTokenInformation(
            guard.0,
            20,
            &mut elevation as *mut _ as *mut c_void,
            4,
            &mut needed,
        ) == 0
        {
            return Err(failure());
        }
        Ok(format!(
            "{}-{user}",
            if elevation != 0 {
                "wslc-cli-admin"
            } else {
                "wslc-cli"
            }
        ))
    }
}
#[cfg(not(windows))]
fn default_session_name() -> Result<String, ContainerError> {
    Err(ContainerError::new(
        "unsupportedPlatform",
        "WSLc requires Windows.",
    ))
}
