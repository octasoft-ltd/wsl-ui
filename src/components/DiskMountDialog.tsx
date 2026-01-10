import { useState, useEffect, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { useMountStore } from "../store/mountStore";
import type { MountDiskOptions, PhysicalDisk } from "../services/wslService";
import { Portal } from "./ui/Portal";

interface DiskMountDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type MountTab = "vhd" | "physical";

const FILESYSTEM_TYPES = [
  { value: "", label: "Auto-detect" },
  { value: "ext4", label: "ext4 (Linux default)" },
  { value: "ext3", label: "ext3" },
  { value: "ntfs", label: "NTFS (Windows)" },
  { value: "vfat", label: "FAT32" },
  { value: "exfat", label: "exFAT" },
  { value: "btrfs", label: "Btrfs" },
  { value: "xfs", label: "XFS" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function DiskMountDialog({ isOpen, onClose }: DiskMountDialogProps) {
  const [activeTab, setActiveTab] = useState<MountTab>("vhd");
  const [vhdPath, setVhdPath] = useState("");
  const [selectedDisk, setSelectedDisk] = useState<PhysicalDisk | null>(null);
  const [selectedPartition, setSelectedPartition] = useState<number | null>(null);
  const [mountName, setMountName] = useState("");
  const [filesystemType, setFilesystemType] = useState("");
  const [mountOptions, setMountOptions] = useState("");
  const [bareMount, setBareMount] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { physicalDisks, isMounting, mountDisk, loadPhysicalDisks } = useMountStore();

  const handleClose = useCallback(() => {
    setVhdPath("");
    setSelectedDisk(null);
    setSelectedPartition(null);
    setMountName("");
    setFilesystemType("");
    setMountOptions("");
    setBareMount(false);
    setError(null);
    onClose();
  }, [onClose]);

  // Load physical disks when dialog opens
  useEffect(() => {
    if (isOpen) {
      loadPhysicalDisks();
    }
  }, [isOpen, loadPhysicalDisks]);

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

  const handleBrowseVhd = async () => {
    const path = await open({
      filters: [{ name: "Virtual Hard Disk", extensions: ["vhd", "vhdx"] }],
      title: "Select Virtual Hard Disk",
      multiple: false,
    });

    if (path && !Array.isArray(path)) {
      setVhdPath(path);
      // Auto-suggest mount name from filename
      if (!mountName) {
        const filename = path.split(/[/\\]/).pop() || "";
        const suggestedName = filename.replace(/\.(vhd|vhdx)$/i, "");
        setMountName(suggestedName);
      }
    }
  };

  const handleMount = async () => {
    setError(null);

    let options: MountDiskOptions;

    if (activeTab === "vhd") {
      if (!vhdPath) {
        setError("Please select a VHD file");
        return;
      }
      options = {
        diskPath: vhdPath,
        isVhd: true,
        mountName: mountName || null,
        filesystemType: filesystemType || null,
        mountOptions: mountOptions || null,
        partition: null,
        bare: bareMount,
      };
    } else {
      if (!selectedDisk) {
        setError("Please select a physical disk");
        return;
      }
      options = {
        diskPath: selectedDisk.deviceId,
        isVhd: false,
        mountName: mountName || null,
        filesystemType: filesystemType || null,
        mountOptions: mountOptions || null,
        partition: selectedPartition,
        bare: bareMount,
      };
    }

    try {
      await mountDisk(options);
      handleClose();
    } catch (err) {
      const errorMsg = typeof err === "string" ? err : (err instanceof Error ? err.message : "Failed to mount disk");
      setError(errorMsg);
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-theme-bg-primary/80 backdrop-blur-xs" onClick={handleClose} />

        {/* Dialog */}
        <div role="dialog" aria-modal="true" data-testid="disk-mount-dialog" className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-lg w-full mx-4 p-6">
        <h2 className="text-xl font-semibold text-theme-text-primary mb-4" data-testid="disk-mount-title">Mount Disk to WSL</h2>

        {/* Tabs */}
        <div className="flex gap-1 mb-4 p-1 bg-theme-bg-tertiary rounded-lg" data-testid="disk-mount-tabs">
          <button
            onClick={() => setActiveTab("vhd")}
            data-testid="disk-mount-tab-vhd"
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "vhd"
                ? "bg-theme-accent-primary text-theme-bg-primary"
                : "text-theme-text-secondary hover:text-theme-text-primary"
            }`}
          >
            Mount VHD
          </button>
          <button
            onClick={() => setActiveTab("physical")}
            data-testid="disk-mount-tab-physical"
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              activeTab === "physical"
                ? "bg-theme-accent-primary text-theme-bg-primary"
                : "text-theme-text-secondary hover:text-theme-text-primary"
            }`}
          >
            Mount Physical Disk
          </button>
        </div>

        {/* Error message */}
        <div className="mb-4 min-h-11">
          {error && (
            <div data-testid="disk-mount-error" className="p-3 bg-[rgba(var(--status-error-rgb),0.2)] border border-[rgba(var(--status-error-rgb),0.4)] rounded-lg text-theme-status-error text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* VHD Tab Content */}
          {activeTab === "vhd" && (
            <div data-testid="disk-mount-vhd-section">
              <label className="block text-sm font-medium text-theme-text-secondary mb-1">
                VHD File
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={vhdPath}
                  readOnly
                  placeholder="Select a .vhd or .vhdx file..."
                  data-testid="disk-mount-vhd-path"
                  className="flex-1 px-3 py-2 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder-theme-text-muted"
                />
                <button
                  onClick={handleBrowseVhd}
                  data-testid="disk-mount-browse-vhd"
                  className="px-4 py-2 bg-theme-bg-hover hover:bg-theme-bg-tertiary text-theme-text-secondary rounded-lg transition-colors"
                >
                  Browse
                </button>
              </div>
            </div>
          )}

          {/* Physical Disk Tab Content */}
          {activeTab === "physical" && (
            <div data-testid="disk-mount-physical-section">
              <label className="block text-sm font-medium text-theme-text-secondary mb-1">
                Physical Disk
              </label>
              <select
                value={selectedDisk?.deviceId || ""}
                onChange={(e) => {
                  const disk = physicalDisks.find(d => d.deviceId === e.target.value);
                  setSelectedDisk(disk || null);
                  setSelectedPartition(null);
                }}
                data-testid="disk-mount-physical-selector"
                className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg text-theme-text-primary"
              >
                <option value="">Select a disk...</option>
                {physicalDisks.map((disk) => (
                  <option key={disk.deviceId} value={disk.deviceId}>
                    {disk.friendlyName} ({formatBytes(disk.sizeBytes)})
                  </option>
                ))}
              </select>
              <p className="text-xs text-theme-text-muted mt-1" data-testid="disk-mount-admin-warning">
                Mounting physical disks may require administrator privileges
              </p>

              {/* Partition selector */}
              {selectedDisk && selectedDisk.partitions.length > 0 && (
                <div className="mt-3">
                  <label className="block text-sm font-medium text-theme-text-secondary mb-1">
                    Partition (optional)
                  </label>
                  <select
                    value={selectedPartition ?? ""}
                    onChange={(e) => setSelectedPartition(e.target.value ? parseInt(e.target.value) : null)}
                    data-testid="disk-mount-partition-selector"
                    className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg text-theme-text-primary"
                  >
                    <option value="">Whole disk</option>
                    {selectedDisk.partitions.map((partition) => (
                      <option key={partition.index} value={partition.index}>
                        Partition {partition.index}: {formatBytes(partition.sizeBytes)}
                        {partition.filesystem ? ` (${partition.filesystem})` : ""}
                        {partition.driveLetter ? ` - ${partition.driveLetter}` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* Mount Name */}
          <div>
            <label className="block text-sm font-medium text-theme-text-secondary mb-1">
              Mount Name (optional)
            </label>
            <input
              type="text"
              value={mountName}
              onChange={(e) => setMountName(e.target.value)}
              placeholder="e.g., mydisk"
              data-testid="disk-mount-name-input"
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-hidden focus:border-theme-accent-primary"
            />
            <p className="text-xs text-theme-text-muted mt-1" data-testid="disk-mount-point-hint">
              Mount point will be /mnt/wsl/{mountName || "<diskname>"}
            </p>
          </div>

          {/* Filesystem Type */}
          <div>
            <label className="block text-sm font-medium text-theme-text-secondary mb-1">
              Filesystem Type
            </label>
            <select
              value={filesystemType}
              onChange={(e) => setFilesystemType(e.target.value)}
              data-testid="disk-mount-filesystem-selector"
              className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg text-theme-text-primary"
            >
              {FILESYSTEM_TYPES.map((fs) => (
                <option key={fs.value} value={fs.value}>
                  {fs.label}
                </option>
              ))}
            </select>
          </div>

          {/* Advanced Options */}
          <details className="text-theme-text-secondary" data-testid="disk-mount-advanced-options">
            <summary className="cursor-pointer text-sm font-medium hover:text-theme-text-primary">
              Advanced Options
            </summary>
            <div className="mt-3 space-y-3 pl-2">
              {/* Mount Options */}
              <div>
                <label className="block text-sm text-theme-text-secondary mb-1">
                  Mount Options
                </label>
                <input
                  type="text"
                  value={mountOptions}
                  onChange={(e) => setMountOptions(e.target.value)}
                  placeholder="e.g., ro,noexec"
                  data-testid="disk-mount-options-input"
                  className="w-full px-3 py-2 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder-theme-text-muted text-sm"
                />
              </div>

              {/* Bare Mount */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={bareMount}
                  onChange={(e) => setBareMount(e.target.checked)}
                  data-testid="disk-mount-bare-checkbox"
                  className="w-4 h-4 rounded border-theme-border-secondary bg-theme-bg-tertiary text-theme-accent-primary focus:ring-theme-accent-primary"
                />
                <span className="text-sm text-theme-text-secondary">
                  Bare mount (attach without mounting)
                </span>
              </label>
            </div>
          </details>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            disabled={isMounting}
            data-testid="disk-mount-cancel-button"
            className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleMount}
            disabled={isMounting || (activeTab === "vhd" ? !vhdPath : !selectedDisk)}
            data-testid="disk-mount-submit-button"
            className="px-4 py-2 text-sm font-medium bg-theme-accent-primary hover:opacity-90 text-theme-bg-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isMounting ? "Mounting..." : "Mount"}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
