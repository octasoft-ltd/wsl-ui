import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wslService } from "../../services/wslService";
import { useDistroStore } from "../../store/distroStore";
import type { Distribution } from "../../types/distribution";
import { DEFAULT_WSL_CONF } from "../../types/settings";
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
    vi.mocked(wslService.getWslConf).mockResolvedValue(DEFAULT_WSL_CONF);
    vi.mocked(useDistroStore).mockReturnValue({
      distributions: [stoppedDistro],
      startDistro,
      actionInProgress: null,
    } as ReturnType<typeof useDistroStore>);
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
});
