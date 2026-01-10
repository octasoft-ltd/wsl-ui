import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { usePollingStore } from "./pollingStore";
import { DEFAULT_POLLING_CONFIG } from "../types/polling";

// Create stable mock functions that persist across test runs
const mockDistroState = {
  distributions: [],
  error: null,
  isTimeoutError: false,
  fetchDistros: vi.fn().mockResolvedValue(undefined),
};

const mockResourceState = {
  error: null,
  fetchStats: vi.fn().mockResolvedValue(undefined),
  clearStats: vi.fn(),
};

const mockHealthState = {
  error: null,
  fetchHealth: vi.fn().mockResolvedValue(true),
};

// Mock the other stores
vi.mock("./distroStore", () => ({
  useDistroStore: {
    getState: () => mockDistroState,
  },
}));

vi.mock("./resourceStore", () => ({
  useResourceStore: {
    getState: () => mockResourceState,
  },
}));

vi.mock("./healthStore", () => ({
  useHealthStore: {
    getState: () => mockHealthState,
  },
}));

// Helper to create initial poll state
const createInitialPollState = (interval: number) => ({
  lastPollTime: 0,
  nextPollTime: 0,
  consecutiveTimeouts: 0,
  currentInterval: interval,
  isPolling: false,
  lastError: null,
});

describe("pollingStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Reset store state to initial
    usePollingStore.setState({
      isRunning: false,
      isPaused: false,
      polls: {
        distros: createInitialPollState(DEFAULT_POLLING_CONFIG.distros.defaultInterval),
        resources: createInitialPollState(DEFAULT_POLLING_CONFIG.resources.defaultInterval),
        health: createInitialPollState(DEFAULT_POLLING_CONFIG.health.defaultInterval),
      },
      config: { ...DEFAULT_POLLING_CONFIG },
    });
  });

  afterEach(() => {
    // Stop polling to clear timers
    usePollingStore.getState().stop();
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  describe("initial state", () => {
    it("should not be running initially", () => {
      const state = usePollingStore.getState();
      expect(state.isRunning).toBe(false);
      expect(state.isPaused).toBe(false);
    });

    it("should have default polling config", () => {
      const state = usePollingStore.getState();
      expect(state.config.distros.defaultInterval).toBe(10000);
      expect(state.config.resources.defaultInterval).toBe(5000);
      expect(state.config.health.defaultInterval).toBe(10000);
    });

    it("should have initial poll states with zero timeouts", () => {
      const state = usePollingStore.getState();
      expect(state.polls.distros.consecutiveTimeouts).toBe(0);
      expect(state.polls.resources.consecutiveTimeouts).toBe(0);
      expect(state.polls.health.consecutiveTimeouts).toBe(0);
    });

    it("should have all poll types enabled by default", () => {
      const state = usePollingStore.getState();
      expect(state.config.distros.enabled).toBe(true);
      expect(state.config.resources.enabled).toBe(true);
      expect(state.config.health.enabled).toBe(true);
    });
  });

  describe("start", () => {
    it("sets isRunning to true", () => {
      usePollingStore.getState().start();

      expect(usePollingStore.getState().isRunning).toBe(true);
    });

    it("sets isPaused to false", () => {
      usePollingStore.setState({ isPaused: true });
      usePollingStore.getState().start();

      expect(usePollingStore.getState().isPaused).toBe(false);
    });

    it("does nothing if already running", () => {
      usePollingStore.setState({ isRunning: true });
      
      // Calling start when already running should not change state
      usePollingStore.getState().start();
      
      // Should still be running (no error thrown)
      expect(usePollingStore.getState().isRunning).toBe(true);
    });
  });

  describe("stop", () => {
    it("sets isRunning to false", () => {
      usePollingStore.setState({ isRunning: true });
      usePollingStore.getState().stop();

      expect(usePollingStore.getState().isRunning).toBe(false);
    });

    it("sets isPaused to false", () => {
      usePollingStore.setState({ isRunning: true, isPaused: true });
      usePollingStore.getState().stop();

      expect(usePollingStore.getState().isPaused).toBe(false);
    });
  });

  describe("pause", () => {
    it("sets isPaused to true when running", () => {
      usePollingStore.setState({ isRunning: true });
      usePollingStore.getState().pause();

      expect(usePollingStore.getState().isPaused).toBe(true);
    });

    it("does nothing when not running", () => {
      usePollingStore.getState().pause();

      expect(usePollingStore.getState().isPaused).toBe(false);
    });

    it("does nothing when already paused", () => {
      usePollingStore.setState({ isRunning: true, isPaused: true });
      usePollingStore.getState().pause();

      expect(usePollingStore.getState().isPaused).toBe(true);
    });
  });

  describe("resume", () => {
    it("sets isPaused to false when paused", () => {
      usePollingStore.setState({ isRunning: true, isPaused: true });
      usePollingStore.getState().resume();

      expect(usePollingStore.getState().isPaused).toBe(false);
    });

    it("does nothing when not running", () => {
      usePollingStore.setState({ isPaused: true });
      usePollingStore.getState().resume();

      // isPaused should remain true since we didn't actually resume
      expect(usePollingStore.getState().isPaused).toBe(true);
    });

    it("does nothing when not paused", () => {
      usePollingStore.setState({ isRunning: true, isPaused: false });
      usePollingStore.getState().resume();

      expect(usePollingStore.getState().isPaused).toBe(false);
    });
  });

  describe("handlePollSuccess", () => {
    it("resets consecutive timeouts to 0", () => {
      usePollingStore.setState({
        polls: {
          ...usePollingStore.getState().polls,
          distros: {
            ...usePollingStore.getState().polls.distros,
            consecutiveTimeouts: 3,
            currentInterval: 40000,
          },
        },
      });

      usePollingStore.getState().handlePollSuccess("distros");

      expect(usePollingStore.getState().polls.distros.consecutiveTimeouts).toBe(0);
    });

    it("resets interval to default", () => {
      usePollingStore.setState({
        polls: {
          ...usePollingStore.getState().polls,
          distros: {
            ...usePollingStore.getState().polls.distros,
            currentInterval: 40000,
          },
        },
      });

      usePollingStore.getState().handlePollSuccess("distros");

      expect(usePollingStore.getState().polls.distros.currentInterval).toBe(
        DEFAULT_POLLING_CONFIG.distros.defaultInterval
      );
    });

    it("clears lastError", () => {
      usePollingStore.setState({
        polls: {
          ...usePollingStore.getState().polls,
          distros: {
            ...usePollingStore.getState().polls.distros,
            lastError: "timeout",
          },
        },
      });

      usePollingStore.getState().handlePollSuccess("distros");

      expect(usePollingStore.getState().polls.distros.lastError).toBeNull();
    });
  });

  describe("handlePollTimeout", () => {
    it("increments consecutive timeouts", () => {
      usePollingStore.getState().handlePollTimeout("distros");

      expect(usePollingStore.getState().polls.distros.consecutiveTimeouts).toBe(1);
    });

    it("applies backoff multiplier to interval", () => {
      const initialInterval = DEFAULT_POLLING_CONFIG.distros.defaultInterval;
      usePollingStore.getState().handlePollTimeout("distros");

      expect(usePollingStore.getState().polls.distros.currentInterval).toBe(
        initialInterval * DEFAULT_POLLING_CONFIG.distros.backoffMultiplier
      );
    });

    it("caps interval at maxInterval", () => {
      // Set interval close to max
      usePollingStore.setState({
        polls: {
          ...usePollingStore.getState().polls,
          distros: {
            ...usePollingStore.getState().polls.distros,
            currentInterval: 50000, // Close to 60000 max
          },
        },
      });

      usePollingStore.getState().handlePollTimeout("distros");

      expect(usePollingStore.getState().polls.distros.currentInterval).toBe(
        DEFAULT_POLLING_CONFIG.distros.maxInterval
      );
    });

    it("sets lastError to timeout", () => {
      usePollingStore.getState().handlePollTimeout("distros");

      expect(usePollingStore.getState().polls.distros.lastError).toBe("timeout");
    });
  });

  describe("resetBackoff", () => {
    it("resets consecutive timeouts for specific poll type", () => {
      usePollingStore.setState({
        polls: {
          ...usePollingStore.getState().polls,
          distros: {
            ...usePollingStore.getState().polls.distros,
            consecutiveTimeouts: 5,
            currentInterval: 60000,
            lastError: "timeout",
          },
        },
      });

      usePollingStore.getState().resetBackoff("distros");

      expect(usePollingStore.getState().polls.distros.consecutiveTimeouts).toBe(0);
      expect(usePollingStore.getState().polls.distros.currentInterval).toBe(
        DEFAULT_POLLING_CONFIG.distros.defaultInterval
      );
      expect(usePollingStore.getState().polls.distros.lastError).toBeNull();
    });
  });

  describe("resetAllBackoff", () => {
    it("resets all poll types", () => {
      usePollingStore.setState({
        polls: {
          distros: {
            ...usePollingStore.getState().polls.distros,
            consecutiveTimeouts: 3,
            currentInterval: 40000,
            lastError: "timeout",
          },
          resources: {
            ...usePollingStore.getState().polls.resources,
            consecutiveTimeouts: 2,
            currentInterval: 20000,
            lastError: "timeout",
          },
          health: {
            ...usePollingStore.getState().polls.health,
            consecutiveTimeouts: 4,
            currentInterval: 60000,
            lastError: "timeout",
          },
        },
      });

      usePollingStore.getState().resetAllBackoff();

      const state = usePollingStore.getState();
      expect(state.polls.distros.consecutiveTimeouts).toBe(0);
      expect(state.polls.resources.consecutiveTimeouts).toBe(0);
      expect(state.polls.health.consecutiveTimeouts).toBe(0);
      expect(state.polls.distros.lastError).toBeNull();
      expect(state.polls.resources.lastError).toBeNull();
      expect(state.polls.health.lastError).toBeNull();
    });
  });

  describe("updateInterval", () => {
    it("updates the default interval for a poll type", () => {
      usePollingStore.getState().updateInterval("distros", 15000);

      expect(usePollingStore.getState().config.distros.defaultInterval).toBe(15000);
    });

    it("clamps interval to minInterval", () => {
      usePollingStore.getState().updateInterval("distros", 1000);

      expect(usePollingStore.getState().config.distros.defaultInterval).toBe(
        DEFAULT_POLLING_CONFIG.distros.minInterval
      );
    });

    it("clamps interval to maxInterval", () => {
      usePollingStore.getState().updateInterval("distros", 120000);

      expect(usePollingStore.getState().config.distros.defaultInterval).toBe(
        DEFAULT_POLLING_CONFIG.distros.maxInterval
      );
    });

    it("updates current interval if not backed off", () => {
      usePollingStore.getState().updateInterval("distros", 15000);

      expect(usePollingStore.getState().polls.distros.currentInterval).toBe(15000);
    });

    it("does not update current interval if backed off", () => {
      usePollingStore.setState({
        polls: {
          ...usePollingStore.getState().polls,
          distros: {
            ...usePollingStore.getState().polls.distros,
            consecutiveTimeouts: 2,
            currentInterval: 40000,
          },
        },
      });

      usePollingStore.getState().updateInterval("distros", 15000);

      // Current interval should remain at backed-off value
      expect(usePollingStore.getState().polls.distros.currentInterval).toBe(40000);
      // But default should be updated
      expect(usePollingStore.getState().config.distros.defaultInterval).toBe(15000);
    });
  });

  describe("setEnabled", () => {
    it("enables a poll type", () => {
      usePollingStore.setState({
        config: {
          ...usePollingStore.getState().config,
          distros: { ...usePollingStore.getState().config.distros, enabled: false },
        },
      });

      usePollingStore.getState().setEnabled("distros", true);

      expect(usePollingStore.getState().config.distros.enabled).toBe(true);
    });

    it("disables a poll type", () => {
      usePollingStore.getState().setEnabled("distros", false);

      expect(usePollingStore.getState().config.distros.enabled).toBe(false);
    });
  });

  describe("setGlobalEnabled", () => {
    it("starts polling when enabled and not running", () => {
      usePollingStore.getState().setGlobalEnabled(true);

      expect(usePollingStore.getState().isRunning).toBe(true);
    });

    it("stops polling when disabled and running", () => {
      usePollingStore.setState({ isRunning: true });
      usePollingStore.getState().setGlobalEnabled(false);

      expect(usePollingStore.getState().isRunning).toBe(false);
    });

    it("does nothing when enabling and already running", () => {
      usePollingStore.setState({ isRunning: true });
      usePollingStore.getState().setGlobalEnabled(true);

      expect(usePollingStore.getState().isRunning).toBe(true);
    });

    it("does nothing when disabling and not running", () => {
      usePollingStore.getState().setGlobalEnabled(false);

      expect(usePollingStore.getState().isRunning).toBe(false);
    });
  });

  describe("selectors", () => {
    describe("hasBackoff", () => {
      it("returns true when any poll has timeouts", () => {
        usePollingStore.setState({
          polls: {
            ...usePollingStore.getState().polls,
            distros: {
              ...usePollingStore.getState().polls.distros,
              consecutiveTimeouts: 1,
            },
          },
        });

        expect(usePollingStore.getState().hasBackoff()).toBe(true);
      });

      it("returns false when no polls have timeouts", () => {
        expect(usePollingStore.getState().hasBackoff()).toBe(false);
      });
    });

    describe("getBackoffMessage", () => {
      it("returns null when no backoff", () => {
        expect(usePollingStore.getState().getBackoffMessage()).toBeNull();
      });

      it("returns message describing backed off polls", () => {
        usePollingStore.setState({
          polls: {
            ...usePollingStore.getState().polls,
            distros: {
              ...usePollingStore.getState().polls.distros,
              consecutiveTimeouts: 2,
              currentInterval: 40000,
            },
          },
        });

        const message = usePollingStore.getState().getBackoffMessage();
        expect(message).toContain("distros");
        expect(message).toContain("40s");
        expect(message).toContain("2x timeouts");
      });

      it("includes all backed off polls in message", () => {
        usePollingStore.setState({
          polls: {
            distros: {
              ...usePollingStore.getState().polls.distros,
              consecutiveTimeouts: 2,
              currentInterval: 40000,
            },
            resources: {
              ...usePollingStore.getState().polls.resources,
              consecutiveTimeouts: 1,
              currentInterval: 10000,
            },
            health: {
              ...usePollingStore.getState().polls.health,
              consecutiveTimeouts: 0,
            },
          },
        });

        const message = usePollingStore.getState().getBackoffMessage();
        expect(message).toContain("distros");
        expect(message).toContain("resources");
        expect(message).not.toContain("health");
      });
    });
  });
});

