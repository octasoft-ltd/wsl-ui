export type PollType = "distros" | "resources" | "health";

export interface PollConfig {
  defaultInterval: number;
  minInterval: number;
  maxInterval: number; // Max backoff cap
  backoffMultiplier: number;
  enabled: boolean;
}

export interface PollState {
  lastPollTime: number;
  nextPollTime: number;
  consecutiveTimeouts: number;
  currentInterval: number;
  isPolling: boolean;
  lastError: string | null;
}

export interface PollingConfig {
  distros: PollConfig;
  resources: PollConfig;
  health: PollConfig;
}

export interface PollingIntervals {
  distros: number;
  resources: number;
  health: number;
}

export const DEFAULT_POLLING_INTERVALS: PollingIntervals = {
  distros: 10000, // 10s
  resources: 5000, // 5s
  health: 10000, // 10s
};

export const DEFAULT_POLLING_CONFIG: PollingConfig = {
  distros: {
    defaultInterval: 10000, // 10s
    minInterval: 5000, // 5s minimum
    maxInterval: 60000, // 60s max backoff
    backoffMultiplier: 2,
    enabled: true,
  },
  resources: {
    defaultInterval: 5000, // 5s
    minInterval: 2000, // 2s minimum
    maxInterval: 30000, // 30s max backoff
    backoffMultiplier: 2,
    enabled: true,
  },
  health: {
    defaultInterval: 10000, // 10s
    minInterval: 5000, // 5s minimum
    maxInterval: 60000, // 60s max backoff
    backoffMultiplier: 2,
    enabled: true,
  },
};
