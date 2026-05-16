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

- [Node.js](https://nodejs.org/) v18 or later
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
