//! Execution policies for the app's Windows privilege boundaries (GH #195).

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Operation {
    CompactHyperV,
    CompactDiskpart,
    ApplyDistroSource,
    ClearDistroSource,
    UpdateWsl,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum FailureKind {
    PermissionDenied,
    Cancelled,
    Unavailable,
    Other,
}

#[derive(Debug)]
pub struct Failure {
    pub kind: FailureKind,
    pub message: String,
}

fn execute_with_policy<T>(
    operation: Operation,
    mut execute: impl FnMut(bool) -> Result<T, Failure>,
) -> Result<T, Failure> {
    if operation == Operation::CompactDiskpart {
        return execute(true);
    }
    match execute(false) {
        Err(error) if error.kind == FailureKind::PermissionDenied => execute(true),
        result => result,
    }
}

impl From<Failure> for crate::wsl::WslError {
    fn from(error: Failure) -> Self {
        let message = if error.kind == FailureKind::Cancelled {
            format!(
                "Operation cancelled - administrator approval was not granted: {}",
                error.message
            )
        } else {
            error.message
        };
        Self::CommandFailed(message)
    }
}

#[cfg(windows)]
pub fn run_powershell(operation: Operation, script: &str) -> Result<String, Failure> {
    execute_with_policy(operation, |elevated| {
        log::debug!("Running {:?}; elevation requested: {}", operation, elevated);
        run_attempt(script, elevated)
    })
}

/// Quote data as a PowerShell literal, preserving backslashes, Unicode and `$`.
#[cfg(windows)]
pub fn quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "''"))
}

#[cfg(windows)]
fn operation_script(script: &str, result_path: &str) -> String {
    format!(
        "{}\n$resultPath = {}\ntry {{\n$message = (& {{\n{}\n}} | Out-String)\nWrite-Result $true 'other' $message\nexit 0\n}} catch {{\nWrite-Result $false (Get-FailureKind $_) $_.ToString()\nexit 1\n}}",
        include_str!("permissions.ps1"), quote(result_path), script
    )
}

#[cfg(windows)]
fn elevation_script(payload: &str, result_path: &str, powershell: &str) -> String {
    format!(
        r#"{preamble}
$resultPath = {result}
try {{
    $payload = {payload}
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if ($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {{
        & ([ScriptBlock]::Create($payload))
    }} else {{
        $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($payload))
        $process = Start-Process -FilePath {powershell} -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand',$encoded -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ErrorAction Stop
        exit $process.ExitCode
    }}
}} catch {{
    Write-Result $false (Get-FailureKind $_) $_.ToString()
    exit 1
}}"#,
        preamble = include_str!("permissions.ps1"),
        result = quote(result_path),
        payload = quote(payload),
        powershell = quote(powershell)
    )
}

#[cfg(windows)]
pub(crate) fn run_attempt(script: &str, elevated: bool) -> Result<String, Failure> {
    let other = |message: String| Failure {
        kind: FailureKind::Other,
        message,
    };
    let directory = tempfile::Builder::new()
        .prefix("wslui-permissions-")
        .tempdir()
        .map_err(|e| other(format!("Cannot create operation output directory: {e}")))?;
    let result_file = directory.path().join("result.json");
    let result_path = result_file.to_string_lossy();
    let paths = crate::settings::get_executable_paths();
    let payload = operation_script(script, &result_path);
    let command = if elevated {
        elevation_script(&payload, &result_path, &paths.powershell)
    } else {
        payload
    };
    let output = crate::utils::hidden_command(&paths.powershell)
        .args(["-NoProfile", "-NonInteractive", "-Command", &command])
        .output()
        .map_err(|e| other(format!("Cannot start PowerShell: {e}")))?;
    let json = std::fs::read_to_string(&result_file).map_err(|e| {
        other(format!(
            "PowerShell returned no operation result ({e}, status {}): {}",
            output.status,
            String::from_utf8_lossy(&output.stderr).trim()
        ))
    })?;
    parse_result(&json, output.status.success())
}

#[cfg(windows)]
fn parse_result(json: &str, process_success: bool) -> Result<String, Failure> {
    #[derive(serde::Deserialize)]
    struct Response {
        success: bool,
        kind: String,
        message: String,
    }
    let response: Response =
        serde_json::from_str(json.trim_start_matches('\u{feff}')).map_err(|e| Failure {
            kind: FailureKind::Other,
            message: format!("Invalid PowerShell operation result: {e}"),
        })?;
    if response.success && process_success {
        return Ok(response.message);
    }
    let kind = match response.kind.as_str() {
        "permission_denied" => FailureKind::PermissionDenied,
        "cancelled" => FailureKind::Cancelled,
        "unavailable" => FailureKind::Unavailable,
        _ => FailureKind::Other,
    };
    Err(Failure {
        kind,
        message: if response.success {
            "PowerShell exited unsuccessfully after reporting success".into()
        } else {
            response.message
        },
    })
}

#[cfg(windows)]
pub fn native_script(executable: &str, arguments: &[&str]) -> String {
    let arguments = arguments
        .iter()
        .map(|arg| quote(arg))
        .collect::<Vec<_>>()
        .join(" ");
    format!(
        r#"
$previousPreference = $ErrorActionPreference
try {{
    # Windows PowerShell turns native stderr into ErrorRecords. Capture it
    # without replacing the executable's exit code with a PowerShell error.
    $ErrorActionPreference = 'Continue'
    $global:LASTEXITCODE = $null
    $nativeOutput = & {executable} {arguments} 2>&1
    $nativeCode = $global:LASTEXITCODE
}} finally {{ $ErrorActionPreference = $previousPreference }}
$message = $nativeOutput | Out-String
if ($null -eq $nativeCode) {{ throw "Native command did not return an exit code: $message" }}
if ($nativeCode -ne 0) {{ throw [System.ComponentModel.Win32Exception]::new([int]$nativeCode, "Exit code ${{nativeCode}}: $message") }}
Write-Output $message
"#,
        executable = quote(executable)
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[cfg(windows)]
    #[test]
    fn powershell_runner_captures_success_and_unicode_without_a_prompt() {
        let result = run_attempt("Write-Output '成功 O''Brien $HOME `ticks`'", false).unwrap();
        assert_eq!(result.trim(), "成功 O'Brien $HOME `ticks`");
    }

    #[cfg(windows)]
    #[test]
    fn powershell_runner_classifies_native_and_dotnet_errors_without_translated_text() {
        for (script, kind) in [
            (
                "throw [System.Security.SecurityException]::new('registry access denied')",
                FailureKind::PermissionDenied,
            ),
            (
                "throw [System.UnauthorizedAccessException]::new('拒绝访问')",
                FailureKind::PermissionDenied,
            ),
            (
                "throw [System.ComponentModel.Win32Exception]::new(740, 'échec')",
                FailureKind::PermissionDenied,
            ),
            (
                "throw [System.ComponentModel.Win32Exception]::new(1314, 'échec')",
                FailureKind::PermissionDenied,
            ),
            (
                "throw [System.ComponentModel.Win32Exception]::new(1223, 'annulé')",
                FailureKind::Cancelled,
            ),
            (
                "throw [System.ComponentModel.Win32Exception]::new(32, 'locked')",
                FailureKind::Other,
            ),
            (
                "Get-WslUiDeliberatelyMissingCommand",
                FailureKind::Unavailable,
            ),
        ] {
            assert_eq!(
                run_attempt(script, false).unwrap_err().kind,
                kind,
                "{script}"
            );
        }
    }

    #[cfg(windows)]
    #[test]
    fn cim_access_denied_is_permission_failure_but_other_cim_codes_are_not() {
        // CIM has a separate status-code namespace: 2 means AccessDenied,
        // whereas Win32 code 2 means FileNotFound. Construct the real exception
        // through its internal status-code constructor (public constructors
        // cannot set NativeErrorCode).
        for (code, expected) in [(2, FailureKind::PermissionDenied), (6, FailureKind::Other)] {
            let script = format!(
                r#"
$constructor = [Microsoft.Management.Infrastructure.CimException].GetConstructors([Reflection.BindingFlags]'NonPublic,Instance') | Where-Object {{ $_.GetParameters().Count -eq 3 }} | Select-Object -First 1
$code = [Enum]::ToObject($constructor.GetParameters()[0].ParameterType, {code})
$exception = $constructor.Invoke([object[]]@($code, 'CIM failure', $null))
throw [System.Exception]::new('outer wrapper', $exception)
"#
            );
            let failure = run_attempt(&script, false).unwrap_err();
            assert_eq!(failure.kind, expected, "{}", failure.message);
        }
    }

    #[cfg(windows)]
    #[test]
    fn missing_computername_is_restored_before_operations() {
        let directory = tempfile::tempdir().unwrap();
        let result = directory.path().join("result.json");
        let payload = operation_script("if ([string]::IsNullOrWhiteSpace($env:COMPUTERNAME)) { throw 'missing computer name' }; Write-Output $env:COMPUTERNAME", &result.to_string_lossy());
        let command = format!("$env:COMPUTERNAME = $null; & {{ {payload} }}");
        let output =
            crate::utils::hidden_command(&crate::settings::get_executable_paths().powershell)
                .args(["-NoProfile", "-NonInteractive", "-Command", &command])
                .output()
                .unwrap();
        let response = parse_result(
            &std::fs::read_to_string(result).unwrap(),
            output.status.success(),
        );
        assert!(!response.unwrap().trim().is_empty());
    }

    #[cfg(windows)]
    #[test]
    fn powershell_nonterminating_errors_are_failures() {
        let failure = run_attempt(
            "Write-Error 'deliberate failure'; Write-Output 'false success'",
            false,
        )
        .unwrap_err();
        assert_eq!(failure.kind, FailureKind::Other);
        assert!(failure.message.contains("deliberate failure"));
        assert!(!failure.message.contains("false success"));
    }

    #[cfg(windows)]
    #[test]
    fn native_exit_codes_survive_powershell_and_preserve_output() {
        let powershell = crate::settings::get_executable_paths().powershell;
        for (code, kind) in [
            (5, FailureKind::PermissionDenied),
            (740, FailureKind::PermissionDenied),
            (1314, FailureKind::PermissionDenied),
            (1223, FailureKind::Cancelled),
            (32, FailureKind::Other),
            (-2147024891, FailureKind::PermissionDenied), // HRESULT E_ACCESSDENIED
            (-2147023673, FailureKind::Cancelled),        // HRESULT_FROM_WIN32(ERROR_CANCELLED)
        ] {
            let command = format!("Write-Output 'native detail'; exit {code}");
            let failure = run_attempt(
                &native_script(&powershell, &["-NoProfile", "-Command", &command]),
                false,
            )
            .unwrap_err();
            assert_eq!(failure.kind, kind, "{}", failure.message);
            assert!(failure.message.contains("native detail"));
        }
        let success = run_attempt(
            &native_script(
                &powershell,
                &[
                    "-NoProfile",
                    "-Command",
                    "Write-Output 'native success'; exit 0",
                ],
            ),
            false,
        )
        .unwrap();
        assert_eq!(success.trim(), "native success");
        assert!(run_attempt(&native_script("WslUiMissingExecutable.exe", &[]), false).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn malformed_or_contradictory_results_are_never_success() {
        for json in ["", "{}", "not json"] {
            assert!(parse_result(json, true).is_err());
        }
        assert!(parse_result(r#"{"success":true,"kind":"other","message":"ok"}"#, false).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn elevation_transport_captures_encoded_child_and_launch_errors_without_uac() {
        let directory = tempfile::Builder::new()
            .prefix("wslui O'Brien $test-")
            .tempdir()
            .unwrap();
        let result_file = directory.path().join("result.json");
        let result_path = result_file.to_string_lossy();
        let powershell = crate::settings::get_executable_paths().powershell;
        let payload = operation_script("Write-Output '成功 $literal'", &result_path);
        // Replace only the OS prompt launcher in the test. The encoded child,
        // result file, error classifier and exit-status protocol are real.
        for (body, expected) in [
            (
                "& $FilePath @ArgumentList; [pscustomobject]@{ ExitCode = $global:LASTEXITCODE }",
                None,
            ),
            (
                "throw [System.ComponentModel.Win32Exception]::new(1223, 'cancelled')",
                Some(FailureKind::Cancelled),
            ),
            (
                "throw [System.ComponentModel.Win32Exception]::new(2, 'missing launcher')",
                Some(FailureKind::Other),
            ),
        ] {
            let _ = std::fs::remove_file(&result_file);
            let launcher = elevation_script(&payload, &result_path, &powershell).replace(
                "$principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)",
                "$false",
            );
            let command = format!("function Start-Process {{ [CmdletBinding()] param($FilePath, $ArgumentList, $Verb, [switch]$Wait, [switch]$PassThru, $WindowStyle) {body} }}\n{launcher}");
            let output = crate::utils::hidden_command(&powershell)
                .args(["-NoProfile", "-NonInteractive", "-Command", &command])
                .output()
                .unwrap();
            let json = std::fs::read_to_string(&result_file)
                .unwrap_or_else(|e| panic!("{e}: {:?}", output));
            let result = parse_result(&json, output.status.success());
            match expected {
                None => assert_eq!(result.unwrap().trim(), "成功 $literal"),
                Some(kind) => assert_eq!(result.unwrap_err().kind, kind),
            }
        }
    }

    fn failure(kind: FailureKind) -> Failure {
        Failure {
            kind,
            message: "original failure".into(),
        }
    }

    #[test]
    fn existing_permissions_complete_without_elevation() {
        for operation in [
            Operation::CompactHyperV,
            Operation::ApplyDistroSource,
            Operation::ClearDistroSource,
            Operation::UpdateWsl,
        ] {
            let mut attempts = vec![];
            let result = execute_with_policy(operation, |elevated| {
                attempts.push(elevated);
                Ok("done")
            });
            assert_eq!(result.unwrap(), "done");
            assert_eq!(attempts, vec![false]);
        }
    }

    #[test]
    fn permission_denial_retries_once_with_elevation() {
        let mut attempts = vec![];
        let result = execute_with_policy(Operation::CompactHyperV, |elevated| {
            attempts.push(elevated);
            if elevated {
                Ok(())
            } else {
                Err(failure(FailureKind::PermissionDenied))
            }
        });
        assert!(result.is_ok());
        assert_eq!(attempts, vec![false, true]);
    }

    #[test]
    fn unrelated_failures_and_cancellation_are_not_retried() {
        for kind in [
            FailureKind::Other,
            FailureKind::Cancelled,
            FailureKind::Unavailable,
        ] {
            let mut attempts = vec![];
            let result: Result<(), _> = execute_with_policy(Operation::CompactHyperV, |elevated| {
                attempts.push(elevated);
                Err(failure(kind))
            });
            let error = result.unwrap_err();
            assert_eq!(error.kind, kind);
            assert_eq!(error.message, "original failure");
            assert_eq!(attempts, vec![false]);
        }
    }

    #[test]
    fn failed_elevated_retry_is_final_including_cancellation() {
        for kind in [
            FailureKind::Cancelled,
            FailureKind::PermissionDenied,
            FailureKind::Other,
        ] {
            let mut attempts = vec![];
            let result: Result<(), _> = execute_with_policy(Operation::UpdateWsl, |elevated| {
                attempts.push(elevated);
                Err(failure(if elevated {
                    kind
                } else {
                    FailureKind::PermissionDenied
                }))
            });
            assert_eq!(result.unwrap_err().kind, kind);
            assert_eq!(attempts, vec![false, true]);
        }
    }

    #[test]
    fn diskpart_requires_elevation_at_launch_and_is_not_retried() {
        let mut attempts = vec![];
        let _: Result<(), _> = execute_with_policy(Operation::CompactDiskpart, |elevated| {
            attempts.push(elevated);
            Err(failure(FailureKind::Cancelled))
        });
        assert_eq!(attempts, vec![true]);
    }
}
