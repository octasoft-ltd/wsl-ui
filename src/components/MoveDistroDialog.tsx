/**
 * Move Distribution Dialog
 *
 * Dialog for moving a distribution to a new location.
 */

import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { wslService } from "../services/wslService";
import { useDistroStore } from "../store/distroStore";
import { useNotificationStore } from "../store/notificationStore";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "./ui/Modal";
import { Button } from "./ui/Button";
import { PathInput } from "./ui/Input";
import type { Distribution } from "../types/distribution";

interface MoveDistroDialogProps {
  isOpen: boolean;
  distro: Distribution;
  onClose: () => void;
}

export function MoveDistroDialog({ isOpen, distro, onClose }: MoveDistroDialogProps) {
  const [location, setLocation] = useState("");
  const [currentLocation, setCurrentLocation] = useState<string | null>(null);
  const [isMoving, setIsMoving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diskSize, setDiskSize] = useState<number | null>(null);
  const { fetchDistros } = useDistroStore();
  const { addNotification } = useNotificationStore();

  // Fetch disk size and current location when dialog opens
  useEffect(() => {
    if (isOpen) {
      wslService.getDistributionDiskSize(distro.name).then(setDiskSize).catch(() => setDiskSize(null));
      wslService.getDistributionLocation(distro.name).then(setCurrentLocation).catch(() => setCurrentLocation(null));
    }
  }, [isOpen, distro.name]);

  const handleBrowse = async () => {
    // Get parent directory of current location so user can see the current folder
    // and navigate to choose a new location
    let startPath = currentLocation || undefined;
    if (startPath) {
      const lastSlash = Math.max(startPath.lastIndexOf("\\"), startPath.lastIndexOf("/"));
      if (lastSlash > 0) {
        startPath = startPath.substring(0, lastSlash);
      }
    }

    const selectedPath = await open({
      directory: true,
      multiple: false,
      title: "Select Destination Folder",
      defaultPath: startPath,
    });

    if (selectedPath && !Array.isArray(selectedPath)) {
      setLocation(selectedPath);
      setError(null);
    }
  };

  const handleMove = async () => {
    if (!location.trim()) {
      setError("Please select a destination folder");
      return;
    }

    setError(null);
    setIsMoving(true);

    try {
      await wslService.moveDistribution(distro.name, location.trim());
      await fetchDistros();
      addNotification({
        type: "success",
        title: "Distribution Moved",
        message: `${distro.name} moved to ${location.trim()}`,
      });
      handleClose();
    } catch (err) {
      // Tauri returns string errors, not Error instances
      const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : "Failed to move distribution";
      setError(errorMessage);
    } finally {
      setIsMoving(false);
    }
  };

  const handleClose = () => {
    if (!isMoving) {
      setLocation("");
      setCurrentLocation(null);
      setError(null);
      onClose();
    }
  };

  const formatSize = (bytes: number): string => {
    const gb = bytes / (1024 * 1024 * 1024);
    return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
  };

  // Strip Windows extended-length path prefix for display
  const formatPath = (path: string): string => {
    return path.replace(/^\\\\\?\\/, "");
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} closeOnBackdrop={!isMoving}>
      <ModalHeader
        title={`Move "${distro.name}"`}
        subtitle="Move distribution to a new location"
        onClose={handleClose}
        showCloseButton={!isMoving}
      />

      <ModalBody>
        {error && (
          <div className="mb-4 p-3 bg-[rgba(var(--status-error-rgb),0.2)] border border-[rgba(var(--status-error-rgb),0.4)] rounded-lg text-theme-status-error text-sm">
            {error}
          </div>
        )}

        <div className="space-y-4">
          <div className="p-3 bg-theme-bg-tertiary/50 border border-theme-border-secondary rounded-lg space-y-2">
            <div>
              <span className="text-theme-text-muted text-xs uppercase tracking-wider">Current Location</span>
              <p className="text-theme-text-primary text-sm font-mono break-all mt-0.5">
                {currentLocation ? formatPath(currentLocation) : "Loading..."}
              </p>
            </div>
            <div className="pt-2 border-t border-theme-border-secondary/50">
              <span className="text-theme-text-muted text-xs uppercase tracking-wider">Current Size</span>
              <p className="text-theme-text-primary text-sm mt-0.5">
                {diskSize !== null ? formatSize(diskSize) : "Loading..."}
              </p>
            </div>
          </div>

          <div>
            <PathInput
              label="New Location"
              value={location}
              onChange={(e) => {
                setLocation(e.target.value);
                setError(null);
              }}
              placeholder="Select or enter destination path"
              disabled={isMoving}
              onBrowse={handleBrowse}
              helperText="The distribution's virtual disk will be moved to this folder."
            />
          </div>
        </div>

        {isMoving && (
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
              <span>Moving distribution... This may take a while for large distros.</span>
            </div>
          </div>
        )}
      </ModalBody>

      <ModalFooter>
        <Button variant="secondary" onClick={handleClose} disabled={isMoving}>
          Cancel
        </Button>
        <Button
          variant="primary"
          onClick={handleMove}
          disabled={isMoving || !location.trim()}
          loading={isMoving}
        >
          Move
        </Button>
      </ModalFooter>
    </Modal>
  );
}
