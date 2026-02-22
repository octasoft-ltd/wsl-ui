/**
 * Comprehensive i18n verification script.
 *
 * Checks:
 *  1. Structural integrity (file counts, barrel exports, JSON parsing)
 *  2. Key completeness (bidirectional)
 *  3. Interpolation variable consistency
 *  4. No [EN] placeholders
 *  5. Untranslated strings (smart check)
 *  6. Component coverage (hardcoded user-visible strings)
 *  7. Translation quality heuristics
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const LOCALES_DIR = path.join(ROOT_DIR, 'src', 'i18n', 'locales');
const EN_DIR = path.join(LOCALES_DIR, 'en');
const COMPONENTS_DIR = path.join(ROOT_DIR, 'src', 'components');

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

const MAX_ISSUES_TO_SHOW = 20;

/** Collect all leaf key paths from a nested object. */
function collectKeyPaths(obj, prefix) {
  prefix = prefix || '';
  const paths = [];
  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? prefix + '.' + key : key;
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

// Unicode character ranges for script detection
const CJK_REGEX = /[\u3000-\u9FFF\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/;
const ARABIC_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const DEVANAGARI_REGEX = /[\u0900-\u097F\uA8E0-\uA8FF]/;

const TECHNICAL_TERMS = new Set([
  'WSL', 'WSL 1', 'WSL 2', 'WSLg', 'WSL UI', 'WSL Global', 'WSL GitHub',
  'VHDX', 'VHD', 'ext4', 'ext3', 'NTFS', 'Btrfs', 'XFS', 'FAT32', 'exFAT',
  'NTFS (Windows)',
  'Docker', 'Podman',
  'IP', 'CPU', 'GPU', 'DNS', 'NAT', 'UNC', 'GUI', 'VM', 'OCI', 'UAC',
  'GB', 'TB', 'MB', 'KB', 'SSH', 'HTTP', 'HTTPS', 'URL', 'API', 'CLI', 'IDE',
  'DXCore', 'MSRDC', 'Direct3D', 'systemd', 'dmesg', 'fstab', 'fstrim', 'sudo', 'xrdp',
  'Linux', 'Windows', 'Ubuntu', 'Debian', 'Fedora', 'Arch',
  'Tauri', 'React', 'Rust', 'GitHub', 'Aptabase',
  'VS Code', 'Cursor', 'Alacritty', 'Kitty', 'WezTerm', 'IntelliJ',
  'Visual Studio Code', 'Windows Terminal', 'Windows Terminal Preview',
  'PowerShell', 'Windows Subsystem for Linux', 'Command Prompt',
  'Apache License 2.0', 'Business Source License 1.1',
  'N/A', 'Linux Containers', 'Octasoft Ltd',
  'Status', 'Online', 'Offline', 'Escape', 'Promise',
  // Words identical in many European languages
  'Terminal', 'Installation', 'Updates', 'Hostname', 'Interop',
  'Community', 'Container', 'Download', 'Partition',
  // Short labels that are same across languages
  'Name *', 'Error:', 'WSL GitHub',
  // Words identical in French/Spanish/Portuguese
  'Options', 'Source', 'Configuration', 'Application', 'Accent', 'Danger',
  'Variables', 'Description', 'Instances',
  // Words identical in French
  'distribution', 'distributions',
]);

/**
 * Strings that are legitimately identical to English in certain locales.
 * Many languages borrow English words for tech/UI concepts.
 * Format: exact string -> set of locales where it's OK to be identical.
 * If a string is in TECHNICAL_TERMS it's already globally allowed.
 */
const LOCALE_SPECIFIC_IDENTICAL = {
  'Status': new Set(['de', 'fr', 'es', 'pt-BR']),
  'Online': new Set(['de', 'fr', 'es', 'pt-BR']),
  'Offline': new Set(['de', 'fr', 'es', 'pt-BR']),
  'Version': new Set(['de', 'fr']),
  'Partition': new Set(['de', 'fr']),
  'Partition (optional)': new Set(['de', 'fr']),
  'Online ({{count}})': new Set(['de', 'pt-BR']),
  'Offline ({{count}})': new Set(['de', 'pt-BR']),
  'in {{hours}}h': new Set(['de']),
};

/**
 * Check if a value is expected to be identical across locales
 * (technical terms, numbers, URLs, paths, keyboard shortcuts, etc.)
 */
function isKnownIdentical(value, locale) {
  if (typeof value !== 'string') return true;
  const trimmed = value.trim();
  if (trimmed.length < 3) return true;
  if (TECHNICAL_TERMS.has(trimmed)) return true;
  // Locale-specific identical words (e.g. "Status" is the same in German)
  if (locale && LOCALE_SPECIFIC_IDENTICAL[trimmed] && LOCALE_SPECIFIC_IDENTICAL[trimmed].has(locale)) return true;
  // Strings that are mostly product/brand names with minor formatting
  if (/^[A-Z][a-z]+ [A-Z]/.test(trimmed) && trimmed.split(' ').length <= 4 && !/\b(the|a|an|is|are|to|for|in|on|of|with|and|or|but|not|this|that|it|by)\b/i.test(trimmed)) return true;
  // Variable-only strings or strings where non-variable part is a known term
  const withoutVars = trimmed.replace(/\{\{[^}]+\}\}/g, '').trim();
  if (withoutVars.length === 0) return true;
  // After removing vars, if what remains is a known term, skip
  if (TECHNICAL_TERMS.has(withoutVars)) return true;
  // After removing vars, if only short common words remain (e.g. "in {{hours}}h" -> "in h")
  const withoutVarsAlpha = withoutVars.replace(/[^a-zA-Z\s]/g, '').trim();
  if (withoutVarsAlpha.length <= 3) return true;
  // Time duration patterns (e.g., "1 minute", "30 seconds", "2 minutes")
  if (/^\d+\s*(second|seconds|minute|minutes|hour|hours|week|weeks)$/i.test(trimmed)) return true;
  // URLs
  if (/^https?:\/\//.test(trimmed)) return true;
  // UNC / backslash paths
  if (/^\\/.test(trimmed)) return true;
  // Keyboard shortcuts
  if (/^(Ctrl|Alt|Shift|Meta|Cmd)\+/i.test(trimmed)) return true;
  // Version strings
  if (/^v?\d+(\.\d+)+/.test(trimmed)) return true;
  // Pure numbers with optional units
  if (/^\d+(\.\d+)?\s*(GB|TB|MB|KB|ms|s|%)?$/i.test(trimmed)) return true;
  // Shell variables
  if (/\$[A-Z_]/.test(trimmed)) return true;
  // Windows/WSL paths
  if (trimmed.indexOf('\\') >= 0 || trimmed.indexOf('wsl$') >= 0) return true;
  // Mostly non-alpha content
  const stripped = trimmed.replace(/\{\{[^}]+\}\}/g, '').replace(/[^a-zA-Z]/g, '');
  if (stripped.length <= 2) return true;
  // Executables
  if (/\.exe\b/.test(trimmed)) return true;
  // CLI flags
  if (/--[a-z]/.test(trimmed) && trimmed.indexOf(' ') >= 0) return true;
  // Email addresses
  if (/\S+@\S+\.\S+/.test(trimmed)) return true;
  return false;
}

function truncate(str, max) {
  max = max || 80;
  if (typeof str !== 'string') return String(str);
  return str.length > max ? str.slice(0, max) + '...' : str;
}

function printIssues(issues, limit) {
  limit = limit || MAX_ISSUES_TO_SHOW;
  const shown = issues.slice(0, limit);
  for (const issue of shown) {
    console.log('    ' + issue);
  }
  if (issues.length > limit) {
    console.log('    ... and ' + (issues.length - limit) + ' more (' + issues.length + ' total)');
  }
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (e) {
    return null;
  }
}

function findTsxFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findTsxFiles(fullPath));
    } else if (entry.name.endsWith('.tsx')) {
      results.push(fullPath);
    }
  }
  return results;
}

// ---- Load English data ----
const enData = {};
const enKeys = {};
const enValues = {};

for (const file of FILES) {
  const filePath = path.join(EN_DIR, file);
  const parsed = readJsonSafe(filePath);
  if (parsed) {
    enData[file] = parsed;
    const paths = collectKeyPaths(parsed);
    enKeys[file] = new Set(paths);
    enValues[file] = {};
    for (const p of paths) {
      enValues[file][p] = getNestedValue(parsed, p);
    }
  }
}

// ---- Begin Verification ----
console.log('=== i18n Verification Report ===\n');

// ============================================================
// CHECK 1: Structural Integrity
// ============================================================
console.log('CHECK 1: Structural Integrity');
console.log('------------------------------------------------------------');

let check1Pass = true;
const check1Issues = [];

for (const locale of NON_EN_LOCALES) {
  const localeDir = path.join(LOCALES_DIR, locale);

  for (const f of FILES) {
    const fp = path.join(localeDir, f);
    if (!fs.existsSync(fp)) {
      check1Issues.push('[' + locale + '] Missing file: ' + f);
      check1Pass = false;
    } else {
      const parsed = readJsonSafe(fp);
      if (parsed === null) {
        check1Issues.push('[' + locale + '] JSON parse error: ' + f);
        check1Pass = false;
      }
    }
  }

  const actualJsonFiles = fs.readdirSync(localeDir).filter(fn => fn.endsWith('.json'));
  if (actualJsonFiles.length !== FILES.length) {
    check1Issues.push('[' + locale + '] Expected ' + FILES.length + ' JSON files, found ' + actualJsonFiles.length);
    check1Pass = false;
  }

  if (!fs.existsSync(path.join(localeDir, 'index.ts'))) {
    check1Issues.push('[' + locale + '] Missing index.ts barrel export');
    check1Pass = false;
  }
}

if (check1Pass) {
  console.log('  PASS - All ' + NON_EN_LOCALES.length + ' locales have ' + FILES.length + ' JSON files + index.ts');
} else {
  console.log('  FAIL - ' + check1Issues.length + ' issue(s):');
  printIssues(check1Issues);
}
console.log();

// ============================================================
// CHECK 2: Key Completeness (bidirectional)
// ============================================================
console.log('CHECK 2: Key Completeness');
console.log('------------------------------------------------------------');

let check2Pass = true;
const check2Issues = [];

for (const locale of NON_EN_LOCALES) {
  for (const file of FILES) {
    const lfp = path.join(LOCALES_DIR, locale, file);
    if (!fs.existsSync(lfp)) continue;
    const lo = readJsonSafe(lfp);
    if (!lo) continue;

    const localePaths = new Set(collectKeyPaths(lo));
    const englishPaths = enKeys[file] || new Set();

    for (const p of englishPaths) {
      if (!localePaths.has(p)) {
        check2Issues.push('[' + locale + '] ' + file + ': MISSING "' + p + '"');
        check2Pass = false;
      }
    }

    for (const p of localePaths) {
      if (!englishPaths.has(p)) {
        check2Issues.push('[' + locale + '] ' + file + ': ORPHAN "' + p + '"');
        check2Pass = false;
      }
    }
  }
}

if (check2Pass) {
  console.log('  PASS - All keys match bidirectionally');
} else {
  console.log('  FAIL - ' + check2Issues.length + ' issue(s):');
  printIssues(check2Issues);
}
console.log();

// ============================================================
// CHECK 3: Interpolation Variable Consistency
// ============================================================
console.log('CHECK 3: Interpolation Variables');
console.log('------------------------------------------------------------');

let check3Pass = true;
const check3Issues = [];

for (const locale of NON_EN_LOCALES) {
  for (const file of FILES) {
    const lfp = path.join(LOCALES_DIR, locale, file);
    if (!fs.existsSync(lfp)) continue;
    const lo = readJsonSafe(lfp);
    if (!lo) continue;

    for (const kp of (enKeys[file] || new Set())) {
      const ev = enValues[file][kp];
      const lv = getNestedValue(lo, kp);
      if (typeof ev !== 'string' || typeof lv !== 'string') continue;

      const evv = extractVars(ev);
      const lvv = extractVars(lv);

      const missing = [];
      for (const v of evv) { if (!lvv.has(v)) missing.push(v); }
      const extra = [];
      for (const v of lvv) { if (!evv.has(v)) extra.push(v); }

      if (missing.length > 0 || extra.length > 0) {
        let d = '[' + locale + '] ' + file + ' -> ' + kp;
        if (missing.length > 0) d += ' | missing: ' + missing.join(', ');
        if (extra.length > 0) d += ' | extra: ' + extra.join(', ');
        d += '\n      EN:    ' + truncate(ev);
        d += '\n      ' + locale.toUpperCase() + ': ' + truncate(lv);
        check3Issues.push(d);
        check3Pass = false;
      }
    }
  }
}

if (check3Pass) {
  console.log('  PASS - All interpolation variables match');
} else {
  console.log('  FAIL - ' + check3Issues.length + ' issue(s):');
  printIssues(check3Issues);
}
console.log();

// ============================================================
// CHECK 4: No [EN] Placeholders
// ============================================================
console.log('CHECK 4: No [EN] Placeholders');
console.log('------------------------------------------------------------');

let check4Pass = true;
const check4Issues = [];

for (const locale of NON_EN_LOCALES) {
  for (const file of FILES) {
    const lfp = path.join(LOCALES_DIR, locale, file);
    if (!fs.existsSync(lfp)) continue;
    const lo = readJsonSafe(lfp);
    if (!lo) continue;

    const localePaths = collectKeyPaths(lo);
    for (const kp of localePaths) {
      const val = getNestedValue(lo, kp);
      if (typeof val === 'string' && val.startsWith('[EN]')) {
        check4Issues.push('[' + locale + '] ' + file + ' -> ' + kp + ': "' + truncate(val, 60) + '"');
        check4Pass = false;
      }
    }
  }
}

if (check4Pass) {
  console.log('  PASS - No [EN] placeholders found');
} else {
  console.log('  FAIL - ' + check4Issues.length + ' found:');
  printIssues(check4Issues);
}
console.log();

// ============================================================
// CHECK 5: Untranslated Strings (smart check)
// ============================================================
console.log('CHECK 5: Untranslated Strings');
console.log('------------------------------------------------------------');

let check5Pass = true;
const check5Issues = [];

for (const locale of NON_EN_LOCALES) {
  for (const file of FILES) {
    const lfp = path.join(LOCALES_DIR, locale, file);
    if (!fs.existsSync(lfp)) continue;
    const lo = readJsonSafe(lfp);
    if (!lo) continue;

    for (const kp of (enKeys[file] || new Set())) {
      const ev = enValues[file][kp];
      const lv = getNestedValue(lo, kp);
      if (typeof ev !== 'string' || typeof lv !== 'string') continue;
      if (ev !== lv) continue;
      if (ev.length <= 5) continue;
      if (isKnownIdentical(ev, locale)) continue;
      check5Issues.push('[' + locale + '] ' + file + ' -> ' + kp + ': "' + truncate(ev, 60) + '"');
      check5Pass = false;
    }
  }
}

if (check5Pass) {
  console.log('  PASS - No suspicious untranslated strings');
} else {
  console.log('  FAIL - ' + check5Issues.length + ' suspicious:');
  printIssues(check5Issues);
}
console.log();

// ============================================================
// CHECK 6: Component Coverage (hardcoded user-visible strings)
// ============================================================
console.log('CHECK 6: Component Coverage');
console.log('------------------------------------------------------------');

let check6Pass = true;
const check6Issues = [];
const BT = String.fromCharCode(96); // backtick
const DL = String.fromCharCode(36); // dollar sign

const tsxFiles = findTsxFiles(COMPONENTS_DIR).filter(f => !f.endsWith('.test.tsx'));

for (const tsxFile of tsxFiles) {
  const rp = path.relative(ROOT_DIR, tsxFile).split(path.sep).join('/');
  const cnt = fs.readFileSync(tsxFile, 'utf-8');

  // Check for hardcoded text between JSX tags: >text<
  const jsxTextRe = new RegExp('>([^<>{}' + BT + '\n]+)<', 'g');
  let m;
  while ((m = jsxTextRe.exec(cnt)) !== null) {
    const text = m[1].trim();
    if (!text || text.length <= 1) continue;
    if (/^\s*$/.test(text)) continue;
    if (/^[\d.%px,\s]+$/.test(text) && !/[a-zA-Z]/.test(text)) continue;
    if (/^[a-z]+-[a-z]+/i.test(text) && text.indexOf(' ') < 0) continue;
    if (text.charAt(0) === '{' || text.charAt(text.length - 1) === '}') continue;
    if (/^[a-z][a-zA-Z]+$/.test(text) || /^\d+$/.test(text) || /^[A-Z_]+$/.test(text) || /^v\d/.test(text)) continue;
    if (!/[a-zA-Z]{2,}/.test(text)) continue;
    const isMultiWord = text.indexOf(' ') >= 0;
    const isSingleVisibleWord = !isMultiWord && text.length >= 4 && /^[A-Z][a-z]+/.test(text) && text.indexOf('.') < 0;
    if (!isMultiWord && !isSingleVisibleWord) continue;
    if (/^(className|data-|aria-|key=|ref=|id=)/.test(text)) continue;
    if (text.indexOf('=') >= 0 || text.indexOf(DL + '{') >= 0) continue;
    // Skip code patterns (ternary, logical, etc.)
    if (/&&|[|][|]|^\s*:/.test(text)) continue;
    if (TECHNICAL_TERMS.has(text.trim())) continue;
    const low = text.trim().toLowerCase();
    const htmlTags = ['div','span','button','input','select','option','form','label','section','header','footer','main','nav','aside'];
    if (htmlTags.indexOf(low) >= 0) continue;
    check6Issues.push(rp + ': "' + truncate(text, 60) + '"');
  }

  // Check hardcoded strings in props
  const propDefs = [
    { prop: 'title', re: new RegExp('\btitle="([^"]+)"', 'g') },
    { prop: 'placeholder', re: new RegExp('\bplaceholder="([^"]+)"', 'g') },
    { prop: 'aria-label', re: new RegExp('\baria-label="([^"]+)"', 'g') },
    { prop: 'label', re: new RegExp('\blabel="([^"]+)"', 'g') },
  ];

  for (const pd of propDefs) {
    pd.re.lastIndex = 0;
    let pm;
    while ((pm = pd.re.exec(cnt)) !== null) {
      const pt = pm[1].trim();
      if (!pt || pt.length <= 1 || pt.trim().length === 0) continue;
      if (pt.charAt(0) === '{' || pt.indexOf(DL + '{') >= 0) continue;
      if (/^[\d.%px,\s]+$/.test(pt) && !/[a-zA-Z]/.test(pt)) continue;
      if (/^[a-z]+-[a-z]+$/i.test(pt) && pt.indexOf(' ') < 0) continue;
      if (!/[a-zA-Z]{2,}/.test(pt) || TECHNICAL_TERMS.has(pt)) continue;
      if (/^[a-z][a-zA-Z]+$/.test(pt) && pt.indexOf(' ') < 0) continue;
      check6Issues.push(rp + ' [prop]: ' + pd.prop + '="' + truncate(pt, 50) + '"');
    }
  }
}

// Deduplicate
const uniqueCheck6 = [];
const seen6 = {};
for (const issue of check6Issues) {
  if (!seen6[issue]) {
    seen6[issue] = true;
    uniqueCheck6.push(issue);
  }
}

check6Pass = uniqueCheck6.length === 0;
if (check6Pass) {
  console.log('  PASS - No hardcoded user-visible strings found');
} else {
  console.log('  FAIL - ' + uniqueCheck6.length + ' potential hardcoded string(s):');
  printIssues(uniqueCheck6);
}
console.log();

// ============================================================
// CHECK 7: Translation Quality Heuristics
// ============================================================
console.log('CHECK 7: Translation Quality');
console.log('------------------------------------------------------------');

let check7Pass = true;
const check7Issues = [];
const CJK_LOCALES = ['zh-CN', 'zh-TW', 'ja', 'ko'];
const ARABIC_LOCALES = ['ar'];
const HINDI_LOCALES = ['hi'];

for (const locale of NON_EN_LOCALES) {
  const expectCJK = CJK_LOCALES.indexOf(locale) >= 0;
  const expectArabic = ARABIC_LOCALES.indexOf(locale) >= 0;
  const expectDevanagari = HINDI_LOCALES.indexOf(locale) >= 0;

  for (const file of FILES) {
    const lfp = path.join(LOCALES_DIR, locale, file);
    if (!fs.existsSync(lfp)) continue;
    const lo = readJsonSafe(lfp);
    if (!lo) continue;

    for (const kp of (enKeys[file] || new Set())) {
      const ev = enValues[file][kp];
      const lv = getNestedValue(lo, kp);
      if (typeof ev !== 'string' || typeof lv !== 'string') continue;
      if (isKnownIdentical(ev, locale)) continue;

      // Skip if the translation itself looks technical/brand
      if (isKnownIdentical(lv, locale)) continue;
      // Strip interpolation vars and non-alpha for checking
      const realText = lv.replace(/\{\{[^}]+\}\}/g, '').replace(/[^a-zA-Z\u0600-\u06FF\u0900-\u097F\u3000-\u9FFF\uAC00-\uD7AF]/g, '');
      if (realText.length < 3) continue;

      if (expectCJK && lv !== ev && !CJK_REGEX.test(lv)) {
        check7Issues.push('[' + locale + '] ' + file + ' -> ' + kp + ': No CJK chars\n      Value: "' + truncate(lv, 60) + '"');
        check7Pass = false;
      }

      if (expectArabic && lv !== ev && !ARABIC_REGEX.test(lv)) {
        check7Issues.push('[' + locale + '] ' + file + ' -> ' + kp + ': No Arabic chars\n      Value: "' + truncate(lv, 60) + '"');
        check7Pass = false;
      }

      if (expectDevanagari && lv !== ev && !DEVANAGARI_REGEX.test(lv)) {
        check7Issues.push('[' + locale + '] ' + file + ' -> ' + kp + ': No Devanagari chars\n      Value: "' + truncate(lv, 60) + '"');
        check7Pass = false;
      }

      // Flag identical-to-English strings for non-Latin script locales
      if ((expectCJK || expectArabic || expectDevanagari) && lv === ev && ev.length > 10) {
        check7Issues.push('[' + locale + '] ' + file + ' -> ' + kp + ': Identical to English\n      Value: "' + truncate(ev, 60) + '"');
        check7Pass = false;
      }
    }
  }
}

if (check7Pass) {
  console.log('  PASS - Translation quality heuristics passed');
} else {
  console.log('  FAIL - ' + check7Issues.length + ' quality issue(s):');
  printIssues(check7Issues);
}
console.log();

// ============================================================
// Summary
// ============================================================
console.log('============================================================');
console.log('=== i18n Verification Summary ===');
console.log('============================================================');

const results = [
  { name: 'Structural Integrity',   pass: check1Pass, count: check1Issues.length },
  { name: 'Key Completeness',       pass: check2Pass, count: check2Issues.length },
  { name: 'Interpolation Variables', pass: check3Pass, count: check3Issues.length },
  { name: 'No [EN] Placeholders',   pass: check4Pass, count: check4Issues.length },
  { name: 'Untranslated Strings',   pass: check5Pass, count: check5Issues.length },
  { name: 'Component Coverage',     pass: check6Pass, count: uniqueCheck6.length },
  { name: 'Translation Quality',    pass: check7Pass, count: check7Issues.length },
];

let overall = true;
for (let i = 0; i < results.length; i++) {
  const r = results[i];
  const status = r.pass ? 'PASS' : 'FAIL';
  const detail = r.pass ? '' : ' (' + r.count + ' issue' + (r.count !== 1 ? 's' : '') + ')';
  let name = r.name;
  while (name.length < 26) name += ' ';
  console.log('CHECK ' + (i + 1) + ': ' + name + ' ' + status + detail);
  if (!r.pass) overall = false;
}

console.log();
console.log('OVERALL: ' + (overall ? 'PASS' : 'FAIL'));
console.log();
process.exit(overall ? 0 : 1);
