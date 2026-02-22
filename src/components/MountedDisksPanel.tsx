import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useMountStore } from "../store/mountStore";
import { TrashIcon } from "./icons";

interface MountedDisksPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onMountNew: () => void;
  anchorRef: React.RefObject<HTMLElement | null>;
}

export function MountedDisksPanel({ isOpen, onClose, onMountNew, anchorRef }: MountedDisksPanelProps) {
  const { t } = useTranslation("dialogs");
  const panelRef = useRef<HTMLDivElement>(null);
  const [unmountingPath, setUnmountingPath] = useState<string | null>(null);
  const { mountedDisks, trackedMounts, isLoading, isUnmounting, loadMountedDisks, unmountDisk, unmountAll, error, clearError } = useMountStore();

  // Load mounted disks when panel opens
  useEffect(() => {
    if (isOpen) {
      loadMountedDisks();
    }
  }, [isOpen, loadMountedDisks]);

  // Close on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, onClose, anchorRef]);

  if (!isOpen) return null;

  // Check if a mount point is tracked (we mounted it via this UI)
  // Use flexible matching since WSL might report slightly different paths
  const findTrackedMount = (mountPoint: string) => {
    const diskName = mountPoint.split('/').pop()?.toLowerCase() || "";

    return trackedMounts.find((m) => {
      // Exact mount point match
      if (m.mountPoint === mountPoint) return true;
      // Case-insensitive mount point match
      if (m.mountPoint.toLowerCase() === mountPoint.toLowerCase()) return true;

      // Check if the mount name part matches
      const trackedName = m.mountPoint.split('/').pop()?.toLowerCase();
      if (trackedName && trackedName === diskName) return true;

      // Also try matching against the filename from the original disk path
      // e.g., D:\data.vhdx -> "data" should match /mnt/wsl/data
      const diskFileName = m.diskPath.split(/[/\\]/).pop()?.toLowerCase() || "";
      const diskFileNameNoExt = diskFileName.replace(/\.[^.]+$/, "");
      if (diskFileNameNoExt && diskFileNameNoExt === diskName) return true;

      return false;
    });
  };

  const isTracked = (mountPoint: string) => !!findTrackedMount(mountPoint);

  const handleUnmountAll = async () => {
    try {
      await unmountAll();
    } catch {
      // Error is handled in store
    }
  };

  const handleUnmountDisk = async (mountPoint: string) => {
    const tracked = findTrackedMount(mountPoint);
    if (!tracked) return;

    setUnmountingPath(mountPoint);
    try {
      // Use the original diskPath for unmounting
      await unmountDisk(tracked.diskPath);
    } catch {
      // Error is handled in store
    } finally {
      setUnmountingPath(null);
    }
  };

  return (
    <div
      ref={panelRef}
      data-testid="mounted-disks-panel"
      className="absolute left-0 bottom-full mb-2 w-72 bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/70 z-50"
    >
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-theme-border-primary">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-theme-text-muted uppercase tracking-wide font-mono" data-testid="mounted-disks-title">
            {t('mountedDisks.title')}
          </span>
          {mountedDisks.length > 0 && (
            <button
              onClick={handleUnmountAll}
              disabled={isUnmounting}
              data-testid="unmount-all-button"
              className="text-xs px-2 py-0.5 text-theme-status-error hover:bg-[rgba(var(--status-error-rgb),0.15)] rounded transition-colors disabled:opacity-50"
            >
              {isUnmounting ? "..." : t('mountedDisks.unmountAll')}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-3 py-2 bg-[rgba(var(--status-error-rgb),0.1)] border-b border-[rgba(var(--status-error-rgb),0.3)]" data-testid="mounted-disks-error">
          <div className="flex items-start justify-between gap-2">
            <p className="text-xs text-theme-status-error flex-1">{error}</p>
            <button
              onClick={clearError}
              data-testid="mounted-disks-clear-error"
              className="text-theme-status-error hover:opacity-80 text-xs"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="max-h-48 overflow-y-auto" data-testid="mounted-disks-list">
        {isLoading ? (
          <div className="px-3 py-6 text-center" data-testid="mounted-disks-loading">
            <div className="w-4 h-4 border-2 border-theme-border-secondary border-t-theme-accent-primary rounded-full animate-spin mx-auto" />
          </div>
        ) : mountedDisks.length === 0 ? (
          <div className="px-3 py-6 text-center" data-testid="mounted-disks-empty">
            <div className="text-theme-status-stopped text-2xl mb-1">○</div>
            <p className="text-xs text-theme-text-muted">{t('mountedDisks.noDisks')}</p>
            <p className="text-xs text-theme-status-stopped mt-1">
              {t('mountedDisks.noDisksHint')}
            </p>
          </div>
        ) : (
          <div className="py-1">
            {mountedDisks.map((disk, index) => {
              const tracked = isTracked(disk.mountPoint);
              const isThisUnmounting = unmountingPath === disk.mountPoint;
              return (
                <div
                  key={disk.mountPoint}
                  data-testid={`mounted-disk-${index}`}
                  className="px-3 py-2 hover:bg-theme-bg-tertiary border-b border-theme-border-primary last:border-b-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-sm text-theme-text-primary min-w-0">
                      <span className="text-theme-text-muted flex-shrink-0">{disk.isVhd ? "◉" : "●"}</span>
                      <code className="font-mono text-theme-accent-primary text-xs truncate" data-testid={`mounted-disk-${index}-path`}>
                        {disk.mountPoint}
                      </code>
                    </div>
                    {tracked && (
                      <button
                        onClick={() => handleUnmountDisk(disk.mountPoint)}
                        disabled={isUnmounting}
                        data-testid={`unmount-disk-${index}`}
                        className="p-1 text-theme-text-muted hover:text-theme-status-error hover:bg-[rgba(var(--status-error-rgb),0.1)] rounded transition-colors disabled:opacity-50"
                        title="Unmount this disk"
                      >
                        {isThisUnmounting ? (
                          <div className="w-3 h-3 border border-theme-text-muted border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <TrashIcon size="sm" />
                        )}
                      </button>
                    )}
                  </div>
                  {disk.filesystem && (
                    <div className="text-xs text-theme-text-muted ml-5 mt-0.5" data-testid={`mounted-disk-${index}-fs`}>
                      {disk.filesystem}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-theme-border-primary p-2">
        <button
          onClick={() => {
            onClose();
            onMountNew();
          }}
          data-testid="mount-new-disk-button"
          className="w-full px-3 py-1.5 text-xs font-medium text-theme-accent-primary hover:bg-[rgba(var(--accent-primary-rgb),0.1)] rounded transition-colors flex items-center justify-center gap-1.5"
        >
          <span>+</span>
          <span>{t('mountedDisks.mountDisk')}</span>
        </button>
      </div>
    </div>
  );
}
