import { useEffect, useCallback } from "react";
import { MonitorIcon, ExternalLinkIcon } from "./icons";
import { Portal } from "./ui/Portal";

interface NoRdpDetectedDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const BLOG_SERIES_URL = "https://wsl-ui.octasoft.co.uk/blog/series/wsl2-linux-desktop";

export function NoRdpDetectedDialog({
  isOpen,
  onClose,
}: NoRdpDetectedDialogProps) {
  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  // Handle Escape key to close dialog
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  if (!isOpen) return null;

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
          data-testid="no-rdp-detected-dialog"
          className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-md w-full mx-4 p-6"
        >
          <div className="flex items-start gap-4 mb-4">
            <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 bg-[rgba(var(--accent-primary-rgb),0.2)] text-theme-accent-primary">
              <MonitorIcon size="md" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-theme-text-primary">
                No Desktop Environment Detected
              </h3>
              <p className="text-sm text-theme-text-secondary mt-2">
                We couldn't detect xrdp running in this distro.
                <br /><br />
                To use Remote Desktop, you'll need to set up a desktop environment and xrdp server.
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <a
              href={BLOG_SERIES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-theme-accent-primary hover:underline"
            >
              Learn how to set up a Linux desktop
              <ExternalLinkIcon size="sm" />
            </a>
            <button
              onClick={handleClose}
              data-testid="dialog-close-button"
              className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
