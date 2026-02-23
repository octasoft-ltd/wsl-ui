/**
 * Set Default User Dialog
 *
 * Dialog for setting the default user for a distribution.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { wslService } from "../services/wslService";
import { useNotificationStore } from "../store/notificationStore";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./ui/Modal";
import { Button } from "./ui/Button";
import { UserIcon, InfoIcon } from "./icons";
import type { Distribution } from "../types/distribution";

interface SetDefaultUserDialogProps {
  isOpen: boolean;
  distro: Distribution;
  onClose: () => void;
}

export function SetDefaultUserDialog({ isOpen, distro, onClose }: SetDefaultUserDialogProps) {
  const { t } = useTranslation("dialogs");
  const [username, setUsername] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { addNotification } = useNotificationStore();

  const validateUsername = (name: string): string | null => {
    if (!name.trim()) {
      return t('setUser.errorEmpty');
    }
    if (!/^[a-z]/.test(name)) {
      return t('setUser.errorStartLowercase');
    }
    if (!/^[a-z][a-z0-9_-]*$/.test(name)) {
      return t('setUser.errorInvalidChars');
    }
    if (name.length > 32) {
      return t('setUser.errorTooLong');
    }
    return null;
  };

  const handleSave = async () => {
    const validationError = validateUsername(username);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setIsSaving(true);

    try {
      await wslService.setDefaultUser(distro.name, username.trim());
      addNotification({
        type: "success",
        title: t('setUser.successTitle'),
        message: t('setUser.successMessage', { distroName: distro.name, username: username.trim() }),
      });
      handleClose();
    } catch (err) {
      // Tauri returns string errors, not Error instances
      const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : t('setUser.errorFailed');
      setError(errorMessage);
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (!isSaving) {
      setUsername("");
      setError(null);
      onClose();
    }
  };

  const handleUsernameChange = (value: string) => {
    // Only allow valid characters as they type
    const sanitized = value.toLowerCase().replace(/[^a-z0-9_-]/g, "");
    setUsername(sanitized);
    setError(null);
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} closeOnBackdrop={!isSaving} size="sm">
      <ModalHeader
        title={t('setUser.title')}
        subtitle={t('setUser.subtitle', { name: distro.name })}
        onClose={handleClose}
        showCloseButton={!isSaving}
      />

      <ModalBody>
        {error && (
          <div className="mb-4 p-3 bg-[rgba(var(--status-error-rgb),0.2)] border border-[rgba(var(--status-error-rgb),0.4)] rounded-lg text-theme-status-error text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-theme-text-secondary mb-1">
              {t('setUser.usernameLabel')}
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <UserIcon size="sm" className="text-theme-text-muted" />
              </div>
              <input
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder={t('setUser.usernamePlaceholder')}
                disabled={isSaving}
                maxLength={32}
                className="w-full pl-10 pr-3 py-2 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-hidden focus:border-theme-accent-primary disabled:opacity-50"
              />
            </div>
            <p className="text-xs text-theme-text-muted mt-1">
              {t('setUser.usernameHint')}
            </p>
          </div>

          <div className="p-3 bg-[rgba(var(--accent-primary-rgb),0.15)] border border-[rgba(var(--accent-primary-rgb),0.3)] rounded-lg flex items-start gap-3">
            <InfoIcon size="sm" className="text-theme-accent-primary mt-0.5 shrink-0" />
            <div className="text-theme-accent-primary/80 text-sm">
              {t('setUser.infoNote')}
            </div>
          </div>
        </div>

        {isSaving && (
          <div className="mt-4 p-3 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg">
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
              <span>{t('setUser.progress')}</span>
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={handleClose} disabled={isSaving}>
          {t('common:button.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={handleSave}
          disabled={isSaving || !username.trim()}
          loading={isSaving}
        >
          {t('setUser.setUser')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
