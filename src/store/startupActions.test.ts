import { beforeEach, describe, expect, it, vi } from "vitest";
import { actionsService } from "../services/actionsService";
import { DEFAULT_CUSTOM_ACTION } from "../types/actions";
import { useNotificationStore } from "./notificationStore";
import { runStartupAction } from "./startupActions";

vi.mock("../services/actionsService", () => ({ actionsService: {
  executeAction: vi.fn(), runActionInTerminal: vi.fn(),
} }));

describe("startup actions", () => {
  const action = { ...DEFAULT_CUSTOM_ACTION, id: "test", name: "Update", runOnStartup: true };
  beforeEach(() => { vi.clearAllMocks(); useNotificationStore.getState().clearAll(); });

  it("opens terminal actions without attempting captured execution", async () => {
    await runStartupAction({ ...action, runInTerminal: true, requiresSudo: true }, "Ubuntu", "guid");
    expect(actionsService.runActionInTerminal).toHaveBeenCalledWith("test", "Ubuntu", "guid");
    expect(actionsService.executeAction).not.toHaveBeenCalled();
  });

  it("explains how to run password-requiring actions without silently failing", async () => {
    await runStartupAction({ ...action, requiresSudo: true, showOutput: false }, "Ubuntu");
    expect(actionsService.executeAction).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications[0].message).toContain("Quick Actions");
  });

  it("surfaces failed unattended actions even when output is hidden", async () => {
    vi.mocked(actionsService.executeAction).mockResolvedValue({ success: false, output: "", error: "Exit 1" });
    await runStartupAction({ ...action, showOutput: false }, "Ubuntu");
    expect(useNotificationStore.getState().notifications[0].message).toContain("Exit 1");
  });
});
