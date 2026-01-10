import { create } from "zustand";
import type { PollType, PollState, PollingConfig } from "../types/polling";
import { DEFAULT_POLLING_CONFIG } from "../types/polling";
import { useDistroStore } from "./distroStore";
import { useResourceStore } from "./resourceStore";
import { useHealthStore } from "./healthStore";
import { usePreflightStore } from "./preflightStore";
import { logger } from "../utils/logger";

interface PollingStore {
  // State
  isRunning: boolean;
  isPaused: boolean;
  polls: Record<PollType, PollState>;
  config: PollingConfig;

  // Actions
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;

  // Internal actions
  schedulePoll: (type: PollType) => void;
  executePoll: (type: PollType) => Promise<void>;
  handlePollSuccess: (type: PollType) => void;
  handlePollTimeout: (type: PollType) => void;
  resetBackoff: (type: PollType) => void;
  resetAllBackoff: () => void;

  // Configuration
  updateInterval: (type: PollType, interval: number) => void;
  setEnabled: (type: PollType, enabled: boolean) => void;
  setGlobalEnabled: (enabled: boolean) => void;

  // Selectors
  hasBackoff: () => boolean;
  getBackoffMessage: () => string | null;
}

// Timer storage (outside Zustand for performance - timers shouldn't trigger re-renders)
const timers: Record<PollType, number | null> = {
  distros: null,
  resources: null,
  health: null,
};

// Poll execution lock to prevent simultaneous calls of same type
const pollLocks: Record<PollType, boolean> = {
  distros: false,
  resources: false,
  health: false,
};

// Stagger offsets to prevent simultaneous polls (ms)
const STAGGER_OFFSETS: Record<PollType, number> = {
  distros: 0,
  resources: 200,
  health: 400,
};

const createInitialPollState = (interval: number): PollState => ({
  lastPollTime: 0,
  nextPollTime: 0,
  consecutiveTimeouts: 0,
  currentInterval: interval,
  isPolling: false,
  lastError: null,
});

export const usePollingStore = create<PollingStore>((set, get) => ({
  isRunning: false,
  isPaused: false,
  polls: {
    distros: createInitialPollState(DEFAULT_POLLING_CONFIG.distros.defaultInterval),
    resources: createInitialPollState(DEFAULT_POLLING_CONFIG.resources.defaultInterval),
    health: createInitialPollState(DEFAULT_POLLING_CONFIG.health.defaultInterval),
  },
  config: { ...DEFAULT_POLLING_CONFIG },

  start: () => {
    const { isRunning, executePoll, schedulePoll } = get();
    if (isRunning) return;

    logger.info("Starting polling manager", "PollingStore");
    set({ isRunning: true, isPaused: false });

    // Execute initial polls immediately (with stagger to avoid simultaneous calls)
    const pollTypes: PollType[] = ["distros", "resources", "health"];
    pollTypes.forEach((type) => {
      setTimeout(() => {
        executePoll(type).then(() => schedulePoll(type));
      }, STAGGER_OFFSETS[type]);
    });
  },

  stop: () => {
    logger.info("Stopping polling manager", "PollingStore");

    // Clear all timers
    (Object.keys(timers) as PollType[]).forEach((type) => {
      if (timers[type] !== null) {
        clearTimeout(timers[type]!);
        timers[type] = null;
      }
    });

    set({ isRunning: false, isPaused: false });
  },

  pause: () => {
    const { isRunning, isPaused } = get();
    if (!isRunning || isPaused) return;

    logger.debug("Pausing polling (app inactive)", "PollingStore");

    // Clear all timers but don't stop
    (Object.keys(timers) as PollType[]).forEach((type) => {
      if (timers[type] !== null) {
        clearTimeout(timers[type]!);
        timers[type] = null;
      }
    });

    set({ isPaused: true });
  },

  resume: () => {
    const { isRunning, isPaused, executePoll, schedulePoll } = get();
    if (!isRunning || !isPaused) return;

    logger.debug("Resuming polling (app active)", "PollingStore");
    set({ isPaused: false });

    // Re-execute and reschedule all polls with stagger
    const pollTypes: PollType[] = ["distros", "resources", "health"];
    pollTypes.forEach((type) => {
      setTimeout(() => {
        executePoll(type).then(() => schedulePoll(type));
      }, STAGGER_OFFSETS[type]);
    });
  },

  schedulePoll: (type: PollType) => {
    const { isRunning, isPaused, polls, config, executePoll, schedulePoll } = get();

    if (!isRunning || isPaused || !config[type].enabled) return;

    // Clear existing timer
    if (timers[type] !== null) {
      clearTimeout(timers[type]!);
    }

    const interval = polls[type].currentInterval;
    const nextPollTime = Date.now() + interval;

    set((state) => ({
      polls: {
        ...state.polls,
        [type]: { ...state.polls[type], nextPollTime },
      },
    }));

    timers[type] = window.setTimeout(async () => {
      await executePoll(type);
      schedulePoll(type);
    }, interval);
  },

  executePoll: async (type: PollType) => {
    const { isPaused, config, handlePollSuccess, handlePollTimeout } = get();

    if (isPaused || !config[type].enabled) return;

    // Skip polling if WSL preflight check hasn't passed
    // No point polling wsl commands if WSL isn't installed/ready
    try {
      const preflightState = usePreflightStore.getState();
      if (!preflightState.isReady) {
        logger.debug(`Skipping ${type} poll - WSL preflight not ready`, "PollingStore");
        return;
      }
    } catch (e) {
      logger.debug("PreflightStore not available, skipping poll", "PollingStore");
      return;
    }

    // Skip polling if an action is in progress (e.g., WSL update, distro operations)
    // Polling during these operations can fail and show spurious errors
    try {
      const distroState = useDistroStore.getState();
      if (distroState?.actionInProgress) {
        logger.debug(`Skipping ${type} poll - action in progress: ${distroState.actionInProgress}`, "PollingStore");
        return;
      }
    } catch (e) {
      // Store might not be available, continue with poll
    }

    // Check condition for resources (only poll when distros are running)
    if (type === "resources") {
      try {
        const distroState = useDistroStore.getState();
        // Defensive check: ensure store is available and has distributions property
        if (!distroState || !distroState.distributions) {
          logger.debug("DistroStore not available, skipping resources poll", "PollingStore");
          return;
        }
        const distros = distroState.distributions;
        const hasRunning = distros.some((d) => d.state === "Running");
        if (!hasRunning) {
          // Clear resource stats when nothing is running
          try {
            useResourceStore.getState().clearStats();
          } catch (e) {
            // Store might not be available (e.g., during cleanup or initialization)
            logger.debug("ResourceStore not available during cleanup", "PollingStore");
          }
          return;
        }
      } catch (e) {
        // Store might not be available (e.g., during cleanup or initialization)
        logger.debug("Error accessing DistroStore, skipping resources poll", "PollingStore", e);
        return;
      }
    }

    // Prevent concurrent polls of the same type
    if (pollLocks[type]) {
      logger.debug(`Skipping ${type} poll - already in progress`, "PollingStore");
      return;
    }

    pollLocks[type] = true;
    set((state) => ({
      polls: {
        ...state.polls,
        [type]: { ...state.polls[type], isPolling: true },
      },
    }));

    try {
      let success = false;
      let isTimeout = false;

      switch (type) {
        case "distros": {
          try {
            const distroStore = useDistroStore.getState();
            if (!distroStore || !distroStore.fetchDistros) {
              logger.debug("DistroStore not available, skipping distros poll", "PollingStore");
              return;
            }
            await distroStore.fetchDistros(true); // silent mode
            const distroState = useDistroStore.getState();
            success = !distroState?.error;
            isTimeout = distroState?.isTimeoutError ?? false;
          } catch (e) {
            logger.debug("Error polling distros, store may be unavailable", "PollingStore", e);
            return;
          }
          break;
        }
        case "resources": {
          try {
            const resourceStore = useResourceStore.getState();
            if (!resourceStore || !resourceStore.fetchStats) {
              logger.debug("ResourceStore not available, skipping resources poll", "PollingStore");
              return;
            }
            await resourceStore.fetchStats(true); // silent mode
            const resourceState = useResourceStore.getState();
            success = !resourceState?.error;
            // Check for timeout in error message
            isTimeout = resourceState?.error?.toLowerCase().includes("timeout") ?? false;
          } catch (e) {
            logger.debug("Error polling resources, store may be unavailable", "PollingStore", e);
            return;
          }
          break;
        }
        case "health": {
          try {
            const healthStore = useHealthStore.getState();
            if (!healthStore || !healthStore.fetchHealth) {
              logger.debug("HealthStore not available, skipping health poll", "PollingStore");
              return;
            }
            success = await healthStore.fetchHealth(true); // silent mode
            const healthState = useHealthStore.getState();
            isTimeout = healthState?.error?.toLowerCase().includes("timeout") ?? false;
          } catch (e) {
            logger.debug("Error polling health, store may be unavailable", "PollingStore", e);
            return;
          }
          break;
        }
      }

      if (success) {
        handlePollSuccess(type);
      } else if (isTimeout) {
        handlePollTimeout(type);
      }
      // Non-timeout errors don't trigger backoff
    } catch (error) {
      logger.error(`Poll ${type} failed:`, "PollingStore", error);

      // Check for timeout in error
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.toLowerCase().includes("timeout")) {
        handlePollTimeout(type);
      }
    } finally {
      pollLocks[type] = false;
      set((state) => ({
        polls: {
          ...state.polls,
          [type]: {
            ...state.polls[type],
            isPolling: false,
            lastPollTime: Date.now(),
          },
        },
      }));
    }
  },

  handlePollSuccess: (type: PollType) => {
    const { polls, config } = get();

    // Reset backoff on success
    if (polls[type].consecutiveTimeouts > 0) {
      logger.info(`Resetting backoff for ${type} after successful poll`, "PollingStore");
    }

    set((state) => ({
      polls: {
        ...state.polls,
        [type]: {
          ...state.polls[type],
          consecutiveTimeouts: 0,
          currentInterval: config[type].defaultInterval,
          lastError: null,
        },
      },
    }));
  },

  handlePollTimeout: (type: PollType) => {
    const { polls, config } = get();
    const pollState = polls[type];
    const pollConfig = config[type];

    const newTimeouts = pollState.consecutiveTimeouts + 1;
    const newInterval = Math.min(
      pollState.currentInterval * pollConfig.backoffMultiplier,
      pollConfig.maxInterval
    );

    logger.warn(
      `Poll ${type} timed out (${newTimeouts}x consecutive), backing off to ${newInterval}ms`,
      "PollingStore"
    );

    set((state) => ({
      polls: {
        ...state.polls,
        [type]: {
          ...state.polls[type],
          consecutiveTimeouts: newTimeouts,
          currentInterval: newInterval,
          lastError: "timeout",
        },
      },
    }));
  },

  resetBackoff: (type: PollType) => {
    const { config, schedulePoll } = get();

    logger.info(`Manually resetting backoff for ${type}`, "PollingStore");

    set((state) => ({
      polls: {
        ...state.polls,
        [type]: {
          ...state.polls[type],
          consecutiveTimeouts: 0,
          currentInterval: config[type].defaultInterval,
          lastError: null,
        },
      },
    }));

    // Reschedule with new interval
    schedulePoll(type);
  },

  resetAllBackoff: () => {
    const { config, schedulePoll } = get();

    logger.info("Manually resetting all backoff", "PollingStore");

    set((state) => ({
      polls: {
        distros: {
          ...state.polls.distros,
          consecutiveTimeouts: 0,
          currentInterval: config.distros.defaultInterval,
          lastError: null,
        },
        resources: {
          ...state.polls.resources,
          consecutiveTimeouts: 0,
          currentInterval: config.resources.defaultInterval,
          lastError: null,
        },
        health: {
          ...state.polls.health,
          consecutiveTimeouts: 0,
          currentInterval: config.health.defaultInterval,
          lastError: null,
        },
      },
    }));

    // Reschedule all polls
    (["distros", "resources", "health"] as PollType[]).forEach(schedulePoll);
  },

  updateInterval: (type: PollType, interval: number) => {
    const { config, polls, schedulePoll } = get();
    const pollConfig = config[type];

    // Clamp to min/max
    const clampedInterval = Math.max(
      pollConfig.minInterval,
      Math.min(interval, pollConfig.maxInterval)
    );

    logger.info(`Updating ${type} interval to ${clampedInterval}ms`, "PollingStore");

    set((state) => ({
      config: {
        ...state.config,
        [type]: { ...state.config[type], defaultInterval: clampedInterval },
      },
      polls: {
        ...state.polls,
        [type]: {
          ...state.polls[type],
          // Only update current interval if not backed off
          currentInterval:
            polls[type].consecutiveTimeouts === 0
              ? clampedInterval
              : state.polls[type].currentInterval,
        },
      },
    }));

    // Reschedule with new interval
    schedulePoll(type);
  },

  setEnabled: (type: PollType, enabled: boolean) => {
    const { schedulePoll } = get();

    logger.info(`Setting ${type} polling enabled: ${enabled}`, "PollingStore");

    set((state) => ({
      config: {
        ...state.config,
        [type]: { ...state.config[type], enabled },
      },
    }));

    if (enabled) {
      schedulePoll(type);
    } else if (timers[type] !== null) {
      clearTimeout(timers[type]!);
      timers[type] = null;
    }
  },

  setGlobalEnabled: (enabled: boolean) => {
    const { start, stop, isRunning } = get();

    logger.info(`Setting global polling enabled: ${enabled}`, "PollingStore");

    if (enabled && !isRunning) {
      start();
    } else if (!enabled && isRunning) {
      stop();
    }
  },

  // Selectors
  hasBackoff: () => {
    const { polls } = get();
    return Object.values(polls).some((p) => p.consecutiveTimeouts > 0);
  },

  getBackoffMessage: () => {
    const { polls } = get();
    const backedOff = (Object.keys(polls) as PollType[]).filter(
      (type) => polls[type].consecutiveTimeouts > 0
    );

    if (backedOff.length === 0) return null;

    const messages = backedOff.map((type) => {
      const poll = polls[type];
      const seconds = Math.round(poll.currentInterval / 1000);
      return `${type}: ${seconds}s (${poll.consecutiveTimeouts}x timeouts)`;
    });

    return `Auto-refresh slowed: ${messages.join(", ")}`;
  },
}));
