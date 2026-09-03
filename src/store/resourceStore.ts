import { create } from "zustand";
import { wslService, type ResourceStats, type DistroResourceUsage } from "../services/wslService";
import { logger } from "../utils/logger";

interface ResourceStore {
  stats: ResourceStats | null;
  isLoading: boolean;
  error: string | null;

  // Actions
  fetchStats: (silent?: boolean) => Promise<void>;
  clearStats: () => void;

  // Selectors
  getDistroResources: (name: string) => DistroResourceUsage | undefined;
}

export const useResourceStore = create<ResourceStore>((set, get) => ({
  stats: null,
  isLoading: false,
  error: null,

  fetchStats: async (silent?: boolean) => {
    if (!silent) set({ isLoading: true, error: null });
    try {
      const stats = await wslService.getResourceStats();
      logger.info("Fetched stats:", "ResourceStore", stats);
      // Clear error on silent success too: the polling backoff reads it after
      // each silent fetch, and a stale error otherwise latches the backoff at
      // max interval for the whole session (GH #115)
      set(silent ? { stats, error: null } : { stats, isLoading: false, error: null });
    } catch (error) {
      logger.error("Failed to fetch resource stats:", "ResourceStore", error);
      set(silent ? { error: String(error) } : { error: String(error), isLoading: false });
    }
  },

  clearStats: () => {
    set({ stats: null, error: null });
  },

  getDistroResources: (name: string) => {
    const { stats } = get();
    if (!stats || !stats.perDistro) return undefined;
    return stats.perDistro.find((d) => d.name === name);
  },
}));

// Expose store for e2e testing (allows direct store access from browser.execute)
if (typeof window !== 'undefined') {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).__resourceStore = useResourceStore;
}
