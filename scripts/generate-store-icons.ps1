# Generate correctly-sized icons for Microsoft Store / MSIX
# Uses System.Drawing to resize the high-resolution icon.png

param(
    [switch]$Check  # Only check current sizes, don't regenerate
)

Add-Type -AssemblyName System.Drawing

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$IconsDir = Join-Path $ProjectRoot "src-tauri\icons"
$SourceIcon = Join-Path $IconsDir "icon.png"

# Required icon sizes for MSIX/Store
$RequiredIcons = @{
    "Square44x44Logo.png" = @{ Width = 44; Height = 44 }
    "Square71x71Logo.png" = @{ Width = 71; Height = 71 }
    "Square150x150Logo.png" = @{ Width = 150; Height = 150 }
    "Square310x310Logo.png" = @{ Width = 310; Height = 310 }
    "StoreLogo.png" = @{ Width = 50; Height = 50 }
    "Wide310x150Logo.png" = @{ Width = 310; Height = 150 }
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

$needsUpdate = $false

foreach ($iconName in $RequiredIcons.Keys) {
    $required = $RequiredIcons[$iconName]
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
    if ($needsUpdate) {
        Write-Host "Run without -Check to regenerate icons" -ForegroundColor Yellow
    } else {
        Write-Host "All icons are correctly sized!" -ForegroundColor Green
    }
    $sourceImg.Dispose()
    exit 0
}

if (-not $needsUpdate) {
    Write-Host "All icons are already correctly sized!" -ForegroundColor Green
    $sourceImg.Dispose()
    exit 0
}

Write-Host "Generating correctly-sized icons..." -ForegroundColor Yellow
Write-Host ""

foreach ($iconName in $RequiredIcons.Keys) {
    $required = $RequiredIcons[$iconName]
    $iconPath = Join-Path $IconsDir $iconName

    # Check if regeneration needed
    $needsRegen = $false
    if (-not (Test-Path $iconPath)) {
        $needsRegen = $true
    } else {
        $img = [System.Drawing.Image]::FromFile($iconPath)
        if ($img.Width -ne $required.Width -or $img.Height -ne $required.Height) {
            $needsRegen = $true
        }
        $img.Dispose()
    }

    if ($needsRegen) {
        Write-Host "  Generating $iconName ($($required.Width)x$($required.Height))..." -ForegroundColor Gray

        # Create a new bitmap with the target size
        $targetWidth = $required.Width
        $targetHeight = $required.Height
        $newImg = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)
        $graphics = [System.Drawing.Graphics]::FromImage($newImg)

        # High quality settings
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

        # For wide logo, center the icon
        if ($iconName -eq "Wide310x150Logo.png") {
            # Wide tile: put the icon in center, leave space on sides
            $iconSize = [Math]::Min($targetHeight - 20, 130)  # Leave some padding
            $x = ($targetWidth - $iconSize) / 2
            $y = ($targetHeight - $iconSize) / 2
            $graphics.Clear([System.Drawing.Color]::Transparent)
            $graphics.DrawImage($sourceImg, $x, $y, $iconSize, $iconSize)
        } else {
            # Square icons: fill the entire space
            $graphics.DrawImage($sourceImg, 0, 0, $targetWidth, $targetHeight)
        }

        $graphics.Dispose()

        # Save as PNG
        $newImg.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $newImg.Dispose()

        Write-Host "  Created: $iconName" -ForegroundColor Green
    }
}

$sourceImg.Dispose()

Write-Host ""
Write-Host "=== Icon Generation Complete ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "Run with -Check to verify all sizes" -ForegroundColor Gray
