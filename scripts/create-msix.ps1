# Create MSIX Package Script
# This script automates the creation of an MSIX package from the MSI installer
# Requires: MSIX Packaging Tool installed from Microsoft Store

param(
    [string]$Version = "0.1.0.0",
    [switch]$Sign,
    [string]$CertThumbprint = ""
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== WSL UI MSIX Package Creator ===" -ForegroundColor Cyan
Write-Host ""

# Paths
$MsiPath = Join-Path $ProjectRoot "src-tauri\target\release\bundle\msi\WSL UI_0.1.0_x64_en-US.msi"
$OutputDir = Join-Path $ProjectRoot "dist"
$TemplatePath = Join-Path $ProjectRoot "scripts\msix-template.xml"
$MsixToolPath = "${env:ProgramFiles}\WindowsApps\Microsoft.MSIXPackagingTool_*\MsixPackagingTool.exe"

# Package identity (from Partner Center)
$PackageName = "OctasoftLtd.wslui"
$Publisher = "CN=8AC4B328-845D-4C1C-B1FC-CE52C08F4693"
$PublisherDisplayName = "Octasoft Ltd"
$DisplayName = "WSL UI"
$Description = "A modern WSL2 distribution manager"

# Verify MSI exists
if (-not (Test-Path $MsiPath)) {
    Write-Host "ERROR: MSI not found at: $MsiPath" -ForegroundColor Red
    Write-Host "Run 'npm run tauri build' first to generate the MSI." -ForegroundColor Yellow
    exit 1
}

# Create output directory
if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

# Find MSIX Packaging Tool
$MsixTool = Get-Item $MsixToolPath -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $MsixTool) {
    Write-Host "ERROR: MSIX Packaging Tool not found." -ForegroundColor Red
    Write-Host "Install it from the Microsoft Store: 'MSIX Packaging Tool'" -ForegroundColor Yellow
    exit 1
}

Write-Host "MSI Path: $MsiPath" -ForegroundColor Gray
Write-Host "Output Dir: $OutputDir" -ForegroundColor Gray
Write-Host "Version: $Version" -ForegroundColor Gray
Write-Host ""

# Method 1: Try MSIX Packaging Tool CLI
Write-Host "Attempting MSIX Packaging Tool CLI..." -ForegroundColor Yellow

# Update template with current version
$TemplateContent = Get-Content $TemplatePath -Raw
$TemplateContent = $TemplateContent -replace 'Version="[^"]*"', "Version=`"$Version`""
$TempTemplate = Join-Path $env:TEMP "msix-template-temp.xml"
$TemplateContent | Set-Content $TempTemplate -Encoding UTF8

try {
    # Run MSIX Packaging Tool in conversion mode
    # Note: This requires running in an elevated context and may need a clean VM
    & $MsixTool.FullName create-package --template $TempTemplate

    if ($LASTEXITCODE -eq 0) {
        Write-Host "MSIX created successfully!" -ForegroundColor Green
    } else {
        throw "MSIX Packaging Tool returned exit code: $LASTEXITCODE"
    }
} catch {
    Write-Host "CLI method failed: $_" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "The MSIX Packaging Tool CLI requires a clean environment." -ForegroundColor Yellow
    Write-Host "Please use the GUI method or Option 2 (makeappx) below." -ForegroundColor Yellow
}

# Clean up temp template
Remove-Item $TempTemplate -ErrorAction SilentlyContinue

Write-Host ""
Write-Host "=== Alternative: Manual makeappx Method ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "If CLI failed, you can create MSIX manually:" -ForegroundColor Yellow
Write-Host "1. Run MSIX Packaging Tool GUI" -ForegroundColor White
Write-Host "2. Select 'Application package'" -ForegroundColor White
Write-Host "3. Use MSI: $MsiPath" -ForegroundColor White
Write-Host "4. Package name: $PackageName" -ForegroundColor White
Write-Host "5. Publisher: $Publisher" -ForegroundColor White
Write-Host "6. Version: $Version" -ForegroundColor White
Write-Host ""

# Sign if requested
if ($Sign -and $CertThumbprint) {
    $MsixFile = Get-ChildItem $OutputDir -Filter "*.msix" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($MsixFile) {
        Write-Host "Signing MSIX with certificate: $CertThumbprint" -ForegroundColor Yellow
        $SignTool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter "signtool.exe" |
                    Select-Object -First 1
        if ($SignTool) {
            & $SignTool.FullName sign /fd SHA256 /sha1 $CertThumbprint $MsixFile.FullName
            Write-Host "MSIX signed successfully!" -ForegroundColor Green
        }
    }
}

Write-Host ""
Write-Host "Done!" -ForegroundColor Green
