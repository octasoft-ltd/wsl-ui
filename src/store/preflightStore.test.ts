import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { usePreflightStore } from "./preflightStore";
import type { WslPreflightStatus } from "../services/wslService";

// Note: @tauri-apps/api/core is mocked in test/setup.ts

// Mock distroStore to prevent side effects
vi.mock("./distroStore", () => ({
  useDistroStore: {
    getState: () => ({
      fetchDistros: vi.fn().mockResolvedValue(undefined),
      clearDistributions: vi.fn(),
    }),
  },
}));

describe("preflightStore", () => {
  beforeEach(() => {
    // Reset store state to initial values
    usePreflightStore.setState({
      status: null,
      isChecking: false,
      hasChecked: false,
      isReady: false,
      title: "",
      message: "",
      helpUrl: null,
    });
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should have null status initially", () => {
      const state = usePreflightStore.getState();
      expect(state.status).toBeNull();
      expect(state.hasChecked).toBe(false);
      expect(state.isReady).toBe(false);
    });

    it("should not be checking initially", () => {
      const state = usePreflightStore.getState();
      expect(state.isChecking).toBe(false);
    });
  });

  describe("checkPreflight", () => {
    it("sets isChecking state while checking", async () => {
      const readyStatus: WslPreflightStatus = { status: "ready" };
      vi.mocked(invoke).mockResolvedValue(readyStatus);

      const checkPromise = usePreflightStore.getState().checkPreflight();

      expect(usePreflightStore.getState().isChecking).toBe(true);

      await checkPromise;

      expect(usePreflightStore.getState().isChecking).toBe(false);
    });

    it("sets hasChecked to true after check", async () => {
      const readyStatus: WslPreflightStatus = { status: "ready" };
      vi.mocked(invoke).mockResolvedValue(readyStatus);

      await usePreflightStore.getState().checkPreflight();

      expect(usePreflightStore.getState().hasChecked).toBe(true);
    });

    it("sets isReady to true when WSL is ready", async () => {
      const readyStatus: WslPreflightStatus = { status: "ready" };
      vi.mocked(invoke).mockResolvedValue(readyStatus);

      await usePreflightStore.getState().checkPreflight();

      expect(usePreflightStore.getState().isReady).toBe(true);
      expect(usePreflightStore.getState().status).toEqual(readyStatus);
    });

    it("sets isReady to false when WSL is not installed", async () => {
      const notInstalledStatus: WslPreflightStatus = {
        status: "notInstalled",
        configuredPath: "C:\\Windows\\System32\\wsl.exe",
      };
      vi.mocked(invoke).mockResolvedValue(notInstalledStatus);

      await usePreflightStore.getState().checkPreflight();

      expect(usePreflightStore.getState().isReady).toBe(false);
      expect(usePreflightStore.getState().status).toEqual(notInstalledStatus);
      expect(usePreflightStore.getState().title).toBe("WSL Not Installed");
    });

    it("sets correct title and message for featureDisabled status", async () => {
      const status: WslPreflightStatus = {
        status: "featureDisabled",
        errorCode: "0x8007019e",
      };
      vi.mocked(invoke).mockResolvedValue(status);

      await usePreflightStore.getState().checkPreflight();

      expect(usePreflightStore.getState().isReady).toBe(false);
      expect(usePreflightStore.getState().title).toBe("WSL Feature Disabled");
      expect(usePreflightStore.getState().helpUrl).toBe(
        "https://learn.microsoft.com/en-us/windows/wsl/install"
      );
    });

    it("sets correct title and message for kernelUpdateRequired status", async () => {
      const status: WslPreflightStatus = { status: "kernelUpdateRequired" };
      vi.mocked(invoke).mockResolvedValue(status);

      await usePreflightStore.getState().checkPreflight();

      expect(usePreflightStore.getState().isReady).toBe(false);
      expect(usePreflightStore.getState().title).toBe("WSL Kernel Update Required");
      expect(usePreflightStore.getState().helpUrl).toContain("update-to-wsl-2");
    });

    it("sets correct title and message for virtualizationDisabled status", async () => {
      const status: WslPreflightStatus = {
        status: "virtualizationDisabled",
        errorCode: "0x80370102",
      };
      vi.mocked(invoke).mockResolvedValue(status);

      await usePreflightStore.getState().checkPreflight();

      expect(usePreflightStore.getState().isReady).toBe(false);
      expect(usePreflightStore.getState().title).toBe("Virtualization Not Enabled");
      expect(usePreflightStore.getState().helpUrl).toContain("troubleshooting");
    });

    it("sets correct title and message for unknown status", async () => {
      const status: WslPreflightStatus = {
        status: "unknown",
        message: "Something went wrong",
      };
      vi.mocked(invoke).mockResolvedValue(status);

      await usePreflightStore.getState().checkPreflight();

      expect(usePreflightStore.getState().isReady).toBe(false);
      expect(usePreflightStore.getState().title).toBe("WSL Unavailable");
      expect(usePreflightStore.getState().message).toContain("Something went wrong");
    });

    it("handles invoke errors gracefully", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Invoke failed"));

      await usePreflightStore.getState().checkPreflight();

      expect(usePreflightStore.getState().isReady).toBe(false);
      expect(usePreflightStore.getState().hasChecked).toBe(true);
      expect(usePreflightStore.getState().title).toBe("WSL Unavailable");
    });

    it("prevents concurrent checks", async () => {
      const readyStatus: WslPreflightStatus = { status: "ready" };
      vi.mocked(invoke).mockResolvedValue(readyStatus);

      // Start first check
      usePreflightStore.setState({ isChecking: true });

      // Try to start second check - should be skipped
      await usePreflightStore.getState().checkPreflight();

      // invoke should not have been called since isChecking was true
      expect(invoke).not.toHaveBeenCalled();
    });

    it("calls invoke with correct command", async () => {
      const readyStatus: WslPreflightStatus = { status: "ready" };
      vi.mocked(invoke).mockResolvedValue(readyStatus);

      await usePreflightStore.getState().checkPreflight();

      expect(invoke).toHaveBeenCalledWith("check_wsl_preflight");
    });
  });

  describe("reset", () => {
    it("resets all state to initial values", async () => {
      // First, set up some state
      const readyStatus: WslPreflightStatus = { status: "ready" };
      vi.mocked(invoke).mockResolvedValue(readyStatus);
      await usePreflightStore.getState().checkPreflight();

      // Verify state was set
      expect(usePreflightStore.getState().hasChecked).toBe(true);

      // Reset
      usePreflightStore.getState().reset();

      // Verify reset
      const state = usePreflightStore.getState();
      expect(state.status).toBeNull();
      expect(state.isChecking).toBe(false);
      expect(state.hasChecked).toBe(false);
      expect(state.isReady).toBe(false);
      expect(state.title).toBe("");
      expect(state.message).toBe("");
      expect(state.helpUrl).toBeNull();
    });
  });

  describe("recovery scenario", () => {
    it("can recover from failure to ready state", async () => {
      // First check returns not installed
      const notInstalledStatus: WslPreflightStatus = {
        status: "notInstalled",
        configuredPath: "C:\\Windows\\System32\\wsl.exe",
      };
      vi.mocked(invoke).mockResolvedValueOnce(notInstalledStatus);

      await usePreflightStore.getState().checkPreflight();
      expect(usePreflightStore.getState().isReady).toBe(false);

      // User installs WSL, second check returns ready
      const readyStatus: WslPreflightStatus = { status: "ready" };
      vi.mocked(invoke).mockResolvedValueOnce(readyStatus);

      await usePreflightStore.getState().checkPreflight();
      expect(usePreflightStore.getState().isReady).toBe(true);
      expect(usePreflightStore.getState().title).toBe("WSL Ready");
    });

    it("updates state correctly when transitioning from ready to failure", async () => {
      // First check returns ready
      const readyStatus: WslPreflightStatus = { status: "ready" };
      vi.mocked(invoke).mockResolvedValueOnce(readyStatus);

      await usePreflightStore.getState().checkPreflight();
      expect(usePreflightStore.getState().isReady).toBe(true);

      // WSL becomes unavailable (e.g., VM disabled)
      const disabledStatus: WslPreflightStatus = {
        status: "virtualizationDisabled",
        errorCode: "0x80370102",
      };
      vi.mocked(invoke).mockResolvedValueOnce(disabledStatus);

      await usePreflightStore.getState().checkPreflight();
      expect(usePreflightStore.getState().isReady).toBe(false);
      expect(usePreflightStore.getState().title).toBe("Virtualization Not Enabled");
    });
  });
});
