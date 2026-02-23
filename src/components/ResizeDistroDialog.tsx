/**
 * Resize Distribution Dialog
 *
 * Dialog for resizing a distribution's virtual disk.
 */

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { wslService, type VhdSizeInfo } from "../services/wslService";
import { useDistroStore } from "../store/distroStore";
import { useNotificationStore } from "../store/notificationStore";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./ui/Modal";
import { Button } from "./ui/Button";
import { WarningIcon } from "./icons";
import type { Distribution } from "../types/distribution";

// Note: WarningIcon is still used for the informational warning about increasing size

interface ResizeDistroDialogProps {
  isOpen: boolean;
  distro: Distribution;
  onClose: () => void;
}

type SizeUnit = "GB" | "TB";

export function ResizeDistroDialog({ isOpen, distro, onClose }: ResizeDistroDialogProps) {
  const { t } = useTranslation("dialogs");
  const [sizeValue, setSizeValue] = useState<string>("256");
  const [sizeUnit, setSizeUnit] = useState<SizeUnit>("GB");
  const [isResizing, setIsResizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vhdSize, setVhdSize] = useState<VhdSizeInfo | null>(null);
  const { fetchDistros } = useDistroStore();
  const { addNotification } = useNotificationStore();

  // Fetch current disk size when dialog opens
  useEffect(() => {
    if (isOpen) {
      wslService.getDistributionVhdSize(distro.name).then((info) => {
        setVhdSize(info);
        // Default new size: add 10% or minimum 50GB, whichever is larger
        const currentGb = info.virtualSize / (1024 * 1024 * 1024);
        const increment = Math.max(50, Math.ceil(currentGb * 0.1));
        const newGb = Math.ceil(currentGb) + increment;

        if (newGb >= 1000) {
          // Show in TB with one decimal, rounded up
          setSizeValue(Math.ceil(newGb / 100) / 10 + ""); // e.g., 1.2 for 1150GB
          setSizeUnit("TB");
        } else {
          setSizeValue(newGb.toString());
          setSizeUnit("GB");
        }
      }).catch(() => setVhdSize(null));
    }
  }, [isOpen, distro.name]);

  const getSizeInBytes = (): number => {
    const value = parseFloat(sizeValue);
    if (isNaN(value) || value <= 0) return 0;

    if (sizeUnit === "TB") {
      return Math.floor(value * 1024 * 1024 * 1024 * 1024);
    }
    return Math.floor(value * 1024 * 1024 * 1024);
  };

  const getSizeString = (): string => {
    const value = parseFloat(sizeValue);
    if (isNaN(value) || value <= 0) return "";
    // Always use GB for the WSL command to avoid precision loss with TB decimals
    let gb: number;
    if (sizeUnit === "TB") {
      gb = Math.ceil(value * 1024); // Convert TB to GB, round up
    } else {
      gb = Math.ceil(value);
    }
    return `${gb}GB`;
  };

  const handleResize = async () => {
    const sizeBytes = getSizeInBytes();
    const sizeString = getSizeString();

    if (sizeBytes < 1_000_000_000) {
      setError(t('resize.errorMinSize'));
      return;
    }

    if (vhdSize && sizeBytes <= vhdSize.virtualSize) {
      setError(t('resize.errorTooSmall', { size: formatSize(vhdSize.virtualSize) }));
      return;
    }

    setError(null);
    setIsResizing(true);

    try {
      await wslService.resizeDistribution(distro.name, sizeString);
      await fetchDistros();
      addNotification({
        type: "success",
        title: t('resize.successTitle'),
        message: t('resize.successMessage', { name: distro.name, size: sizeString }),
      });
      handleClose();
    } catch (err) {
      // Tauri returns string errors, not Error instances
      const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : t('resize.errorFailed');
      setError(errorMessage);
    } finally {
      setIsResizing(false);
    }
  };

  const handleClose = () => {
    if (!isResizing) {
      setError(null);
      setSizeValue("256");
      setSizeUnit("GB");
      onClose();
    }
  };

  const formatSize = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1024) {
      return `${(gb / 1024).toFixed(2)} TB`;
    }
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  const sizeBytes = getSizeInBytes();
  const isValidSize = sizeBytes >= 1_000_000_000 && (!vhdSize || sizeBytes > vhdSize.virtualSize);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} closeOnBackdrop={!isResizing}>
      <ModalHeader
        title={t('resize.title', { name: distro.name })}
        subtitle={t('resize.subtitle')}
        onClose={handleClose}
        showCloseButton={!isResizing}
      />

      <ModalBody>
        {error && (
          <div className="mb-4 p-3 bg-[rgba(var(--status-error-rgb),0.2)] border border-[rgba(var(--status-error-rgb),0.4)] rounded-lg text-theme-status-error text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="p-3 bg-theme-bg-tertiary/50 border border-theme-border-secondary rounded-lg space-y-3">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <span className="text-theme-text-muted text-xs uppercase tracking-wider">{t('resize.virtualSize')}</span>
                <p className="text-theme-text-primary font-medium">
                  {vhdSize !== null ? formatSize(vhdSize.virtualSize) : t('common:label.loading')}
                </p>
              </div>
              <div>
                <span className="text-theme-text-muted text-xs uppercase tracking-wider">{t('resize.fileSize')}</span>
                <p className="text-theme-text-secondary font-medium">
                  {vhdSize !== null ? formatSize(vhdSize.fileSize) : t('common:label.loading')}
                </p>
              </div>
            </div>
            <div className="pt-2 border-t border-theme-border-secondary/50">
              <span className="text-theme-text-muted text-xs uppercase tracking-wider">{t('resize.newVirtualSize')}</span>
              <p className="text-theme-accent-primary font-medium">
                {isValidSize ? formatSize(sizeBytes) : t('resize.invalid')}
              </p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-theme-text-secondary mb-1">
              {t('resize.newSize')}
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={sizeValue}
                onChange={(e) => {
                  setSizeValue(e.target.value);
                  setError(null);
                }}
                min="1"
                step="1"
                disabled={isResizing}
                className="flex-1 px-3 py-2 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-hidden focus:border-theme-accent-primary disabled:opacity-50"
              />
              <select
                value={sizeUnit}
                onChange={(e) => setSizeUnit(e.target.value as SizeUnit)}
                disabled={isResizing}
                className="px-3 py-2 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg text-theme-text-primary focus:outline-hidden focus:border-theme-accent-primary disabled:opacity-50"
              >
                <option value="GB">GB</option>
                <option value="TB">TB</option>
              </select>
            </div>
          </div>

          <div className="p-3 bg-[rgba(var(--status-warning-rgb),0.15)] border border-[rgba(var(--status-warning-rgb),0.3)] rounded-lg flex items-start gap-3">
            <WarningIcon size="sm" className="text-theme-status-warning mt-0.5 shrink-0" />
            <div className="text-theme-status-warning/80 text-sm">
              <strong className="text-theme-status-warning">{t('resize.note')}</strong> {t('resize.noteDescription')}
            </div>
          </div>
        </div>

        {isResizing && (
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
              <span>{t('resize.progress')}</span>
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={handleClose} disabled={isResizing}>
          {t('common:button.cancel')}
        </Button>
        <Button
          variant="primary"
          onClick={handleResize}
          disabled={isResizing || !isValidSize}
          loading={isResizing}
        >
          {t('resize.resize')}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
