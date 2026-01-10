# MSIX Validation Script
# Checks package structure without requiring WACK

$ErrorActionPreference = "Continue"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$MsixPath = Join-Path $ProjectRoot "dist\OctasoftLtd.wslui_0.1.0.0_x64.msix"
$ValidateDir = Join-Path $ProjectRoot "dist\msix-validate"

Write-Host "=== MSIX Validation Checklist ===" -ForegroundColor Cyan
Write-Host ""

# Check MSIX exists
if (-not (Test-Path $MsixPath)) {
    Write-Host "[ERROR] MSIX not found: $MsixPath" -ForegroundColor Red
    exit 1
}
Write-Host "[OK] MSIX exists: $MsixPath" -ForegroundColor Green
Write-Host ""

# Check manifest
Write-Host "1. Manifest Check:" -ForegroundColor Yellow
$manifestPath = Join-Path $ValidateDir "AppxManifest.xml"
if (Test-Path $manifestPath) {
    $manifest = [xml](Get-Content $manifestPath)
    Write-Host "   Identity Name: $($manifest.Package.Identity.Name)" -ForegroundColor White
    Write-Host "   Publisher: $($manifest.Package.Identity.Publisher)" -ForegroundColor White
    Write-Host "   Version: $($manifest.Package.Identity.Version)" -ForegroundColor White
    Write-Host "   Min Windows: $($manifest.Package.Dependencies.TargetDeviceFamily.MinVersion)" -ForegroundColor White

    # Check capabilities
    $caps = $manifest.Package.Capabilities.Capability | ForEach-Object { $_.Name }
    Write-Host "   Capabilities: $($caps -join ', ')" -ForegroundColor White

    if ($caps -contains "runFullTrust") {
        Write-Host "   [OK] runFullTrust capability present" -ForegroundColor Green
    } else {
        Write-Host "   [WARN] runFullTrust capability missing!" -ForegroundColor Red
    }
} else {
    Write-Host "   [ERROR] Manifest not found" -ForegroundColor Red
}
Write-Host ""

# Check required assets
Write-Host "2. Required Assets:" -ForegroundColor Yellow
$requiredAssets = @(
    "Square44x44Logo.png",
    "Square150x150Logo.png",
    "StoreLogo.png"
)
$optionalAssets = @(
    "Square71x71Logo.png",
    "Square310x310Logo.png",
    "Wide310x150Logo.png"
)

foreach ($asset in $requiredAssets) {
    $assetPath = Join-Path $ValidateDir "Assets\$asset"
    if (Test-Path $assetPath) {
        $size = (Get-Item $assetPath).Length
        Write-Host "   [OK] $asset ($size bytes)" -ForegroundColor Green
    } else {
        Write-Host "   [MISSING] $asset (REQUIRED)" -ForegroundColor Red
    }
}

foreach ($asset in $optionalAssets) {
    $assetPath = Join-Path $ValidateDir "Assets\$asset"
    if (Test-Path $assetPath) {
        Write-Host "   [OK] $asset (optional)" -ForegroundColor Green
    } else {
        Write-Host "   [INFO] $asset (optional, not present)" -ForegroundColor Gray
    }
}
Write-Host ""

# Check executable
Write-Host "3. Executable:" -ForegroundColor Yellow
$exePath = Join-Path $ValidateDir "wsl2-ui.exe"
if (Test-Path $exePath) {
    $size = [math]::Round((Get-Item $exePath).Length / 1MB, 2)
    Write-Host "   [OK] wsl2-ui.exe ($size MB)" -ForegroundColor Green

    # Check if it's a valid PE
    $bytes = [System.IO.File]::ReadAllBytes($exePath)
    if ($bytes[0] -eq 0x4D -and $bytes[1] -eq 0x5A) {
        Write-Host "   [OK] Valid PE executable" -ForegroundColor Green
    } else {
        Write-Host "   [ERROR] Invalid PE header" -ForegroundColor Red
    }
} else {
    Write-Host "   [MISSING] wsl2-ui.exe" -ForegroundColor Red
}
Write-Host ""

# Check signature
Write-Host "4. Digital Signature:" -ForegroundColor Yellow
$sigPath = Join-Path $ValidateDir "AppxSignature.p7x"
if (Test-Path $sigPath) {
    Write-Host "   [OK] Package is signed (AppxSignature.p7x present)" -ForegroundColor Green
} else {
    Write-Host "   [INFO] Package is unsigned" -ForegroundColor Yellow
    Write-Host "   This is OK for Store submission - Microsoft will sign it" -ForegroundColor Gray
}
Write-Host ""

# Check code integrity
Write-Host "5. Code Integrity:" -ForegroundColor Yellow
$catPath = Join-Path $ValidateDir "AppxMetadata\CodeIntegrity.cat"
if (Test-Path $catPath) {
    Write-Host "   [OK] CodeIntegrity.cat present" -ForegroundColor Green
} else {
    Write-Host "   [INFO] CodeIntegrity.cat not present (normal for test signed)" -ForegroundColor Gray
}
Write-Host ""

# Package size check
Write-Host "6. Package Size:" -ForegroundColor Yellow
$msixSize = [math]::Round((Get-Item $MsixPath).Length / 1MB, 2)
Write-Host "   MSIX size: $msixSize MB" -ForegroundColor White
if ($msixSize -lt 150) {
    Write-Host "   [OK] Under 150MB Store limit" -ForegroundColor Green
} else {
    Write-Host "   [WARN] Over 150MB - may need MSIX bundle for Store" -ForegroundColor Yellow
}
Write-Host ""

Write-Host "=== Validation Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Upload to Partner Center for final validation" -ForegroundColor White
Write-Host "2. Microsoft runs WACK automatically during submission" -ForegroundColor White
Write-Host "3. You'll see any issues before final submit" -ForegroundColor White
