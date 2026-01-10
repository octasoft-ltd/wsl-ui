/**
 * Close Action Dialog
 *
 * A dialog shown when the user tries to close the application and their
 * preference is set to "ask". Allows choosing between minimizing to tray
 * or quitting the application, with an option to remember the choice.
 */

import { useState, useEffect, useCallback } from "react";
import { Portal } from "./ui/Portal";
import { CloseIcon, MinimizeIcon } from "./icons";

interface CloseActionDialogProps {
  isOpen: boolean;
  onMinimize: () => void;
  onQuit: () => void;
  onRememberChoice: (action: "minimize" | "quit") => void;
}

export function CloseActionDialog({
  isOpen,
  onMinimize,
  onQuit,
  onRememberChoice,
}: CloseActionDialogProps) {
  const [rememberChoice, setRememberChoice] = useState(false);

  // Reset state when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setRememberChoice(false);
    }
  }, [isOpen]);

  const handleMinimize = useCallback(() => {
    if (rememberChoice) {
      onRememberChoice("minimize");
    }
    onMinimize();
  }, [rememberChoice, onMinimize, onRememberChoice]);

  const handleQuit = useCallback(() => {
    if (rememberChoice) {
      onRememberChoice("quit");
    }
    onQuit();
  }, [rememberChoice, onQuit, onRememberChoice]);

  const handleCancel = useCallback(() => {
    onMinimize();
  }, [onMinimize]);

  // Handle Escape key to close dialog (same as minimize)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleCancel]);

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
          data-testid="close-action-dialog"
          className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-md w-full mx-4 p-6"
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-[rgba(var(--accent-primary-rgb),0.2)] text-theme-accent-primary">
              <CloseIcon size="md" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-theme-text-primary">
                Close Application?
              </h3>
              <p className="text-sm text-theme-text-secondary mt-1">
                Would you like to minimize to the system tray or quit completely?
              </p>
            </div>
          </div>

          {/* Remember choice checkbox - above buttons */}
          <div className="mb-4 p-3 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberChoice}
                onChange={(e) => setRememberChoice(e.target.checked)}
                className="w-4 h-4 rounded border-theme-border-secondary bg-theme-bg-tertiary text-theme-accent-primary focus:ring-theme-accent-primary focus:ring-offset-0"
              />
              <span className="text-sm text-theme-text-secondary">
                Remember my choice
              </span>
            </label>
            {rememberChoice && (
              <p className="text-xs text-theme-text-muted mt-2 ml-7">
                You can change this later in Settings
              </p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleMinimize}
              data-testid="close-dialog-minimize-button"
              className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors flex items-center gap-2"
            >
              <MinimizeIcon size="sm" />
              Minimize to Tray
            </button>
            <button
              onClick={handleQuit}
              data-testid="close-dialog-quit-button"
              className="px-4 py-2 text-sm font-medium text-white bg-theme-status-error hover:opacity-90 rounded-lg transition-colors flex items-center gap-2"
            >
              <CloseIcon size="sm" />
              Quit
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
