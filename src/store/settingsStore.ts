import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { AppSettings } from "../types/settings";
import { DEFAULT_SETTINGS } from "../types/settings";
import { logger, debug, info } from "../utils/logger";
import { usePreflightStore } from "./preflightStore";

interface SettingsStore {
  settings: AppSettings;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  // Actions
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => Promise<void>;
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoading: false,
  isSaving: false,
  error: null,

  loadSettings: async () => {
    debug("[SettingsStore] Loading settings");
    set({ isLoading: true, error: null });
    try {
      const loaded = await invoke<Partial<AppSettings>>("get_settings");
      // Merge with defaults to ensure new fields have values
      const settings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ...loaded,
        // Deep merge for nested objects
        pollingIntervals: {
          ...DEFAULT_SETTINGS.pollingIntervals,
          ...(loaded.pollingIntervals || {}),
        },
        wslTimeouts: {
          ...DEFAULT_SETTINGS.wslTimeouts,
          ...(loaded.wslTimeouts || {}),
        },
        executablePaths: {
          ...DEFAULT_SETTINGS.executablePaths,
          ...(loaded.executablePaths || {}),
        },
        distributionSources: {
          ...DEFAULT_SETTINGS.distributionSources,
          ...(loaded.distributionSources || {}),
        },
      };
      info("[SettingsStore] Settings loaded successfully");
      set({ settings, isLoading: false });
    } catch (error) {
      logger.error("Failed to load settings:", "SettingsStore", error);
      // Use defaults if loading fails
      set({ settings: DEFAULT_SETTINGS, isLoading: false });
    }
  },

  saveSettings: async (settings: AppSettings) => {
    debug("[SettingsStore] Saving settings");
    set({ isSaving: true, error: null });

    // Capture old WSL path for comparison
    const oldWslPath = get().settings.executablePaths.wsl;

    try {
      await invoke("save_settings", { settings });
      info("[SettingsStore] Settings saved successfully");
      set({ settings, isSaving: false });

      // Auto-recheck preflight if WSL executable path changed
      const newWslPath = settings.executablePaths.wsl;
      if (oldWslPath !== newWslPath) {
        info("[SettingsStore] WSL path changed, triggering preflight recheck");
        usePreflightStore.getState().checkPreflight();
      }
    } catch (error) {
      logger.error("Failed to save settings:", "SettingsStore", error);
      set({
        error: error instanceof Error ? error.message : "Failed to save settings",
        isSaving: false,
      });
    }
  },

  updateSetting: async <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    debug(`[SettingsStore] Updating setting: ${key}`);
    const currentSettings = get().settings;
    const newSettings = { ...currentSettings, [key]: value };
    await get().saveSettings(newSettings);
  },
}));



