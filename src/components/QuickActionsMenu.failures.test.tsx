import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { QuickActionsMenu } from "./QuickActionsMenu";
import { useDistroStore } from "../store/distroStore";
import { useActionsStore } from "../store/actionsStore";
import { useNotificationStore } from "../store/notificationStore";
import { DEFAULT_CUSTOM_ACTION } from "../types/actions";

const popup = vi.hoisted(() => ({ onAction: undefined as ((id: string) => void) | undefined }));
vi.mock("../store/distroStore");
vi.mock("../store/actionsStore");
vi.mock("../hooks/usePopupWindow", () => ({
  estimatePopupHeight: () => 200,
  usePopupWindow: (options: { onAction: (id: string) => void }) => {
    popup.onAction = options.onAction;
    return { isOpen: false, open: vi.fn(), close: vi.fn() };
  },
}));
vi.mock("./ConfirmDialog", () => ({ ConfirmDialog: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: () => void }) =>
  isOpen ? <button onClick={onConfirm}>Confirm action</button> : null }));
vi.mock("./PasswordPromptDialog", () => ({ PasswordPromptDialog: ({ isOpen, onSubmit }: { isOpen: boolean; onSubmit: (password: string) => void }) =>
  isOpen ? <button onClick={() => onSubmit("password")}>Submit password</button> : null }));

beforeEach(() => { vi.clearAllMocks(); useNotificationStore.getState().clearAll(); });

it.each(["direct", "confirmed", "sudo"])("surfaces a hidden-output failure for %s execution", async (flow) => {
  const executeAction = vi.fn().mockResolvedValue({ success: false, output: "", error: "Permission denied" });
  vi.mocked(useActionsStore).mockReturnValue({
    actions: [{ ...DEFAULT_CUSTOM_ACTION, id: "fail", showOutput: false,
      confirmBeforeRun: flow === "confirmed", requiresSudo: flow === "sudo" }],
    fetchActions: vi.fn(), executeAction, isExecuting: false,
  } as unknown as ReturnType<typeof useActionsStore>);
  vi.mocked(useDistroStore).mockReturnValue({ distributions: [], setActionInProgress: vi.fn(), actionInProgress: null } as ReturnType<typeof useDistroStore>);
  render(<QuickActionsMenu distro={{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }} />);
  await act(async () => popup.onAction?.("custom:fail"));
  if (flow === "confirmed") fireEvent.click(screen.getByText("Confirm action"));
  if (flow === "sudo") fireEvent.click(screen.getByText("Submit password"));
  await waitFor(() => expect(useNotificationStore.getState().notifications[0]?.message).toContain("Permission denied"));
});
