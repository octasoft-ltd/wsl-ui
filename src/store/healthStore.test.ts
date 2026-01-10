import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { useHealthStore } from "./healthStore";
import type { WslHealth, WslVersionInfo } from "../services/wslService";

// Note: @tauri-apps/api/core is mocked in test/setup.ts

const mockHealth: WslHealth = {
  status: "healthy",
  message: "WSL is running normally",
  wslProcessCount: 5,
  vmRunning: true,
};

const mockVersionInfo: WslVersionInfo = {
  wslVersion: "2.0.9.0",
  kernelVersion: "5.15.133.1-1",
  wslgVersion: "1.0.59",
  msrdcVersion: "1.2.4677",
  direct3dVersion: "1.611.1-81528511",
  dxcoreVersion: "10.0.26100.1-240331-1435.ge-release",
  windowsVersion: "10.0.22631.4169",
};

describe("healthStore", () => {
  beforeEach(() => {
    // Reset store state
    useHealthStore.setState({
      health: null,
      versionInfo: null,
      isLoading: false,
      error: null,
    });
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should have null health initially", () => {
      const state = useHealthStore.getState();
      expect(state.health).toBeNull();
      expect(state.versionInfo).toBeNull();
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("fetchHealth", () => {
    it("sets loading state while fetching (non-silent)", async () => {
      vi.mocked(invoke).mockResolvedValue(mockHealth);

      const fetchPromise = useHealthStore.getState().fetchHealth();

      expect(useHealthStore.getState().isLoading).toBe(true);

      await fetchPromise;

      expect(useHealthStore.getState().isLoading).toBe(false);
    });

    it("does not set loading state when silent", async () => {
      vi.mocked(invoke).mockResolvedValue(mockHealth);

      const fetchPromise = useHealthStore.getState().fetchHealth(true);

      expect(useHealthStore.getState().isLoading).toBe(false);

      await fetchPromise;

      expect(useHealthStore.getState().isLoading).toBe(false);
    });

    it("stores fetched health data", async () => {
      vi.mocked(invoke).mockResolvedValue(mockHealth);

      await useHealthStore.getState().fetchHealth();

      expect(useHealthStore.getState().health).toEqual(mockHealth);
    });

    it("calls invoke with correct command", async () => {
      vi.mocked(invoke).mockResolvedValue(mockHealth);

      await useHealthStore.getState().fetchHealth();

      expect(invoke).toHaveBeenCalledWith("get_wsl_health");
    });

    it("returns true on successful fetch", async () => {
      vi.mocked(invoke).mockResolvedValue(mockHealth);

      const result = await useHealthStore.getState().fetchHealth();

      expect(result).toBe(true);
    });

    it("clears error on successful fetch", async () => {
      useHealthStore.setState({ error: "Previous error" });
      vi.mocked(invoke).mockResolvedValue(mockHealth);

      await useHealthStore.getState().fetchHealth();

      expect(useHealthStore.getState().error).toBeNull();
    });

    it("sets error on fetch failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Fetch failed"));

      await useHealthStore.getState().fetchHealth();

      expect(useHealthStore.getState().error).toBe("Fetch failed");
      expect(useHealthStore.getState().isLoading).toBe(false);
    });

    it("returns false on fetch failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Fetch failed"));

      const result = await useHealthStore.getState().fetchHealth();

      expect(result).toBe(false);
    });

    it("sets error when silent on failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Silent error"));

      await useHealthStore.getState().fetchHealth(true);

      expect(useHealthStore.getState().error).toBe("Silent error");
      // Loading should not have been set
      expect(useHealthStore.getState().isLoading).toBe(false);
    });
  });

  describe("fetchVersion", () => {
    it("stores fetched version info", async () => {
      vi.mocked(invoke).mockResolvedValue(mockVersionInfo);

      await useHealthStore.getState().fetchVersion();

      expect(useHealthStore.getState().versionInfo).toEqual(mockVersionInfo);
    });

    it("calls invoke with correct command", async () => {
      vi.mocked(invoke).mockResolvedValue(mockVersionInfo);

      await useHealthStore.getState().fetchVersion();

      expect(invoke).toHaveBeenCalledWith("get_wsl_version");
    });

    it("returns true on successful fetch", async () => {
      vi.mocked(invoke).mockResolvedValue(mockVersionInfo);

      const result = await useHealthStore.getState().fetchVersion();

      expect(result).toBe(true);
    });

    it("returns false on fetch failure without setting error state", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Version fetch failed"));

      const result = await useHealthStore.getState().fetchVersion();

      // Version errors don't set error state (it's optional info)
      expect(result).toBe(false);
      expect(useHealthStore.getState().error).toBeNull();
    });

    it("does not update versionInfo on failure", async () => {
      useHealthStore.setState({ versionInfo: mockVersionInfo });
      vi.mocked(invoke).mockRejectedValue(new Error("Error"));

      await useHealthStore.getState().fetchVersion();

      // Should keep the previous value
      expect(useHealthStore.getState().versionInfo).toEqual(mockVersionInfo);
    });
  });

  describe("clearError", () => {
    it("clears the error state", () => {
      useHealthStore.setState({ error: "Some error" });

      useHealthStore.getState().clearError();

      expect(useHealthStore.getState().error).toBeNull();
    });

    it("does nothing when error is already null", () => {
      useHealthStore.getState().clearError();

      expect(useHealthStore.getState().error).toBeNull();
    });
  });

  describe("health status values", () => {
    it("handles stopped status", async () => {
      const stoppedHealth: WslHealth = {
        status: "stopped",
        message: "WSL is not running",
        wslProcessCount: 0,
        vmRunning: false,
      };
      vi.mocked(invoke).mockResolvedValue(stoppedHealth);

      await useHealthStore.getState().fetchHealth();

      expect(useHealthStore.getState().health?.status).toBe("stopped");
      expect(useHealthStore.getState().health?.vmRunning).toBe(false);
    });

    it("handles warning status", async () => {
      const warningHealth: WslHealth = {
        status: "warning",
        message: "High memory usage",
        wslProcessCount: 50,
        vmRunning: true,
      };
      vi.mocked(invoke).mockResolvedValue(warningHealth);

      await useHealthStore.getState().fetchHealth();

      expect(useHealthStore.getState().health?.status).toBe("warning");
    });

    it("handles unhealthy status", async () => {
      const unhealthyHealth: WslHealth = {
        status: "unhealthy",
        message: "WSL is unresponsive",
        wslProcessCount: 0,
        vmRunning: true,
      };
      vi.mocked(invoke).mockResolvedValue(unhealthyHealth);

      await useHealthStore.getState().fetchHealth();

      expect(useHealthStore.getState().health?.status).toBe("unhealthy");
    });
  });
});


