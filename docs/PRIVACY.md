# WSL UI Privacy Policy

**Last updated:** January 2025

## Overview

WSL UI is a desktop application for managing Windows Subsystem for Linux (WSL) distributions. This privacy policy explains how we handle your data.

## Data Collection

**WSL UI does not collect, transmit, or store any personal data.**

All operations are performed locally on your machine. The application:
- Does NOT send any data to external servers
- Does NOT include analytics or telemetry
- Does NOT track usage patterns
- Does NOT require an account or login

## Local Storage

The application stores user preferences locally on your device:

- **Windows:** `%LOCALAPPDATA%\wsl-ui\`

This includes:
- Application settings (theme, polling intervals)
- Custom action configurations
- Window state preferences

You can delete this folder at any time to remove all stored preferences.

## Network Access

WSL UI may access the network only when you explicitly request it:

- **Installing distributions from Docker Hub** - Downloads container images
- **Installing from custom rootfs URLs** - Downloads files you specify
- **WSL updates** - Triggers Windows' built-in WSL update mechanism

All network requests are initiated by user action and go directly to the relevant service (Microsoft, Docker Hub, or URLs you provide). WSL UI does not proxy or intercept this traffic.

## Third-Party Services

When using certain features, data is sent to third-party services:

| Feature | Service | Data Sent |
|---------|---------|-----------|
| Install from Docker | Docker Hub | Image name requested |
| Install from Store | Microsoft | Distribution name |
| Custom rootfs | Your specified URL | HTTP request |

WSL UI does not control these third-party services. Please review their respective privacy policies.

## Permissions

WSL UI requires the following system access:

- **Full trust (runFullTrust)** - Required to execute WSL commands and access WSL filesystems
- **File system access** - To import/export distributions and browse WSL files

## Children's Privacy

WSL UI is a developer tool and is not directed at children under 13.

## Changes to This Policy

We may update this privacy policy from time to time. Changes will be posted in the application repository.

## Contact

For privacy concerns or questions:

- **GitHub Issues:** https://github.com/octasoft-ltd/wsl-ui/issues
- **Website:** https://www.octasoft.co.uk

## Source Available

WSL UI is source-available software licensed under BUSL-1.1. You can review the complete source code at:

https://github.com/octasoft-ltd/wsl-ui
