import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { CustomAction } from "../types/actions";
import type { Distribution } from "../types/distribution";
import { QuickActionsPopup } from "./QuickActionsPopup";

const testDistribution: Distribution = {
  isDefault: false,
  name: "Ubuntu-22.04",
  state: "Running",
  version: 2,
};

const testCustomAction: CustomAction = {
  command: "echo test",
  confirmBeforeRun: true,
  icon: "terminal",
  id: "test-action",
  name: "Test Action",
  order: 0,
  requiresStopped: true,
  requiresSudo: true,
  runInTerminal: false,
  runOnStartup: false,
  scope: { type: "all" },
  showOutput: true,
};

describe("QuickActionsPopup", () => {
  it.each(["Running", "Stopped"] as const)("shows the version conversion stop requirement for state %s", (state) => {
    render(<QuickActionsPopup actions={[]} distro={{ ...testDistribution, state }} onAction={vi.fn()} />);
    fireEvent.click(screen.getByTestId("quick-action-manage"));
    const action = within(screen.getByTestId("manage-action-set-version"));
    if (state === "Running") {
      expect(action.getByTestId("requires-stop-indicator")).toBeVisible();
    } else {
      expect(action.queryByTestId("requires-stop-indicator")).not.toBeInTheDocument();
    }
    expect(action.getByText("v2")).toBeVisible();
  });

  it("offers explicit sparse commands without claiming the current disk state", () => {
    const onAction = vi.fn();
    render(<QuickActionsPopup actions={[]} distro={testDistribution} onAction={onAction} />);
    fireEvent.click(screen.getByTestId("quick-action-manage"));
    fireEvent.click(screen.getByTestId("manage-action-sparse"));
    fireEvent.click(screen.getByTestId("manage-action-sparse-disable"));
    expect(onAction.mock.calls).toEqual([["manage:sparse-enable"], ["manage:sparse-disable"]]);
  });

  it("exposes menu semantics and stable test selectors", () => {
    render(
      <QuickActionsPopup
        actions={[testCustomAction]}
        distro={testDistribution}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByTestId("quick-actions-menu")).toHaveAttribute("role", "menu");
    expect(screen.getByTestId("quick-actions-menu")).toHaveAccessibleName(/Ubuntu-22\.04/);
    expect(screen.getByTestId("quick-action-info")).toHaveAttribute("role", "menuitem");
    expect(screen.getByTestId("quick-action-manage")).toHaveAttribute("aria-expanded", "false");
  });

  it("returns only the authoritative custom action identifier", () => {
    const onAction = vi.fn();
    render(
      <QuickActionsPopup
        actions={[testCustomAction]}
        distro={testDistribution}
        onAction={onAction}
      />,
    );

    fireEvent.click(screen.getByTestId("quick-action-custom-test-action"));

    expect(onAction).toHaveBeenCalledWith("custom:test-action");
    expect(onAction.mock.calls[0]).toHaveLength(1);
  });

  it("resets transient submenu state when a new popup session remounts content", () => {
    const { rerender } = render(
      <QuickActionsPopup
        key="first-session"
        actions={[]}
        distro={testDistribution}
        onAction={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("quick-action-manage"));
    expect(screen.getByTestId("quick-action-manage")).toHaveAttribute("aria-expanded", "true");

    rerender(
      <QuickActionsPopup
        key="second-session"
        actions={[]}
        distro={{ ...testDistribution, name: "Debian" }}
        onAction={vi.fn()}
      />,
    );

    expect(screen.getByTestId("quick-action-manage")).toHaveAttribute("aria-expanded", "false");
  });

  it("supports arrow, Home, and End keyboard navigation", () => {
    render(
      <QuickActionsPopup
        actions={[]}
        distro={testDistribution}
        onAction={vi.fn()}
      />,
    );

    const menu = screen.getByTestId("quick-actions-menu");
    const firstItem = screen.getByTestId("quick-action-info");
    const secondItem = screen.getByTestId("quick-action-explorer");
    const manageItem = screen.getByTestId("quick-action-manage");

    firstItem.focus();
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(secondItem).toHaveFocus();

    fireEvent.keyDown(menu, { key: "End" });
    expect(manageItem).toHaveFocus();

    fireEvent.keyDown(menu, { key: "Home" });
    expect(firstItem).toHaveFocus();
  });
});
