import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Portal } from "./ui/Portal";
import { CloseIcon, LockIcon } from "./icons";

interface PasswordPromptDialogProps {
  isOpen: boolean;
  actionName: string;
  distroName: string;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}

export function PasswordPromptDialog({
  isOpen,
  actionName,
  distroName,
  onSubmit,
  onCancel,
}: PasswordPromptDialogProps) {
  const { t } = useTranslation("dialogs");
  const [password, setPassword] = useState("");

  const handleCancel = useCallback(() => {
    setPassword("");
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

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim()) {
      onSubmit(password);
      setPassword("");
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 bg-theme-bg-primary/90 backdrop-blur-sm flex items-center justify-center z-[100] p-4" data-testid="password-prompt-overlay">
        <div className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/70 max-w-md w-full overflow-hidden animate-fade-slide-in" data-testid="password-prompt-dialog">
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-theme-accent-primary/50 to-transparent" />

          <div className="flex items-center justify-between px-5 py-4 border-b border-theme-border-primary">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-theme-accent-primary/10 rounded-lg">
                <LockIcon size="md" className="text-theme-accent-primary" />
              </div>
              <h3 className="font-semibold text-theme-text-primary" data-testid="password-prompt-title">{t('password.title')}</h3>
            </div>
            <button
              onClick={handleCancel}
              className="p-1.5 text-theme-text-muted hover:text-theme-accent-primary hover:bg-theme-bg-tertiary rounded-lg transition-all"
              data-testid="password-prompt-close"
            >
              <CloseIcon size="md" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="p-5" data-testid="password-prompt-form">
            <p className="text-sm text-theme-text-secondary mb-4">
              {t('password.descriptionPrefix')} <span className="font-medium text-theme-text-primary" data-testid="password-prompt-action-name">"{actionName}"</span> {t('password.descriptionSuffix')} <span className="font-medium text-theme-text-primary" data-testid="password-prompt-distro-name">{distroName}</span>.
            </p>
            <p className="text-xs text-theme-text-muted mb-4">
              {t('password.instruction')}
            </p>

            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('password.placeholder')}
              autoFocus
              data-testid="password-prompt-input"
              className="w-full px-4 py-3 bg-theme-bg-primary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:border-theme-accent-primary transition-colors"
            />

            <p className="text-xs text-theme-text-muted mt-3" data-testid="password-prompt-security-note">
              {t('password.securityNote')}
            </p>

            <div className="flex justify-end gap-3 mt-6">
              <button
                type="button"
                onClick={handleCancel}
                data-testid="password-prompt-cancel"
                className="px-4 py-2 text-sm text-theme-text-secondary hover:text-theme-text-primary transition-colors"
              >
                {t('common:button.cancel')}
              </button>
              <button
                type="submit"
                disabled={!password.trim()}
                data-testid="password-prompt-submit"
                className="px-4 py-2 text-sm font-medium bg-theme-accent-primary hover:bg-theme-accent-primary-hover text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t('password.submit')}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Portal>
  );
}
