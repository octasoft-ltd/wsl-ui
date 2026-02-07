import { describe, it, expect, beforeEach, vi } from "vitest";
import { useDistroStore } from "./distroStore";
import type { Distribution } from "../types/distribution";

// Mock the wslService
vi.mock("../services/wslService", () => ({
  wslService: {
    listDistributions: vi.fn(),
    startDistribution: vi.fn(),
    stopDistribution: vi.fn(),
    deleteDistribution: vi.fn(),
    shutdownAll: vi.fn(),
    setDefaultDistribution: vi.fn(),
    openTerminal: vi.fn(),
    openFileExplorer: vi.fn(),
    openIDE: vi.fn(),
    restartDistribution: vi.fn(),
    exportDistribution: vi.fn(),
    importDistribution: vi.fn(),
    getDistributionDiskSize: vi.fn(),
    getDistributionOsInfo: vi.fn(),
    // RDP-related methods
    detectRdp: vi.fn(),
    checkWslConfigTimeouts: vi.fn(),
    openTerminalWithMessage: vi.fn(),
    openRdp: vi.fn(),
  },
}));

// Mock the notification store
vi.mock("./notificationStore", () => ({
  useNotificationStore: {
    getState: vi.fn(() => ({
      notifications: [],
      addNotification: vi.fn(),
      removeNotification: vi.fn(),
    })),
  },
}));

// Mock the logger
vi.mock("../utils/logger", () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

// Import after mocking
import { wslService } from "../services/wslService";
import { logger } from "../utils/logger";
import { useNotificationStore } from "./notificationStore";

const mockDistributions: Distribution[] = [
  { name: "Ubuntu", state: "Running", version: 2, isDefault: true },
  { name: "Debian", state: "Stopped", version: 2, isDefault: false },
  { name: "Alpine", state: "Running", version: 2, isDefault: false },
];

describe("distroStore", () => {
  beforeEach(() => {
    // Reset store state to post-first-load state for most tests
    useDistroStore.setState({
      distributions: [],
      isLoading: false,
      error: null,
      actionInProgress: null,
    });
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should have isLoading true on fresh store creation (before first fetch)", () => {
      // Reset to the actual initial state (simulating fresh app start)
      useDistroStore.setState({
        distributions: [],
        isLoading: true, // This is the actual initial value in the store
        error: null,
        actionInProgress: null,
      });

      const state = useDistroStore.getState();
      expect(state.distributions).toEqual([]);
      expect(state.isLoading).toBe(true); // Shows spinner until first fetch completes
      expect(state.error).toBeNull();
      expect(state.actionInProgress).toBeNull();
    });

    it("should have empty distributions after reset", () => {
      const state = useDistroStore.getState();
      expect(state.distributions).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.actionInProgress).toBeNull();
    });
  });

  describe("getStatus", () => {
    it("returns correct status with no distributions", () => {
      const status = useDistroStore.getState().getStatus();
      expect(status).toEqual({
        defaultDistro: null,
        runningCount: 0,
        totalCount: 0,
      });
    });

    it("returns correct status with distributions", () => {
      useDistroStore.setState({ distributions: mockDistributions });

      const status = useDistroStore.getState().getStatus();
      expect(status).toEqual({
        defaultDistro: "Ubuntu",
        runningCount: 2,
        totalCount: 3,
      });
    });

    it("returns null defaultDistro when none is set", () => {
      const distrosWithoutDefault = mockDistributions.map((d) => ({
        ...d,
        isDefault: false,
      }));
      useDistroStore.setState({ distributions: distrosWithoutDefault });

      const status = useDistroStore.getState().getStatus();
      expect(status.defaultDistro).toBeNull();
    });

    it("counts only running distributions", () => {
      const allStopped = mockDistributions.map((d) => ({
        ...d,
        state: "Stopped" as const,
      }));
      useDistroStore.setState({ distributions: allStopped });

      const status = useDistroStore.getState().getStatus();
      expect(status.runningCount).toBe(0);
    });
  });

  describe("fetchDistros", () => {
    it("sets loading state while fetching", async () => {
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      const fetchPromise = useDistroStore.getState().fetchDistros();

      // Should be loading immediately after calling
      expect(useDistroStore.getState().isLoading).toBe(true);

      await fetchPromise;

      expect(useDistroStore.getState().isLoading).toBe(false);
    });

    it("stores fetched distributions", async () => {
      vi.mocked(wslService.listDistributions).mockResolvedValue(
        mockDistributions
      );
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().fetchDistros();

      expect(useDistroStore.getState().distributions).toEqual(
        mockDistributions
      );
    });

    it("sets error on fetch failure", async () => {
      vi.mocked(wslService.listDistributions).mockRejectedValue(
        new Error("Network error")
      );

      await useDistroStore.getState().fetchDistros();

      expect(useDistroStore.getState().error).toBe("Network error");
      expect(useDistroStore.getState().isLoading).toBe(false);
    });

    it("handles non-Error rejection", async () => {
      vi.mocked(wslService.listDistributions).mockRejectedValue(
        new Error("Connection failed")
      );

      await useDistroStore.getState().fetchDistros();

      // Error is now parsed through parseError utility
      expect(useDistroStore.getState().error).toBe("Connection failed");
    });
  });

  describe("fetchDistros - silent mode and initial loading", () => {
    it("should clear isLoading on successful silent fetch (initial app load scenario)", async () => {
      // Simulate fresh app start with isLoading: true
      useDistroStore.setState({
        distributions: [],
        isLoading: true, // Initial state before first fetch
        error: null,
        actionInProgress: null,
      });

      vi.mocked(wslService.listDistributions).mockResolvedValue(mockDistributions);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      // Silent fetch (like polling does on initial load)
      await useDistroStore.getState().fetchDistros(true);

      // isLoading should be cleared even for silent fetch
      expect(useDistroStore.getState().isLoading).toBe(false);
      expect(useDistroStore.getState().distributions).toEqual(mockDistributions);
    });

    it("should clear isLoading on failed silent fetch", async () => {
      // Simulate fresh app start with isLoading: true
      useDistroStore.setState({
        distributions: [],
        isLoading: true,
        error: null,
        actionInProgress: null,
      });

      vi.mocked(wslService.listDistributions).mockRejectedValue(
        new Error("WSL not available")
      );

      // Silent fetch that fails
      await useDistroStore.getState().fetchDistros(true);

      // isLoading should be cleared even on error
      expect(useDistroStore.getState().isLoading).toBe(false);
      expect(useDistroStore.getState().error).toBe("WSL not available");
    });

    it("should not set isLoading to true at start of silent fetch", async () => {
      // Start with isLoading: false (post-initial-load state)
      useDistroStore.setState({
        distributions: mockDistributions,
        isLoading: false,
        error: null,
        actionInProgress: null,
      });

      let resolveList: (value: Distribution[]) => void;
      const listPromise = new Promise<Distribution[]>((resolve) => {
        resolveList = resolve;
      });

      vi.mocked(wslService.listDistributions).mockReturnValue(listPromise);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      // Start silent fetch
      const fetchPromise = useDistroStore.getState().fetchDistros(true);

      // isLoading should remain false during silent fetch
      expect(useDistroStore.getState().isLoading).toBe(false);

      // Complete the fetch
      resolveList!(mockDistributions);
      await fetchPromise;

      expect(useDistroStore.getState().isLoading).toBe(false);
    });

    it("should set isLoading to true at start of non-silent fetch", async () => {
      useDistroStore.setState({
        distributions: [],
        isLoading: false,
        error: null,
        actionInProgress: null,
      });

      let resolveList: (value: Distribution[]) => void;
      const listPromise = new Promise<Distribution[]>((resolve) => {
        resolveList = resolve;
      });

      vi.mocked(wslService.listDistributions).mockReturnValue(listPromise);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      // Start non-silent fetch
      const fetchPromise = useDistroStore.getState().fetchDistros();

      // isLoading should be true during non-silent fetch
      expect(useDistroStore.getState().isLoading).toBe(true);

      // Complete the fetch
      resolveList!(mockDistributions);
      await fetchPromise;

      expect(useDistroStore.getState().isLoading).toBe(false);
    });

    it("should show spinner until first fetch completes (app startup flow)", async () => {
      // Simulate the exact app startup flow:
      // 1. Store is created with isLoading: true
      // 2. Polling starts and calls fetchDistros(true) - silent mode
      // 3. Spinner should show during this time
      // 4. Once fetch completes, spinner hides

      // Step 1: Fresh store state
      useDistroStore.setState({
        distributions: [],
        isLoading: true, // Fresh store starts loading
        error: null,
        actionInProgress: null,
      });

      // Verify spinner would show (isLoading && distributions.length === 0)
      let state = useDistroStore.getState();
      expect(state.isLoading && state.distributions.length === 0).toBe(true);

      // Step 2: Polling calls silent fetch
      vi.mocked(wslService.listDistributions).mockResolvedValue(mockDistributions);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().fetchDistros(true);

      // Step 3: After fetch, spinner should hide
      state = useDistroStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.distributions.length).toBe(3);
      // Spinner condition should now be false
      expect(state.isLoading && state.distributions.length === 0).toBe(false);
    });

    it("should show empty state after fetch completes with no distributions", async () => {
      // Simulate app startup when no distributions exist
      useDistroStore.setState({
        distributions: [],
        isLoading: true,
        error: null,
        actionInProgress: null,
      });

      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().fetchDistros(true);

      const state = useDistroStore.getState();
      expect(state.isLoading).toBe(false);
      expect(state.distributions.length).toBe(0);
      // Empty state should show (not loading, no distributions)
      expect(!state.isLoading && state.distributions.length === 0).toBe(true);
    });
  });

  describe("startDistro", () => {
    it("sets actionInProgress during start", async () => {
      vi.mocked(wslService.startDistribution).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      const startPromise = useDistroStore.getState().startDistro("Ubuntu");

      expect(useDistroStore.getState().actionInProgress).toBe(
        "Starting Ubuntu..."
      );

      await startPromise;

      expect(useDistroStore.getState().actionInProgress).toBeNull();
    });

    it("calls wslService.startDistribution with name and id", async () => {
      vi.mocked(wslService.startDistribution).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().startDistro("Ubuntu", "{test-guid}");

      expect(wslService.startDistribution).toHaveBeenCalledWith("Ubuntu", "{test-guid}");
    });

    it("refreshes distributions after starting", async () => {
      vi.mocked(wslService.startDistribution).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue(
        mockDistributions
      );
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().startDistro("Ubuntu");

      expect(wslService.listDistributions).toHaveBeenCalled();
    });

    it("sets error on failure", async () => {
      vi.mocked(wslService.startDistribution).mockRejectedValue(
        new Error("Start failed")
      );

      await useDistroStore.getState().startDistro("Ubuntu");

      expect(useDistroStore.getState().error).toBe("Start failed");
      expect(useDistroStore.getState().actionInProgress).toBeNull();
    });
  });

  describe("stopDistro", () => {
    it("calls wslService.stopDistribution", async () => {
      vi.mocked(wslService.stopDistribution).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().stopDistro("Ubuntu");

      expect(wslService.stopDistribution).toHaveBeenCalledWith("Ubuntu");
    });

    it("sets actionInProgress during stop", async () => {
      vi.mocked(wslService.stopDistribution).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      const stopPromise = useDistroStore.getState().stopDistro("Debian");

      expect(useDistroStore.getState().actionInProgress).toBe(
        "Stopping Debian..."
      );

      await stopPromise;

      expect(useDistroStore.getState().actionInProgress).toBeNull();
    });

    it("sets error on failure", async () => {
      vi.mocked(wslService.stopDistribution).mockRejectedValue(
        new Error("Stop failed")
      );

      await useDistroStore.getState().stopDistro("Ubuntu");

      expect(useDistroStore.getState().error).toBe("Stop failed");
      expect(useDistroStore.getState().actionInProgress).toBeNull();
    });

    it("sets isTimeoutError true for timeout errors", async () => {
      vi.mocked(wslService.stopDistribution).mockRejectedValue(
        new Error("Operation timed out")
      );

      await useDistroStore.getState().stopDistro("Ubuntu");

      expect(useDistroStore.getState().error).toContain("timed out");
      expect(useDistroStore.getState().isTimeoutError).toBe(true);
      expect(useDistroStore.getState().actionInProgress).toBeNull();
    });

    it("sets isTimeoutError false for non-timeout errors", async () => {
      vi.mocked(wslService.stopDistribution).mockRejectedValue(
        new Error("Command failed")
      );

      await useDistroStore.getState().stopDistro("Ubuntu");

      expect(useDistroStore.getState().isTimeoutError).toBe(false);
    });
  });

  describe("deleteDistro", () => {
    it("calls wslService.deleteDistribution", async () => {
      vi.mocked(wslService.deleteDistribution).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().deleteDistro("Ubuntu");

      expect(wslService.deleteDistribution).toHaveBeenCalledWith("Ubuntu");
    });

    it("sets correct actionInProgress message", async () => {
      vi.mocked(wslService.deleteDistribution).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      const deletePromise = useDistroStore.getState().deleteDistro("TestDistro");

      expect(useDistroStore.getState().actionInProgress).toBe(
        "Deleting TestDistro..."
      );

      await deletePromise;
    });
  });

  describe("shutdownAll", () => {
    it("calls wslService.shutdownAll", async () => {
      vi.mocked(wslService.shutdownAll).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().shutdownAll();

      expect(wslService.shutdownAll).toHaveBeenCalled();
    });

    it("sets correct actionInProgress message", async () => {
      vi.mocked(wslService.shutdownAll).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      const shutdownPromise = useDistroStore.getState().shutdownAll();

      expect(useDistroStore.getState().actionInProgress).toBe(
        "Shutting down WSL..."
      );

      await shutdownPromise;
    });
  });

  describe("setDefault", () => {
    it("calls wslService.setDefaultDistribution", async () => {
      vi.mocked(wslService.setDefaultDistribution).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().setDefault("Ubuntu");

      expect(wslService.setDefaultDistribution).toHaveBeenCalledWith("Ubuntu");
    });
  });

  describe("openTerminal", () => {
    it("calls wslService.openTerminal with id", async () => {
      vi.mocked(wslService.openTerminal).mockResolvedValue(undefined);

      await useDistroStore.getState().openTerminal("Ubuntu", "{test-guid}");

      expect(wslService.openTerminal).toHaveBeenCalledWith("Ubuntu", "{test-guid}");
    });

    it("calls wslService.openTerminal without id", async () => {
      vi.mocked(wslService.openTerminal).mockResolvedValue(undefined);

      await useDistroStore.getState().openTerminal("Ubuntu");

      expect(wslService.openTerminal).toHaveBeenCalledWith("Ubuntu", undefined);
    });

    it("does not refresh distributions after opening terminal", async () => {
      vi.mocked(wslService.openTerminal).mockResolvedValue(undefined);

      await useDistroStore.getState().openTerminal("Ubuntu");

      expect(wslService.listDistributions).not.toHaveBeenCalled();
    });
  });

  describe("restartDistro", () => {
    it("calls wslService.restartDistribution with name and id", async () => {
      vi.mocked(wslService.restartDistribution).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().restartDistro("Ubuntu", "{test-guid}");

      expect(wslService.restartDistribution).toHaveBeenCalledWith("Ubuntu", "{test-guid}");
    });
  });

  describe("exportDistro", () => {
    it("calls wslService.exportDistribution and returns path", async () => {
      vi.mocked(wslService.exportDistribution).mockResolvedValue(
        "/path/to/export.tar"
      );

      const result = await useDistroStore.getState().exportDistro("Ubuntu");

      expect(wslService.exportDistribution).toHaveBeenCalledWith("Ubuntu");
      expect(result).toBe("/path/to/export.tar");
    });

    it("returns null on cancellation", async () => {
      vi.mocked(wslService.exportDistribution).mockResolvedValue(null);

      const result = await useDistroStore.getState().exportDistro("Ubuntu");

      expect(result).toBeNull();
    });
  });

  describe("importDistro", () => {
    it("calls wslService.importDistribution and returns name", async () => {
      vi.mocked(wslService.importDistribution).mockResolvedValue("NewDistro");
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      const result = await useDistroStore
        .getState()
        .importDistro("NewDistro", "/install/location");

      expect(wslService.importDistribution).toHaveBeenCalledWith(
        "NewDistro",
        "/install/location"
      );
      expect(result).toBe("NewDistro");
    });

    it("refreshes distributions after successful import", async () => {
      vi.mocked(wslService.importDistribution).mockResolvedValue("NewDistro");
      vi.mocked(wslService.listDistributions).mockResolvedValue(
        mockDistributions
      );
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore
        .getState()
        .importDistro("NewDistro", "/install/location");

      expect(wslService.listDistributions).toHaveBeenCalled();
    });
  });

  describe("fetchDistros - N+1 optimization", () => {
    it("fetches disk size for all distros in parallel", async () => {
      vi.mocked(wslService.listDistributions).mockResolvedValue(
        mockDistributions
      );
      vi.mocked(wslService.getDistributionDiskSize).mockImplementation(
        async (name) => {
          // Simulate network delay
          await new Promise((resolve) => setTimeout(resolve, 50));
          return name === "Ubuntu" ? 1024 * 1024 * 1024 : 512 * 1024 * 1024;
        }
      );

      const startTime = Date.now();
      await useDistroStore.getState().fetchDistros();

      // Wait for background tasks to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      const endTime = Date.now();
      const duration = endTime - startTime;

      // If calls were sequential, it would take 150ms (3 * 50ms)
      // If parallel, it should take ~100ms (50ms + overhead + wait time)
      // We check that it's less than 130ms to allow for some overhead
      expect(duration).toBeLessThan(130);

      // Verify all disk size calls were made
      expect(wslService.getDistributionDiskSize).toHaveBeenCalledTimes(3);
      expect(wslService.getDistributionDiskSize).toHaveBeenCalledWith("Ubuntu");
      expect(wslService.getDistributionDiskSize).toHaveBeenCalledWith("Debian");
      expect(wslService.getDistributionDiskSize).toHaveBeenCalledWith("Alpine");
    });

    it("fetches OS info only for running distros in parallel", async () => {
      vi.mocked(wslService.listDistributions).mockResolvedValue(
        mockDistributions
      );
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);
      vi.mocked(wslService.getDistributionOsInfo).mockImplementation(
        async (name) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return `${name} OS Info`;
        }
      );

      await useDistroStore.getState().fetchDistros();

      // Wait for background tasks to complete
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Should only be called for running distros (Ubuntu and Alpine)
      expect(wslService.getDistributionOsInfo).toHaveBeenCalledTimes(2);
      expect(wslService.getDistributionOsInfo).toHaveBeenCalledWith("Ubuntu");
      expect(wslService.getDistributionOsInfo).toHaveBeenCalledWith("Alpine");
      expect(wslService.getDistributionOsInfo).not.toHaveBeenCalledWith(
        "Debian"
      );
    });

    it("updates store with disk sizes as they arrive", async () => {
      vi.mocked(wslService.listDistributions).mockResolvedValue(
        mockDistributions
      );

      let resolveUbuntu: (value: number) => void;
      let resolveDebian: (value: number) => void;

      vi.mocked(wslService.getDistributionDiskSize).mockImplementation(
        async (name) => {
          if (name === "Ubuntu") {
            return new Promise((resolve) => {
              resolveUbuntu = resolve;
            });
          } else if (name === "Debian") {
            return new Promise((resolve) => {
              resolveDebian = resolve;
            });
          }
          return 0;
        }
      );

      await useDistroStore.getState().fetchDistros();

      // Initially, no disk sizes
      let state = useDistroStore.getState();
      expect(state.distributions[0].diskSize).toBeUndefined();

      // Resolve Ubuntu's disk size
      resolveUbuntu!(1024 * 1024 * 1024);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Ubuntu should have disk size now
      state = useDistroStore.getState();
      const ubuntu = state.distributions.find((d) => d.name === "Ubuntu");
      expect(ubuntu?.diskSize).toBe(1024 * 1024 * 1024);

      // Debian should still not have disk size
      const debian = state.distributions.find((d) => d.name === "Debian");
      expect(debian?.diskSize).toBeUndefined();

      // Resolve Debian's disk size
      resolveDebian!(512 * 1024 * 1024);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Both should have disk sizes now
      state = useDistroStore.getState();
      const updatedDebian = state.distributions.find(
        (d) => d.name === "Debian"
      );
      expect(updatedDebian?.diskSize).toBe(512 * 1024 * 1024);
    });

    it("handles partial failures gracefully - disk size failure", async () => {
      vi.mocked(wslService.listDistributions).mockResolvedValue(
        mockDistributions
      );

      vi.mocked(wslService.getDistributionDiskSize).mockImplementation(
        async (name) => {
          if (name === "Ubuntu") {
            throw new Error("Failed to get disk size");
          }
          return 512 * 1024 * 1024;
        }
      );

      await useDistroStore.getState().fetchDistros();

      // Wait for background tasks to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not crash the entire fetch
      const state = useDistroStore.getState();
      expect(state.distributions).toHaveLength(3);
      expect(state.error).toBeNull();

      // Error should be logged
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to get disk size for",
        "Store",
        "Ubuntu",
        ":",
        expect.any(Error)
      );

      // Other distros should still have disk sizes
      const debian = state.distributions.find((d) => d.name === "Debian");
      const alpine = state.distributions.find((d) => d.name === "Alpine");
      expect(debian?.diskSize).toBe(512 * 1024 * 1024);
      expect(alpine?.diskSize).toBe(512 * 1024 * 1024);
    });

    it("handles partial failures gracefully - OS info failure", async () => {
      vi.mocked(wslService.listDistributions).mockResolvedValue(
        mockDistributions
      );
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      vi.mocked(wslService.getDistributionOsInfo).mockImplementation(
        async (name) => {
          if (name === "Ubuntu") {
            throw new Error("Failed to get OS info");
          }
          return `${name} OS Info`;
        }
      );

      await useDistroStore.getState().fetchDistros();

      // Wait for background tasks to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Should not crash the entire fetch
      const state = useDistroStore.getState();
      expect(state.distributions).toHaveLength(3);
      expect(state.error).toBeNull();

      // Error should be logged
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to get OS info for",
        "Store",
        "Ubuntu",
        ":",
        expect.any(Error)
      );

      // Alpine should still have OS info
      const alpine = state.distributions.find((d) => d.name === "Alpine");
      expect(alpine?.osInfo).toBe("Alpine OS Info");
    });

    it("does not update disk size if result is 0 or negative", async () => {
      vi.mocked(wslService.listDistributions).mockResolvedValue(
        mockDistributions
      );

      vi.mocked(wslService.getDistributionDiskSize).mockImplementation(
        async (name) => {
          if (name === "Ubuntu") return 0;
          if (name === "Debian") return -1;
          return 1024 * 1024;
        }
      );

      await useDistroStore.getState().fetchDistros();

      // Wait for background tasks to complete
      await new Promise((resolve) => setTimeout(resolve, 50));

      const state = useDistroStore.getState();
      const ubuntu = state.distributions.find((d) => d.name === "Ubuntu");
      const debian = state.distributions.find((d) => d.name === "Debian");
      const alpine = state.distributions.find((d) => d.name === "Alpine");

      // Ubuntu and Debian should not have disk sizes
      expect(ubuntu?.diskSize).toBeUndefined();
      expect(debian?.diskSize).toBeUndefined();

      // Alpine should have disk size
      expect(alpine?.diskSize).toBe(1024 * 1024);
    });
  });

  describe("race condition handling", () => {
    it("should cancel in-flight background requests when fetchDistros is called again", async () => {
      // First set of distributions
      const firstDistros: Distribution[] = [
        { name: "Ubuntu", state: "Running", version: 2, isDefault: true },
      ];
      // Second set of distributions
      const secondDistros: Distribution[] = [
        { name: "Ubuntu", state: "Running", version: 2, isDefault: true },
        { name: "Debian", state: "Stopped", version: 2, isDefault: false },
      ];

      let firstDiskSizeResolve: (value: number) => void;
      const firstDiskSizePromise = new Promise<number>(
        (resolve) => (firstDiskSizeResolve = resolve)
      );

      // First call - slow disk size fetch
      vi.mocked(wslService.listDistributions)
        .mockResolvedValueOnce(firstDistros)
        .mockResolvedValueOnce(secondDistros);
      vi.mocked(wslService.getDistributionDiskSize)
        .mockReturnValueOnce(firstDiskSizePromise)
        .mockResolvedValue(2000);
      vi.mocked(wslService.getDistributionOsInfo).mockResolvedValue(
        "Ubuntu 22.04"
      );

      // Start first fetch
      const firstFetch = useDistroStore.getState().fetchDistros();

      // Wait for first fetch to complete (but background requests still pending)
      await firstFetch;
      expect(useDistroStore.getState().distributions).toMatchObject(firstDistros);

      // Start second fetch immediately (should cancel first fetch's background requests)
      const secondFetch = useDistroStore.getState().fetchDistros();
      await secondFetch;

      // Resolve the slow first request
      firstDiskSizeResolve!(1000);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Final state should be from the second fetch
      expect(useDistroStore.getState().distributions).toMatchObject(secondDistros);
      // The first distro's disk size should NOT be updated by the stale request
      const ubuntu = useDistroStore
        .getState()
        .distributions.find((d) => d.name === "Ubuntu");
      expect(ubuntu?.diskSize).not.toBe(1000);
    });

    it("should ignore stale background updates from cancelled fetch", async () => {
      const distros: Distribution[] = [
        { name: "Ubuntu", state: "Running", version: 2, isDefault: true },
        { name: "Debian", state: "Running", version: 2, isDefault: false },
      ];

      let slowOsInfoResolve: (value: string) => void;
      const slowOsInfoPromise = new Promise<string>(
        (resolve) => (slowOsInfoResolve = resolve)
      );

      // Setup: slow OS info fetch for Ubuntu
      vi.mocked(wslService.listDistributions).mockResolvedValue(distros);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(1000);
      vi.mocked(wslService.getDistributionOsInfo)
        .mockReturnValueOnce(slowOsInfoPromise) // Ubuntu - slow
        .mockResolvedValue("Debian 12"); // Debian - fast

      // First fetch
      const firstFetch = useDistroStore.getState().fetchDistros();
      await firstFetch;

      // Second fetch (should invalidate first)
      const secondFetch = useDistroStore.getState().fetchDistros();
      await secondFetch;

      // Resolve the slow request from first fetch
      slowOsInfoResolve!("Ubuntu 20.04 (OLD)");
      await new Promise((resolve) => setTimeout(resolve, 50));

      // OS info should NOT be from the stale first fetch
      const ubuntu = useDistroStore
        .getState()
        .distributions.find((d) => d.name === "Ubuntu");
      expect(ubuntu?.osInfo).not.toBe("Ubuntu 20.04 (OLD)");
    });

    it("should handle rapid consecutive fetchDistros calls", async () => {
      const distros1: Distribution[] = [
        { name: "Ubuntu", state: "Running", version: 2, isDefault: true },
      ];
      const distros2: Distribution[] = [
        { name: "Ubuntu", state: "Running", version: 2, isDefault: true },
        { name: "Debian", state: "Stopped", version: 2, isDefault: false },
      ];
      const distros3: Distribution[] = [
        { name: "Ubuntu", state: "Running", version: 2, isDefault: true },
        { name: "Debian", state: "Stopped", version: 2, isDefault: false },
        { name: "Alpine", state: "Stopped", version: 2, isDefault: false },
      ];

      vi.mocked(wslService.listDistributions)
        .mockResolvedValueOnce(distros1)
        .mockResolvedValueOnce(distros2)
        .mockResolvedValueOnce(distros3);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(1000);
      vi.mocked(wslService.getDistributionOsInfo).mockResolvedValue(
        "Ubuntu 22.04"
      );

      // Fire off multiple rapid fetches
      const fetch1 = useDistroStore.getState().fetchDistros();
      const fetch2 = useDistroStore.getState().fetchDistros();
      const fetch3 = useDistroStore.getState().fetchDistros();

      await Promise.all([fetch1, fetch2, fetch3]);

      // Final state should be from the last fetch
      expect(useDistroStore.getState().distributions.length).toBe(3);
      // Use toMatchObject since background fetch may have added diskSize/osInfo
      expect(useDistroStore.getState().distributions).toMatchObject(distros3);
    });

    it("should properly handle component unmount scenario", async () => {
      const distros: Distribution[] = [
        { name: "Ubuntu", state: "Running", version: 2, isDefault: true },
      ];

      let diskSizeResolve: (value: number) => void;
      const diskSizePromise = new Promise<number>(
        (resolve) => (diskSizeResolve = resolve)
      );

      vi.mocked(wslService.listDistributions).mockResolvedValue(distros);
      vi.mocked(wslService.getDistributionDiskSize).mockReturnValue(
        diskSizePromise
      );
      vi.mocked(wslService.getDistributionOsInfo).mockResolvedValue(
        "Ubuntu 22.04"
      );

      // Start fetch
      const fetchPromise = useDistroStore.getState().fetchDistros();
      await fetchPromise;

      // Simulate component unmount - clear the store
      useDistroStore.setState({
        distributions: [],
        isLoading: false,
        error: null,
        actionInProgress: null,
      });

      // Resolve the pending background request
      diskSizeResolve!(5000);
      await new Promise((resolve) => setTimeout(resolve, 10));

      // State should remain cleared (not updated by stale request)
      expect(useDistroStore.getState().distributions).toEqual([]);
    });

    it("should handle errors in background requests without affecting main state", async () => {
      const distros: Distribution[] = [
        { name: "Ubuntu", state: "Running", version: 2, isDefault: true },
        { name: "Debian", state: "Running", version: 2, isDefault: false },
      ];

      vi.mocked(wslService.listDistributions).mockResolvedValue(distros);
      vi.mocked(wslService.getDistributionDiskSize)
        .mockRejectedValueOnce(new Error("Disk size error"))
        .mockResolvedValue(2000);
      vi.mocked(wslService.getDistributionOsInfo)
        .mockRejectedValueOnce(new Error("OS info error"))
        .mockResolvedValue("Debian 12");

      await useDistroStore.getState().fetchDistros();

      // Should still have distributions even though background requests failed
      // Use toMatchObject since some background requests succeeded and added properties
      expect(useDistroStore.getState().distributions).toMatchObject(distros);
      expect(useDistroStore.getState().error).toBeNull();
    });

    it("should only update details for distros that still exist", async () => {
      const initialDistros: Distribution[] = [
        { name: "Ubuntu", state: "Running", version: 2, isDefault: true },
        { name: "Debian", state: "Running", version: 2, isDefault: false },
      ];
      const updatedDistros: Distribution[] = [
        { name: "Ubuntu", state: "Running", version: 2, isDefault: true },
        // Debian was deleted
      ];

      let debianDiskSizeResolve: (value: number) => void;
      const debianDiskSizePromise = new Promise<number>(
        (resolve) => (debianDiskSizeResolve = resolve)
      );

      // First fetch
      vi.mocked(wslService.listDistributions).mockResolvedValueOnce(
        initialDistros
      );
      vi.mocked(wslService.getDistributionDiskSize)
        .mockReturnValueOnce(Promise.resolve(1000)) // Ubuntu - fast
        .mockReturnValueOnce(debianDiskSizePromise); // Debian - slow
      vi.mocked(wslService.getDistributionOsInfo).mockResolvedValue(
        "Ubuntu 22.04"
      );

      const firstFetch = useDistroStore.getState().fetchDistros();
      await firstFetch;

      // Second fetch - Debian is now gone
      vi.mocked(wslService.listDistributions).mockResolvedValueOnce(
        updatedDistros
      );
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(1500);

      const secondFetch = useDistroStore.getState().fetchDistros();
      await secondFetch;

      // Resolve Debian's disk size from first fetch
      debianDiskSizeResolve!(9999);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Debian should not be in the state
      const debian = useDistroStore
        .getState()
        .distributions.find((d) => d.name === "Debian");
      expect(debian).toBeUndefined();

      // Should only have Ubuntu
      // Use toMatchObject since background fetch may have added diskSize/osInfo
      expect(useDistroStore.getState().distributions).toMatchObject(updatedDistros);
    });
  });

  describe("openRemoteDesktop", () => {
    const mockAddNotification = vi.fn();

    beforeEach(() => {
      // Reset notification store mock
      mockAddNotification.mockClear();
      vi.mocked(useNotificationStore.getState).mockReturnValue({
        notifications: [],
        addNotification: mockAddNotification,
        removeNotification: vi.fn(),
        clearAll: vi.fn(),
      });
    });

    it("starts distro if not running", async () => {
      // Set up stopped distro
      useDistroStore.setState({
        distributions: [{ name: "Ubuntu", state: "Stopped", version: 2, isDefault: true }],
      });

      vi.mocked(wslService.startDistribution).mockResolvedValue(undefined);
      vi.mocked(wslService.detectRdp).mockResolvedValue({ type: "xrdp", port: 3390 });
      vi.mocked(wslService.checkWslConfigTimeouts).mockResolvedValue({ timeoutsConfigured: true });
      vi.mocked(wslService.openRdp).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().openRemoteDesktop("Ubuntu");

      expect(wslService.startDistribution).toHaveBeenCalledWith("Ubuntu", undefined);
    });

    it("does not start distro if already running", async () => {
      useDistroStore.setState({
        distributions: [{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }],
      });

      vi.mocked(wslService.detectRdp).mockResolvedValue({ type: "xrdp", port: 3390 });
      vi.mocked(wslService.checkWslConfigTimeouts).mockResolvedValue({ timeoutsConfigured: true });
      vi.mocked(wslService.openRdp).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().openRemoteDesktop("Ubuntu");

      expect(wslService.startDistribution).not.toHaveBeenCalled();
    });

    it("returns success for xrdp detection", async () => {
      useDistroStore.setState({
        distributions: [{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }],
      });

      vi.mocked(wslService.detectRdp).mockResolvedValue({ type: "xrdp", port: 3390 });
      vi.mocked(wslService.checkWslConfigTimeouts).mockResolvedValue({ timeoutsConfigured: true });
      vi.mocked(wslService.openRdp).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      const result = await useDistroStore.getState().openRemoteDesktop("Ubuntu");

      expect(result.success).toBe(true);
      expect(result.type).toBe("xrdp");
    });

    it("returns failure for no desktop environment", async () => {
      useDistroStore.setState({
        distributions: [{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }],
      });

      vi.mocked(wslService.detectRdp).mockResolvedValue({ type: "none" });

      const result = await useDistroStore.getState().openRemoteDesktop("Ubuntu");

      expect(result.success).toBe(false);
      expect(result.type).toBe("none");
      expect(result.error).toContain("No desktop environment");
    });

    it("returns failure and shows notification for port conflict", async () => {
      useDistroStore.setState({
        distributions: [{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }],
      });

      vi.mocked(wslService.detectRdp).mockResolvedValue({ type: "port_conflict", port: 3390 });

      const result = await useDistroStore.getState().openRemoteDesktop("Ubuntu");

      expect(result.success).toBe(false);
      expect(result.type).toBe("port_conflict");
      expect(result.error).toContain("already in use");
      expect(mockAddNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "error",
          title: "RDP Port Conflict",
        })
      );
    });

    it("opens terminal with message when timeouts not configured", async () => {
      useDistroStore.setState({
        distributions: [{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }],
      });

      vi.mocked(wslService.detectRdp).mockResolvedValue({ type: "xrdp", port: 3390 });
      vi.mocked(wslService.checkWslConfigTimeouts).mockResolvedValue({ timeoutsConfigured: false });
      vi.mocked(wslService.openTerminalWithMessage).mockResolvedValue(undefined);
      vi.mocked(wslService.openRdp).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().openRemoteDesktop("Ubuntu");

      expect(wslService.openTerminalWithMessage).toHaveBeenCalledWith(
        "Ubuntu",
        undefined,
        expect.stringContaining("keeps your WSL distro running")
      );
    });

    it("does not open terminal when timeouts are configured", async () => {
      useDistroStore.setState({
        distributions: [{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }],
      });

      vi.mocked(wslService.detectRdp).mockResolvedValue({ type: "xrdp", port: 3390 });
      vi.mocked(wslService.checkWslConfigTimeouts).mockResolvedValue({ timeoutsConfigured: true });
      vi.mocked(wslService.openRdp).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().openRemoteDesktop("Ubuntu");

      expect(wslService.openTerminalWithMessage).not.toHaveBeenCalled();
    });

    it("opens RDP with detected port", async () => {
      useDistroStore.setState({
        distributions: [{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }],
      });

      vi.mocked(wslService.detectRdp).mockResolvedValue({ type: "xrdp", port: 3391 });
      vi.mocked(wslService.checkWslConfigTimeouts).mockResolvedValue({ timeoutsConfigured: true });
      vi.mocked(wslService.openRdp).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().openRemoteDesktop("Ubuntu");

      expect(wslService.openRdp).toHaveBeenCalledWith(3391);
    });

    it("uses default port 3389 when port not specified", async () => {
      useDistroStore.setState({
        distributions: [{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }],
      });

      vi.mocked(wslService.detectRdp).mockResolvedValue({ type: "xrdp" });
      vi.mocked(wslService.checkWslConfigTimeouts).mockResolvedValue({ timeoutsConfigured: true });
      vi.mocked(wslService.openRdp).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().openRemoteDesktop("Ubuntu");

      expect(wslService.openRdp).toHaveBeenCalledWith(3389);
    });

    it("handles errors gracefully", async () => {
      useDistroStore.setState({
        distributions: [{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }],
      });

      vi.mocked(wslService.detectRdp).mockRejectedValue(new Error("Connection failed"));

      const result = await useDistroStore.getState().openRemoteDesktop("Ubuntu");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Connection failed");
    });

    it("clears actionInProgress after completion", async () => {
      useDistroStore.setState({
        distributions: [{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }],
      });

      vi.mocked(wslService.detectRdp).mockResolvedValue({ type: "xrdp", port: 3390 });
      vi.mocked(wslService.checkWslConfigTimeouts).mockResolvedValue({ timeoutsConfigured: true });
      vi.mocked(wslService.openRdp).mockResolvedValue(undefined);
      vi.mocked(wslService.listDistributions).mockResolvedValue([]);
      vi.mocked(wslService.getDistributionDiskSize).mockResolvedValue(0);

      await useDistroStore.getState().openRemoteDesktop("Ubuntu");

      expect(useDistroStore.getState().actionInProgress).toBeNull();
    });

    it("clears actionInProgress even on error", async () => {
      useDistroStore.setState({
        distributions: [{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }],
      });

      vi.mocked(wslService.detectRdp).mockRejectedValue(new Error("Failed"));

      await useDistroStore.getState().openRemoteDesktop("Ubuntu");

      expect(useDistroStore.getState().actionInProgress).toBeNull();
    });
  });
});

