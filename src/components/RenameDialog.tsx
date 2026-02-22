import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { wslService } from "../services/wslService";
import { useDistroStore } from "../store/distroStore";
import { useNotificationStore } from "../store/notificationStore";
import { Portal } from "./ui/Portal";
import { Checkbox, Input } from "./ui/Input";

interface RenameDialogProps {
  isOpen: boolean;
  distroId: string;
  currentName: string;
  onClose: () => void;
}

// Simple pencil/edit icon for the button
function EditIcon({ className = "w-4 h-4" }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
      />
    </svg>
  );
}

export function RenameDialog({
  isOpen,
  distroId,
  currentName,
  onClose,
}: RenameDialogProps) {
  const { t } = useTranslation("dialogs");
  const [newName, setNewName] = useState(currentName);
  const [updateTerminalProfile, setUpdateTerminalProfile] = useState(true);
  const [updateShortcut, setUpdateShortcut] = useState(true);
  const [isRenaming, setIsRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { distributions, fetchDistros } = useDistroStore();
  const { addNotification } = useNotificationStore();

  // Reset state when dialog opens with new distro
  useEffect(() => {
    if (isOpen) {
      setNewName(currentName);
      setUpdateTerminalProfile(true);
      setUpdateShortcut(true);
      setError(null);
    }
  }, [isOpen, currentName]);

  // Real-time validation as user types
  const validationError = (() => {
    const trimmedName = newName.trim();

    if (!trimmedName || trimmedName === currentName) {
      return null; // No error for empty or unchanged
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(trimmedName)) {
      return t('common:validation.invalidChars') as string;
    }

    const isDuplicate = distributions.some(
      (d) =>
        d.name.toLowerCase() === trimmedName.toLowerCase() &&
        d.id !== distroId
    );
    if (isDuplicate) {
      return t('common:validation.duplicateName', { name: trimmedName }) as string;
    }

    return null;
  })();

  if (!isOpen) return null;

  const handleRename = async () => {
    const trimmedName = newName.trim();

    if (!trimmedName) {
      setError(t('rename.errorEmpty'));
      return;
    }

    if (trimmedName === currentName) {
      setError(t('rename.errorSameAsCurrent'));
      return;
    }

    // Basic validation (WSL name restrictions)
    if (!/^[a-zA-Z0-9._-]+$/.test(trimmedName)) {
      setError(t('common:validation.invalidChars'));
      return;
    }

    // Check for duplicate name (case-insensitive, excluding current distro)
    const isDuplicate = distributions.some(
      (d) =>
        d.name.toLowerCase() === trimmedName.toLowerCase() &&
        d.id !== distroId
    );
    if (isDuplicate) {
      setError(t('common:validation.duplicateName', { name: trimmedName }));
      return;
    }

    setError(null);
    setIsRenaming(true);

    try {
      await wslService.renameDistribution(
        distroId,
        trimmedName,
        updateTerminalProfile,
        updateShortcut
      );
      await fetchDistros();
      addNotification({
        type: "success",
        title: t('rename.successTitle'),
        message: t('rename.successMessage', { oldName: currentName, newName: trimmedName }),
      });
      handleClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : String(err)
      );
    } finally {
      setIsRenaming(false);
    }
  };

  const handleClose = () => {
    setNewName(currentName);
    setError(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isRenaming && newName.trim()) {
      handleRename();
    } else if (e.key === "Escape") {
      handleClose();
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-theme-bg-primary/80 backdrop-blur-xs"
          onClick={handleClose}
        />

        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          data-testid="rename-dialog"
          className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-md w-full mx-4 p-6"
        >
          <h2 className="text-xl font-semibold text-theme-text-primary mb-2">
            {t('rename.title')}
          </h2>
          <p className="text-sm text-theme-text-secondary mb-4">
            {t('rename.subtitle')}{" "}
            <span className="text-theme-status-warning font-medium">
              {currentName}
            </span>
          </p>

          {error && (
            <div
              data-testid="rename-error"
              className="mb-4 p-3 bg-[rgba(var(--status-error-rgb),0.2)] border border-[rgba(var(--status-error-rgb),0.4)] rounded-lg text-theme-status-error text-sm"
            >
              {error}
            </div>
          )}

          <div className="mb-4">
            <Input
              label={t('rename.nameLabel')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('rename.namePlaceholder')}
              disabled={isRenaming}
              autoFocus
              data-testid="rename-name-input"
              error={validationError || undefined}
              showErrorIcon
              errorTestId="rename-validation-error"
              reserveErrorSpace
            />
          </div>

          {/* Options */}
          <div className="mb-6 space-y-3">
            <label className="block text-sm font-medium text-theme-text-secondary mb-2">
              {t('rename.optionsLabel')}
            </label>

            <div data-testid="rename-terminal-option">
              <Checkbox
                checked={updateTerminalProfile}
                onChange={(e) => setUpdateTerminalProfile(e.target.checked)}
                disabled={isRenaming}
                data-testid="rename-update-terminal"
                label={t('rename.updateTerminal')}
                description={t('rename.updateTerminalDesc')}
              />
            </div>

            <div data-testid="rename-shortcut-option">
              <Checkbox
                checked={updateShortcut}
                onChange={(e) => setUpdateShortcut(e.target.checked)}
                disabled={isRenaming}
                data-testid="rename-update-shortcut"
                label={t('rename.renameShortcut')}
                description={t('rename.renameShortcutDesc')}
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleClose}
              disabled={isRenaming}
              data-testid="rename-cancel-button"
              className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors disabled:opacity-50"
            >
              {t('common:button.cancel')}
            </button>
            <button
              onClick={handleRename}
              disabled={isRenaming || !newName.trim() || newName.trim() === currentName || !!validationError}
              data-testid="rename-confirm-button"
              className="px-4 py-2 text-sm font-medium bg-theme-accent-primary hover:opacity-90 text-theme-bg-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isRenaming ? (
                t('rename.renaming')
              ) : (
                <>
                  <EditIcon />
                  {t('rename.rename')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
