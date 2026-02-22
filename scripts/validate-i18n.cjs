const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const EN_DIR = path.join(LOCALES_DIR, 'en');

const FILES = [
  'common.json',
  'header.json',
  'dashboard.json',
  'dialogs.json',
  'settings.json',
  'actions.json',
  'install.json',
  'errors.json',
  'help.json',
  'statusbar.json',
];

const NON_EN_LOCALES = ['ar', 'de', 'es', 'fr', 'hi', 'ja', 'ko', 'pt-BR', 'zh-CN', 'zh-TW'];

/** Collect all leaf key paths from a nested object. */
function collectKeyPaths(obj, prefix = '') {
  const paths = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (obj[key] !== null && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      paths.push(...collectKeyPaths(obj[key], fullKey));
    } else {
      paths.push(fullKey);
    }
  }
  return paths;
}

/** Get a value from a nested object using a dot-separated key path. */
function getNestedValue(obj, keyPath) {
  const parts = keyPath.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/** Extract all {{var}} interpolation variables from a string. */
function extractVars(str) {
  if (typeof str !== 'string') return new Set();
  const matches = str.match(/\{\{[^}]+\}\}/g);
  return new Set(matches || []);
}

// ---- Main ----
console.log('=== i18n Validation Report ===\n');

let totalIssues = 0;

// -- Part 1: Key count comparison --
console.log('--- 1. Key Count Comparison (per file) ---\n');

const enKeyCounts = {};  // file -> count
for (const file of FILES) {
  const enObj = JSON.parse(fs.readFileSync(path.join(EN_DIR, file), 'utf-8'));
  enKeyCounts[file] = collectKeyPaths(enObj).length;
}

let keyCountIssues = 0;
for (const locale of NON_EN_LOCALES) {
  const mismatches = [];
  let localeTotalKeys = 0;
  let enTotalKeys = 0;

  for (const file of FILES) {
    const localeFilePath = path.join(LOCALES_DIR, locale, file);
    if (!fs.existsSync(localeFilePath)) {
      mismatches.push(`  ${file}: MISSING (en has ${enKeyCounts[file]} keys)`);
      keyCountIssues++;
      enTotalKeys += enKeyCounts[file];
      continue;
    }
    const localeObj = JSON.parse(fs.readFileSync(localeFilePath, 'utf-8'));
    const localeCount = collectKeyPaths(localeObj).length;
    localeTotalKeys += localeCount;
    enTotalKeys += enKeyCounts[file];

    if (localeCount !== enKeyCounts[file]) {
      mismatches.push(`  ${file}: en=${enKeyCounts[file]}, ${locale}=${localeCount} (diff: ${localeCount - enKeyCounts[file]})`);
      keyCountIssues++;
    }
  }

  if (mismatches.length === 0) {
    console.log(`  ${locale}: OK (${localeTotalKeys} keys match en)`);
  } else {
    console.log(`  ${locale}: MISMATCH`);
    for (const m of mismatches) console.log(`    ${m}`);
  }
}

totalIssues += keyCountIssues;
console.log(`\n  Key count issues: ${keyCountIssues}\n`);

// -- Part 2: Missing / extra keys --
console.log('--- 2. Missing & Extra Keys ---\n');

let missingKeyIssues = 0;
let extraKeyIssues = 0;

for (const locale of NON_EN_LOCALES) {
  const localeMissing = [];
  const localeExtra = [];

  for (const file of FILES) {
    const enObj = JSON.parse(fs.readFileSync(path.join(EN_DIR, file), 'utf-8'));
    const localeFilePath = path.join(LOCALES_DIR, locale, file);
    if (!fs.existsSync(localeFilePath)) continue;

    const localeObj = JSON.parse(fs.readFileSync(localeFilePath, 'utf-8'));
    const enPaths = new Set(collectKeyPaths(enObj));
    const localePaths = new Set(collectKeyPaths(localeObj));

    for (const p of enPaths) {
      if (!localePaths.has(p)) {
        localeMissing.push(`${file} -> ${p}`);
      }
    }
    for (const p of localePaths) {
      if (!enPaths.has(p)) {
        localeExtra.push(`${file} -> ${p}`);
      }
    }
  }

  if (localeMissing.length === 0 && localeExtra.length === 0) {
    console.log(`  ${locale}: OK`);
  } else {
    if (localeMissing.length > 0) {
      console.log(`  ${locale}: ${localeMissing.length} missing key(s)`);
      for (const k of localeMissing) console.log(`    MISSING: ${k}`);
      missingKeyIssues += localeMissing.length;
    }
    if (localeExtra.length > 0) {
      console.log(`  ${locale}: ${localeExtra.length} extra key(s)`);
      for (const k of localeExtra) console.log(`    EXTRA:   ${k}`);
      extraKeyIssues += localeExtra.length;
    }
  }
}

totalIssues += missingKeyIssues + extraKeyIssues;
console.log(`\n  Missing keys: ${missingKeyIssues}`);
console.log(`  Extra keys:   ${extraKeyIssues}\n`);

// -- Part 3: Interpolation variable mismatches --
console.log('--- 3. Interpolation Variable Mismatches ---\n');

let varIssues = 0;

for (const locale of NON_EN_LOCALES) {
  const localeVarIssues = [];

  for (const file of FILES) {
    const enObj = JSON.parse(fs.readFileSync(path.join(EN_DIR, file), 'utf-8'));
    const localeFilePath = path.join(LOCALES_DIR, locale, file);
    if (!fs.existsSync(localeFilePath)) continue;

    const localeObj = JSON.parse(fs.readFileSync(localeFilePath, 'utf-8'));
    const enPaths = collectKeyPaths(enObj);

    for (const keyPath of enPaths) {
      const enValue = getNestedValue(enObj, keyPath);
      const localeValue = getNestedValue(localeObj, keyPath);

      if (typeof enValue !== 'string' || typeof localeValue !== 'string') continue;

      const enVars = extractVars(enValue);
      const localeVars = extractVars(localeValue);

      // Variables in English but missing from translation
      const missingInTranslation = [];
      for (const v of enVars) {
        if (!localeVars.has(v)) missingInTranslation.push(v);
      }

      // Variables in translation but not in English
      const extraInTranslation = [];
      for (const v of localeVars) {
        if (!enVars.has(v)) extraInTranslation.push(v);
      }

      if (missingInTranslation.length > 0 || extraInTranslation.length > 0) {
        let detail = `${file} -> ${keyPath}:`;
        if (missingInTranslation.length > 0) {
          detail += ` missing ${missingInTranslation.join(', ')}`;
        }
        if (extraInTranslation.length > 0) {
          detail += ` extra ${extraInTranslation.join(', ')}`;
        }
        localeVarIssues.push(detail);
      }
    }
  }

  if (localeVarIssues.length === 0) {
    console.log(`  ${locale}: OK`);
  } else {
    console.log(`  ${locale}: ${localeVarIssues.length} interpolation issue(s)`);
    for (const issue of localeVarIssues) {
      console.log(`    ${issue}`);
    }
    varIssues += localeVarIssues.length;
  }
}

totalIssues += varIssues;
console.log(`\n  Interpolation issues: ${varIssues}\n`);

// -- Final Summary --
console.log('=== Final Summary ===');
console.log(`  Total issues found: ${totalIssues}`);
if (totalIssues === 0) {
  console.log('  All locales are fully in sync with English. No issues detected.');
} else {
  console.log('  Please fix the issues listed above.');
}
console.log('\nDone.');

process.exit(totalIssues > 0 ? 1 : 0);
