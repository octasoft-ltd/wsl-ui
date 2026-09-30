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

    expect(await screen.findByText("/mnt/wsl/data")).toBeInTheDocument();
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
});
