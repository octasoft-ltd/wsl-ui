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

/**
 * Collect all leaf key paths from a nested object.
 * Returns an array of dot-separated key paths.
 */
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

/**
 * Get a value from a nested object using a dot-separated key path.
 */
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

/**
 * Set a value in a nested object using a dot-separated key path.
 * Creates intermediate objects as needed.
 */
function setNestedValue(obj, keyPath, value) {
  const parts = keyPath.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (!(parts[i] in current) || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

/**
 * Build a new object that follows the English key structure/ordering,
 * using existing translations where available, and "[EN] ..." placeholders
 * for missing keys.
 *
 * Returns { result, added, removed } where added/removed are arrays of key paths.
 */
function syncObject(enObj, localeObj) {
  const enPaths = collectKeyPaths(enObj);
  const localePaths = new Set(collectKeyPaths(localeObj));

  const added = [];
  const removed = [];

  // Find orphaned keys (in locale but not in English)
  for (const lp of localePaths) {
    if (getNestedValue(enObj, lp) === undefined) {
      // Check that this isn't a parent path that exists in English as a parent too
      // It's truly orphaned only if the English source doesn't have it at all
      removed.push(lp);
    }
  }

  // Build new object following English ordering
  const result = {};
  for (const keyPath of enPaths) {
    const existingValue = getNestedValue(localeObj, keyPath);
    if (existingValue !== undefined) {
      // Preserve existing translation
      setNestedValue(result, keyPath, existingValue);
    } else {
      // Add English value with [EN] prefix
      const enValue = getNestedValue(enObj, keyPath);
      const placeholder = typeof enValue === 'string' ? `[EN] ${enValue}` : enValue;
      setNestedValue(result, keyPath, placeholder);
      added.push(keyPath);
    }
  }

  return { result, added, removed };
}

// ---- Main ----
console.log('=== i18n Translation Sync ===\n');

const summary = {};
const errors = [];

for (const locale of NON_EN_LOCALES) {
  summary[locale] = { totalAdded: 0, totalRemoved: 0, addedKeys: [], removedKeys: [] };

  for (const file of FILES) {
    const enFilePath = path.join(EN_DIR, file);
    const localeFilePath = path.join(LOCALES_DIR, locale, file);

    // Read English source
    let enObj;
    try {
      enObj = JSON.parse(fs.readFileSync(enFilePath, 'utf-8'));
    } catch (err) {
      errors.push(`[ERROR] Failed to parse English file ${enFilePath}: ${err.message}`);
      continue;
    }

    // Read locale file (may not exist yet)
    let localeObj = {};
    if (fs.existsSync(localeFilePath)) {
      try {
        localeObj = JSON.parse(fs.readFileSync(localeFilePath, 'utf-8'));
      } catch (err) {
        errors.push(`[ERROR] Failed to parse ${localeFilePath}: ${err.message}`);
        continue;
      }
    } else {
      // If the locale file doesn't exist, we'll create it with all English values prefixed
      console.log(`  [NEW] ${locale}/${file} does not exist, creating it.`);
    }

    const { result, added, removed } = syncObject(enObj, localeObj);

    // Track stats
    if (added.length > 0 || removed.length > 0) {
      summary[locale].totalAdded += added.length;
      summary[locale].totalRemoved += removed.length;
      for (const k of added) summary[locale].addedKeys.push(`${file} -> ${k}`);
      for (const k of removed) summary[locale].removedKeys.push(`${file} -> ${k}`);
    }

    // Write the synced file (2-space indent + trailing newline)
    fs.writeFileSync(localeFilePath, JSON.stringify(result, null, 2) + '\n', 'utf-8');
  }
}

// ---- Report ----
console.log('--- Summary per locale ---\n');

let grandAdded = 0;
let grandRemoved = 0;

for (const locale of NON_EN_LOCALES) {
  const s = summary[locale];
  grandAdded += s.totalAdded;
  grandRemoved += s.totalRemoved;

  if (s.totalAdded === 0 && s.totalRemoved === 0) {
    console.log(`  ${locale}: already in sync`);
  } else {
    console.log(`  ${locale}: +${s.totalAdded} added, -${s.totalRemoved} removed`);
    if (s.addedKeys.length > 0) {
      for (const k of s.addedKeys) {
        console.log(`      + ${k}`);
      }
    }
    if (s.removedKeys.length > 0) {
      for (const k of s.removedKeys) {
        console.log(`      - ${k}`);
      }
    }
  }
}

console.log(`\n--- Totals ---`);
console.log(`  Keys added:   ${grandAdded}`);
console.log(`  Keys removed: ${grandRemoved}`);

if (errors.length > 0) {
  console.log(`\n--- Errors ---`);
  for (const e of errors) {
    console.log(`  ${e}`);
  }
}

console.log('\nDone.');
