import { create } from "zustand";

export type NotificationType = "success" | "info" | "warning" | "error";

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  autoDismiss?: number; // milliseconds, 0 = no auto-dismiss
}

interface NotificationState {
  notifications: Notification[];
  addNotification: (notification: Omit<Notification, "id">) => void;
  removeNotification: (id: string) => void;
  clearAll: () => void;
}

let notificationId = 0;

export const useNotificationStore = create<NotificationState>((set) => ({
  notifications: [],

  addNotification: (notification) => {
    const id = `notification-${++notificationId}`;
    const newNotification: Notification = {
      ...notification,
      id,
      autoDismiss: notification.autoDismiss ?? (notification.type === "success" ? 5000 : 0),
    };

    set((state) => ({
      notifications: [...state.notifications, newNotification],
    }));

    // Note: Auto-dismiss is handled by NotificationBanner component
    // to allow for exit animations before removal
  },

  removeNotification: (id) => {
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    }));
  },

  clearAll: () => {
    set({ notifications: [] });
  },
}));

// Expose store for e2e testing (allows direct store access from browser.execute)
if (typeof window !== "undefined") {
  (
    window as unknown as { __notificationStore: typeof useNotificationStore }
  ).__notificationStore = useNotificationStore;
}
