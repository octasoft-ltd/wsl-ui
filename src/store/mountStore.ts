import { create } from "zustand";
import { wslService, type MountedDisk, type PhysicalDisk, type MountDiskOptions } from "../services/wslService";
import { logger } from "../utils/logger";

/**
 * Tracked mount - stores the original disk path so we can unmount
 * WSL doesn't persist this info, so we track it ourselves
 */
interface TrackedMount {
  /** Original disk path used in wsl --mount (e.g., D:\data.vhdx or \\.\PHYSICALDRIVE2) */
  diskPath: string;
  /** Mount point inside WSL (e.g., /mnt/wsl/mydata) */
  mountPoint: string;
  /** Whether this is a VHD file */
  isVhd: boolean;
  /** Filesystem type if specified */
  filesystem: string | null;
  /** When it was mounted */
  mountedAt: number;
}

interface MountStore {
  // State
  mountedDisks: MountedDisk[];
  trackedMounts: TrackedMount[];  // Disks we mounted via UI (so we can unmount them)
  physicalDisks: PhysicalDisk[];
  isLoading: boolean;
  isMounting: boolean;
  isUnmounting: boolean;
  error: string | null;
  showMountDialog: boolean;

  // Actions
  loadMountedDisks: () => Promise<void>;
  loadPhysicalDisks: () => Promise<void>;
  refreshAll: () => Promise<void>;
  mountDisk: (options: MountDiskOptions) => Promise<void>;
  unmountDisk: (diskPath: string) => Promise<void>;
  unmountAll: () => Promise<void>;
  clearError: () => void;
  openMountDialog: () => void;
  closeMountDialog: () => void;
}

export const useMountStore = create<MountStore>((set, get) => ({
  mountedDisks: [],
  trackedMounts: [],
  physicalDisks: [],
  isLoading: false,
  isMounting: false,
  isUnmounting: false,
  error: null,
  showMountDialog: false,

  loadMountedDisks: async () => {
    // Prevent duplicate concurrent calls (e.g., from React StrictMode)
    if (get().isLoading) {
      return;
    }
    set({ isLoading: true, error: null });
    try {
      const mountedDisks = await wslService.listMountedDisks();
      // If no disks mounted (WSL likely shut down), clear tracked mounts too
      if (mountedDisks.length === 0) {
        set({ mountedDisks, trackedMounts: [], isLoading: false });
      } else {
        set({ mountedDisks, isLoading: false });
      }
    } catch (error) {
      const errorMsg = typeof error === "string" ? error : (error instanceof Error ? error.message : "Failed to load mounted disks");
      logger.error("Failed to load mounted disks:", "MountStore", error);
      set({ error: errorMsg, isLoading: false });
    }
  },

  loadPhysicalDisks: async () => {
    set({ isLoading: true, error: null });
    try {
      const physicalDisks = await wslService.listPhysicalDisks();
      set({ physicalDisks, isLoading: false });
    } catch (error) {
      const errorMsg = typeof error === "string" ? error : (error instanceof Error ? error.message : "Failed to load physical disks");
      logger.error("Failed to load physical disks:", "MountStore", error);
      set({ error: errorMsg, isLoading: false });
    }
  },

  refreshAll: async () => {
    set({ isLoading: true, error: null });
    try {
      const [mountedDisks, physicalDisks] = await Promise.all([
        wslService.listMountedDisks(),
        wslService.listPhysicalDisks(),
      ]);
      set({ mountedDisks, physicalDisks, isLoading: false });
    } catch (error) {
      const errorMsg = typeof error === "string" ? error : (error instanceof Error ? error.message : "Failed to refresh disk data");
      logger.error("Failed to refresh disk data:", "MountStore", error);
      set({ error: errorMsg, isLoading: false });
    }
  },

  mountDisk: async (options: MountDiskOptions) => {
    set({ isMounting: true, error: null });
    try {
      await wslService.mountDisk(options);

      // Track this mount so we can unmount it later
      // WSL mounts to /mnt/wsl/<name> - derive mount point from options
      const diskFileName = options.diskPath.split(/[/\\]/).pop() || options.diskPath;
      const mountName = options.mountName || diskFileName.replace(/\.[^.]+$/, ""); // Remove extension
      const mountPoint = `/mnt/wsl/${mountName}`;

      const trackedMount: TrackedMount = {
        diskPath: options.diskPath,
        mountPoint,
        isVhd: options.isVhd,
        filesystem: options.filesystemType || null,
        mountedAt: Date.now(),
      };

      set((state) => ({
        trackedMounts: [...state.trackedMounts, trackedMount],
        isMounting: false,
      }));

      // Refresh mounted disks after successful mount
      await get().loadMountedDisks();
    } catch (error) {
      const errorMsg = typeof error === "string" ? error : (error instanceof Error ? error.message : "Failed to mount disk");
      logger.error("Failed to mount disk:", "MountStore", error);
      set({ error: errorMsg, isMounting: false });
      throw error;
    }
  },

  unmountDisk: async (mountPointOrPath: string) => {
    set({ isUnmounting: true, error: null });
    try {
      // Look up the original disk path from our tracked mounts
      const { trackedMounts } = get();
      const tracked = trackedMounts.find(
        (m) => m.mountPoint === mountPointOrPath || m.diskPath === mountPointOrPath
      );

      // Use the tracked disk path if found, otherwise use what was passed
      const diskPath = tracked?.diskPath || mountPointOrPath;

      await wslService.unmountDisk(diskPath);

      // Remove from tracked mounts if it was tracked
      if (tracked) {
        set((state) => ({
          trackedMounts: state.trackedMounts.filter((m) => m.mountPoint !== tracked.mountPoint),
        }));
      }

      // Refresh mounted disks after successful unmount
      await get().loadMountedDisks();
      set({ isUnmounting: false });
    } catch (error) {
      const errorMsg = typeof error === "string" ? error : (error instanceof Error ? error.message : "Failed to unmount disk");
      logger.error("Failed to unmount disk:", "MountStore", error);
      set({ error: errorMsg, isUnmounting: false });
      throw error;
    }
  },

  unmountAll: async () => {
    set({ isUnmounting: true, error: null });
    try {
      await wslService.unmountDisk(); // No path = unmount all
      // Clear all tracked mounts
      set({ trackedMounts: [] });
      // Refresh mounted disks after successful unmount
      await get().loadMountedDisks();
      set({ isUnmounting: false });
    } catch (error) {
      const errorMsg = typeof error === "string" ? error : (error instanceof Error ? error.message : "Failed to unmount all disks");
      logger.error("Failed to unmount all disks:", "MountStore", error);
      set({ error: errorMsg, isUnmounting: false });
      throw error;
    }
  },

  clearError: () => {
    set({ error: null });
  },

  openMountDialog: () => {
    set({ showMountDialog: true });
  },

  closeMountDialog: () => {
    set({ showMountDialog: false });
  },
}));
