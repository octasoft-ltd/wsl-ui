# Windows PowerShell 5.1 compatible. Trust is an explicit, separate administrator step.
[CmdletBinding(SupportsShouldProcess, ConfirmImpact = 'High')]
param(
    [Parameter(Mandatory)][string]$PackagePath,
    [string]$CertificatePath,
    [switch]$TrustCertificate
)

$ErrorActionPreference = 'Stop'
$PackagePath = (Resolve-Path -LiteralPath $PackagePath).Path
if (-not $CertificatePath) { $CertificatePath = [IO.Path]::ChangeExtension($PackagePath, '.cer') }
if (-not (Test-Path -LiteralPath $CertificatePath -PathType Leaf)) {
    throw 'Download the matching .cer certificate alongside the signed MSIX. The _store.msix package is unsigned and is only for Store submission.'
}
$certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new((Resolve-Path -LiteralPath $CertificatePath).Path)
try {
    if ($certificate.Subject -cne 'CN=8AC4B328-845D-4C1C-B1FC-CE52C08F4693' -or $certificate.HasPrivateKey) {
        throw 'Expected the public WSL UI signing certificate.'
    }
    $signature = Get-AuthenticodeSignature -LiteralPath $PackagePath
    if (-not $signature.SignerCertificate -or $signature.SignerCertificate.Thumbprint -ne $certificate.Thumbprint) {
        throw 'The package is unsigned or its signer does not match the supplied certificate.'
    }
    if ($signature.Status -notin @('Valid', 'NotTrusted', 'UnknownError')) {
        throw "Package signature validation failed: $($signature.StatusMessage)"
    }
    if ($TrustCertificate) {
        # Windows may report an untrusted root as UnknownError. Require Valid after
        # the explicit trust step and roll back newly added trust on any failure.
        $target = "WSL UI certificate $($certificate.Thumbprint) in LocalMachine\TrustedPeople"
        if ($PSCmdlet.ShouldProcess($target, 'Trust this publisher for all users of this computer')) {
            $principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
            if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
                throw 'Run the -TrustCertificate step in an administrator PowerShell window, then install from your normal user account.'
            }
            $trustedPath = "Cert:/LocalMachine/TrustedPeople/$($certificate.Thumbprint)"
            $alreadyTrusted = Test-Path $trustedPath
            try {
                $null = Import-Certificate -FilePath $CertificatePath -CertStoreLocation 'Cert:/LocalMachine/TrustedPeople'
                if ((Get-AuthenticodeSignature -LiteralPath $PackagePath).Status -ne 'Valid') {
                    throw 'Package signature still fails validation after trusting the certificate. Do not install it.'
                }
            }
            catch {
                if (-not $alreadyTrusted -and (Test-Path $trustedPath)) { Remove-Item $trustedPath -Force }
                throw
            }
            Write-Host 'Certificate trusted. Run this script without -TrustCertificate from your normal user account to install.'
        }
        return
    }
    if ($signature.Status -ne 'Valid') {
        throw 'The package is not trusted. Run this script with -TrustCertificate in an administrator PowerShell window first, or ask your IT administrator.'
    }
    if ($PSCmdlet.ShouldProcess($PackagePath, 'Install or update WSL UI for the current user')) {
        Add-AppxPackage -Path $PackagePath
    }
}
finally { $certificate.Dispose() }
