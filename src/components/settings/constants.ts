/**
 * Settings Page Constants
 */

import type { InstalledTerminal } from "../../types/settings";

export interface PresetOption {
  value: string;
  label: string;
  description: string;
  /** Whether this preset is disabled (e.g., terminal not installed) */
  disabled?: boolean;
}

export const IDE_PRESETS: PresetOption[] = [
  { value: "code", label: "VS Code", description: "Visual Studio Code" },
  { value: "cursor", label: "Cursor", description: "Cursor AI Editor" },
  { value: "custom", label: "Custom", description: "Enter a custom command" },
];

/** Base terminal presets (without installation status) */
const BASE_TERMINAL_PRESETS: PresetOption[] = [
  { value: "auto", label: "Auto-detect", description: "Try WT Preview → WT → cmd" },
  { value: "wt", label: "Windows Terminal", description: "Uses matching profile if exists, otherwise default" },
  { value: "wt-preview", label: "Windows Terminal Preview", description: "Uses matching profile if exists, otherwise default" },
  { value: "cmd", label: "Command Prompt", description: "Classic Windows cmd.exe" },
  { value: "custom", label: "Custom", description: "Enter a custom command" },
];

/** Default terminal presets (for backward compatibility) */
export const TERMINAL_PRESETS: PresetOption[] = BASE_TERMINAL_PRESETS;

/**
 * Get terminal presets with installation status
 * Updates descriptions to show which terminals are installed
 */
export function getTerminalPresetsWithStatus(installedTerminals: InstalledTerminal[]): PresetOption[] {
  const terminalMap = new Map(installedTerminals.map(t => [t.id, t]));

  return BASE_TERMINAL_PRESETS.map(preset => {
    // Check if this preset corresponds to a detectable terminal
    if (preset.value === "wt" || preset.value === "wt-preview") {
      const terminal = terminalMap.get(preset.value);
      if (terminal) {
        if (terminal.installed) {
          return {
            ...preset,
            description: `${preset.description} (Installed)`,
          };
        } else {
          return {
            ...preset,
            label: `${preset.label}`,
            description: "Not installed",
            disabled: true,
          };
        }
      }
    }
    return preset;
  });
}

export type SettingsTab = "app" | "appearance" | "polling" | "timeouts" | "executables" | "wsl-global" | "wsl-distro" | "actions" | "startup" | "distros" | "sources" | "privacy" | "about";

export type SettingsIconName = "settings" | "palette" | "refresh" | "clock" | "terminal" | "server" | "folder" | "sparkles" | "play" | "grid" | "download" | "shield" | "info";

export interface SettingsTabConfig {
  id: SettingsTab;
  label: string;
  icon: SettingsIconName;
}

export const SETTINGS_TABS: SettingsTabConfig[] = [
  { id: "app", label: "Application", icon: "settings" },
  { id: "appearance", label: "Appearance", icon: "palette" },
  { id: "polling", label: "Auto-Refresh", icon: "refresh" },
  { id: "timeouts", label: "Timeouts", icon: "clock" },
  { id: "executables", label: "Executable Paths", icon: "terminal" },
  { id: "wsl-global", label: "WSL Global", icon: "server" },
  { id: "wsl-distro", label: "Per-Distribution", icon: "folder" },
  { id: "actions", label: "Custom Actions", icon: "sparkles" },
  { id: "startup", label: "Startup", icon: "play" },
  { id: "distros", label: "Distro Catalog", icon: "grid" },
  { id: "sources", label: "Remote Sources", icon: "download" },
  { id: "privacy", label: "Privacy", icon: "shield" },
  { id: "about", label: "About", icon: "info" },
];



