import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { wslService } from "../../services/wslService";
import type { ManifestPreview } from "../../types/distroSources";
import { WslDistroSourcesSettings } from "./WslDistroSourcesSettings";

vi.mock("../../services/wslService", () => ({
  wslService: {
    getDistroSource: vi.fn(),
    previewDistroManifest: vi.fn(),
    applyDistroSource: vi.fn(),
    clearDistroSource: vi.fn(),
  },
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("WslDistroSourcesSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(wslService.getDistroSource).mockResolvedValue(null);
  });

  it("discards a preview if the URL changes while it is loading", async () => {
    const pending = deferred<ManifestPreview>();
    vi.mocked(wslService.previewDistroManifest).mockReturnValue(pending.promise);
    render(<WslDistroSourcesSettings />);

    const input = await screen.findByLabelText("Manifest URL");
    fireEvent.change(input, { target: { value: "https://one.test/manifest.json" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.change(input, { target: { value: "https://two.test/manifest.json" } });

    await act(async () => {
      pending.resolve({
        url: "https://one.test/manifest.json",
        entries: [{
          flavor: "Ubuntu",
          name: "Stale-Distro",
          friendlyName: "Stale Distro",
          default: false,
          hasAmd64: true,
          hasArm64: false,
        }],
      });
      await pending.promise;
    });
    expect(screen.queryByText("Stale-Distro")).not.toBeInTheDocument();
  });

  it("disables both mutations while apply is pending", async () => {
    const pending = deferred<void>();
    vi.mocked(wslService.applyDistroSource).mockReturnValue(pending.promise);
    render(<WslDistroSourcesSettings />);

    const input = await screen.findByLabelText("Manifest URL");
    fireEvent.change(input, { target: { value: "https://example.test/manifest.json" } });
    const apply = screen.getByRole("button", { name: "Apply (requires admin)" });
    const clear = screen.getByRole("button", { name: "Reset to defaults" });
    fireEvent.click(apply);

    expect(apply).toBeDisabled();
    expect(clear).toBeDisabled();
    pending.resolve();
    await waitFor(() => expect(apply).not.toBeDisabled());
  });

  it("does not restore an in-flight preview after reset", async () => {
    const pending = deferred<ManifestPreview>();
    vi.mocked(wslService.previewDistroManifest).mockReturnValue(pending.promise);
    vi.mocked(wslService.clearDistroSource).mockResolvedValue();
    render(<WslDistroSourcesSettings />);

    const input = await screen.findByLabelText("Manifest URL");
    fireEvent.change(input, { target: { value: "https://one.test/manifest.json" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset to defaults" }));
    await waitFor(() => expect(wslService.clearDistroSource).toHaveBeenCalledOnce());

    await act(async () => {
      pending.resolve({
        url: "https://one.test/manifest.json",
        entries: [{
          flavor: "Ubuntu",
          name: "Stale-After-Reset",
          friendlyName: "Stale After Reset",
          default: false,
          hasAmd64: true,
          hasArm64: false,
        }],
      });
      await pending.promise;
    });

    expect(screen.queryByText("Stale-After-Reset")).not.toBeInTheDocument();
  });
});
