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
