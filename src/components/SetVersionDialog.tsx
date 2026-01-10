/**
 * Set WSL Version Dialog
 *
 * Dialog for changing a distribution's WSL version (1 or 2).
 * Shows current version, target version options, and warnings about conversion time.
 */

import { useState } from "react";
import { wslService } from "../services/wslService";
import { useDistroStore } from "../store/distroStore";
import { useNotificationStore } from "../store/notificationStore";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./ui/Modal";
import { Button } from "./ui/Button";
import { WarningIcon } from "./icons";
import type { Distribution } from "../types/distribution";

interface SetVersionDialogProps {
  isOpen: boolean;
  distro: Distribution;
  onClose: () => void;
}

export function SetVersionDialog({ isOpen, distro, onClose }: SetVersionDialogProps) {
  const [selectedVersion, setSelectedVersion] = useState<1 | 2>(
    distro.version === 1 ? 2 : 1
  );
  const [isConverting, setIsConverting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fetchDistros } = useDistroStore();
  const { addNotification } = useNotificationStore();

  const currentVersion = distro.version as 1 | 2;
  const targetVersion = selectedVersion;

  const handleConvert = async () => {
    if (targetVersion === currentVersion) {
      return;
    }

    setError(null);
    setIsConverting(true);

    try {
      await wslService.setDistroVersion(distro.name, targetVersion);
      await fetchDistros();
      addNotification({
        type: "success",
        title: "WSL Version Changed",
        message: `${distro.name} converted to WSL ${targetVersion}`,
      });
      handleClose();
    } catch (err) {
      const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : "Failed to convert distribution";
      setError(errorMessage);
    } finally {
      setIsConverting(false);
    }
  };

  const handleClose = () => {
    if (!isConverting) {
      setError(null);
      setSelectedVersion(distro.version === 1 ? 2 : 1);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} closeOnBackdrop={!isConverting} size="sm">
      <ModalHeader
        title="Set WSL Version"
        subtitle={`For "${distro.name}"`}
        onClose={handleClose}
        showCloseButton={!isConverting}
      />

      <ModalBody>
        {error && (
          <div className="mb-4 p-3 bg-[rgba(var(--status-error-rgb),0.2)] border border-[rgba(var(--status-error-rgb),0.4)] rounded-lg text-theme-status-error text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Version Options */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-theme-text-secondary mb-2">
              Select Version
            </label>

            {/* WSL 1 Option */}
            <button
              onClick={() => setSelectedVersion(1)}
              disabled={isConverting || currentVersion === 1}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                selectedVersion === 1
                  ? "border-theme-accent-primary bg-[rgba(var(--accent-primary-rgb),0.1)]"
                  : currentVersion === 1
                  ? "border-theme-border-secondary bg-theme-bg-tertiary opacity-60 cursor-not-allowed"
                  : "border-theme-border-secondary hover:border-theme-border-primary bg-theme-bg-tertiary"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-theme-text-primary">WSL 1</div>
                  <div className="text-sm text-theme-text-muted">
                    Lightweight, uses Windows filesystem layer
                  </div>
                </div>
                {currentVersion === 1 && (
                  <span className="text-xs px-2 py-1 rounded bg-theme-accent-primary text-theme-bg-primary font-medium">
                    Current
                  </span>
                )}
              </div>
            </button>

            {/* WSL 2 Option */}
            <button
              onClick={() => setSelectedVersion(2)}
              disabled={isConverting || currentVersion === 2}
              className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                selectedVersion === 2
                  ? "border-theme-accent-primary bg-[rgba(var(--accent-primary-rgb),0.1)]"
                  : currentVersion === 2
                  ? "border-theme-border-secondary bg-theme-bg-tertiary opacity-60 cursor-not-allowed"
                  : "border-theme-border-secondary hover:border-theme-border-primary bg-theme-bg-tertiary"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-theme-text-primary">WSL 2</div>
                  <div className="text-sm text-theme-text-muted">
                    Full Linux kernel, better performance
                  </div>
                </div>
                {currentVersion === 2 && (
                  <span className="text-xs px-2 py-1 rounded bg-theme-accent-primary text-theme-bg-primary font-medium">
                    Current
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Conversion Warning */}
          <div className="p-3 bg-[rgba(var(--status-warning-rgb),0.15)] border border-[rgba(var(--status-warning-rgb),0.3)] rounded-lg flex items-start gap-3">
            <WarningIcon size="sm" className="text-theme-status-warning mt-0.5 shrink-0" />
            <div className="text-theme-status-warning/80 text-sm space-y-1">
              <p className="font-medium">This operation may take several minutes.</p>
              <p>
                {currentVersion === 1 && targetVersion === 2
                  ? "Converting to WSL 2 will create a virtual disk (VHDX) from the filesystem."
                  : "Converting to WSL 1 will extract the filesystem from the virtual disk."}
              </p>
            </div>
          </div>
        </div>

        {isConverting && (
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
              <span>Converting to WSL {targetVersion}... This may take a few minutes.</span>
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={handleClose} disabled={isConverting}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleConvert}
          disabled={isConverting || targetVersion === currentVersion}
          loading={isConverting}
        >
          Convert to WSL {targetVersion}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
