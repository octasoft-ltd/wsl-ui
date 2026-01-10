import { create } from "zustand";
import {
  wslService,
  type WslHealth,
  type WslVersionInfo,
} from "../services/wslService";
import { parseError, logError, formatError } from "../utils/errors";

interface HealthStore {
  health: WslHealth | null;
  versionInfo: WslVersionInfo | null;
  isLoading: boolean;
  error: string | null;

  // Actions - return boolean for success/failure (used by polling)
  fetchHealth: (silent?: boolean) => Promise<boolean>;
  fetchVersion: () => Promise<boolean>;
  clearError: () => void;
}

export const useHealthStore = create<HealthStore>((set) => ({
  health: null,
  versionInfo: null,
  isLoading: false,
  error: null,

  fetchHealth: async (silent?: boolean) => {
    if (!silent) set({ isLoading: true });
    try {
      const health = await wslService.getWslHealth();
      set(silent ? { health, error: null } : { health, isLoading: false, error: null });
      return true;
    } catch (error) {
      const appError = parseError(error);
      logError(appError, "healthStore.fetchHealth");
      set(silent 
        ? { error: formatError(appError) } 
        : { error: formatError(appError), isLoading: false }
      );
      return false;
    }
  },

  fetchVersion: async () => {
    try {
      const versionInfo = await wslService.getWslVersion();
      set({ versionInfo });
      return true;
    } catch (error) {
      // Version is optional info, don't set error state
      const appError = parseError(error);
      logError(appError, "healthStore.fetchVersion");
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
