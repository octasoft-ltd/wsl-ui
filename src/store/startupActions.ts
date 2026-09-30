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
    if (action.requiresSudo) {
      notify("This action needs a sudo password and cannot run unattended. Run it from Quick Actions to enter your password.");
      return;
    }
    const result = await actionsService.executeAction(action.id, distro, id);
    if (action.showOutput) {
      useActionsStore.getState().setStartupActionOutput({
        actionName: action.name, distro, output: result.output, error: result.error,
      });
    } else if (!result.success) {
      notify(result.error || result.output || "The command exited unsuccessfully.");
    }
  } catch (error) {
    notify(typeof error === "string" ? error : error instanceof Error ? error.message : "Failed to run action.");
  }
}
