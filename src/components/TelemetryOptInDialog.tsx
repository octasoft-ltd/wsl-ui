/**
 * Telemetry Opt-In Dialog
 *
 * Shown on first launch to ask the user if they want to share
 * anonymous usage data to help improve WSL UI.
 */

import { Portal } from "./ui/Portal";
import { ChartBarIcon, ShieldCheckIcon } from "./icons";

interface TelemetryOptInDialogProps {
  isOpen: boolean;
  onAccept: () => void;
  onDecline: () => void;
}

export function TelemetryOptInDialog({
  isOpen,
  onAccept,
  onDecline,
}: TelemetryOptInDialogProps) {
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
          data-testid="telemetry-opt-in-dialog"
          className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-lg w-full mx-4 p-6"
        >
          <div className="flex items-start gap-4 mb-5">
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-[rgba(var(--accent-primary-rgb),0.2)] text-theme-accent-primary">
              <ChartBarIcon size="lg" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-theme-text-primary">
                Help Improve WSL UI
              </h3>
              <p className="text-sm text-theme-text-secondary mt-1">
                Would you like to share anonymous usage data?
              </p>
            </div>
          </div>

          {/* What we collect */}
          <div className="mb-5 p-4 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg">
            <div className="flex items-center gap-2 mb-3">
              <ShieldCheckIcon size="sm" className="text-theme-status-success" />
              <span className="text-sm font-medium text-theme-text-primary">
                Privacy-Focused Analytics
              </span>
            </div>
            <ul className="text-sm text-theme-text-secondary space-y-1.5 ml-6">
              <li className="flex items-start gap-2">
                <span className="text-theme-accent-primary mt-0.5">•</span>
                <span>App version and Windows version</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-theme-accent-primary mt-0.5">•</span>
                <span>Number of distributions (not names)</span>
              </li>
            </ul>
            <div className="mt-3 pt-3 border-t border-theme-border-primary">
              <p className="text-xs text-theme-text-muted">
                No personal data, distro names, file paths, or identifying information is ever collected.
                Data is processed by{" "}
                <a
                  href="https://aptabase.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-theme-accent-primary hover:underline"
                >
                  Aptabase
                </a>
                , a privacy-first analytics provider.
              </p>
            </div>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onDecline}
              data-testid="telemetry-decline-button"
              className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors"
            >
              No Thanks
            </button>
            <button
              onClick={onAccept}
              data-testid="telemetry-accept-button"
              className="px-4 py-2 text-sm font-medium text-theme-bg-primary bg-theme-accent-primary hover:opacity-90 rounded-lg transition-colors"
            >
              Yes, Share Data
            </button>
          </div>

          <p className="text-xs text-theme-text-muted text-center mt-4">
            You can change this anytime in Settings → Privacy
          </p>
        </div>
      </div>
    </Portal>
  );
}
