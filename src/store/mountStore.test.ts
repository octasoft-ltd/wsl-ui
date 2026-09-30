import { describe, it, expect, beforeEach, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { getDiskMountEntries, useMountStore } from "./mountStore";
import type { MountedDisk, PhysicalDisk, MountDiskOptions } from "../services/wslService";

// Note: @tauri-apps/api/core is mocked in test/setup.ts

const mockMountedDisk: MountedDisk = {
  path: "D:\\VHDs\\data.vhdx",
  mountPoint: "/mnt/wsl/data",
  filesystem: "ext4",
  isVhd: true,
};

const mockPhysicalDisk: PhysicalDisk = {
  deviceId: "\\\\.\\PHYSICALDRIVE1",
  friendlyName: "Samsung SSD 970 EVO",
  sizeBytes: 500107862016, // ~500GB
  partitions: [
    {
      index: 1,
      sizeBytes: 104857600, // 100MB
      filesystem: "FAT32",
      driveLetter: null,
    },
    {
      index: 2,
      sizeBytes: 500003004416,
      filesystem: "NTFS",
      driveLetter: "E:",
    },
  ],
};

const mockMountOptions: MountDiskOptions = {
  diskPath: "D:\\VHDs\\mydata.vhdx",
  isVhd: true,
  mountName: "mydata",
  filesystemType: "ext4",
  mountOptions: null,
  partition: null,
  bare: false,
};

describe("mountStore", () => {
  beforeEach(() => {
    // Reset store state
    useMountStore.setState({
      mountedDisks: [],
      trackedMounts: [],
      physicalDisks: [],
      isLoading: false,
      isMounting: false,
      isUnmounting: false,
      error: null,
      showMountDialog: false,
    });
    vi.clearAllMocks();
  });

  describe("mount identity", () => {
    const tracked = (diskPath: string, mountPoint: string | null) => ({
      diskPath, mountPoint, isVhd: true, filesystem: "ext4", mountedAt: 0,
    });
    const discovered = (mountPoint: string) => ({ ...mockMountedDisk, path: "/dev/sdc", mountPoint });

    it("matches the exact mountpoint despite an earlier filename collision", () => {
      const entries = getDiskMountEntries([discovered("/mnt/wsl/data")], [
        tracked("D:\\data.vhdx", "/mnt/wsl/other"),
        tracked("E:\\actual.vhdx", "/mnt/wsl/data"),
      ]);
      expect(entries[0].diskPath).toBe("E:\\actual.vhdx");
      expect(entries[1].diskPath).toBe("D:\\data.vhdx");
    });

    it.each(["/other/data", "/mnt/wsl/Data", null])("does not guess identity from names or case: %s", (mountPoint) => {
      const entries = getDiskMountEntries([discovered("/mnt/wsl/data")], [tracked("D:\\data.vhdx", mountPoint)]);
      expect(entries[0].diskPath).toBeNull();
      expect(entries[1].mountPoint).toBe("D:\\data.vhdx");
      expect(entries[1].diskPath).toBe("D:\\data.vhdx");
    });

    it("keeps ambiguous tracked identities separate and labels them by Windows path", () => {
      const entries = getDiskMountEntries([discovered("/mnt/wsl/data")], [
        tracked("D:\\one.vhdx", "/mnt/wsl/data"), tracked("E:\\two.vhdx", "/mnt/wsl/data"),
      ]);
      expect(entries.map((entry) => entry.diskPath)).toEqual([null, "D:\\one.vhdx", "E:\\two.vhdx"]);
      expect(new Set(entries.map((entry) => entry.mountPoint)).size).toBe(3);
    });

    it("does not associate one attachment with multiple discovered filesystems at the same point", () => {
      const entries = getDiskMountEntries([discovered("/mnt/wsl/data"), { ...discovered("/mnt/wsl/data"), path: "/dev/sdd" }], [tracked("D:\\data.vhdx", "/mnt/wsl/data")]);
      expect(entries.map((entry) => entry.diskPath)).toEqual([null, null, "D:\\data.vhdx"]);
    });

    it("rejects a Linux unmount target shared by multiple discovered filesystems", async () => {
      useMountStore.setState({
        trackedMounts: [tracked("D:\\data.vhdx", "/mnt/wsl/data")],
        mountedDisks: [discovered("/mnt/wsl/data"), { ...discovered("/mnt/wsl/data"), path: "/dev/sdd" }],
      });
      await expect(useMountStore.getState().unmountDisk("/mnt/wsl/data")).rejects.toThrow("Cannot identify");
      expect(invoke).not.toHaveBeenCalled();
    });

    it.each(["/mnt/wsl/data", "/mnt/wsl/DATA", "/mnt/wsl/unknown"])("rejects ambiguous or unknown Linux unmount targets: %s", async (target) => {
      const mounts = [tracked("D:\\one.vhdx", "/mnt/wsl/data"), tracked("E:\\two.vhdx", "/mnt/wsl/data")];
      useMountStore.setState({ trackedMounts: mounts });
      await expect(useMountStore.getState().unmountDisk(target)).rejects.toThrow("Cannot identify");
      expect(invoke).not.toHaveBeenCalled();
      expect(useMountStore.getState().trackedMounts).toEqual(mounts);
      expect(useMountStore.getState().isUnmounting).toBe(false);
    });
  });

  describe("initial state", () => {
    it("should have empty arrays initially", () => {
      const state = useMountStore.getState();
      expect(state.mountedDisks).toEqual([]);
      expect(state.trackedMounts).toEqual([]);
      expect(state.physicalDisks).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.isMounting).toBe(false);
      expect(state.isUnmounting).toBe(false);
      expect(state.error).toBeNull();
      expect(state.showMountDialog).toBe(false);
    });
  });

  describe("loadMountedDisks", () => {
    it("sets loading state while fetching", async () => {
      vi.mocked(invoke).mockResolvedValue([]);

      const loadPromise = useMountStore.getState().loadMountedDisks();

      expect(useMountStore.getState().isLoading).toBe(true);

      await loadPromise;

      expect(useMountStore.getState().isLoading).toBe(false);
    });

    it("stores fetched mounted disks", async () => {
      const disks = [mockMountedDisk];
      vi.mocked(invoke).mockResolvedValue(disks);

      await useMountStore.getState().loadMountedDisks();

      expect(useMountStore.getState().mountedDisks).toEqual(disks);
    });

    it("calls invoke with correct command", async () => {
      vi.mocked(invoke).mockResolvedValue([]);

      await useMountStore.getState().loadMountedDisks();

      expect(invoke).toHaveBeenCalledWith("list_mounted_disks");
    });

    it("preserves tracked mounts when filesystem discovery returns empty", async () => {
      useMountStore.setState({
        trackedMounts: [
          {
            diskPath: "D:\\test.vhdx",
            mountPoint: "/mnt/wsl/test",
            isVhd: true,
            filesystem: "ext4",
            mountedAt: Date.now(),
          },
        ],
      });
      vi.mocked(invoke).mockResolvedValue([]);

      await useMountStore.getState().loadMountedDisks();

      expect(useMountStore.getState().trackedMounts).toHaveLength(1);
      expect(useMountStore.getState().trackedMounts[0].diskPath).toBe("D:\\test.vhdx");
    });

    it("preserves tracked mounts when disks are mounted", async () => {
      const trackedMount = {
        diskPath: "D:\\test.vhdx",
        mountPoint: "/mnt/wsl/test",
        isVhd: true,
        filesystem: "ext4",
        mountedAt: Date.now(),
      };
      useMountStore.setState({ trackedMounts: [trackedMount] });
      vi.mocked(invoke).mockResolvedValue([mockMountedDisk]);

      await useMountStore.getState().loadMountedDisks();

      expect(useMountStore.getState().trackedMounts).toEqual([trackedMount]);
    });

    it("sets error on load failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Load failed"));

      await useMountStore.getState().loadMountedDisks();

      expect(useMountStore.getState().error).toBe("Load failed");
      expect(useMountStore.getState().isLoading).toBe(false);
    });

    it("prevents duplicate concurrent calls", async () => {
      useMountStore.setState({ isLoading: true });
      vi.mocked(invoke).mockResolvedValue([]);

      await useMountStore.getState().loadMountedDisks();

      // Should not have called invoke since already loading
      expect(invoke).not.toHaveBeenCalled();
    });
  });

  describe("loadPhysicalDisks", () => {
    it("stores fetched physical disks", async () => {
      const disks = [mockPhysicalDisk];
      vi.mocked(invoke).mockResolvedValue(disks);

      await useMountStore.getState().loadPhysicalDisks();

      expect(useMountStore.getState().physicalDisks).toEqual(disks);
    });

    it("calls invoke with correct command", async () => {
      vi.mocked(invoke).mockResolvedValue([]);

      await useMountStore.getState().loadPhysicalDisks();

      expect(invoke).toHaveBeenCalledWith("list_physical_disks");
    });

    it("sets error on load failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Load failed"));

      await useMountStore.getState().loadPhysicalDisks();

      expect(useMountStore.getState().error).toBe("Load failed");
    });
  });

  describe("refreshAll", () => {
    it("loads both mounted and physical disks", async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce([mockMountedDisk])
        .mockResolvedValueOnce([mockPhysicalDisk]);

      await useMountStore.getState().refreshAll();

      expect(useMountStore.getState().mountedDisks).toEqual([mockMountedDisk]);
      expect(useMountStore.getState().physicalDisks).toEqual([mockPhysicalDisk]);
    });

    it("sets error if either call fails", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Refresh failed"));

      await useMountStore.getState().refreshAll();

      expect(useMountStore.getState().error).toBe("Refresh failed");
    });
  });

  describe("mountDisk", () => {
    it.each([
      { diskPath: "D:\\data.vhdx", isVhd: true },
      { diskPath: "\\\\.\\PHYSICALDRIVE1", isVhd: false },
    ])("keeps bare attachment $diskPath without inventing a mount point", async ({ diskPath, isVhd }) => {
      vi.mocked(invoke).mockResolvedValueOnce(undefined).mockResolvedValueOnce([]);

      await useMountStore.getState().mountDisk({ ...mockMountOptions, diskPath, isVhd, bare: true });

      expect(useMountStore.getState().trackedMounts).toEqual([
        expect.objectContaining({ diskPath, isVhd, mountPoint: null, filesystem: null }),
      ]);
    });

    it("sets mounting state while mounting", async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined) // mount_disk
        .mockResolvedValueOnce([mockMountedDisk]); // list_mounted_disks

      const mountPromise = useMountStore.getState().mountDisk(mockMountOptions);

      expect(useMountStore.getState().isMounting).toBe(true);

      await mountPromise;

      expect(useMountStore.getState().isMounting).toBe(false);
    });

    it("calls invoke with correct options", async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([mockMountedDisk]);

      await useMountStore.getState().mountDisk(mockMountOptions);

      expect(invoke).toHaveBeenCalledWith("mount_disk", {
        options: mockMountOptions,
      });
    });

    it("tracks mounted disk", async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined) // mount_disk
        .mockResolvedValueOnce([mockMountedDisk]); // list_mounted_disks

      await useMountStore.getState().mountDisk(mockMountOptions);

      const trackedMounts = useMountStore.getState().trackedMounts;
      expect(trackedMounts).toHaveLength(1);
      expect(trackedMounts[0].diskPath).toBe("D:\\VHDs\\mydata.vhdx");
      expect(trackedMounts[0].mountPoint).toBe("/mnt/wsl/mydata");
      expect(trackedMounts[0].isVhd).toBe(true);
    });

    it.each([
      { diskPath: "D:\\VHDs\\testdisk.vhdx", isVhd: true },
      { diskPath: "\\\\.\\PHYSICALDRIVE2", isVhd: false },
    ])("requests and tracks the same generated mountpoint for $diskPath", async ({ diskPath, isVhd }) => {
      const optionsWithoutName: MountDiskOptions = {
        diskPath,
        isVhd,
        mountName: undefined,
        filesystemType: "ext4",
        mountOptions: null,
        partition: 1,
        bare: false,
      };
      let requestedOptions: MountDiskOptions | undefined;
      vi.mocked(invoke).mockImplementation(async (command, args) => {
        if (command === "mount_disk") {
          requestedOptions = (args as { options: MountDiskOptions }).options;
          return undefined;
        }
        return [{ ...mockMountedDisk, path: "/dev/sdc1", mountPoint: `/mnt/wsl/${requestedOptions?.mountName}` }];
      });

      await useMountStore.getState().mountDisk(optionsWithoutName);

      const trackedMounts = useMountStore.getState().trackedMounts;
      expect(requestedOptions?.mountName).toMatch(/^wsl-ui-[a-f0-9-]{36}$/);
      expect(requestedOptions).toEqual({ ...optionsWithoutName, mountName: requestedOptions?.mountName });
      expect(optionsWithoutName.mountName).toBeUndefined();
      expect(trackedMounts[0].mountPoint).toBe(`/mnt/wsl/${requestedOptions?.mountName}`);
      const entries = getDiskMountEntries(useMountStore.getState().mountedDisks, trackedMounts);
      expect(entries).toHaveLength(1);
      expect(entries[0].diskPath).toBe(diskPath);
    });

    it.each([undefined, null, ""])("generates distinct names for unnamed filesystem mounts: %s", async (mountName) => {
      vi.mocked(invoke).mockResolvedValue([]);
      await useMountStore.getState().mountDisk({ ...mockMountOptions, diskPath: "D:\\one.vhdx", mountName });
      await useMountStore.getState().mountDisk({ ...mockMountOptions, diskPath: "E:\\two.vhdx", mountName });
      const points = useMountStore.getState().trackedMounts.map((mount) => mount.mountPoint);
      expect(points.every((point) => point?.startsWith("/mnt/wsl/wsl-ui-"))).toBe(true);
      expect(new Set(points).size).toBe(2);
    });

    it.each([undefined, null, ""])("does not generate a name for a bare attachment: %s", async (mountName) => {
      vi.mocked(invoke).mockResolvedValue([]);
      const options = { ...mockMountOptions, bare: true, mountName };
      await useMountStore.getState().mountDisk(options);
      expect(invoke).toHaveBeenCalledWith("mount_disk", { options });
      expect(useMountStore.getState().trackedMounts[0].mountPoint).toBeNull();
    });

    it("refreshes mounted disks after mount", async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([mockMountedDisk]);

      await useMountStore.getState().mountDisk(mockMountOptions);

      expect(invoke).toHaveBeenCalledWith("list_mounted_disks");
    });

    it("sets error and throws on mount failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Mount failed"));

      await expect(
        useMountStore.getState().mountDisk(mockMountOptions)
      ).rejects.toThrow("Mount failed");

      expect(useMountStore.getState().error).toBe("Mount failed");
      expect(useMountStore.getState().isMounting).toBe(false);
    });
  });

  describe("unmountDisk", () => {
    it("removes only the requested bare attachment", async () => {
      useMountStore.setState({ trackedMounts: ["D:\\one.vhdx", "D:\\two.vhdx"].map((diskPath) => ({
        diskPath, mountPoint: null, isVhd: true, filesystem: null, mountedAt: 0,
      })) });
      vi.mocked(invoke).mockResolvedValueOnce(undefined).mockResolvedValueOnce([]);

      await useMountStore.getState().unmountDisk("D:\\one.vhdx");

      expect(invoke).toHaveBeenCalledWith("unmount_disk", { diskPath: "D:\\one.vhdx" });
      expect(useMountStore.getState().trackedMounts.map((disk) => disk.diskPath)).toEqual(["D:\\two.vhdx"]);
    });

    it("sets unmounting state while unmounting", async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined) // unmount_disk
        .mockResolvedValueOnce([]); // list_mounted_disks

      const unmountPromise = useMountStore
        .getState()
        .unmountDisk("D:\\test.vhdx");

      expect(useMountStore.getState().isUnmounting).toBe(true);

      await unmountPromise;

      expect(useMountStore.getState().isUnmounting).toBe(false);
    });

    it("looks up disk path from tracked mounts by mount point", async () => {
      useMountStore.setState({
        trackedMounts: [
          {
            diskPath: "D:\\tracked.vhdx",
            mountPoint: "/mnt/wsl/tracked",
            isVhd: true,
            filesystem: "ext4",
            mountedAt: Date.now(),
          },
        ],
      });
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]);

      await useMountStore.getState().unmountDisk("/mnt/wsl/tracked");

      expect(invoke).toHaveBeenCalledWith("unmount_disk", {
        diskPath: "D:\\tracked.vhdx",
      });
    });

    it("looks up disk path from tracked mounts by disk path", async () => {
      useMountStore.setState({
        trackedMounts: [
          {
            diskPath: "D:\\tracked.vhdx",
            mountPoint: "/mnt/wsl/tracked",
            isVhd: true,
            filesystem: "ext4",
            mountedAt: Date.now(),
          },
        ],
      });
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]);

      await useMountStore.getState().unmountDisk("D:\\tracked.vhdx");

      expect(invoke).toHaveBeenCalledWith("unmount_disk", {
        diskPath: "D:\\tracked.vhdx",
      });
    });

    it("uses provided path if not tracked", async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]);

      await useMountStore.getState().unmountDisk("D:\\untracked.vhdx");

      expect(invoke).toHaveBeenCalledWith("unmount_disk", {
        diskPath: "D:\\untracked.vhdx",
      });
    });

    it("removes mount from tracked mounts", async () => {
      useMountStore.setState({
        trackedMounts: [
          {
            diskPath: "D:\\tracked.vhdx",
            mountPoint: "/mnt/wsl/tracked",
            isVhd: true,
            filesystem: "ext4",
            mountedAt: Date.now(),
          },
        ],
      });
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]);

      await useMountStore.getState().unmountDisk("/mnt/wsl/tracked");

      expect(useMountStore.getState().trackedMounts).toEqual([]);
    });

    it("sets error and throws on unmount failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Unmount failed"));

      await expect(
        useMountStore.getState().unmountDisk("D:\\test.vhdx")
      ).rejects.toThrow("Unmount failed");

      expect(useMountStore.getState().error).toBe("Unmount failed");
    });
  });

  describe("unmountAll", () => {
    it("calls invoke with null diskPath", async () => {
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]);

      await useMountStore.getState().unmountAll();

      expect(invoke).toHaveBeenCalledWith("unmount_disk", {
        diskPath: null,
      });
    });

    it("clears all tracked mounts", async () => {
      useMountStore.setState({
        trackedMounts: [
          {
            diskPath: "D:\\disk1.vhdx",
            mountPoint: "/mnt/wsl/disk1",
            isVhd: true,
            filesystem: "ext4",
            mountedAt: Date.now(),
          },
          {
            diskPath: "D:\\disk2.vhdx",
            mountPoint: "/mnt/wsl/disk2",
            isVhd: true,
            filesystem: "ext4",
            mountedAt: Date.now(),
          },
        ],
      });
      vi.mocked(invoke)
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce([]);

      await useMountStore.getState().unmountAll();

      expect(useMountStore.getState().trackedMounts).toEqual([]);
    });

    it("sets error and throws on failure", async () => {
      vi.mocked(invoke).mockRejectedValue(new Error("Unmount all failed"));

      await expect(useMountStore.getState().unmountAll()).rejects.toThrow(
        "Unmount all failed"
      );

      expect(useMountStore.getState().error).toBe("Unmount all failed");
    });
  });

  describe("clearError", () => {
    it("clears the error state", () => {
      useMountStore.setState({ error: "Some error" });

      useMountStore.getState().clearError();

      expect(useMountStore.getState().error).toBeNull();
    });
  });

  describe("dialog state", () => {
    it("openMountDialog sets showMountDialog to true", () => {
      useMountStore.getState().openMountDialog();

      expect(useMountStore.getState().showMountDialog).toBe(true);
    });

    it("closeMountDialog sets showMountDialog to false", () => {
      useMountStore.setState({ showMountDialog: true });

      useMountStore.getState().closeMountDialog();

      expect(useMountStore.getState().showMountDialog).toBe(false);
    });
  });
});

