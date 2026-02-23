/**
 * Review Prompt Dialog
 *
 * Shown after successful distro installation to encourage users
 * to leave a review on Microsoft Store.
 */

import { useTranslation } from "react-i18next";
import { Portal } from "./ui/Portal";

/** App logo SVG component */
function AppLogo() {
  return (
    <svg width="48" height="48" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg">
      <defs>
        <linearGradient id="reviewLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#f59e0b"/>
          <stop offset="100%" stopColor="#d97706"/>
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="512" height="512" rx="76" fill="url(#reviewLogoGrad)"/>
      <path d="M128 179 L256 256 L128 333" stroke="#1a1a1a" strokeWidth="32" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="288" y="307" width="140" height="26" rx="13" fill="#1a1a1a"/>
    </svg>
  );
}

interface ReviewPromptDialogProps {
  isOpen: boolean;
  onReview: () => void;
  onMaybeLater: () => void;
  onNoThanks: () => void;
}

export function ReviewPromptDialog({
  isOpen,
  onReview,
  onMaybeLater,
  onNoThanks,
}: ReviewPromptDialogProps) {
  const { t } = useTranslation("dialogs");

  if (!isOpen) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-theme-bg-primary/80 backdrop-blur-xs" />

        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          data-testid="review-prompt-dialog"
          className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-md w-full mx-4 p-6"
        >
          <div className="flex items-start gap-4 mb-5">
            <div className="shrink-0">
              <AppLogo />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-theme-text-primary">
                {t('review.title')}
              </h3>
              <p className="text-sm text-theme-text-secondary mt-1">
                {t('review.description')}
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onNoThanks}
              data-testid="review-no-thanks-button"
              className="px-3 py-2 text-sm text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              {t('review.noThanks')}
            </button>
            <button
              onClick={onMaybeLater}
              data-testid="review-maybe-later-button"
              className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors"
            >
              {t('review.maybeLater')}
            </button>
            <button
              onClick={onReview}
              data-testid="review-leave-review-button"
              className="px-4 py-2 text-sm font-medium text-theme-bg-primary bg-theme-accent-primary hover:opacity-90 rounded-lg transition-colors"
            >
              {t('review.leaveReview')}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
