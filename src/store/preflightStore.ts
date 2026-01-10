import { create } from "zustand";
import {
  wslService,
  type WslPreflightStatus,
  isWslReady,
  getPreflightTitle,
  getPreflightMessage,
  getPreflightHelpUrl,
} from "../services/wslService";
import { info, debug } from "../utils/logger";
import { useDistroStore } from "./distroStore";

interface PreflightStore {
  /** Current preflight status - null if not yet checked */
  status: WslPreflightStatus | null;
  /** Whether a preflight check is in progress */
  isChecking: boolean;
  /** Whether the initial preflight check has completed */
  hasChecked: boolean;

  // Derived getters (computed from status)
  /** Whether WSL is ready to use */
  isReady: boolean;
  /** Title for the current status (for display) */
  title: string;
  /** Message describing the current status */
  message: string;
  /** Help URL for fixing the issue, if applicable */
  helpUrl: string | null;

  // Actions
  /** Run the preflight check */
  checkPreflight: () => Promise<void>;
  /** Reset the preflight state (for testing) */
  reset: () => void;
}

export const usePreflightStore = create<PreflightStore>((set, get) => ({
  status: null,
  isChecking: false,
  hasChecked: false,

  // Derived values - computed when status changes
  isReady: false,
  title: "",
  message: "",
  helpUrl: null,

  checkPreflight: async () => {
    // Don't run concurrent checks
    if (get().isChecking) {
      debug("[preflightStore] Check already in progress, skipping");
      return;
    }

    info("[preflightStore] Running WSL preflight check");
    set({ isChecking: true });

    // Minimum delay to provide visual feedback when check is fast
    const MIN_CHECK_DELAY = 500;
    const minDelay = new Promise((resolve) => setTimeout(resolve, MIN_CHECK_DELAY));

    try {
      const [status] = await Promise.all([wslService.checkWslPreflight(), minDelay]);
      const ready = isWslReady(status);

      info(`[preflightStore] Preflight result: ${status.status} (ready: ${ready})`);

      set({
        status,
        isChecking: false,
        hasChecked: true,
        isReady: ready,
        title: getPreflightTitle(status),
        message: getPreflightMessage(status),
        helpUrl: getPreflightHelpUrl(status),
      });

      // Auto-fetch distros if WSL is now ready, otherwise clear stale data
      if (ready) {
        info("[preflightStore] WSL is ready, triggering distro fetch");
        useDistroStore.getState().fetchDistros();
      } else {
        info("[preflightStore] WSL is not ready, clearing stale distributions");
        useDistroStore.getState().clearDistributions();
      }
    } catch (error) {
      // If the check itself fails, treat as unknown error
      const errorMessage = error instanceof Error ? error.message : String(error);
      info(`[preflightStore] Preflight check failed: ${errorMessage}`);

      const status: WslPreflightStatus = {
        status: "unknown",
        message: errorMessage,
      };

      set({
        status,
        isChecking: false,
        hasChecked: true,
        isReady: false,
        title: getPreflightTitle(status),
        message: getPreflightMessage(status),
        helpUrl: getPreflightHelpUrl(status),
      });

      // Clear stale distributions since preflight failed
      useDistroStore.getState().clearDistributions();
    }
  },

  reset: () => {
    set({
      status: null,
      isChecking: false,
      hasChecked: false,
      isReady: false,
      title: "",
      message: "",
      helpUrl: null,
    });
  },
}));
