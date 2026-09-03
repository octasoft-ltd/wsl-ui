import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { usePopupWindow } from "./usePopupWindow";

const popupMocks = vi.hoisted(() => ({
  emitTo: vi.fn().mockResolvedValue(undefined),
  getByLabel: vi.fn().mockResolvedValue(null),
  hide: vi.fn().mockResolvedValue(undefined),
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  setFocus: vi.fn().mockResolvedValue(undefined),
  setPosition: vi.fn().mockResolvedValue(undefined),
  setSize: vi.fn().mockResolvedValue(undefined),
  show: vi.fn().mockResolvedValue(undefined),
  windowOptions: null as Record<string, unknown> | null,
}));

vi.mock("@tauri-apps/api/event", () => ({
  emitTo: popupMocks.emitTo,
  listen: vi.fn(async (eventName, listener) => {
    popupMocks.listeners.set(eventName, listener);
    return () => {
      if (popupMocks.listeners.get(eventName) === listener) {
        popupMocks.listeners.delete(eventName);
      }
    };
  }),
}));

vi.mock("@tauri-apps/api/window", () => ({
  currentMonitor: vi.fn().mockResolvedValue({
    position: { x: -1920, y: 0 },
    scaleFactor: 1,
    size: { height: 1080, width: 1920 },
  }),
  getCurrentWindow: () => ({
    innerPosition: vi.fn().mockResolvedValue({ x: -1800, y: 100 }),
    scaleFactor: vi.fn().mockResolvedValue(1),
  }),
  LogicalPosition: class LogicalPosition {
    constructor(public x: number, public y: number) {}
  },
  LogicalSize: class LogicalSize {
    constructor(public width: number, public height: number) {}
  },
}));

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: class WebviewWindow {
    static getByLabel = popupMocks.getByLabel;

    constructor(_label: string, options: Record<string, unknown>) {
      popupMocks.windowOptions = options;
    }

    hide = popupMocks.hide;
    once = vi.fn();
    setFocus = popupMocks.setFocus;
    setPosition = popupMocks.setPosition;
    setSize = popupMocks.setSize;
    show = popupMocks.show;
  },
}));

vi.mock("../utils/logger", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
  },
}));

function dispatchPopupEvent(eventName: string, payload: unknown) {
  const listener = popupMocks.listeners.get(eventName);
  if (!listener) {
    throw new Error(`Missing popup listener for ${eventName}`);
  }
  listener({ payload });
}

describe("usePopupWindow", () => {
  beforeEach(() => {
    popupMocks.emitTo.mockClear();
    popupMocks.getByLabel.mockClear();
    popupMocks.hide.mockClear();
    popupMocks.listeners.clear();
    popupMocks.setFocus.mockClear();
    popupMocks.setPosition.mockClear();
    popupMocks.setSize.mockClear();
    popupMocks.show.mockClear();
    popupMocks.windowOptions = null;
  });

  it("uses the current monitor origin and ignores events from stale sessions", async () => {
    const anchorElement = document.createElement("button");
    anchorElement.getBoundingClientRect = () => ({
      bottom: 60,
      height: 40,
      left: 100,
      right: 140,
      toJSON: () => ({}),
      top: 20,
      width: 40,
      x: 100,
      y: 20,
    });
    const onAction = vi.fn();
    const anchorRef = { current: anchorElement };
    const { result } = renderHook(() => usePopupWindow({
      anchorRef,
      height: 320,
      label: "quick-actions-popup",
      onAction,
      popupType: "quick-actions",
      url: "/popup.html",
      width: 260,
    }));

    await act(async () => {
      await result.current.open({ payload: { distro: "Ubuntu" } });
    });

    expect(popupMocks.windowOptions).toMatchObject({ x: -1700, y: 164 });

    await act(async () => {
      dispatchPopupEvent("popup-ready", { popupType: "quick-actions" });
      await Promise.resolve();
    });
    const firstInitPayload = popupMocks.emitTo.mock.calls.find(
      (call) => call[1] === "popup-init",
    )?.[2] as { sessionId: string };

    await act(async () => {
      await result.current.open({ payload: { distro: "Debian" } });
    });
    const initCalls = popupMocks.emitTo.mock.calls.filter((call) => call[1] === "popup-init");
    const secondInitPayload = initCalls[initCalls.length - 1]?.[2] as { sessionId: string };

    act(() => {
      dispatchPopupEvent("popup-action-selected", {
        actionId: "restart",
        popupType: "quick-actions",
        sessionId: firstInitPayload.sessionId,
      });
    });
    expect(onAction).not.toHaveBeenCalled();

    act(() => {
      dispatchPopupEvent("popup-action-selected", {
        actionId: "restart",
        popupType: "quick-actions",
        sessionId: secondInitPayload.sessionId,
      });
    });
    expect(onAction).toHaveBeenCalledWith("restart");
  });

  it("hides an open popup when an ancestor scrolls", async () => {
    const anchorElement = document.createElement("button");
    document.body.appendChild(anchorElement);
    const anchorRef = { current: anchorElement };
    const { result, unmount } = renderHook(() => usePopupWindow({
      anchorRef,
      height: 320,
      label: "quick-actions-popup",
      popupType: "quick-actions",
      url: "/popup.html",
      width: 260,
    }));

    await act(async () => {
      await result.current.open();
      dispatchPopupEvent("popup-ready", { popupType: "quick-actions" });
      await Promise.resolve();
    });
    const initPayload = popupMocks.emitTo.mock.calls.find(
      (call) => call[1] === "popup-init",
    )?.[2] as { sessionId: string };

    await act(async () => {
      dispatchPopupEvent("popup-content-ready", {
        popupType: "quick-actions",
        sessionId: initPayload.sessionId,
      });
      await Promise.resolve();
    });
    expect(result.current.isOpen).toBe(true);

    act(() => {
      anchorElement.dispatchEvent(new Event("scroll", { bubbles: false }));
    });

    expect(popupMocks.hide).toHaveBeenCalled();
    expect(result.current.isOpen).toBe(false);
    unmount();
    anchorElement.remove();
  });
});
