# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

We take security vulnerabilities seriously. If you discover a security issue,
please report it responsibly.

### How to Report

**For sensitive security issues:**
- Email: wsl-ui@octasoft.co.uk
- Subject line: `[SECURITY] Brief description`

**For non-sensitive issues:**
- Open a GitHub issue at https://github.com/octasoft-ltd/wsl-ui/issues

### What to Include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response Timeline

- **Acknowledgment:** Within 48 hours
- **Initial assessment:** Within 7 days
- **Resolution target:** Within 30 days for critical issues

### Scope

The following are in scope:
- WSL UI desktop application
- Build and release pipeline
- Dependencies with known vulnerabilities

The following are out of scope:
- Issues in WSL itself (report to Microsoft)
- Issues in third-party distributions
- Social engineering attacks

## Security Considerations

### Permissions

WSL UI requires `runFullTrust` capability to manage WSL distributions. The
application:

- Executes `wsl.exe` and PowerShell for WSL management
- Reads Windows registry for distribution configuration
- Writes to `%LOCALAPPDATA%\wsl-ui\` for settings storage

### Data Handling

- No data is transmitted to external servers
- No telemetry or analytics
- All operations are local to your machine
- See [PRIVACY.md](docs/PRIVACY.md) for full details

### Network Access

Network requests only occur when you explicitly:
- Download distributions from Docker Hub or custom URLs
- Install from Microsoft Store
- Browse the LXC community catalog

## Acknowledgments

We appreciate responsible disclosure and will acknowledge security researchers
who report valid vulnerabilities (with permission).

## Dependency maintenance

Dependabot checks npm, both Cargo projects, and GitHub Actions every Monday.
Compatible version updates are grouped; major updates remain separate for npm
and Cargo. npm version updates use a three-day cooldown. Security updates are
exempt from that cooldown and have separate groups.

The configuration in `.github/dependabot.yml` takes effect on the default branch.
Repository-level Dependabot alerts and security update pull requests were enabled
on 2026-09-30. Changes still require review; automatic merging is not configured.

### Audit: 2026-09-30

This audit covers published dependency advisories and workflow dependencies. It
does not constitute a source-code penetration test.

| Scan | Before | After |
| --- | --- | --- |
| npm, including development tools | 36 affected packages: 4 critical, 27 high, 3 moderate, 2 low | 13 high, all from the `extract-zip` chain below |
| npm production dependencies | — | 0 |
| Tauri Cargo lockfile | 16 vulnerability entries, 13 warnings | 0 vulnerability entries, 2 warnings |
| Standalone wsl-core Cargo lockfile | — | 0 vulnerability entries or warnings |

Counts include transitive dependencies and repeated affected versions; they are
not counts of distinct CVEs. Results reflect the advisory databases at audit time.

Updates include Vite 7.3.6, Vitest/coverage 4.1.11, Sharp 0.35.5, WebdriverIO
9.32.0, PostCSS 8.5.28, and Tauri 2.12.0 with current compatible plugins.
The Rust lockfile now includes patched `bytes`, `h2`, `quick-xml`, `rustls`,
`rustls-webpki`, `tar`, and `time`; the vulnerable `rkyv` dependency was removed
by upstream dependency changes. Both Cargo lockfiles are tracked for repeatability.

GitHub Actions are pinned to release commit SHAs, and workflows use Node.js 24.
CI also disables dependency install scripts and checks the frontend build on pull
requests. Rust CI retains `cargo test` without `--locked` because release-please
bumps the local crate versions without updating their lockfile entries.
Tauri's action stays on 0.6.2 (which uses Node.js 24): its 1.0 release changes asset
labels and overwrites existing release names/bodies, so that migration needs a
separate release-pipeline review.

### Remaining findings and follow-up

- **Development tools: `extract-zip` 2.0.1.**
  [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)
  and [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3)
  describe archive symlink traversal/arbitrary file writes. WebdriverIO 9.32.0
  requires `@puppeteer/browsers` 2.x, which depends on this package. There is no
  patched `extract-zip` release. The current E2E configuration connects to a local
  `tauri-driver` on port 4444 rather than requesting a Puppeteer browser download,
  but this does not remove the vulnerable dependency. Avoid using this toolchain
  to extract untrusted browser archives. Recheck when WebdriverIO adopts
  `@puppeteer/browsers` 3.x, which removes `extract-zip`, or a patch is released.
  Do not use `npm audit fix --force`: its suggested WebdriverIO downgrade is not
  a compatible remediation.
- **Rust platform dependencies:**
  [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html)
  affects `glib` 0.18.5 (iterator unsoundness; fixed in 0.20.0), and
  [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html)
  flags unmaintained `proc-macro-error` 1.0.4. Both remain in Tauri's dependency
  lockfile but are absent from the Windows x86_64 dependency tree. Follow upstream
  Tauri/GTK updates; reassess before supporting Linux. No advisories are suppressed.
- **Temporary Mocha override:** `package.json` selects `serialize-javascript`
  7.1.2 or newer within major 7 for Mocha, fixing
  [GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq)
  and [GHSA-qj8w-gfj5-8c6v](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v).
  A Mocha parallel-worker smoke test passed with this override. Remove it once
  WebdriverIO's Mocha dependency permits a patched serializer itself.

### Verification and repeat scans

Verified on Windows with Node.js 24.20.0 and Rust 1.98.0:

- Clean `npm ci --ignore-scripts`, frontend build, and 717 tests with coverage.
- 377 Tauri tests and 41 wsl-core tests using `cargo test --locked`.
- Sharp native resize/PNG round trip and Mocha parallel-worker smoke test.
- Workflow linting with actionlint and Dependabot JSON-schema validation.

Full desktop E2E tests and release publishing were not run.

```powershell
npm audit
npm audit --omit=dev
cargo audit --file src-tauri/Cargo.lock
cargo audit --file crates/wsl-core/Cargo.lock
npm run build
npm run test:coverage
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo test --locked --manifest-path crates/wsl-core/Cargo.toml
```

`cargo audit` requires the cargo-audit tool and an up-to-date RustSec database.
The audit used a disposable Podman scanner with only copies of the lockfiles
mounted read-only. npm install scripts remained disabled throughout.
