# Build MSIX Package Script
# Creates MSIX directly using makeappx.exe from Windows SDK
# This bypasses the MSIX Packaging Tool GUI entirely

param(
    [string]$Version = "0.1.0.0",
    [switch]$Sign,
    [string]$CertThumbprint = "7F9F0BCCFFE3E145AC666178D4AD9E95743D26BE",
    [switch]$Install
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host "=== WSL UI MSIX Builder ===" -ForegroundColor Cyan
Write-Host ""

# Package identity (from Partner Center)
$PackageName = "OctasoftLtd.wslui"
$PackageFamilyName = "OctasoftLtd.wslui_w3j9wqjt4fgp6"
$Publisher = "CN=8AC4B328-845D-4C1C-B1FC-CE52C08F4693"
$PublisherDisplayName = "Octasoft Ltd"
$DisplayName = "WSL UI"
$Description = "A modern WSL2 distribution manager"

# Paths
$ExePath = Join-Path $ProjectRoot "src-tauri\target\release\wsl2-ui.exe"
$IconsDir = Join-Path $ProjectRoot "src-tauri\icons"
$OutputDir = Join-Path $ProjectRoot "dist"
$StagingDir = Join-Path $OutputDir "msix-staging"
$MsixOutput = Join-Path $OutputDir "${PackageName}_${Version}_x64.msix"

# Find Windows SDK tools by searching for makeappx.exe
$MakeAppx = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter "makeappx.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match "x64" } |
            Sort-Object { [version]($_.FullName -replace '.*\\(\d+\.\d+\.\d+\.\d+)\\.*', '$1') } -Descending |
            Select-Object -First 1 -ExpandProperty FullName

if (-not $MakeAppx) {
    Write-Host "ERROR: Windows SDK not found. Install Windows SDK with App Certification Kit." -ForegroundColor Red
    exit 1
}

$SdkBinPath = Split-Path $MakeAppx
$SignTool = Join-Path $SdkBinPath "signtool.exe"
$MakePri = Join-Path $SdkBinPath "makepri.exe"

# Verify exe exists
if (-not (Test-Path $ExePath)) {
    Write-Host "ERROR: Executable not found at: $ExePath" -ForegroundColor Red
    Write-Host "Run 'npm run tauri build' first." -ForegroundColor Yellow
    exit 1
}

Write-Host "SDK Path: $SdkBinPath" -ForegroundColor Gray
Write-Host "Exe Path: $ExePath" -ForegroundColor Gray
Write-Host "Version: $Version" -ForegroundColor Gray
Write-Host ""

# Clean and create staging directory
if (Test-Path $StagingDir) {
    Remove-Item $StagingDir -Recurse -Force
}
New-Item -ItemType Directory -Path $StagingDir | Out-Null
New-Item -ItemType Directory -Path "$StagingDir\Assets" | Out-Null

Write-Host "Copying application files..." -ForegroundColor Yellow

# Copy main executable
Copy-Item $ExePath $StagingDir

# Copy WebView2Loader.dll if present
$WebView2Loader = Join-Path (Split-Path $ExePath) "WebView2Loader.dll"
if (Test-Path $WebView2Loader) {
    Copy-Item $WebView2Loader $StagingDir
}

# Copy icons/assets - these must be exact sizes per Microsoft Store requirements
# Run generate-store-icons.ps1 first to ensure correct sizes
$RequiredAssets = @(
    "Square44x44Logo.png",   # 44x44
    "Square71x71Logo.png",   # 71x71
    "Square150x150Logo.png", # 150x150
    "Square310x310Logo.png", # 310x310
    "StoreLogo.png",         # 50x50
    "Wide310x150Logo.png"    # 310x150
)

foreach ($asset in $RequiredAssets) {
    $srcPath = Join-Path $IconsDir $asset
    if (Test-Path $srcPath) {
        Copy-Item $srcPath (Join-Path "$StagingDir\Assets" $asset)
    } else {
        Write-Host "WARNING: Missing icon $asset - run generate-store-icons.ps1 first" -ForegroundColor Yellow
    }
}

Write-Host "Creating AppxManifest.xml..." -ForegroundColor Yellow

# Create AppxManifest.xml
$Manifest = @"
<?xml version="1.0" encoding="utf-8"?>
<Package xmlns="http://schemas.microsoft.com/appx/manifest/foundation/windows10"
         xmlns:uap="http://schemas.microsoft.com/appx/manifest/uap/windows10"
         xmlns:rescap="http://schemas.microsoft.com/appx/manifest/foundation/windows10/restrictedcapabilities"
         IgnorableNamespaces="uap rescap">
  <Identity Name="$PackageName"
            Publisher="$Publisher"
            Version="$Version"
            ProcessorArchitecture="x64" />
  <Properties>
    <DisplayName>$DisplayName</DisplayName>
    <PublisherDisplayName>$PublisherDisplayName</PublisherDisplayName>
    <Description>$Description</Description>
    <Logo>Assets\StoreLogo.png</Logo>
  </Properties>
  <Resources>
    <Resource Language="en-us" />
  </Resources>
  <Dependencies>
    <TargetDeviceFamily Name="Windows.Desktop" MinVersion="10.0.17763.0" MaxVersionTested="10.0.22621.0" />
  </Dependencies>
  <Applications>
    <Application Id="App" Executable="wsl2-ui.exe" EntryPoint="Windows.FullTrustApplication">
      <uap:VisualElements DisplayName="$DisplayName"
                          Description="$Description"
                          BackgroundColor="transparent"
                          Square150x150Logo="Assets\Square150x150Logo.png"
                          Square44x44Logo="Assets\Square44x44Logo.png">
        <uap:DefaultTile Wide310x150Logo="Assets\Wide310x150Logo.png"
                         Square310x310Logo="Assets\Square310x310Logo.png"
                         Square71x71Logo="Assets\Square71x71Logo.png" />
      </uap:VisualElements>
    </Application>
  </Applications>
  <Capabilities>
    <rescap:Capability Name="runFullTrust" />
  </Capabilities>
</Package>
"@

$Manifest | Set-Content (Join-Path $StagingDir "AppxManifest.xml") -Encoding UTF8

Write-Host "Creating MSIX package..." -ForegroundColor Yellow

# Remove old MSIX if exists
if (Test-Path $MsixOutput) {
    Remove-Item $MsixOutput -Force
}

# Create MSIX package
& $MakeAppx pack /d $StagingDir /p $MsixOutput /nv

if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: makeappx failed with exit code $LASTEXITCODE" -ForegroundColor Red
    exit 1
}

Write-Host "MSIX created: $MsixOutput" -ForegroundColor Green
Write-Host ""

# Sign if requested
if ($Sign) {
    Write-Host "Signing MSIX package..." -ForegroundColor Yellow
    & $SignTool sign /fd SHA256 /sha1 $CertThumbprint $MsixOutput

    if ($LASTEXITCODE -ne 0) {
        Write-Host "WARNING: Signing failed. Package is unsigned." -ForegroundColor Yellow
    } else {
        Write-Host "MSIX signed successfully!" -ForegroundColor Green
    }
}

# Install if requested
if ($Install) {
    Write-Host ""
    Write-Host "Installing MSIX package..." -ForegroundColor Yellow

    # Remove existing package if present
    $existing = Get-AppPackage -Name $PackageName -ErrorAction SilentlyContinue
    if ($existing) {
        Write-Host "Removing existing package..." -ForegroundColor Gray
        Remove-AppPackage -Package $existing.PackageFullName
    }

    Add-AppPackage -Path $MsixOutput

    if ($LASTEXITCODE -eq 0) {
        Write-Host "MSIX installed successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "Launch with: Start-Process 'shell:AppsFolder\${PackageFamilyName}!App'" -ForegroundColor Cyan
    }
}

# Cleanup staging
Remove-Item $StagingDir -Recurse -Force

Write-Host ""
Write-Host "=== Build Complete ===" -ForegroundColor Cyan
Write-Host "MSIX: $MsixOutput" -ForegroundColor White
Write-Host ""
Write-Host "To sign and install:" -ForegroundColor Yellow
Write-Host "  .\scripts\build-msix.ps1 -Sign -Install" -ForegroundColor White
Write-Host ""
Write-Host "For Store submission, upload the unsigned MSIX to Partner Center." -ForegroundColor Yellow
