# Generate correctly-sized icons for Microsoft Store / MSIX
# Uses System.Drawing to resize the high-resolution icon.png
# Includes target-size and scale variants for proper taskbar display

param(
    [switch]$Check  # Only check current sizes, don't regenerate
)

Add-Type -AssemblyName System.Drawing

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$IconsDir = Join-Path $ProjectRoot "src-tauri\icons"
$SourceIcon = Join-Path $IconsDir "icon.png"

# Required icon sizes for MSIX/Store - base icons
$RequiredIcons = @{
    "Square44x44Logo.png" = @{ Width = 44; Height = 44 }
    "Square71x71Logo.png" = @{ Width = 71; Height = 71 }
    "Square150x150Logo.png" = @{ Width = 150; Height = 150 }
    "Square310x310Logo.png" = @{ Width = 310; Height = 310 }
    "StoreLogo.png" = @{ Width = 50; Height = 50 }
    "Wide310x150Logo.png" = @{ Width = 310; Height = 150 }
}

# Target-size variants for Square44x44Logo (taskbar, jumplists)
# Only unplated variants - these show the icon without a tile background
$TargetSizeVariants = @(16, 24, 32, 48, 256)

# Helper function to create a square icon
function New-SquareIcon {
    param(
        [System.Drawing.Image]$Source,
        [string]$OutputPath,
        [int]$Size
    )

    $newImg = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($newImg)

    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    $graphics.DrawImage($Source, 0, 0, $Size, $Size)
    $graphics.Dispose()

    $newImg.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $newImg.Dispose()
}

# Helper function to check if icon needs regeneration
function Test-IconNeedsRegen {
    param(
        [string]$Path,
        [int]$RequiredWidth,
        [int]$RequiredHeight
    )

    if (-not (Test-Path $Path)) {
        return $true
    }

    $img = [System.Drawing.Image]::FromFile($Path)
    $needsRegen = ($img.Width -ne $RequiredWidth -or $img.Height -ne $RequiredHeight)
    $img.Dispose()
    return $needsRegen
}

Write-Host "=== Store Icon Generator ===" -ForegroundColor Cyan
Write-Host ""

# Check source exists
if (-not (Test-Path $SourceIcon)) {
    Write-Host "ERROR: Source icon not found: $SourceIcon" -ForegroundColor Red
    exit 1
}

$sourceImg = [System.Drawing.Image]::FromFile($SourceIcon)
Write-Host "Source: icon.png ($($sourceImg.Width)x$($sourceImg.Height))" -ForegroundColor Gray
Write-Host ""

# Build complete list of all icons to generate
$AllIcons = @{}

# Add base icons
foreach ($key in $RequiredIcons.Keys) {
    $AllIcons[$key] = $RequiredIcons[$key]
}

# Add target-size unplated variants (for taskbar)
foreach ($size in $TargetSizeVariants) {
    $AllIcons["Square44x44Logo.targetsize-${size}_altform-unplated.png"] = @{ Width = $size; Height = $size }
}

Write-Host "Checking icons..." -ForegroundColor Yellow
Write-Host ""

$needsUpdate = $false
$iconStatus = @{}

foreach ($iconName in $AllIcons.Keys | Sort-Object) {
    $required = $AllIcons[$iconName]
    $iconPath = Join-Path $IconsDir $iconName
    $status = "MISSING"
    $currentSize = ""

    if (Test-Path $iconPath) {
        $img = [System.Drawing.Image]::FromFile($iconPath)
        $currentSize = "$($img.Width)x$($img.Height)"

        if ($img.Width -eq $required.Width -and $img.Height -eq $required.Height) {
            $status = "OK"
        } else {
            $status = "WRONG SIZE"
            $needsUpdate = $true
        }
        $img.Dispose()
    } else {
        $needsUpdate = $true
    }

    $iconStatus[$iconName] = $status
    $requiredSize = "$($required.Width)x$($required.Height)"

    switch ($status) {
        "OK" {
            Write-Host "[OK] $iconName ($requiredSize)" -ForegroundColor Green
        }
        "WRONG SIZE" {
            Write-Host "[FIX] $iconName - current: $currentSize, required: $requiredSize" -ForegroundColor Yellow
        }
        "MISSING" {
            Write-Host "[ADD] $iconName - required: $requiredSize" -ForegroundColor Yellow
        }
    }
}

Write-Host ""

if ($Check) {
    $sourceImg.Dispose()
    if ($needsUpdate) {
        Write-Host "Run without -Check to regenerate icons" -ForegroundColor Yellow
        exit 1
    } else {
        Write-Host "All icons are correctly sized!" -ForegroundColor Green
        exit 0
    }
}

if (-not $needsUpdate) {
    Write-Host "All icons are already correctly sized!" -ForegroundColor Green
    $sourceImg.Dispose()
    exit 0
}

Write-Host "Generating icons..." -ForegroundColor Yellow
Write-Host ""

foreach ($iconName in $AllIcons.Keys | Sort-Object) {
    if ($iconStatus[$iconName] -eq "OK") {
        continue
    }

    $required = $AllIcons[$iconName]
    $iconPath = Join-Path $IconsDir $iconName
    $targetWidth = $required.Width
    $targetHeight = $required.Height

    Write-Host "  Generating $iconName (${targetWidth}x${targetHeight})..." -ForegroundColor Gray

    $newImg = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($newImg)

    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    # For wide logo, center the icon
    if ($iconName -eq "Wide310x150Logo.png") {
        $iconSize = [Math]::Min($targetHeight - 20, 130)
        $x = ($targetWidth - $iconSize) / 2
        $y = ($targetHeight - $iconSize) / 2
        $graphics.Clear([System.Drawing.Color]::Transparent)
        $graphics.DrawImage($sourceImg, $x, $y, $iconSize, $iconSize)
    } else {
        $graphics.DrawImage($sourceImg, 0, 0, $targetWidth, $targetHeight)
    }

    $graphics.Dispose()
    $newImg.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $newImg.Dispose()

    Write-Host "  Created: $iconName" -ForegroundColor Green
}

$sourceImg.Dispose()

Write-Host ""
Write-Host "=== Icon Generation Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Generated icons for:" -ForegroundColor Gray
Write-Host "  - Base tile icons (44x44 to 310x310)" -ForegroundColor Gray
Write-Host "  - Unplated target-size variants for taskbar (16, 24, 32, 48, 256px)" -ForegroundColor Gray
Write-Host ""
Write-Host "Run with -Check to verify all sizes" -ForegroundColor Gray
