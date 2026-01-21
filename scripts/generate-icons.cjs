/**
 * Generate all Tauri app icons from a single SVG source
 *
 * Uses sharp to render the SVG at each required size.
 * Source SVG should be edge-to-edge (no padding).
 *
 * Usage: node scripts/generate-icons.cjs [--check]
 */

const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;
const fs = require('fs');
const path = require('path');

const SOURCE_SVG = 'src-tauri/icons/wsl-ui-icon.svg';
const OUTPUT_DIR = 'src-tauri/icons';

// All icons to generate with their target sizes
const ICONS = {
  // Tauri bundle icons
  '32x32.png': { target: 32 },
  '64x64.png': { target: 64 },
  '128x128.png': { target: 128 },
  '128x128@2x.png': { target: 256 },
  'icon.png': { target: 512 },

  // MSIX base tile icons
  'Square44x44Logo.png': { target: 44 },
  'Square71x71Logo.png': { target: 71 },
  'Square150x150Logo.png': { target: 150 },
  'Square310x310Logo.png': { target: 310 },
  'StoreLogo.png': { target: 50 },
  'Wide310x150Logo.png': { target: [310, 150], wide: true },

  // MSIX targetsize unplated (taskbar icons)
  'Square44x44Logo.targetsize-16_altform-unplated.png': { target: 16 },
  'Square44x44Logo.targetsize-24_altform-unplated.png': { target: 24 },
  'Square44x44Logo.targetsize-32_altform-unplated.png': { target: 32 },
  'Square44x44Logo.targetsize-48_altform-unplated.png': { target: 48 },
  'Square44x44Logo.targetsize-256_altform-unplated.png': { target: 256 },
};

// ICO sizes
const ICO_SIZES = [16, 32, 48, 256];

/**
 * Render SVG to PNG at target size
 */
async function renderSvg(targetSize, wide = false) {
  const svgBuffer = fs.readFileSync(SOURCE_SVG);

  if (wide) {
    // Wide tile: render square then extend width with transparent padding
    const [targetWidth, targetHeight] = targetSize;
    const squareBuffer = await sharp(svgBuffer, { density: 300 })
      .resize(targetHeight, targetHeight)
      .png()
      .toBuffer();

    return sharp(squareBuffer)
      .extend({
        left: Math.floor((targetWidth - targetHeight) / 2),
        right: Math.ceil((targetWidth - targetHeight) / 2),
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .png()
      .toBuffer();
  }

  return sharp(svgBuffer, { density: 300 })
    .resize(targetSize, targetSize)
    .png()
    .toBuffer();
}

async function generateIcons(checkOnly = false) {
  console.log('=== Icon Generator ===\n');
  console.log(`Source: ${SOURCE_SVG}`);
  console.log(`Output: ${OUTPUT_DIR}/\n`);

  // Check source exists
  if (!fs.existsSync(SOURCE_SVG)) {
    console.error(`ERROR: Source SVG not found: ${SOURCE_SVG}`);
    console.error('\nCopy your icon SVG to this location and run again.');
    process.exit(1);
  }

  if (checkOnly) {
    console.log('Checking icons...\n');
  } else {
    console.log('Generating icons...\n');
  }

  let generated = 0;

  // Generate PNG icons
  for (const [filename, config] of Object.entries(ICONS)) {
    const outputPath = path.join(OUTPUT_DIR, filename);
    const targetSize = Array.isArray(config.target)
      ? config.target.join('x')
      : `${config.target}x${config.target}`;

    if (checkOnly) {
      const exists = fs.existsSync(outputPath);
      console.log(`[${exists ? 'OK' : 'MISSING'}] ${filename} (${targetSize})`);
      continue;
    }

    try {
      const buffer = await renderSvg(config.target, config.wide);
      fs.writeFileSync(outputPath, buffer);
      console.log(`  Created ${filename} (${targetSize})`);
      generated++;
    } catch (err) {
      console.error(`  ERROR ${filename}: ${err.message}`);
    }
  }

  // Generate ICO
  if (!checkOnly) {
    console.log('\nGenerating icon.ico...');
    try {
      const icoBuffers = [];
      for (const size of ICO_SIZES) {
        const buffer = await renderSvg(size);
        icoBuffers.push(buffer);
      }
      const icoBuffer = await pngToIco(icoBuffers);
      fs.writeFileSync(path.join(OUTPUT_DIR, 'icon.ico'), icoBuffer);
      console.log(`  Created icon.ico (sizes: ${ICO_SIZES.join(', ')})`);
      generated++;
    } catch (err) {
      console.error(`  ERROR icon.ico: ${err.message}`);
    }
  }

  console.log('\n=== Done ===');
  if (!checkOnly) {
    console.log(`Generated ${generated} icons from SVG source`);
  }
}

// Run
const checkOnly = process.argv.includes('--check');
generateIcons(checkOnly).catch(console.error);
