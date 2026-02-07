import { create } from "zustand";
import type { WslConfigPendingStatus } from "../types/rdp";
import { wslService } from "../services/wslService";
import { useNotificationStore } from "./notificationStore";
import { logger } from "../utils/logger";

// Polling interval for config pending check (60 seconds - longer poll as requested)
const POLL_INTERVAL = 60000;

// Title used to identify our notification
const NOTIFICATION_TITLE = "WSL Config Pending Restart";

interface ConfigPendingStore {
  // State
  status: WslConfigPendingStatus | null;
  isChecking: boolean;
  error: string | null;

  // Actions
  checkPending: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  clearStatus: () => void;
}

// Timer for polling (outside Zustand to avoid re-renders)
let pollTimer: number | null = null;

export const useConfigPendingStore = create<ConfigPendingStore>((set, get) => ({
  status: null,
  isChecking: false,
  error: null,

  checkPending: async () => {
    const { isChecking } = get();
    if (isChecking) return;

    set({ isChecking: true, error: null });

    try {
      const status = await wslService.checkWslConfigPending();

      set({ status, isChecking: false });

      // Handle notification based on status
      const notificationStore = useNotificationStore.getState();
      const notifications = notificationStore.notifications;
      const existingNotification = notifications.find(
        (n) => n.title === NOTIFICATION_TITLE
      );

      if (status.pendingRestart) {
        // Only show notification if one doesn't already exist
        // This allows it to reappear if user dismisses it, but won't duplicate
        if (!existingNotification) {
          notificationStore.addNotification({
            type: "warning",
            title: NOTIFICATION_TITLE,
            message:
              "Your .wslconfig has changes that require WSL restart to take effect. Run 'wsl --shutdown' to apply.",
            autoDismiss: 0,
          });
          logger.info("WSL config has pending changes requiring restart", "ConfigPendingStore");
        }
      } else {
        // No longer pending - remove notification if one exists
        if (existingNotification) {
          notificationStore.removeNotification(existingNotification.id);
          logger.info("WSL config changes have been applied", "ConfigPendingStore");
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error("Failed to check config pending status:", "ConfigPendingStore", error);
      set({ error: errorMessage, isChecking: false });
    }
  },

  startPolling: () => {
    const { checkPending } = get();

    // Clear any existing timer
    if (pollTimer !== null) {
      clearInterval(pollTimer);
    }

    logger.info("Starting config pending polling", "ConfigPendingStore");

    // Do an initial check
    checkPending();

    // Set up polling
    pollTimer = window.setInterval(() => {
      checkPending();
    }, POLL_INTERVAL);
  },

  stopPolling: () => {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
      logger.info("Stopped config pending polling", "ConfigPendingStore");
    }
  },

  clearStatus: () => {
    set({ status: null, error: null });

    // Remove any pending notification
    const notificationStore = useNotificationStore.getState();
    const notifications = notificationStore.notifications;
    const pendingNotification = notifications.find(
      (n) => n.title === NOTIFICATION_TITLE
    );
    if (pendingNotification) {
      notificationStore.removeNotification(pendingNotification.id);
    }
  },
}));

// Expose store for e2e testing
if (typeof window !== "undefined") {
  (window as unknown as { __configPendingStore: typeof useConfigPendingStore }).__configPendingStore =
    useConfigPendingStore;
}
