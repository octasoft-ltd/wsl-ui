# Contributing to WSL UI

Thank you for your interest in contributing to WSL UI! We welcome bug reports,
feature suggestions, documentation improvements, and code contributions.

## Ways to Contribute

### Report Bugs

Found a bug? Please open an issue with:
- Steps to reproduce the issue
- Expected vs actual behavior
- WSL UI version and Windows version
- Screenshots if applicable

### Suggest Features

Have an idea? Open a feature request issue describing:
- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

### Improve Documentation

Help us improve the docs:
- Fix typos or unclear explanations
- Add examples
- Improve the troubleshooting guide

### Submit Code

Fix bugs or implement new features by submitting a pull request.

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 26 (see `.node-version`); Node 24 remains tested as a fallback
- [Rust](https://rustup.rs/) latest stable
- [Tauri CLI](https://tauri.app/v1/guides/getting-started/prerequisites)
- Windows (the app must be built on Windows, not inside WSL)

### Getting Started

```bash
# Clone the repository
git clone https://github.com/octasoft-ltd/wsl-ui.git
cd wsl-ui

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Run tests
npm run test:run

# Run linting
npm run lint
```

### Dependency Updates

Dependabot groups npm, Rust and GitHub Actions version updates into one weekly
digest PR on Mondays at 09:00 Europe/London, including major versions. Security
updates are raised separately and grouped by ecosystem. npm version updates
retain a three-day cooldown.

The scoped `@puppeteer/browsers` override removes vulnerable `extract-zip` from
WebdriverIO's browser-download tooling. `proxy-agent` is explicit because the new
browser helper makes proxy support optional. Remove the override when WebdriverIO
supports that helper version directly; verify a fresh driver download as well as
the desktop suite when changing it.

### Node runtime and rollback

Release builds and desktop E2E use `.node-version` (currently Node 26). CI runs
frontend tests and production builds on both Node 24 and 26. Node is build/test
tooling; the shipped Windows app runs Rust and WebView2, not Node.

CI sets `NODE_OPTIONS=--trace-deprecation` and retains test/build output in
`node-compatibility-24` and `node-compatibility-26` artifacts for 14 days. For a
local PowerShell run, set `$env:NODE_OPTIONS='--trace-deprecation'` before running
the tests, build and desktop checks. Review warnings even when commands pass.
The Node 26 trace exposed WebdriverIO's transitive `tsx` loader using deprecated
`module.register()`; the lockfile updates `tsx` to 4.23.15, which uses the newer
registration API.

To fall back, change `.node-version` to `24`, retain the CI matrix, and rerun the
build and desktop tests. If Node 24 becomes the long-term target, also return
`@types/node` to major 24 so type checking cannot admit Node-26-only APIs.

The upgrade review covers the [Node 25](https://nodejs.org/en/blog/release/v25.0.0)
and [Node 26](https://nodejs.org/en/blog/release/v26.0.0) major release notes.
Node 26 removes `http.Server.prototype.writeHeader`, legacy `_stream_*` modules,
and `--experimental-transform-types`, and deprecates `module.register()`.
Compile success alone does not validate native addons, HTTP behavior or test
runners: verify dependency installation, frontend tests/build, the native app
build and desktop tests. Keep mocked WSL results distinct from native WSL tests.

Action updates are pinned to upstream release commits. `setup-node` 7.1.0 adds
additional version-file formats, absolute-path support and download retries; `upload-artifact` 7.0.2 improves
rate-limit retries. These are updates within the existing action major versions;
changing `node-version` does not change the runtime bundled inside each action.
### Project Structure

```
wsl-ui/
├── src/                    # React frontend
│   ├── components/         # UI components
│   ├── services/           # Tauri API wrappers
│   ├── store/              # Zustand state management
│   └── test/               # Test files
├── src-tauri/              # Rust backend
│   ├── src/                # Rust source code
│   └── Cargo.toml
├── crates/wsl-core/        # Shared WSL parsing library
└── docs/                   # Documentation
```

## Contributing Translations

WSL UI uses [i18next](https://www.i18next.com/) with JSON translation files. Translations live in `src/i18n/locales/`.

### Adding a New Language

1. **Create the locale directory**

   ```bash
   mkdir src/i18n/locales/<code>
   ```

   Use the BCP 47 language code (e.g., `it` for Italian, `nl` for Dutch, `pt-PT` for European Portuguese).

2. **Copy English files as a starting point**

   ```bash
   cp src/i18n/locales/en/*.json src/i18n/locales/<code>/
   ```

3. **Translate all 10 namespace files**

   | File | Contents |
   |------|----------|
   | `common.json` | Buttons, labels, status labels, validation messages |
   | `header.json` | Navigation and header text |
   | `dashboard.json` | Main dashboard content |
   | `dialogs.json` | Modal and dialog text |
   | `settings.json` | Settings page content |
   | `actions.json` | Action menus and context menus |
   | `install.json` | Installation and setup messages |
   | `errors.json` | Error messages |
   | `help.json` | Help and documentation text |
   | `statusbar.json` | Status bar content |

   Translate only the values — never the keys.

4. **Create an index file**

   Copy the structure from an existing language:

   ```bash
   cp src/i18n/locales/fr/index.ts src/i18n/locales/<code>/index.ts
   ```

   No changes needed — it re-exports all 10 namespaces by name.

5. **Register the language in `src/i18n/index.ts`**

   Add an entry to `supportedLanguages`:

   ```ts
   { code: "it", name: "Italian", nativeName: "Italiano" },
   ```

   For RTL languages (Arabic, Hebrew, etc.), add `dir: "rtl" as const`:

   ```ts
   { code: "he", name: "Hebrew", nativeName: "עברית", dir: "rtl" as const },
   ```

   Add a lazy-load entry to `languageImports`:

   ```ts
   it: () => import("./locales/it/index").then((m) => m.default),
   ```

6. **Test your translation**

   ```bash
   npm run tauri dev
   ```

   Open Settings → Language and select your new language. Verify all UI strings appear correctly.

7. **Submit a pull request**

   Follow the [PR guidelines](#pull-request-guidelines) below. In the PR description, mention the language name and code, and note any strings that were left in English intentionally (e.g., proper nouns, technical terms).

### Requesting a Language

If you'd like a language added but cannot translate it yourself, [open a language request issue](https://github.com/octasoft-ltd/wsl-ui/issues/new?template=language-request.yml).

---

## Pull Request Guidelines

### Before Submitting

1. **Create a focused PR** - One feature or fix per PR
2. **Run tests** - Ensure all tests pass (`npm run test:run`)
3. **Run linting** - Check code quality (`npm run lint`)
4. **Update docs** - Document new features
5. **Add tests** - Include tests for new functionality

### PR Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Commit with a clear message
5. Push to your fork (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Commit Messages

Write clear, concise commit messages:
- Use present tense ("Add feature" not "Added feature")
- Keep the first line under 72 characters
- Reference issues when applicable (`Fixes #123`)

## Code Style

### TypeScript/React (Frontend)

- Use functional components with hooks
- Follow existing patterns in the codebase
- Use meaningful variable and function names
- Keep components focused and reusable

### Rust (Backend)

- Follow Rust idioms and best practices
- Use `thiserror` for error handling
- Write doc comments for public APIs
- Keep functions small and focused

## Testing

### Unit Tests

```bash
# Run in watch mode
npm run test

# Run once with coverage
npm run test:coverage
```

### E2E Tests

```bash
# Build the app first
npm run tauri build -- --debug

# Run E2E tests in mock mode
npm run test:e2e:dev
```

## License

By contributing, you agree that your contributions will be licensed under the
same [GPL-3.0](LICENSE) license as the project.

## Questions?

- Open an issue for questions
- Check existing issues and discussions
- See [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) for common issues

Thank you for contributing!
