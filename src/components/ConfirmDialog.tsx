import { useEffect, useCallback } from "react";
import { WarningIcon } from "./icons";
import { Portal } from "./ui/Portal";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
}

export function ConfirmDialog({
  isOpen,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  danger = false,
}: ConfirmDialogProps) {
  const handleCancel = useCallback(() => {
    onCancel();
  }, [onCancel]);

  // Handle Escape key to close dialog
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
        <div className="absolute inset-0 bg-theme-bg-primary/80 backdrop-blur-xs" onClick={handleCancel} />

        {/* Dialog */}
        <div
          role="dialog"
          data-testid="confirm-dialog"
          className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-md w-full mx-4 p-6"
        >
          <div className="flex items-start gap-4 mb-4">
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                danger ? "bg-[rgba(var(--status-error-rgb),0.2)] text-theme-status-error" : "bg-[rgba(var(--status-warning-rgb),0.2)] text-theme-status-warning"
              }`}
            >
              <WarningIcon size="md" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-theme-text-primary">{title}</h3>
              <p className="text-sm text-theme-text-secondary mt-1 whitespace-pre-line">{message}</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleCancel}
              data-testid="dialog-cancel-button"
              className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              data-testid="dialog-confirm-button"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                danger
                  ? "bg-theme-status-error hover:opacity-90 text-white"
                  : "bg-theme-status-warning hover:opacity-90 text-theme-bg-primary"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}

