/**
 * Stop And Action Dialog
 *
 * A confirmation dialog shown when an action requires stopping a running distribution.
 * Provides a seamless "Stop & Continue" experience instead of requiring manual stop.
 *
 * For actions that require full WSL shutdown (like resize disk), set requiresShutdown=true
 * to show a more prominent warning with red styling.
 */

import { useState, useEffect, useCallback } from "react";
import { Portal } from "./ui/Portal";
import { PauseIcon, WarningIcon, PowerIcon } from "./icons";

interface StopAndActionDialogProps {
  isOpen: boolean;
  distroName: string;
  actionName: string;
  /** If true, shows shutdown variant with red styling and different messaging */
  requiresShutdown?: boolean;
  onStopAndContinue: () => Promise<void>;
  onCancel: () => void;
}

export function StopAndActionDialog({
  isOpen,
  distroName,
  actionName,
  requiresShutdown = false,
  onStopAndContinue,
  onCancel,
}: StopAndActionDialogProps) {
  const [isStopping, setIsStopping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setIsStopping(false);
      setError(null);
    }
  }, [isOpen]);

  const handleStopAndContinue = async () => {
    setIsStopping(true);
    setError(null);

    try {
      await onStopAndContinue();
    } catch (err) {
      const errorMessage =
        typeof err === "string"
          ? err
          : err instanceof Error
          ? err.message
          : "Failed to stop distribution";
      setError(errorMessage);
      setIsStopping(false);
    }
  };

  const handleCancel = useCallback(() => {
    if (!isStopping) {
      onCancel();
    }
  }, [isStopping, onCancel]);

  // Handle Escape key to close dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isStopping) {
        handleCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isStopping, handleCancel]);

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-theme-bg-primary/80 backdrop-blur-xs"
          onClick={handleCancel}
        />

        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          data-testid="stop-and-action-dialog"
          className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-md w-full mx-4 p-6"
        >
          <div className="flex items-start gap-4 mb-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
              requiresShutdown
                ? "bg-[rgba(var(--status-error-rgb),0.2)] text-theme-status-error"
                : "bg-[rgba(var(--status-warning-rgb),0.2)] text-theme-status-warning"
            }`}>
              {requiresShutdown ? <PowerIcon size="md" /> : <PauseIcon size="md" />}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-theme-text-primary">
                {requiresShutdown ? "Shutdown WSL?" : "Stop Distribution?"}
              </h3>
              <p className="text-sm text-theme-text-secondary mt-1">
                <span className="font-medium text-theme-text-primary">{actionName}</span>{" "}
                requires{" "}
                {requiresShutdown ? (
                  <>
                    <span className="font-medium text-theme-status-error">all WSL distributions</span>{" "}
                    to be shut down to release the virtual disk.
                  </>
                ) : (
                  <>
                    <span className="font-medium text-theme-status-warning">{distroName}</span>{" "}
                    to be stopped.
                  </>
                )}
              </p>
            </div>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-[rgba(var(--status-error-rgb),0.2)] border border-[rgba(var(--status-error-rgb),0.4)] rounded-lg flex items-start gap-2">
              <WarningIcon size="sm" className="text-theme-status-error mt-0.5 shrink-0" />
              <span className="text-theme-status-error text-sm">{error}</span>
            </div>
          )}

          {isStopping && (
            <div
              data-testid="stop-dialog-loading"
              className="mb-4 p-3 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg"
            >
              <div className="flex items-center gap-3 text-theme-text-secondary text-sm">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span>{requiresShutdown ? "Shutting down WSL..." : `Stopping ${distroName}...`}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleCancel}
              disabled={isStopping}
              data-testid="stop-dialog-cancel-button"
              className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleStopAndContinue}
              disabled={isStopping}
              data-testid="stop-and-continue-button"
              className={`px-4 py-2 text-sm font-medium hover:opacity-90 text-theme-bg-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                requiresShutdown ? "bg-theme-status-error" : "bg-theme-status-warning"
              }`}
            >
              {isStopping ? (
                <>
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  {requiresShutdown ? "Shutting down..." : "Stopping..."}
                </>
              ) : (
                <>
                  {requiresShutdown ? <PowerIcon size="sm" /> : <PauseIcon size="sm" />}
                  {requiresShutdown ? "Shutdown & Continue" : "Stop & Continue"}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
