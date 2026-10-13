# Windows permissions and elevation

WSL UI runs in the signed-in user's context. It does not elevate the whole app or infer effective access from group membership. Effective access also depends on the process token, resource ACLs, installed tools and organization policy.

## Operation catalogue

| Operation | Authority / resource | Execution policy |
| --- | --- | --- |
| List, start, stop, import, export, clone, rename and configure distributions | User's WSL registrations, files and directories | Current user; preserve per-user WSL identity. Filesystem errors are reported, not blindly retried as administrator. |
| Read/write app settings, Windows Terminal settings, `.wslconfig` | User profile files | Current user; report ACL or I/O failures. |
| Commands inside a distribution, including fstrim and `wsl.conf` changes | Linux user/root inside that distribution | Existing guest-root execution where needed; Linux root is separate from Windows administrator. |
| Compact with `Optimize-VHD` | Hyper-V management access and access to the detached VHDX | Try current permissions. Retry once with UAC only on a recognized permission failure. Hyper-V Administrators may already have enough rights; membership alone is not proof. |
| Compact with DiskPart | Windows administrative disk-management access | Launch the operation with elevation. Used only when Optimize-VHD is unavailable (or FORCE_DISKPART is explicitly set). Cancellation and ordinary Hyper-V failures never trigger DiskPart. |
| Apply/clear custom distribution sources | SetValue access to HKLM's WSL source registry key | Open a write-capable key before changing values. Try current permissions, retry once with UAC on permission denial. Ignore missing values when clearing; propagate other errors. |
| Read distribution sources / download and preview a manifest | Registry read access / network | Current user; no elevation. |
| Update WSL | Permissions required by the selected WSL updater | Try current permissions; retry once with UAC on recognized permission exit codes. WSL itself may also request elevation. |
| Mount/unmount physical disks through WSL | Windows disk access and WSL's own requirements | Existing current-user WSL command; WSL may require administrator rights. No generic automatic retry or identity change is introduced. |
| Sideload certificate trust (`Install-WSL-UI.ps1 -TrustCertificate`) | Machine certificate trust store | Existing explicit administrator step; separate from runtime elevation. |
| Microsoft Store/MSIX packaging and publishing | Build/signing/Store infrastructure | Unchanged by runtime permission policy. No manifest change or new app capability. |

## Failure and retry contract

`src-tauri/src/permissions.rs` owns the operation policy and process transport; `permissions.ps1` classifies PowerShell errors using exception metadata rather than localized message text.

- Recognize access denied, elevation required and privilege-not-held Win32/HRESULT codes, WMI/CIM access denied, explicit .NET access/security exceptions and PowerShell PermissionDenied records.
- Preserve cancellation (Win32 1223 / HRESULT 0x800704C7). Never retry after a failed elevated attempt.
- Preserve unrelated failures, including sharing violations, missing files and malformed/missing process results.
- Treat terminating and non-terminating PowerShell errors as failures.
- Native commands carry their actual exit code and captured output through the wrapper. Unknown native codes are reported without assuming an English error message means permission denial.
- Use a unique temporary result directory for each attempt and delete it after completion. Pass the elevated child an encoded command to preserve quoting and Unicode; it uses the configured PowerShell executable.
- Registry changes are idempotent but are not a multi-value transaction. Write access is acquired before mutation; a later unrelated I/O failure is reported rather than hidden.
- Restore a missing COMPUTERNAME from the local machine name before invoking Hyper-V; preserve an existing value.
- Existing compaction shutdown/file validation remains in place.

## Validation

Automated Windows tests exercise real unelevated PowerShell execution, Unicode/literal quoting, native exit codes, non-terminating errors, and the encoded child/result-file transport. The UAC launch is substituted in the transport test so it cannot display a desktop prompt. Policy tests verify single retries and preservation of cancellation/errors; the registry test uses only a disposable HKCU key and deletes that key after testing its ACL.

These tests do not prove that a particular organization's Hyper-V delegation works. Before treating #195 as confirmed on a target machine:

1. Use a test account that belongs to Hyper-V Administrators but not local Administrators, and start WSL UI normally. Group changes may require signing out and back in.
2. On a disposable stopped distribution/VHDX owned by that account, confirm Optimize-VHD is installed, then compact. Expect success without UAC when Hyper-V and file permissions permit it.
3. With a test account lacking those rights, confirm a recognized denial requests UAC once. Cancel it: expect a cancellation error and no DiskPart prompt. With authorized administrator approval, confirm the operation's result is returned.
4. Exercise a locked/inaccessible test VHDX and a machine without Optimize-VHD. Confirm unrelated failures remain failures; missing Hyper-V selects DiskPart. Cancel DiskPart and confirm no second attempt.
5. On a test installation, apply and clear a source with normal HKLM ACLs, then with explicitly delegated SetValue access. Expect UAC only when needed. Restore the original source and ACLs afterward.
6. Verify a WSL update on a test installation and cancellation where applicable. Do not repeatedly update production WSL merely to test error handling.

## References

- [Optimize-VHD requirements](https://learn.microsoft.com/en-us/powershell/module/hyper-v/optimize-vhd)
- [DiskPart requirements](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/diskpart)
- [RegistryKey.OpenSubKey and access exceptions](https://learn.microsoft.com/en-us/dotnet/api/microsoft.win32.registrykey.opensubkey)
- [WSL commands](https://learn.microsoft.com/en-us/windows/wsl/basic-commands)
- [Issue #195](https://github.com/octasoft-ltd/wsl-ui/issues/195)
