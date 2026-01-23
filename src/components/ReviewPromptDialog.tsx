/**
 * Review Prompt Dialog
 *
 * Shown after successful distro installation to encourage users
 * to leave a review on Microsoft Store.
 */

import { Portal } from "./ui/Portal";
import { StarIcon } from "./icons";

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
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-[rgba(var(--accent-primary-rgb),0.2)] text-theme-accent-primary">
              <StarIcon size="lg" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-theme-text-primary">
                Finding WSL UI useful?
              </h3>
              <p className="text-sm text-theme-text-secondary mt-1">
                A quick review helps others discover this tool and keeps the project going. It only takes 30 seconds.
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
              No Thanks
            </button>
            <button
              onClick={onMaybeLater}
              data-testid="review-maybe-later-button"
              className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors"
            >
              Maybe Later
            </button>
            <button
              onClick={onReview}
              data-testid="review-leave-review-button"
              className="px-4 py-2 text-sm font-medium text-theme-bg-primary bg-theme-accent-primary hover:opacity-90 rounded-lg transition-colors"
            >
              Leave a Review
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
