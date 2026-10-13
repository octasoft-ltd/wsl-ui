# Install WSL UI from an MSIX release

The GitHub MSIX packages are signed with a WSL UI self-signed certificate. Windows
must trust that certificate before installing the package. The Microsoft Store,
MSI, and EXE installation options are also available.

## Download and install

Download these three files from the same [release](https://github.com/octasoft-ltd/wsl-ui/releases),
using `x64` or `arm64` for your computer:

- `WSL.UI_<version>_<arch>.msix`
- `WSL.UI_<version>_<arch>.cer`
- `Install-WSL-UI_<arch>.ps1`

Keep them in one folder. Files ending `_store.msix` are unsigned copies for the
maintainer to submit to Microsoft Partner Center; they are not sideload installers.
Older releases without a `.cer` contain unsigned packages and cannot be fixed by
installing a certificate from a newer release.

1. Open **Windows PowerShell as administrator**, navigate to the download folder,
   and run (replace the example filename with the release you downloaded):

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-WSL-UI_x64.ps1 -PackagePath .\WSL.UI_0.21.0.0_x64.msix -TrustCertificate
   ```

   Review the certificate thumbprint shown in the confirmation prompt. This trusts
   the signing certificate for all users by adding its public key to
   **Local Computer → Trusted People**. It does not install the app. Only trust
   files downloaded from this project's releases. Your organisation may require
   IT to perform this step or may prohibit sideloading.

2. Close the administrator window. Open **Windows PowerShell as your normal user**
   in the same folder, then run:

   ```powershell
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Install-WSL-UI_x64.ps1 -PackagePath .\WSL.UI_0.21.0.0_x64.msix
   ```

   The helper checks that the package's signature is valid and matches the `.cer`
   before installing or updating WSL UI for your account. Separating these steps
   avoids installing the app under a different administrator's account.

`-ExecutionPolicy Bypass` applies only to that PowerShell process; it does not
change the machine's execution policy. Managed policy still takes precedence.
You can add `-WhatIf` to preview either operation. The trust step is normally
needed only once, until the signing certificate changes.

### Manual alternative

In administrator Windows PowerShell, import the downloaded public certificate:

```powershell
Import-Certificate -FilePath .\WSL.UI_0.21.0.0_x64.cer -CertStoreLocation Cert:\LocalMachine\TrustedPeople
```

Then double-click the matching signed MSIX as your normal user, or use
`Add-AppxPackage -Path .\WSL.UI_0.21.0.0_x64.msix`. Do not import into Trusted Root
Certification Authorities. The `.cer` is public and contains no private key.

## Maintainer: configure signing once

Configure these repository Actions secrets **before merging/enabling signed releases**:

- `MSIX_SIGNING_CERTIFICATE`: a base64-encoded password-protected PFX containing the signing private key.
- `MSIX_SIGNING_PASSWORD`: its password.

Generate one certificate and reuse it across releases and both architectures.
Its subject must exactly match the existing Store publisher identity:
`CN=8AC4B328-845D-4C1C-B1FC-CE52C08F4693`.

On a trusted Windows machine, use PowerShell to generate a code-signing certificate
and upload the secrets via the authenticated GitHub CLI. This does not add the
certificate to any trusted certificate store:

```powershell
$cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=8AC4B328-845D-4C1C-B1FC-CE52C08F4693' -FriendlyName 'WSL UI MSIX release signing' -KeyUsage DigitalSignature -KeyAlgorithm RSA -KeyLength 3072 -HashAlgorithm SHA256 -KeyExportPolicy Exportable -CertStoreLocation Cert:\CurrentUser\My -NotAfter (Get-Date).AddYears(3) -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.3', '2.5.29.19={text}')
$password = Read-Host 'Choose a strong PFX password and save it in your password manager' -AsSecureString
$plainPassword = [System.Net.NetworkCredential]::new('', $password).Password
try {
    $pfx = $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $plainPassword)
    [Convert]::ToBase64String($pfx) | gh secret set MSIX_SIGNING_CERTIFICATE --repo octasoft-ltd/wsl-ui
    if ($LASTEXITCODE -ne 0) { throw 'Certificate secret upload failed.' }
    $plainPassword | gh secret set MSIX_SIGNING_PASSWORD --repo octasoft-ltd/wsl-ui
    if ($LASTEXITCODE -ne 0) { throw 'Password secret upload failed.' }
} finally {
    $plainPassword = $null
    $pfx = $null
}
```

Back up the password-protected PFX and password securely; never commit or attach
the PFX to a release. The certificate remains in your user Personal store for
backup. Record its thumbprint and expiry date. Renew before expiry, update both
secrets together, and tell users to trust the new public certificate when rotating.

Both release workflows build the unsigned MSIX, preserve it as `_store.msix`, then
sign the installable copy with SHA-256 and an RFC 3161 timestamp. They export only
the public `.cer`. Each architecture uploads its own certificate and helper name
to avoid concurrent release-asset replacement. Signing keys are imported into the
runner's user Personal store temporarily and removed in `finally`.

Missing credentials, signing errors, and timestamp failures stop the build.
The manual release workflow must target a tag containing these scripts; older tags
need a new release or an explicit backport. The legacy local `build-msix.ps1 -Sign`
option is separate from this release workflow.

## Verification

Run `pwsh -NoProfile -File scripts/tests/msix-signing.Tests.ps1` on Windows with
the Windows SDK installed. It creates a disposable certificate, signs a real
fixture package with the SDK, checks the timestamp and public certificate,
preserves the Store bytes, checks failure cases, and confirms private-key cleanup.
It does not trust certificates or install an application on the developer machine.
The timestamp service requires network access.

The Windows CI job additionally tests the certificate trust step on its disposable
runner. Before shipping, test actual x64/ARM64 app installation and upgrades on
appropriate clean machines, including any existing Microsoft Store installation.

References: [Microsoft certificate requirements](https://learn.microsoft.com/en-us/windows/msix/package/create-certificate-package-signing)
and [SignTool signing](https://learn.microsoft.com/en-us/windows/msix/package/sign-app-package-using-signtool).
