# WSL UI Privacy Policy

**Last updated:** January 2026

## Overview

WSL UI is a desktop application for managing Windows Subsystem for Linux (WSL) distributions. This privacy policy explains how we handle your data.

## Analytics (Optional)

WSL UI includes optional, privacy-focused analytics powered by [Aptabase](https://aptabase.com). This is **disabled by default** and only enabled if you choose to opt in.

### What We Collect (When Enabled)

If you opt in to analytics, we collect:

| Data | Purpose |
|------|---------|
| App version | Understand which versions are in use |
| Windows version | Ensure compatibility |
| Number of distributions | Understand typical usage patterns |

### What We Never Collect

- Distribution names or paths
- File contents or paths
- Personal information
- IP addresses (Aptabase anonymizes these)
- Device identifiers

### Your Control

- **First Launch:** You'll be asked whether to enable analytics
- **Settings:** Toggle analytics on/off anytime in Settings → Privacy
- **No Account Required:** Analytics work without any login or registration

### Why Aptabase?

We chose [Aptabase](https://aptabase.com) because it's:
- Privacy-first by design
- GDPR compliant
- Open source
- Does not sell or share data
- Hosted in the EU

## Local Storage

The application stores user preferences locally on your device:

- **Windows:** `%LOCALAPPDATA%\wsl-ui\`

This includes:
- Application settings (theme, polling intervals)
- Custom action configurations
- Window state preferences
- Analytics preference (enabled/disabled)

You can delete this folder at any time to remove all stored preferences.

## Network Access

WSL UI may access the network in these situations:

### User-Initiated
- **Installing distributions from Docker Hub** - Downloads container images
- **Installing from custom rootfs URLs** - Downloads files you specify
- **WSL updates** - Triggers Windows' built-in WSL update mechanism

### Analytics (If Enabled)
- Sends anonymous usage events to Aptabase servers
- All data is transmitted securely over HTTPS
- No personal or identifying information is included

All user-initiated network requests go directly to the relevant service (Microsoft, Docker Hub, or URLs you provide). WSL UI does not proxy or intercept this traffic.

## Third-Party Services

When using certain features, data is sent to third-party services:

| Feature | Service | Data Sent |
|---------|---------|-----------|
| Install from Docker | Docker Hub | Image name requested |
| Install from Store | Microsoft | Distribution name |
| Custom rootfs | Your specified URL | HTTP request |
| Analytics (opt-in) | Aptabase | Anonymous usage data |

WSL UI does not control these third-party services. Please review their respective privacy policies:
- [Docker Privacy Policy](https://www.docker.com/legal/privacy)
- [Microsoft Privacy Statement](https://privacy.microsoft.com/)
- [Aptabase Privacy Policy](https://aptabase.com/legal/privacy)

## Permissions

WSL UI requires the following system access:

- **Full trust (runFullTrust)** - Required to execute WSL commands and access WSL filesystems
- **File system access** - To import/export distributions and browse WSL files

## Children's Privacy

WSL UI is a developer tool and is not directed at children under 13.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted in the application repository and noted in release notes.

## Contact

For privacy concerns or questions:

- **GitHub Issues:** https://github.com/octasoft-ltd/wsl-ui/issues
- **Website:** https://www.octasoft.co.uk

## Source Available

WSL UI is source-available software licensed under BUSL-1.1. You can review the complete source code at:

https://github.com/octasoft-ltd/wsl-ui
