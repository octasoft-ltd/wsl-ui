/**
 * Hook for handling actions that require stopping a running distribution first.
 *
 * Provides a consistent UX pattern:
 * 1. If distro is stopped: proceed with action immediately
 * 2. If distro is running: show confirmation dialog, stop, then proceed
 *
 * Some actions (like resize disk) require a full WSL shutdown rather than
 * just stopping the specific distribution. Use requiresShutdown option for these.
 */

import { useState, useCallback } from "react";
import type { Distribution } from "../types/distribution";
import { useDistroStore } from "../store/distroStore";

interface StopBeforeActionState {
  /** Whether the stop dialog is currently shown */
  showStopDialog: boolean;
  /** Name of the action being performed (for dialog message) */
  actionName: string;
  /** Distribution being acted upon */
  distro: Distribution | null;
  /** The action to perform after stopping */
  pendingAction: (() => void) | null;
  /** Whether this action requires full WSL shutdown (vs just stopping the distro) */
  requiresShutdown: boolean;
}

interface ExecuteOptions {
  /** If true, requires full WSL shutdown instead of just stopping the distro */
  requiresShutdown?: boolean;
}

interface UseStopBeforeActionReturn {
  /** Current state of the stop-before-action flow */
  state: StopBeforeActionState;
  /** Trigger an action that may require stopping first */
  executeWithStopCheck: (
    distro: Distribution,
    actionName: string,
    action: () => void,
    options?: ExecuteOptions
  ) => void;
  /** Handle the "Stop & Continue" or "Shutdown & Continue" button click */
  handleStopAndContinue: () => Promise<void>;
  /** Handle canceling the stop dialog */
  handleCancel: () => void;
}

const initialState: StopBeforeActionState = {
  showStopDialog: false,
  actionName: "",
  distro: null,
  pendingAction: null,
  requiresShutdown: false,
};

/**
 * Hook for managing actions that require a stopped distribution.
 *
 * @example
 * ```tsx
 * const { state, executeWithStopCheck, handleStopAndContinue, handleCancel } = useStopBeforeAction();
 *
 * // When user clicks Export
 * const handleExport = () => {
 *   executeWithStopCheck(distro, "Export", () => {
 *     exportDistro(distro.name);
 *   });
 * };
 *
 * // Render the dialog
 * <StopAndActionDialog
 *   isOpen={state.showStopDialog}
 *   distroName={state.distro?.name ?? ""}
 *   actionName={state.actionName}
 *   onStopAndContinue={handleStopAndContinue}
 *   onCancel={handleCancel}
 * />
 * ```
 */
export function useStopBeforeAction(): UseStopBeforeActionReturn {
  const [state, setState] = useState<StopBeforeActionState>(initialState);
  const { distributions, stopDistro, shutdownAll, fetchDistros } = useDistroStore();

  /**
   * Execute an action, checking if stop is required first.
   * If the distro is running, shows the stop dialog.
   * If the distro is stopped, executes the action immediately.
   *
   * @param options.requiresShutdown - If true, will shutdown all WSL instead of just stopping the distro.
   *        When requiresShutdown is true, checks if ANY distro is running (not just the target),
   *        because VHDX operations require the WSL VM to be fully stopped.
   */
  const executeWithStopCheck = useCallback(
    (distro: Distribution, actionName: string, action: () => void, options?: ExecuteOptions) => {
      const requiresShutdown = options?.requiresShutdown ?? false;

      // For shutdown-requiring actions, check if ANY distro is running
      // (VHDX is locked while any WSL distro is active)
      const anyRunning = requiresShutdown
        ? distributions.some(d => d.state === "Running")
        : distro.state === "Running";

      if (anyRunning) {
        // Show stop dialog
        setState({
          showStopDialog: true,
          actionName,
          distro,
          pendingAction: action,
          requiresShutdown,
        });
      } else {
        // Execute immediately
        action();
      }
    },
    [distributions]
  );

  /**
   * Handle the "Stop & Continue" or "Shutdown & Continue" button click.
   * Either stops the distribution or shuts down all WSL, then executes the pending action.
   */
  const handleStopAndContinue = useCallback(async () => {
    const { distro, pendingAction, requiresShutdown } = state;

    if (!distro || !pendingAction) {
      setState(initialState);
      return;
    }

    // Either shutdown all WSL or just stop the specific distribution
    if (requiresShutdown) {
      await shutdownAll();
    } else {
      await stopDistro(distro.name);
    }

    // Wait for state to update
    await fetchDistros();

    // Close dialog and execute the pending action
    setState(initialState);
    pendingAction();
  }, [state, stopDistro, shutdownAll, fetchDistros]);

  /**
   * Handle canceling the stop dialog.
   */
  const handleCancel = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    state,
    executeWithStopCheck,
    handleStopAndContinue,
    handleCancel,
  };
}
