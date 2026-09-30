import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wslService } from "../../services/wslService";
import { useDistroStore } from "../../store/distroStore";
import { useNotificationStore } from "../../store/notificationStore";
import type { Distribution } from "../../types/distribution";
import { DEFAULT_WSL_CONF, type GpuStatus } from "../../types/settings";
import { WslDistroSettings } from "./WslDistroSettings";

vi.mock("../../services/wslService", () => ({
  wslService: {
    getWslConf: vi.fn(),
    getDistroGpuStatus: vi.fn(),
    checkNvidiaContainerToolkit: vi.fn(),
    saveWslConf: vi.fn(),
  },
}));

vi.mock("../../store/distroStore", () => ({
  useDistroStore: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-shell", () => ({
  open: vi.fn(),
}));

const stoppedDistro: Distribution = {
  id: "stopped-id",
  name: "Stopped-Distro",
  state: "Stopped",
  version: 2,
  isDefault: true,
};

describe("WslDistroSettings", () => {
  const startDistro = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useNotificationStore.getState().clearAll();
    vi.mocked(wslService.getWslConf).mockResolvedValue(DEFAULT_WSL_CONF);
    vi.mocked(useDistroStore).mockReturnValue({
      distributions: [stoppedDistro],
      startDistro,
      actionInProgress: null,
    } as ReturnType<typeof useDistroStore>);
  });

  async function startDeferredSave() {
    vi.mocked(useDistroStore).mockReturnValue({
      distributions: [
        { ...stoppedDistro, name: "First", state: "Running" },
        { ...stoppedDistro, name: "Second", state: "Running" },
      ], startDistro, actionInProgress: null,
    } as ReturnType<typeof useDistroStore>);
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    vi.mocked(wslService.saveWslConf).mockReturnValueOnce(new Promise<void>((res, rej) => {
      resolve = res;
      reject = rej;
    }));
    const view = render(<WslDistroSettings />);
    fireEvent.change(await screen.findByTestId("distro-hostname-input"), { target: { value: "first-host" } });
    fireEvent.click(screen.getByTestId("distro-save-button"));
    expect(wslService.saveWslConf).toHaveBeenCalledWith("First", expect.objectContaining({ networkHostname: "first-host" }));
    return { ...view, resolve, reject };
  }

  it("notifies about a failed save for the original distro after switching, preserving the new form", async () => {
    const { reject } = await startDeferredSave();
    fireEvent.change(screen.getByTestId("distro-settings-selector"), { target: { value: "Second" } });
    fireEvent.change(await screen.findByTestId("distro-hostname-input"), { target: { value: "second-draft" } });
    await act(async () => reject("Permission denied"));

    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({ type: "error", title: expect.stringContaining("First"), message: "Permission denied", autoDismiss: 0 }),
    ]);
    expect(screen.getByTestId("distro-hostname-input")).toHaveValue("second-draft");
    expect(screen.getByTestId("distro-save-button")).toBeEnabled();
    expect(screen.queryByTestId("distro-config-error")).not.toBeInTheDocument();
  });

  it("retains a failed save notification after the settings panel unmounts", async () => {
    const { reject, unmount } = await startDeferredSave();
    unmount();
    await act(async () => reject(new Error("Disk is read-only")));
    expect(useNotificationStore.getState().notifications).toEqual([
      expect.objectContaining({ type: "error", title: expect.stringContaining("First"), message: "Disk is read-only", autoDismiss: 0 }),
    ]);
  });

  it("does not reset the newly selected distro's draft when an earlier save succeeds", async () => {
    const { resolve } = await startDeferredSave();
    fireEvent.change(screen.getByTestId("distro-settings-selector"), { target: { value: "Second" } });
    fireEvent.change(await screen.findByTestId("distro-hostname-input"), { target: { value: "second-draft" } });
    await act(async () => resolve());
    expect(screen.getByTestId("distro-hostname-input")).toHaveValue("second-draft");
    expect(screen.getByTestId("distro-save-button")).toBeEnabled();
    expect(useNotificationStore.getState().notifications).toEqual([]);
  });

  it("does not read Linux-side settings until a stopped distro is explicitly started", async () => {
    render(<WslDistroSettings />);

    expect(await screen.findByRole("button", { name: "Start and load settings" })).toBeInTheDocument();
    await waitFor(() => expect(wslService.getWslConf).not.toHaveBeenCalled());
  });

  it("starts the selected distro only after the explicit load action", async () => {
    const { rerender } = render(<WslDistroSettings />);

    fireEvent.click(await screen.findByRole("button", { name: "Start and load settings" }));

    expect(startDistro).toHaveBeenCalledWith("Stopped-Distro", "stopped-id");

    vi.mocked(useDistroStore).mockReturnValue({
      distributions: [{ ...stoppedDistro, state: "Running" }],
      startDistro,
      actionInProgress: null,
    } as ReturnType<typeof useDistroStore>);
    rerender(<WslDistroSettings />);

    await waitFor(() => {
      expect(wslService.getWslConf).toHaveBeenCalledWith("Stopped-Distro", "stopped-id");
    });
  });

  it("allows an explicitly requested start when a localized stopped state is unknown", async () => {
    vi.mocked(useDistroStore).mockReturnValue({
      distributions: [{ ...stoppedDistro, state: "Unknown" }],
      startDistro,
      actionInProgress: null,
    } as ReturnType<typeof useDistroStore>);

    render(<WslDistroSettings />);

    expect(await screen.findByRole("button", { name: "Start and load settings" })).toBeEnabled();
  });

  it("ignores a GPU response after switching distributions", async () => {
    vi.mocked(useDistroStore).mockReturnValue({
      distributions: [
        { ...stoppedDistro, name: "First", state: "Running" },
        { ...stoppedDistro, name: "Second", state: "Running" },
      ], startDistro, actionInProgress: null,
    } as ReturnType<typeof useDistroStore>);
    let resolve!: (value: GpuStatus) => void;
    vi.mocked(wslService.getDistroGpuStatus).mockReturnValueOnce(new Promise(r => { resolve = r; }));
    render(<WslDistroSettings />);
    fireEvent.click(await screen.findByRole("button", { name: /check gpu/i }));
    fireEvent.change(screen.getByTestId("distro-settings-selector"), { target: { value: "Second" } });
    await act(async () => resolve({ nvidiaAvailable: true } as GpuStatus));
    expect(wslService.checkNvidiaContainerToolkit).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /check gpu/i })).toBeEnabled();
  });
});
