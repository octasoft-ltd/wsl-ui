/**
 * Compact Distribution Dialog
 *
 * Dialog for compacting a distribution's virtual disk to reclaim unused space.
 */

import { useState, useEffect, useRef } from "react";
import { wslService, type VhdSizeInfo, type CompactResult } from "../services/wslService";
import { useDistroStore } from "../store/distroStore";
import { useNotificationStore } from "../store/notificationStore";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./ui/Modal";
import { Button } from "./ui/Button";
import { WarningIcon } from "./icons";
import type { Distribution } from "../types/distribution";

interface CompactDistroDialogProps {
  isOpen: boolean;
  distro: Distribution;
  onClose: () => void;
}

export function CompactDistroDialog({ isOpen, distro, onClose }: CompactDistroDialogProps) {
  const [isCompacting, setIsCompacting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vhdSize, setVhdSize] = useState<VhdSizeInfo | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { fetchDistros, setCompactingDistro } = useDistroStore();
  const { addNotification } = useNotificationStore();

  // Fetch current disk size when dialog opens
  useEffect(() => {
    if (isOpen) {
      setError(null);
      setElapsedSeconds(0);
      wslService.getDistributionVhdSize(distro.name)
        .then(setVhdSize)
        .catch(() => setVhdSize(null));
    }
  }, [isOpen, distro.name]);

  // Elapsed time counter
  useEffect(() => {
    if (isCompacting) {
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isCompacting]);

  const formatElapsedTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatSize = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1024) {
      return `${(gb / 1024).toFixed(2)} TB`;
    }
    return gb >= 1 ? `${gb.toFixed(2)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  const handleCompact = async () => {
    setError(null);
    setIsCompacting(true);
    setElapsedSeconds(0);
    setCompactingDistro(distro.name);

    try {
      const result: CompactResult = await wslService.compactDistribution(distro.name);

      // Build detailed message with fstrim and size info
      const parts: string[] = [];

      // fstrim info
      if (result.fstrimBytes !== null && result.fstrimBytes > 0) {
        parts.push(`Trimmed ${formatSize(result.fstrimBytes)}`);
      } else if (result.fstrimMessage?.includes("not available")) {
        parts.push("fstrim unavailable");
      }

      // Size change info
      if (result.sizeBefore > 0 && result.sizeAfter > 0) {
        const savedBytes = result.sizeBefore - result.sizeAfter;
        if (savedBytes > 0) {
          parts.push(`saved ${formatSize(savedBytes)} (${formatSize(result.sizeBefore)} → ${formatSize(result.sizeAfter)})`);
        } else {
          parts.push(`size: ${formatSize(result.sizeAfter)} (already optimized)`);
        }
      }

      const message = parts.length > 0
        ? `${distro.name}: ${parts.join(", ")}.`
        : `${distro.name} disk compacted successfully.`;

      // Show notification BEFORE refreshing distros (fetchDistros can be slow/fail)
      addNotification({
        type: "success",
        title: "Disk Compacted",
        message,
      });

      // Close dialog directly (bypassing handleClose which checks isCompacting)
      setError(null);
      setElapsedSeconds(0);
      onClose();

      // Refresh distro list in background (don't await - it's not critical)
      fetchDistros().catch(() => {
        // Silently ignore - user already got success notification
      });
    } catch (err) {
      const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : "Failed to compact distribution";
      setError(errorMessage);
    } finally {
      // Always reset compacting state (runs for both success and error)
      setIsCompacting(false);
      setCompactingDistro(null);
    }
  };

  const handleClose = () => {
    if (!isCompacting) {
      setError(null);
      setElapsedSeconds(0);
      onClose();
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} closeOnBackdrop={!isCompacting} data-testid="compact-dialog">
      <ModalHeader
        title={`Compact "${distro.name}" Disk`}
        subtitle="Reclaim unused disk space from the virtual disk"
        onClose={handleClose}
        showCloseButton={!isCompacting}
      />

      <ModalBody>
        {error && (
          <div data-testid="compact-error" className="mb-4 p-3 bg-[rgba(var(--status-error-rgb),0.2)] border border-[rgba(var(--status-error-rgb),0.4)] rounded-lg text-theme-status-error text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="p-3 bg-theme-bg-tertiary/50 border border-theme-border-secondary rounded-lg">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-theme-text-muted text-xs uppercase tracking-wider">Virtual Size (Max)</span>
                <p data-testid="compact-virtual-size" className="text-theme-text-primary font-medium">
                  {vhdSize !== null ? formatSize(vhdSize.virtualSize) : "Loading..."}
                </p>
              </div>
              <div>
                <span className="text-theme-text-muted text-xs uppercase tracking-wider">File Size (Current)</span>
                <p data-testid="compact-file-size" className="text-theme-text-secondary font-medium">
                  {vhdSize !== null ? formatSize(vhdSize.fileSize) : "Loading..."}
                </p>
              </div>
            </div>
          </div>

          <div className="p-3 bg-[rgba(var(--status-warning-rgb),0.15)] border border-[rgba(var(--status-warning-rgb),0.3)] rounded-lg flex items-start gap-3">
            <WarningIcon size="sm" className="text-theme-status-warning mt-0.5 shrink-0" />
            <div className="text-theme-status-warning/80 text-sm">
              <strong className="text-theme-status-warning">Important:</strong>
              <ul className="mt-1 ml-4 list-disc space-y-1">
                <li>This operation requires administrator privileges (UAC prompt)</li>
                <li>WSL will be shut down during this operation</li>
                <li>Do not close the app or shut down your computer</li>
              </ul>
            </div>
          </div>
        </div>

        {isCompacting && (
          <div data-testid="compact-progress" className="mt-4 p-4 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg">
            <div className="flex items-center gap-3 text-theme-text-primary">
              <svg className="w-5 h-5 animate-spin text-theme-accent-primary" fill="none" viewBox="0 0 24 24">
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
              <div className="flex-1">
                <span className="font-medium">Optimizing disk...</span>
                <span data-testid="compact-elapsed-time" className="text-theme-text-muted ml-2">
                  {formatElapsedTime(elapsedSeconds)} elapsed
                </span>
              </div>
            </div>
            <div className="mt-3 text-theme-text-muted text-sm space-y-1">
              <p>Running fstrim, shutting down WSL, then compacting VHDX.</p>
              <p>Please wait. This operation cannot be cancelled.</p>
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button data-testid="compact-cancel-button" variant="secondary" onClick={handleClose} disabled={isCompacting}>
          Cancel
        </Button>
        <Button
          data-testid="compact-confirm-button"
          variant="primary"
          onClick={handleCompact}
          disabled={isCompacting || vhdSize === null}
          loading={isCompacting}
        >
          Compact Disk
        </Button>
      </ModalFooter>
    </Modal>
  );
}
