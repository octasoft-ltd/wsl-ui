# Dependency security audit implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement the tasks inline.

**Goal:** Audit and update npm, Rust, and GitHub Actions dependencies and configure Dependabot.
**Architecture:** Use upstream advisory databases and existing lockfiles as the baseline. Prefer compatible updates, review necessary version-range changes, and validate with the existing build and test suites.
**Tech Stack:** npm, React, Vite, Vitest, Rust, Tauri, GitHub Actions.
**Spec:** User request: audit recent CVEs, update dependencies, and add Dependabot to GitHub.

## Constraints

- Preserve unrelated local files and disabled npm install scripts.
- Cover root npm, src-tauri Cargo, crates/wsl-core Cargo, and GitHub Actions.
- Keep findings without an upstream fix visible; do not suppress advisories to obtain a clean result.
- Prepare local changes; do not publish a release or merge automatically.

## Review focus

- Both Cargo manifests must be covered by Dependabot.
- Native npm binaries must work with install scripts disabled.
- Compatible updates must preserve frontend builds and existing unit tests.
- Rust dependency changes must compile for the Windows application.
- Distinguish actionable security findings from unmaintained platform dependencies.

## Tasks

- [x] Capture npm and Rust audit baselines and inspect workflow action versions.
- [x] Update npm package.json/package-lock.json and Cargo manifests/lockfiles where needed; repeat audits.
- [x] Add .github/dependabot.yml for all dependency roots, weekly checks, grouped compatible updates, and a three-day npm cooldown.
- [x] Update vulnerable or obsolete workflow dependencies and validate YAML.
- [x] Run npm build/test/coverage and Rust tests with locked dependencies; document residual advisories and verification limits.
- [x] Review the final diff and report GitHub activation status.
