import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { wslService } from "./wslService";

describe("distribution polling", () => {
  beforeEach(() => vi.mocked(invoke).mockReset());

  it("reuses the fetched list for the tray instead of requesting another WSL query", async () => {
    const distributions = [{ name: "Ubuntu", state: "Running", version: 2, isDefault: true }];
    vi.mocked(invoke).mockResolvedValueOnce(distributions).mockResolvedValueOnce(undefined);
    await expect(wslService.listDistributions()).resolves.toEqual(distributions);
    expect(invoke).toHaveBeenNthCalledWith(2, "refresh_tray_menu", { distributions });
    expect(invoke).toHaveBeenCalledTimes(2);
  });

  it("keeps a successful poll when updating the tray fails", async () => {
    vi.mocked(invoke).mockResolvedValueOnce([]).mockRejectedValueOnce(new Error("tray unavailable"));
    await expect(wslService.listDistributions()).resolves.toEqual([]);
  });
});
