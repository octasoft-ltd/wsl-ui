import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadLanguage } from "../i18n";
import { PopupHost } from "./PopupHost";

const transportMocks = vi.hoisted(() => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
  focusUnlisten: vi.fn(),
  listeners: new Map<string, (event: { payload: unknown }) => unknown>(),
  listen: vi.fn(),
  onFocusChanged: vi.fn(),
  popupHide: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: transportMocks.emitTo,
  listen: transportMocks.listen,
}));

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    hide: transportMocks.popupHide,
    onFocusChanged: transportMocks.onFocusChanged,
  }),
}));

interface TestPayload {
  name: string;
}

function emitTransportEvent(eventName: string, payload: unknown) {
  const listener = transportMocks.listeners.get(eventName);
  if (!listener) {
    throw new Error(`Missing transport listener for ${eventName}`);
  }
  return listener({ payload });
}

describe("PopupHost", () => {
  beforeEach(() => {
    transportMocks.emitTo.mockClear();
    transportMocks.focusUnlisten.mockClear();
    transportMocks.popupHide.mockClear();
    transportMocks.listeners.clear();
    transportMocks.listen.mockReset();
    transportMocks.listen.mockImplementation(async (eventName, listener) => {
      transportMocks.listeners.set(eventName, listener);
      return vi.fn();
    });
    transportMocks.onFocusChanged.mockReset();
    transportMocks.onFocusChanged.mockResolvedValue(transportMocks.focusUnlisten);
    vi.mocked(loadLanguage).mockReset();
    vi.mocked(loadLanguage).mockResolvedValue(undefined);
  });

  it("associates actions with the active session and sends no mutable action payload", async () => {
    render(
      <PopupHost<TestPayload> popupType="quick-actions">
        {(payload, requestAction) => (
          <button onClick={() => requestAction("custom:trusted-id")}>{payload.name}</button>
        )}
      </PopupHost>,
    );

    await waitFor(() => {
      expect(transportMocks.emitTo).toHaveBeenCalledWith(
        "main",
        "popup-ready",
        { popupType: "quick-actions" },
      );
    });

    await act(async () => {
      await emitTransportEvent("popup-init", {
        payload: { name: "Ubuntu" },
        popupType: "quick-actions",
        sessionId: "session-1",
      });
    });

    fireEvent.click(await screen.findByRole("button", { name: "Ubuntu" }));

    expect(transportMocks.emitTo).toHaveBeenCalledWith(
      "main",
      "popup-action-selected",
      {
        actionId: "custom:trusted-id",
        popupType: "quick-actions",
        sessionId: "session-1",
      },
    );
    await waitFor(() => expect(transportMocks.popupHide).toHaveBeenCalledOnce());
    expect(transportMocks.emitTo).not.toHaveBeenCalledWith(
      "main",
      "popup-close",
      expect.anything(),
    );
  });

  it("hides locally and informs the main window when the popup loses browser focus", async () => {
    render(
      <PopupHost<TestPayload> popupType="quick-actions">
        {(payload) => <div>{payload.name}</div>}
      </PopupHost>,
    );
    await waitFor(() => expect(transportMocks.listeners.has("popup-init")).toBe(true));
    await act(async () => {
      await emitTransportEvent("popup-init", {
        payload: { name: "Ubuntu" },
        popupType: "quick-actions",
        sessionId: "session-1",
      });
    });

    fireEvent.blur(window);

    await waitFor(() => expect(transportMocks.popupHide).toHaveBeenCalledOnce());
    expect(transportMocks.emitTo).toHaveBeenCalledWith(
      "main",
      "popup-close",
      { popupType: "quick-actions", sessionId: "session-1" },
    );
  });

  it("does not allow an older language load to replace the latest popup session", async () => {
    let resolveFirstLanguageLoad: (() => void) | undefined;
    vi.mocked(loadLanguage).mockImplementation((locale) => {
      if (locale === "de") {
        return new Promise<void>((resolve) => {
          resolveFirstLanguageLoad = resolve;
        });
      }
      return Promise.resolve();
    });

    render(
      <PopupHost<TestPayload> popupType="quick-actions">
        {(payload) => <div>{payload.name}</div>}
      </PopupHost>,
    );
    await waitFor(() => expect(transportMocks.listeners.has("popup-init")).toBe(true));

    const firstInit = emitTransportEvent("popup-init", {
      locale: "de",
      payload: { name: "Ubuntu" },
      popupType: "quick-actions",
      sessionId: "session-1",
    });
    await act(async () => {
      await emitTransportEvent("popup-init", {
        locale: "en",
        payload: { name: "Debian" },
        popupType: "quick-actions",
        sessionId: "session-2",
      });
    });

    expect(screen.getByText("Debian")).toBeInTheDocument();

    await act(async () => {
      resolveFirstLanguageLoad?.();
      await firstInit;
    });

    expect(screen.getByText("Debian")).toBeInTheDocument();
    expect(screen.queryByText("Ubuntu")).not.toBeInTheDocument();
  });

  it("keeps visible content associated with its committed session during the next language load", async () => {
    let resolveNextLanguageLoad: (() => void) | undefined;
    render(
      <PopupHost<TestPayload> popupType="quick-actions">
        {(payload, requestAction) => (
          <button onClick={() => requestAction("restart")}>{payload.name}</button>
        )}
      </PopupHost>,
    );
    await waitFor(() => expect(transportMocks.listeners.has("popup-init")).toBe(true));
    await act(async () => {
      await emitTransportEvent("popup-init", {
        payload: { name: "Ubuntu" },
        popupType: "quick-actions",
        sessionId: "session-1",
      });
    });

    vi.mocked(loadLanguage).mockImplementation(() => new Promise<void>((resolve) => {
      resolveNextLanguageLoad = resolve;
    }));
    const nextInit = emitTransportEvent("popup-init", {
      locale: "de",
      payload: { name: "Debian" },
      popupType: "quick-actions",
      sessionId: "session-2",
    });

    fireEvent.click(screen.getByRole("button", { name: "Ubuntu" }));
    expect(transportMocks.emitTo).toHaveBeenCalledWith(
      "main",
      "popup-action-selected",
      {
        actionId: "restart",
        popupType: "quick-actions",
        sessionId: "session-1",
      },
    );

    await act(async () => {
      resolveNextLanguageLoad?.();
      await nextInit;
    });
  });

  it("immediately releases a listener that resolves after unmount", async () => {
    let resolveListener: ((unlisten: () => void) => void) | undefined;
    const lateUnlisten = vi.fn();
    transportMocks.listen.mockImplementationOnce(() => new Promise((resolve) => {
      resolveListener = resolve;
    }));

    const { unmount } = render(
      <PopupHost<TestPayload> popupType="quick-actions">
        {(payload) => <div>{payload.name}</div>}
      </PopupHost>,
    );
    unmount();

    await act(async () => {
      resolveListener?.(lateUnlisten);
      await Promise.resolve();
    });

    expect(lateUnlisten).toHaveBeenCalledOnce();
    expect(transportMocks.onFocusChanged).not.toHaveBeenCalled();
  });
});
