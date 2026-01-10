import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "./settingsStore";
import { DEFAULT_SETTINGS } from "../types/settings";
import type { AppSettings } from "../types/settings";

// Note: @tauri-apps/api/core is mocked in test/setup.ts

// Mock preflightStore to prevent side effects from our cross-store hooks
vi.mock("./preflightStore", () => ({
  usePreflightStore: {
    getState: () => ({
      checkPreflight: vi.fn().mockResolvedValue(undefined),
    }),
  },
}));

describe("settingsStore", () => {
  beforeEach(() => {
    // Reset store state to defaults
    useSettingsStore.setState({
      settings: DEFAULT_SETTINGS,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should have default settings initially", () => {
      const state = useSettingsStore.getState();
      expect(state.settings).toEqual(DEFAULT_SETTINGS);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });

    it("should have expected default values", () => {
      const state = useSettingsStore.getState();
      expect(state.settings.ideCommand).toBe("code");
      expect(state.settings.terminalCommand).toBe("auto");
    });
  });

  describe("loadSettings", () => {
    it("sets loading state while fetching", async () => {
      vi.mocked(invoke).mockResolvedValue(DEFAULT_SETTINGS);

      const loadPromise = useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().isLoading).toBe(true);

      await loadPromise;

      expect(useSettingsStore.getState().isLoading).toBe(false);
    });

    it("stores loaded settings", async () => {
      const customSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ideCommand: "cursor",
        terminalCommand: "wt",
        usePreReleaseUpdates: true,
      };
      vi.mocked(invoke).mockResolvedValue(customSettings);

      await useSettingsStore.getState().loadSettings();

      expect(useSettingsStore.getState().settings).toEqual(customSettings);
    });

    it("calls invoke with correct command", async () => {
      vi.mocked(invoke).mockResolvedValue(DEFAULT_SETTINGS);

      await useSettingsStore.getState().loadSettings();

      expect(invoke).toHaveBeenCalledWith("get_settings");
    });

    it("falls back to defaults on load failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Load failed"));

      await useSettingsStore.getState().loadSettings();

      // Should fall back to defaults, not set error
      expect(useSettingsStore.getState().settings).toEqual(DEFAULT_SETTINGS);
      expect(useSettingsStore.getState().isLoading).toBe(false);
    });
  });

  describe("saveSettings", () => {
    it("sets saving state while saving", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const newSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ideCommand: "cursor",
        terminalCommand: "wt",
        usePreReleaseUpdates: false,
      };

      const savePromise = useSettingsStore.getState().saveSettings(newSettings);

      expect(useSettingsStore.getState().isSaving).toBe(true);

      await savePromise;

      expect(useSettingsStore.getState().isSaving).toBe(false);
    });

    it("updates settings after successful save", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const newSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ideCommand: "cursor",
        terminalCommand: "wt",
        usePreReleaseUpdates: true,
      };

      await useSettingsStore.getState().saveSettings(newSettings);

      expect(useSettingsStore.getState().settings).toEqual(newSettings);
    });

    it("calls invoke with correct command and settings", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      const newSettings: AppSettings = {
        ...DEFAULT_SETTINGS,
        ideCommand: "cursor",
        terminalCommand: "wt",
        usePreReleaseUpdates: false,
      };

      await useSettingsStore.getState().saveSettings(newSettings);

      expect(invoke).toHaveBeenCalledWith("save_settings", {
        settings: newSettings,
      });
    });

    it("sets error on save failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Save failed"));

      await useSettingsStore.getState().saveSettings(DEFAULT_SETTINGS);

      expect(useSettingsStore.getState().error).toBe("Save failed");
      expect(useSettingsStore.getState().isSaving).toBe(false);
    });

    it("handles non-Error rejection", async () => {
      vi.mocked(invoke).mockRejectedValue("String error");

      await useSettingsStore.getState().saveSettings(DEFAULT_SETTINGS);

      expect(useSettingsStore.getState().error).toBe("Failed to save settings");
    });
  });

  describe("updateSetting", () => {
    it("updates a single setting", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore.getState().updateSetting("ideCommand", "cursor");

      expect(useSettingsStore.getState().settings.ideCommand).toBe("cursor");
      // Other settings should remain unchanged
      expect(useSettingsStore.getState().settings.terminalCommand).toBe("auto");
    });

    it("calls saveSettings with merged settings", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      await useSettingsStore
        .getState()
        .updateSetting("terminalCommand", "powershell");

      expect(invoke).toHaveBeenCalledWith("save_settings", {
        settings: {
          ...DEFAULT_SETTINGS,
          terminalCommand: "powershell",
        },
      });
    });

    it("preserves other settings when updating one", async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      // First set custom settings
      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          ideCommand: "cursor",
          terminalCommand: "wt",
          usePreReleaseUpdates: true,
        },
      });

      // Update only one setting
      await useSettingsStore.getState().updateSetting("ideCommand", "code");

      // Other settings should be preserved
      expect(useSettingsStore.getState().settings.terminalCommand).toBe("wt");
      expect(useSettingsStore.getState().settings.usePreReleaseUpdates).toBe(true);
    });
  });
});



