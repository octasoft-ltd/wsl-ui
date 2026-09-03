import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useStopBeforeAction } from "./useStopBeforeAction";
import { useDistroStore } from "../store/distroStore";
import { useNotificationStore } from "../store/notificationStore";
import type { Distribution } from "../types/distribution";

const makeDistro = (overrides: Partial<Distribution> = {}): Distribution =>
  ({
    id: "{guid}",
    name: "Ubuntu",
    state: "Running",
    isDefault: true,
    wslVersion: 2,
    ...overrides,
  }) as Distribution;

/**
 * Populate the pending action by running executeWithStopCheck against a
 * running distro (which opens the dialog), then invoke handleStopAndContinue.
 */
async function runStopAndContinue(
  pendingAction: () => void,
  options?: { requiresShutdown?: boolean }
) {
  const { result } = renderHook(() => useStopBeforeAction());

  act(() => {
    result.current.executeWithStopCheck(
      makeDistro(),
      "Resize",
      pendingAction,
      options
    );
  });

  await act(async () => {
    await result.current.handleStopAndContinue();
  });
}

describe("useStopBeforeAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationStore.setState({ notifications: [] });
    useDistroStore.setState({
      distributions: [makeDistro()],
      error: null,
    });
  });

  it("runs the pending action when stop succeeds and nothing is running", async () => {
    const pendingAction = vi.fn();
    useDistroStore.setState({
      stopDistro: vi.fn().mockResolvedValue(true),
      shutdownAll: vi.fn().mockResolvedValue(true),
      // Simulate the re-fetch observing the distro is now stopped.
      fetchDistros: vi.fn().mockImplementation(async () => {
        useDistroStore.setState({
          distributions: [makeDistro({ state: "Stopped" })],
        });
      }),
    });

    await runStopAndContinue(pendingAction);

    expect(pendingAction).toHaveBeenCalledTimes(1);
  });

  it("does NOT run the destructive action when stopDistro fails", async () => {
    const pendingAction = vi.fn();
    useDistroStore.setState({
      // Store swallows the error and reports failure via the boolean.
      stopDistro: vi.fn().mockResolvedValue(false),
      shutdownAll: vi.fn().mockResolvedValue(false),
      // Distro is still running because the stop failed.
      fetchDistros: vi.fn().mockResolvedValue(undefined),
    });

    await runStopAndContinue(pendingAction);

    expect(pendingAction).not.toHaveBeenCalled();
  });

  it("does NOT run the destructive action when shutdownAll fails (requiresShutdown)", async () => {
    const pendingAction = vi.fn();
    useDistroStore.setState({
      stopDistro: vi.fn().mockResolvedValue(false),
      shutdownAll: vi.fn().mockResolvedValue(false),
      fetchDistros: vi.fn().mockResolvedValue(undefined),
    });

    await runStopAndContinue(pendingAction, { requiresShutdown: true });

    expect(pendingAction).not.toHaveBeenCalled();
  });

  it("aborts and notifies when the stop reports success but WSL is still running", async () => {
    const pendingAction = vi.fn();
    useDistroStore.setState({
      stopDistro: vi.fn().mockResolvedValue(true),
      shutdownAll: vi.fn().mockResolvedValue(true),
      // Re-fetch still shows a running distro: VHDX is still locked.
      fetchDistros: vi.fn().mockImplementation(async () => {
        useDistroStore.setState({
          distributions: [makeDistro({ state: "Running" })],
        });
      }),
    });

    await runStopAndContinue(pendingAction, { requiresShutdown: true });

    expect(pendingAction).not.toHaveBeenCalled();
    expect(useNotificationStore.getState().notifications).toHaveLength(1);
    expect(useNotificationStore.getState().notifications[0].type).toBe("error");
  });
});
