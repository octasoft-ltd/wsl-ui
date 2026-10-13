# Sign a GitHub release package using the persistent certificate held in CI secrets.
# Keep the password off command lines and never export the private key to release assets.
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$PackagePath,
    [string]$ExpectedPublisher = 'CN=8AC4B328-845D-4C1C-B1FC-CE52C08F4693',
    [string]$TimestampUrl = 'http://timestamp.digicert.com'
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:MSIX_SIGNING_CERTIFICATE) -or
    [string]::IsNullOrWhiteSpace($env:MSIX_SIGNING_PASSWORD)) {
    throw 'Configure MSIX_SIGNING_CERTIFICATE (base64 PFX) and MSIX_SIGNING_PASSWORD before releasing. See docs/MSIX-SIGNING.md.'
}
$PackagePath = (Resolve-Path -LiteralPath $PackagePath).Path
$signTool = Get-ChildItem 'C:/Program Files (x86)/Windows Kits/10/bin/*/x64/signtool.exe' |
    Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
if (-not $signTool) { throw 'Windows SDK SignTool is required.' }
$publicPath = [IO.Path]::ChangeExtension($PackagePath, '.cer')
$storePath = Join-Path (Split-Path $PackagePath) ([IO.Path]::GetFileNameWithoutExtension($PackagePath) + '_store.msix')
if (Test-Path -LiteralPath $storePath) { throw "Store copy already exists: $storePath. Rebuild before signing again." }

$certificate = $null
$imported = $false
$pfxPath = Join-Path ([IO.Path]::GetTempPath()) ('wsl-ui-sign-' + [guid]::NewGuid() + '.pfx')
try {
    $bytes = [Convert]::FromBase64String($env:MSIX_SIGNING_CERTIFICATE)
    $certificate = [Security.Cryptography.X509Certificates.X509Certificate2]::new(
        $bytes, $env:MSIX_SIGNING_PASSWORD, [Security.Cryptography.X509Certificates.X509KeyStorageFlags]::EphemeralKeySet)
    if (-not $certificate.HasPrivateKey) { throw 'Signing certificate has no private key.' }
    if ($certificate.Subject -cne $ExpectedPublisher) { throw 'Signing certificate subject must match the MSIX publisher.' }
    if ($certificate.NotAfter -le (Get-Date) -or $certificate.NotBefore -gt (Get-Date)) { throw 'Signing certificate is expired or not yet valid.' }
    if (Test-Path "Cert:/CurrentUser/My/$($certificate.Thumbprint)") {
        throw 'Signing certificate already exists in CurrentUser/My. Use a clean runner to avoid modifying an existing private key.'
    }
    [IO.File]::WriteAllBytes($pfxPath, $bytes)
    $password = ConvertTo-SecureString $env:MSIX_SIGNING_PASSWORD -AsPlainText -Force
    $null = Import-PfxCertificate -FilePath $pfxPath -Password $password -CertStoreLocation 'Cert:/CurrentUser/My'
    $imported = $true
    Remove-Item -LiteralPath $pfxPath -Force

    # Store submission continues to use the original unsigned bytes.
    Copy-Item -LiteralPath $PackagePath -Destination $storePath
    & $signTool.FullName sign /fd SHA256 /sha1 $certificate.Thumbprint /tr $TimestampUrl /td SHA256 $PackagePath
    if ($LASTEXITCODE -ne 0) { throw "MSIX signing failed (exit $LASTEXITCODE). No release should be uploaded." }
    $signature = Get-AuthenticodeSignature -LiteralPath $PackagePath
    if ($signature.SignerCertificate.Thumbprint -ne $certificate.Thumbprint -or -not $signature.TimeStamperCertificate) {
        throw 'The signed MSIX does not contain the expected signer and timestamp.'
    }
    [IO.File]::WriteAllBytes($publicPath, $certificate.Export([Security.Cryptography.X509Certificates.X509ContentType]::Cert))
    Write-Host "Signed: $PackagePath"
    Write-Host "Public certificate: $publicPath (thumbprint $($certificate.Thumbprint))"
}
finally {
    if (Test-Path -LiteralPath $pfxPath) { Remove-Item -LiteralPath $pfxPath -Force }
    if ($imported) { Remove-Item "Cert:/CurrentUser/My/$($certificate.Thumbprint)" -DeleteKey -Force }
    if ($certificate) { $certificate.Dispose() }
}
