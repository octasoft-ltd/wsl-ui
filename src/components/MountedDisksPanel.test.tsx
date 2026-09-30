import { createRef } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { useMountStore } from "../store/mountStore";
import { MountedDisksPanel } from "./MountedDisksPanel";

function openPanel() {
  render(<MountedDisksPanel isOpen onClose={vi.fn()} onMountNew={vi.fn()} anchorRef={createRef<HTMLElement>()} />);
}

describe("MountedDisksPanel", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockReset();
    vi.mocked(invoke).mockResolvedValue([]);
    useMountStore.setState({ mountedDisks: [], trackedMounts: [], isLoading: false, isUnmounting: false, error: null });
  });

  it("shows a bare attachment and unmounts it using its original Windows path", async () => {
    useMountStore.setState({ trackedMounts: [{
      diskPath: "D:\\data.vhdx", mountPoint: null, isVhd: true, filesystem: null, mountedAt: 0,
    }] });
    openPanel();

    expect(await screen.findByText("D:\\data.vhdx")).toBeInTheDocument();
    expect(screen.getByTestId("unmount-all-button")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("unmount-disk-0"));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("unmount_disk", { diskPath: "D:\\data.vhdx" }));
    await waitFor(() => expect(screen.getByTestId("mounted-disks-empty")).toBeInTheDocument());
  });

  it("retains the unmount action when a filesystem mount is missing from a refresh", async () => {
    useMountStore.setState({ trackedMounts: [{
      diskPath: "D:\\data.vhdx", mountPoint: "/mnt/wsl/data", isVhd: true, filesystem: "ext4", mountedAt: 0,
    }] });
    openPanel();

    expect(await screen.findByText("D:\\data.vhdx")).toBeInTheDocument();
    expect(screen.getByTestId("unmount-disk-0")).toBeInTheDocument();
  });

  it("does not duplicate tracked disks present in discovery", async () => {
    vi.mocked(invoke).mockResolvedValue([{ path: "data", mountPoint: "/mnt/wsl/data", isVhd: true, filesystem: "ext4" }]);
    useMountStore.setState({ trackedMounts: [{
      diskPath: "D:\\data.vhdx", mountPoint: "/mnt/wsl/data", isVhd: true, filesystem: "ext4", mountedAt: 0,
    }] });
    openPanel();

    expect(await screen.findByText("/mnt/wsl/data")).toBeInTheDocument();
    expect(screen.queryByTestId("mounted-disk-1")).not.toBeInTheDocument();
  });

  it("unmounts the exact identity when an earlier attachment has the same filename", async () => {
    vi.mocked(invoke).mockResolvedValue([{ path: "/dev/sdc", mountPoint: "/mnt/wsl/data", isVhd: true, filesystem: "ext4" }]);
    useMountStore.setState({ trackedMounts: [
      { diskPath: "D:\\data.vhdx", mountPoint: "/mnt/wsl/other", isVhd: true, filesystem: "ext4", mountedAt: 0 },
      { diskPath: "E:\\actual.vhdx", mountPoint: "/mnt/wsl/data", isVhd: true, filesystem: "ext4", mountedAt: 0 },
    ] });
    openPanel();

    await screen.findByText("/mnt/wsl/data");
    fireEvent.click(screen.getByTestId("unmount-disk-0"));

    await waitFor(() => expect(invoke).toHaveBeenCalledWith("unmount_disk", { diskPath: "E:\\actual.vhdx" }));
    expect(invoke).not.toHaveBeenCalledWith("unmount_disk", { diskPath: "D:\\data.vhdx" });
  });

  it("offers only explicit Windows attachments when discovery has an ambiguous identity", async () => {
    vi.mocked(invoke).mockResolvedValue([{ path: "/dev/sdc", mountPoint: "/mnt/wsl/data", isVhd: true, filesystem: "ext4" }]);
    useMountStore.setState({ trackedMounts: ["D:\\one.vhdx", "E:\\two.vhdx"].map((diskPath) => ({
      diskPath, mountPoint: "/mnt/wsl/data", isVhd: true, filesystem: "ext4", mountedAt: 0,
    })) });
    openPanel();

    await screen.findByText("/mnt/wsl/data");
    expect(screen.queryByTestId("unmount-disk-0")).not.toBeInTheDocument();
    expect(screen.getByTestId("mounted-disk-1-path")).toHaveTextContent("D:\\one.vhdx");
    expect(screen.getByTestId("mounted-disk-2-path")).toHaveTextContent("E:\\two.vhdx");
    fireEvent.click(screen.getByTestId("unmount-disk-2"));
    await waitFor(() => expect(invoke).toHaveBeenCalledWith("unmount_disk", { diskPath: "E:\\two.vhdx" }));
  });

  it("renders duplicate discovered mountpoints without duplicate React keys or guessed unmount actions", async () => {
    const consoleError = vi.spyOn(console, "error");
    try {
      vi.mocked(invoke).mockResolvedValue(["/dev/sdc", "/dev/sdd"].map((path) => ({
        path, mountPoint: "/mnt/wsl/data", isVhd: true, filesystem: "ext4",
      })));
      useMountStore.setState({ trackedMounts: [{
        diskPath: "D:\\data.vhdx", mountPoint: "/mnt/wsl/data", isVhd: true, filesystem: "ext4", mountedAt: 0,
      }] });
      openPanel();

      await waitFor(() => expect(screen.getAllByText("/mnt/wsl/data")).toHaveLength(2));
      expect(screen.queryByTestId("unmount-disk-0")).not.toBeInTheDocument();
      expect(screen.queryByTestId("unmount-disk-1")).not.toBeInTheDocument();
      expect(screen.getByTestId("mounted-disk-2-path")).toHaveTextContent("D:\\data.vhdx");
      expect(consoleError.mock.calls.some((call) => call.some((value) => String(value).includes("same key")))).toBe(false);
    } finally {
      consoleError.mockRestore();
    }
  });
});
