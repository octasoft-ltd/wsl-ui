import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { useConfigPendingStore } from "./configPendingStore";
import { useNotificationStore } from "./notificationStore";
import type { WslConfigPendingStatus } from "../types/rdp";

// Mock the wslService
vi.mock("../services/wslService", () => ({
  wslService: {
    checkWslConfigPending: vi.fn(),
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

const NOTIFICATION_TITLE = "WSL Config Pending Restart";

describe("configPendingStore", () => {
  beforeEach(() => {
    // Reset config pending store state
    useConfigPendingStore.setState({
      status: null,
      isChecking: false,
      error: null,
    });
    // Reset notification store
    useNotificationStore.setState({
      notifications: [],
    });
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Stop any polling that might be running
    useConfigPendingStore.getState().stopPolling();
  });

  describe("initial state", () => {
    it("should have correct initial state", () => {
      const state = useConfigPendingStore.getState();
      expect(state.status).toBeNull();
      expect(state.isChecking).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe("checkPending", () => {
    it("sets isChecking while checking", async () => {
      const pendingStatus: WslConfigPendingStatus = {
        pendingRestart: false,
      };
      vi.mocked(wslService.checkWslConfigPending).mockResolvedValue(pendingStatus);

      const checkPromise = useConfigPendingStore.getState().checkPending();

      expect(useConfigPendingStore.getState().isChecking).toBe(true);

      await checkPromise;

      expect(useConfigPendingStore.getState().isChecking).toBe(false);
    });

    it("stores status after successful check", async () => {
      const pendingStatus: WslConfigPendingStatus = {
        pendingRestart: true,
        configModified: "2024-01-15T10:00:00Z",
        wslStarted: "2024-01-15T09:00:00Z",
      };
      vi.mocked(wslService.checkWslConfigPending).mockResolvedValue(pendingStatus);

      await useConfigPendingStore.getState().checkPending();

      expect(useConfigPendingStore.getState().status).toEqual(pendingStatus);
    });

    it("sets error on check failure", async () => {
      vi.mocked(wslService.checkWslConfigPending).mockRejectedValue(
        new Error("PowerShell failed")
      );

      await useConfigPendingStore.getState().checkPending();

      expect(useConfigPendingStore.getState().error).toBe("PowerShell failed");
      expect(useConfigPendingStore.getState().isChecking).toBe(false);
    });

    it("prevents concurrent checks", async () => {
      let resolveCheck: (value: WslConfigPendingStatus) => void;
      const checkPromise = new Promise<WslConfigPendingStatus>((resolve) => {
        resolveCheck = resolve;
      });
      vi.mocked(wslService.checkWslConfigPending).mockReturnValue(checkPromise);

      // Start first check
      const firstCheck = useConfigPendingStore.getState().checkPending();

      // Try to start second check while first is in progress
      await useConfigPendingStore.getState().checkPending();

      // Service should only be called once
      expect(wslService.checkWslConfigPending).toHaveBeenCalledTimes(1);

      // Complete the first check
      resolveCheck!({ pendingRestart: false });
      await firstCheck;
    });
  });

  describe("notification behavior", () => {
    it("shows notification when pendingRestart is true", async () => {
      const pendingStatus: WslConfigPendingStatus = {
        pendingRestart: true,
      };
      vi.mocked(wslService.checkWslConfigPending).mockResolvedValue(pendingStatus);

      await useConfigPendingStore.getState().checkPending();

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe(NOTIFICATION_TITLE);
      expect(notifications[0].type).toBe("warning");
    });

    it("does not show notification when pendingRestart is false", async () => {
      const pendingStatus: WslConfigPendingStatus = {
        pendingRestart: false,
      };
      vi.mocked(wslService.checkWslConfigPending).mockResolvedValue(pendingStatus);

      await useConfigPendingStore.getState().checkPending();

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(0);
    });

    it("does not duplicate notification on subsequent checks", async () => {
      const pendingStatus: WslConfigPendingStatus = {
        pendingRestart: true,
      };
      vi.mocked(wslService.checkWslConfigPending).mockResolvedValue(pendingStatus);

      // First check - should add notification
      await useConfigPendingStore.getState().checkPending();
      expect(useNotificationStore.getState().notifications).toHaveLength(1);

      // Second check - should not add another notification
      await useConfigPendingStore.getState().checkPending();
      expect(useNotificationStore.getState().notifications).toHaveLength(1);

      // Third check - still only one notification
      await useConfigPendingStore.getState().checkPending();
      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });

    it("re-adds notification after user dismisses it", async () => {
      const pendingStatus: WslConfigPendingStatus = {
        pendingRestart: true,
      };
      vi.mocked(wslService.checkWslConfigPending).mockResolvedValue(pendingStatus);

      // First check - adds notification
      await useConfigPendingStore.getState().checkPending();
      expect(useNotificationStore.getState().notifications).toHaveLength(1);

      // User dismisses notification
      const notificationId = useNotificationStore.getState().notifications[0].id;
      useNotificationStore.getState().removeNotification(notificationId);
      expect(useNotificationStore.getState().notifications).toHaveLength(0);

      // Next check - should re-add notification since it was dismissed
      await useConfigPendingStore.getState().checkPending();
      expect(useNotificationStore.getState().notifications).toHaveLength(1);
    });

    it("removes notification when pendingRestart becomes false", async () => {
      // First: pending restart is true
      vi.mocked(wslService.checkWslConfigPending).mockResolvedValue({
        pendingRestart: true,
      });
      await useConfigPendingStore.getState().checkPending();
      expect(useNotificationStore.getState().notifications).toHaveLength(1);

      // Second: pending restart is false (user ran wsl --shutdown)
      vi.mocked(wslService.checkWslConfigPending).mockResolvedValue({
        pendingRestart: false,
      });
      await useConfigPendingStore.getState().checkPending();
      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });
  });

  describe("clearStatus", () => {
    it("resets status and error", () => {
      // Set some state
      useConfigPendingStore.setState({
        status: { pendingRestart: true },
        error: "some error",
      });

      useConfigPendingStore.getState().clearStatus();

      const state = useConfigPendingStore.getState();
      expect(state.status).toBeNull();
      expect(state.error).toBeNull();
    });

    it("removes pending notification if exists", () => {
      // Add a pending notification
      useNotificationStore.getState().addNotification({
        type: "warning",
        title: NOTIFICATION_TITLE,
        message: "Test message",
      });
      expect(useNotificationStore.getState().notifications).toHaveLength(1);

      useConfigPendingStore.getState().clearStatus();

      expect(useNotificationStore.getState().notifications).toHaveLength(0);
    });

    it("does not affect other notifications", () => {
      // Add multiple notifications
      useNotificationStore.getState().addNotification({
        type: "warning",
        title: NOTIFICATION_TITLE,
        message: "Pending restart message",
      });
      useNotificationStore.getState().addNotification({
        type: "info",
        title: "Other Notification",
        message: "Some other message",
      });
      expect(useNotificationStore.getState().notifications).toHaveLength(2);

      useConfigPendingStore.getState().clearStatus();

      const notifications = useNotificationStore.getState().notifications;
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe("Other Notification");
    });
  });

  describe("polling", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("startPolling calls checkPending immediately", async () => {
      vi.mocked(wslService.checkWslConfigPending).mockResolvedValue({
        pendingRestart: false,
      });

      useConfigPendingStore.getState().startPolling();

      expect(wslService.checkWslConfigPending).toHaveBeenCalledTimes(1);
    });

    it("stopPolling stops the polling timer", async () => {
      vi.mocked(wslService.checkWslConfigPending).mockResolvedValue({
        pendingRestart: false,
      });

      useConfigPendingStore.getState().startPolling();
      expect(wslService.checkWslConfigPending).toHaveBeenCalledTimes(1);

      useConfigPendingStore.getState().stopPolling();

      // Advance time past polling interval
      vi.advanceTimersByTime(120000);

      // Should not have been called again
      expect(wslService.checkWslConfigPending).toHaveBeenCalledTimes(1);
    });
  });
});
