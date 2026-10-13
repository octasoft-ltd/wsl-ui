# Run with PowerShell 7: pwsh -File scripts/tests/msix-signing.Tests.ps1
# Uses real Windows SDK packaging/signing and a disposable certificate.
# Trust changes run only with -TestTrust on a disposable CI runner.
param([switch]$TestTrust)
$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot)
$signScript = Join-Path $root 'scripts/sign-msix.ps1'
$installScript = Join-Path $root 'scripts/Install-WSL-UI.ps1'
$temp = Join-Path ([IO.Path]::GetTempPath()) ('wsl-ui-msix-test-' + [guid]::NewGuid())
$previousPfx = $env:MSIX_SIGNING_CERTIFICATE
$previousPassword = $env:MSIX_SIGNING_PASSWORD

function Assert-Throws([scriptblock]$Action, [string]$Pattern) {
    try { & $Action; throw 'Expected an error, but the command succeeded.' }
    catch { if ($_.Exception.Message -notmatch $Pattern) { throw } }
}

try {
    New-Item -ItemType Directory -Path $temp | Out-Null
    $env:MSIX_SIGNING_CERTIFICATE = ''
    $env:MSIX_SIGNING_PASSWORD = ''
    Assert-Throws { & $signScript -PackagePath (Join-Path $temp 'missing.msix') } 'MSIX_SIGNING_CERTIFICATE'
    Write-Host 'PASS: Missing credentials fail explicitly.'

    $sdk = Get-ChildItem 'C:/Program Files (x86)/Windows Kits/10/bin/*/x64/makeappx.exe' |
        Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
    if (-not $sdk) { throw 'Windows SDK is required for these integration tests.' }
    $staging = New-Item -ItemType Directory -Path (Join-Path $temp 'staging')
    Copy-Item (Join-Path $root 'src-tauri/icons/StoreLogo.png') (Join-Path $staging 'Logo.png')
    Set-Content (Join-Path $staging 'app.exe') 'Packaging fixture; never executed.'
    @'
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10" xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10" xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities" IgnorableNamespaces="uap rescap">
  <Identity Name="OctasoftLtd.wslui" Publisher="CN=8AC4B328-845D-4C1C-B1FC-CE52C08F4693" Version="0.0.0.1" ProcessorArchitecture="x64" />
  <Properties><DisplayName>Test</DisplayName><PublisherDisplayName>Test</PublisherDisplayName><Logo>Logo.png</Logo></Properties>
  <Resources><Resource Language="en-us" /></Resources>
  <Dependencies><TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22621.0" /></Dependencies>
  <Applications><Application Id="App" Executable="app.exe" EntryPoint="Windows.FullTrustApplication"><uap:VisualElements DisplayName="Test" Description="Test" BackgroundColor="transparent" Square150x150Logo="Logo.png" Square44x44Logo="Logo.png" /></Application></Applications>
  <Capabilities><rescap:Capability Name="runFullTrust" /></Capabilities>
</Package>
'@ | Set-Content (Join-Path $staging 'AppxManifest.xml')
    $package = Join-Path $temp 'WSL.UI_0.0.0.1_x64.msix'
    & $sdk.FullName pack /d $staging /p $package /nv | Out-Host
    if ($LASTEXITCODE -ne 0) { throw 'Fixture packaging failed.' }
    $unsignedHash = (Get-FileHash $package).Hash
    Assert-Throws { & $installScript -PackagePath $package -WhatIf } 'certificate|unsigned'

    $rsa = [Security.Cryptography.RSA]::Create(2048)
    $request = [Security.Cryptography.X509Certificates.CertificateRequest]::new(
        'CN=8AC4B328-845D-4C1C-B1FC-CE52C08F4693', $rsa,
        [Security.Cryptography.HashAlgorithmName]::SHA256, [Security.Cryptography.RSASignaturePadding]::Pkcs1)
    $oids = [Security.Cryptography.OidCollection]::new()
    $null = $oids.Add([Security.Cryptography.Oid]::new('1.3.6.1.5.5.7.3.3'))
    $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509EnhancedKeyUsageExtension]::new($oids, $true))
    $request.CertificateExtensions.Add([Security.Cryptography.X509Certificates.X509BasicConstraintsExtension]::new($false, $false, 0, $true))
    $certificate = $request.CreateSelfSigned([DateTimeOffset]::Now.AddMinutes(-5), [DateTimeOffset]::Now.AddDays(1))
    $env:MSIX_SIGNING_PASSWORD = [guid]::NewGuid().ToString()
    $env:MSIX_SIGNING_CERTIFICATE = [Convert]::ToBase64String($certificate.Export(
        [Security.Cryptography.X509Certificates.X509ContentType]::Pfx, $env:MSIX_SIGNING_PASSWORD))
    & $signScript -PackagePath $package
    $public = [Security.Cryptography.X509Certificates.X509Certificate2]::new([IO.Path]::ChangeExtension($package, '.cer'))
    if ($public.HasPrivateKey -or $public.Thumbprint -ne $certificate.Thumbprint) { throw 'Wrong public certificate exported.' }
    $signature = Get-AuthenticodeSignature $package
    if ($signature.SignerCertificate.Thumbprint -ne $certificate.Thumbprint) { throw 'Package signer mismatch.' }
    if (-not $signature.TimeStamperCertificate) { throw 'Package must be timestamped.' }
    if (Test-Path "Cert:/CurrentUser/My/$($certificate.Thumbprint)") { throw 'Signing private key was not cleaned up.' }
    $storePackage = Join-Path $temp 'WSL.UI_0.0.0.1_x64_store.msix'
    if ((Get-FileHash $storePackage).Hash -ne $unsignedHash) { throw 'Store package was changed.' }
    Write-Host 'PASS: Real MSIX signed and timestamped, public-only CER exported, Store copy preserved, private key removed.'

    & $installScript -PackagePath $package -TrustCertificate -WhatIf
    & powershell.exe -NoProfile -NonInteractive -File $installScript -PackagePath $package -TrustCertificate -WhatIf
    if ($LASTEXITCODE -ne 0) { throw 'Windows PowerShell 5.1 trust preview failed.' }
    Assert-Throws { & $installScript -PackagePath $package -WhatIf } 'not trusted'
    Assert-Throws { & $signScript -PackagePath $storePackage -ExpectedPublisher 'CN=Wrong' } 'publisher'
    if (Test-Path "Cert:/CurrentUser/My/$($certificate.Thumbprint)") { throw 'Failed signing left a private key behind.' }
    Write-Host 'PASS: Trust can be previewed; installation requires trust; wrong publisher rejected and key cleaned up.'

    $failedPackage = Join-Path $temp 'failed.msix'
    Copy-Item $storePackage $failedPackage
    Assert-Throws { & $signScript -PackagePath $failedPackage -TimestampUrl 'http://127.0.0.1:1' } 'MSIX signing failed'
    if (Test-Path "Cert:/CurrentUser/My/$($certificate.Thumbprint)") { throw 'Timestamp failure left a private key behind.' }
    if (Test-Path (Join-Path $temp 'failed.cer')) { throw 'Failed signing published a certificate.' }
    Write-Host 'PASS: Timestamp failure is fatal and cleans up the private key.'

    if ($TestTrust) {
        try {
            & $installScript -PackagePath $package -TrustCertificate -Confirm:$false
            if ((Get-AuthenticodeSignature $package).Status -ne 'Valid') { throw 'Trusted package must validate.' }
            & $installScript -PackagePath $package -WhatIf
            & powershell.exe -NoProfile -NonInteractive -File $installScript -PackagePath $package -WhatIf
            if ($LASTEXITCODE -ne 0) { throw 'Windows PowerShell 5.1 installation preview failed.' }
            Write-Host 'PASS: Trust helper makes the real signature valid; installation can be previewed.'
        }
        finally {
            $trustedPath = "Cert:/LocalMachine/TrustedPeople/$($certificate.Thumbprint)"
            if (Test-Path $trustedPath) { Remove-Item $trustedPath -Force }
        }
    }
}
finally {
    $env:MSIX_SIGNING_CERTIFICATE = $previousPfx
    $env:MSIX_SIGNING_PASSWORD = $previousPassword
    if ($certificate) { $certificate.Dispose() }
    if ($rsa) { $rsa.Dispose() }
    # Only delete this run's unique temporary directory.
    if (Test-Path -LiteralPath $temp) {
        $resolvedTemp = (Resolve-Path -LiteralPath $temp).Path
        if ((Split-Path $resolvedTemp -Parent).TrimEnd('\') -ne [IO.Path]::GetTempPath().TrimEnd('\') -or
            (Split-Path $resolvedTemp -Leaf) -notlike 'wsl-ui-msix-test-*') { throw 'Unexpected test cleanup path.' }
        Remove-Item -LiteralPath $resolvedTemp -Recurse -Force
    }
}
# The timestamp failure test intentionally leaves a native nonzero exit code.
# Reset it for GitHub Actions' PowerShell wrapper after all assertions succeed.
exit 0
