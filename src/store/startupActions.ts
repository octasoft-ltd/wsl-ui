import { actionsService } from "../services/actionsService";
import type { CustomAction } from "../types/actions";
import { useActionsStore } from "./actionsStore";
import { useNotificationStore } from "./notificationStore";

export async function runStartupAction(action: CustomAction, distro: string, id?: string): Promise<void> {
  const notify = (message: string) => useNotificationStore.getState().addNotification({
    type: "error", title: `Startup action: ${action.name}`, message: `${distro}: ${message}`,
  });
  try {
    if (action.runInTerminal) {
      await actionsService.runActionInTerminal(action.id, distro, id);
      return;
    }
    const result = await actionsService.executeAction(action.id, distro, id);
    if (action.showOutput) {
      useActionsStore.getState().setStartupActionOutput({
        actionName: action.name, distro, output: result.output, error: result.error,
      });
    }
    if (!result.success && (!action.showOutput || action.requiresSudo)) {
      const detail = result.error || result.output || "The command exited unsuccessfully.";
      notify(action.requiresSudo
        ? `${detail}\nIf sudo needs a password, run this action from Quick Actions to enter it.`
        : detail);
    }
  } catch (error) {
    notify(typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to run action.");
  }
}
