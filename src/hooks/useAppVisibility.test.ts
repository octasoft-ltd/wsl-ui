import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppVisibility } from "./useAppVisibility";
vi.mock("@tauri-apps/api/window", () => ({ getCurrentWindow: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("native app visibility", () => {
  it("stays inactive for a hidden native window and resumes only after showing", async () => {
    let focused!: (event: { payload: boolean }) => void;
    let resized!: () => void;
    const shown = vi.fn().mockResolvedValue(false);
    const minimized = vi.fn().mockResolvedValue(false);
    const unlisten = vi.fn();
    vi.mocked(getCurrentWindow).mockReturnValue({
      isVisible: shown,
      isMinimized: minimized,
      onFocusChanged: vi.fn(async (handler) => {
        focused = handler;
        return unlisten;
      }),
      onResized: vi.fn(async (handler) => {
        resized = handler;
        return unlisten;
      }),
    } as unknown as ReturnType<typeof getCurrentWindow>);
    const { result, unmount } = renderHook(useAppVisibility);
    await act(async () => {});
    expect(result.current).toBe(false);
    shown.mockResolvedValue(true);
    await act(async () => focused({ payload: true }));
    expect(result.current).toBe(true);
    minimized.mockResolvedValue(true);
    await act(async () => resized());
    expect(result.current).toBe(false);
    minimized.mockResolvedValue(false);
    await act(async () => focused({ payload: true }));
    expect(result.current).toBe(true);
    await act(async () => focused({ payload: false }));
    expect(result.current).toBe(false);
    unmount();
    expect(unlisten).toHaveBeenCalledTimes(2);
  });
});
