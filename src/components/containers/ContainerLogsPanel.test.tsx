import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
vi.mock("@tauri-apps/plugin-fs", () => ({
  writeTextFile: vi.fn().mockResolvedValue(undefined),
}));
import { ContainerLogsPanel } from "./ContainerLogsPanel";
const connection = {
  sessionName: "default",
  sessionId: "a",
  runtimeVersion: "3.0.1",
};
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockResolvedValue({ text: "ready", truncated: false });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
async function show() {
  await act(async () => {
    render(
      <ContainerLogsPanel
        connection={connection}
        id={"a".repeat(64)}
        visible
      />,
    );
  });
}
describe("bounded logs following", () => {
  it("retries an initial tail discarded when the viewer is hidden", async () => {
    let finish!: (value: { text: string; truncated: boolean }) => void;
    const pending = new Promise((resolve) => {
      finish = resolve;
    });
    vi.mocked(invoke).mockReturnValueOnce(pending);
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <ContainerLogsPanel
          connection={connection}
          id={"a".repeat(64)}
          visible
        />,
      );
    });
    await act(async () =>
      view.rerender(
        <ContainerLogsPanel
          connection={connection}
          id={"a".repeat(64)}
          visible={false}
        />,
      ),
    );
    await act(async () =>
      finish({ text: "discarded old response", truncated: false }),
    );
    await act(async () =>
      view.rerender(
        <ContainerLogsPanel
          connection={connection}
          id={"a".repeat(64)}
          visible
        />,
      ),
    );
    expect(screen.getByTestId("container-log-output")).toHaveTextContent(
      "ready",
    );
    expect(invoke).toHaveBeenCalledTimes(2);
  });
  it("keeps an intentional Clear while the initial tail is pending", async () => {
    let finish!: (value: { text: string; truncated: boolean }) => void;
    vi.mocked(invoke).mockReturnValueOnce(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await show();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Clear display" })),
    );
    await act(async () =>
      finish({ text: "old pending output", truncated: false }),
    );
    expect(screen.getByTestId("container-log-output")).toHaveTextContent(
      "No recent logs.",
    );
  });
  it("stops issuing reads immediately when following is paused", async () => {
    await show();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Follow" })),
    );
    await act(async () => vi.advanceTimersByTimeAsync(2000));
    const reads = vi.mocked(invoke).mock.calls.length;
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Pause" })),
    );
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(invoke).toHaveBeenCalledTimes(reads);
  });
  it("keeps the display empty after clearing while following", async () => {
    await show();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Follow" })),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Clear display" })),
    );
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(screen.getByTestId("container-log-output")).toHaveTextContent(
      "No recent logs.",
    );
  });
  it("saves the visible logs only to the user-selected path", async () => {
    vi.mocked(save).mockResolvedValueOnce("C:\\chosen\\service.log");
    await show();
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Save logs" })),
    );
    expect(writeTextFile).toHaveBeenCalledWith(
      "C:\\chosen\\service.log",
      "ready",
    );
    vi.mocked(writeTextFile).mockClear();
    vi.mocked(save).mockResolvedValueOnce(null);
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Save logs" })),
    );
    expect(writeTextFile).not.toHaveBeenCalled();
  });
  it("cancels reads when the viewer is hidden and caps excessive output", async () => {
    vi.mocked(invoke).mockResolvedValue({
      text: "x".repeat(300000),
      truncated: true,
    });
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <ContainerLogsPanel
          connection={connection}
          id={"a".repeat(64)}
          visible
        />,
      );
    });
    expect(screen.getByTestId("container-log-output").textContent?.length).toBe(
      262144,
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Follow" })),
    );
    const reads = vi.mocked(invoke).mock.calls.length;
    await act(async () =>
      view.rerender(
        <ContainerLogsPanel
          connection={connection}
          id={"a".repeat(64)}
          visible={false}
        />,
      ),
    );
    await act(async () => vi.advanceTimersByTimeAsync(10000));
    expect(invoke).toHaveBeenCalledTimes(reads);
  });
});
