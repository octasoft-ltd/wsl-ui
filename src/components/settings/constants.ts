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

export type SettingsTab = "app" | "appearance" | "polling" | "timeouts" | "executables" | "wsl-global" | "wsl-distro" | "actions" | "distros" | "sources" | "privacy" | "about";

export type SettingsIconName = "settings" | "palette" | "refresh" | "clock" | "terminal" | "server" | "folder" | "sparkles" | "grid" | "download" | "shield" | "info";

export interface SettingsTabConfig {
  id: SettingsTab;
  label: string;
  labelKey: string;
  icon: SettingsIconName;
}

export const SETTINGS_TABS: SettingsTabConfig[] = [
  { id: "app", label: "Application", labelKey: "settings:tabs.app", icon: "settings" },
  { id: "appearance", label: "Appearance", labelKey: "settings:tabs.appearance", icon: "palette" },
  { id: "polling", label: "Auto-Refresh", labelKey: "settings:tabs.polling", icon: "refresh" },
  { id: "timeouts", label: "Timeouts", labelKey: "settings:tabs.timeouts", icon: "clock" },
  { id: "executables", label: "Executable Paths", labelKey: "settings:tabs.executables", icon: "terminal" },
  { id: "wsl-global", label: "WSL Global", labelKey: "settings:tabs.wslGlobal", icon: "server" },
  { id: "wsl-distro", label: "Per-Distribution", labelKey: "settings:tabs.wslDistro", icon: "folder" },
  { id: "actions", label: "Custom Actions", labelKey: "settings:tabs.actions", icon: "sparkles" },
  { id: "distros", label: "Distro Catalog", labelKey: "settings:tabs.distros", icon: "grid" },
  { id: "sources", label: "Remote Sources", labelKey: "settings:tabs.sources", icon: "download" },
  { id: "privacy", label: "Privacy", labelKey: "settings:tabs.privacy", icon: "shield" },
  { id: "about", label: "About", labelKey: "settings:tabs.about", icon: "info" },
];



