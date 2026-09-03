import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { emitTo, listen, type UnlistenFn } from "@tauri-apps/api/event";
import { currentMonitor, getCurrentWindow, LogicalPosition, LogicalSize } from "@tauri-apps/api/window";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { logger } from "../utils/logger";

interface PersistentPopupWindow {
  window: WebviewWindow;
  webviewReady: boolean;
}

interface ActivePopupController {
  hide: (restoreFocus?: boolean) => void;
  token: symbol;
}

interface PopupEventContext {
  popupType: string;
  sessionId: string;
}

interface PopupActionEvent extends PopupEventContext {
  actionId: string;
}

const POPUP_GAP_PX = 4;
const MAX_SCREEN_HEIGHT_RATIO = 0.8;

let persistentPopupWindow: PersistentPopupWindow | null = null;
let activePopupController: ActivePopupController | null = null;
let popupSessionSequence = 0;

function createPopupSessionId(label: string): string {
  popupSessionSequence += 1;
  return `${label}-${Date.now()}-${popupSessionSequence}`;
}

export interface PopupWindowOptions {
  anchorRef: RefObject<HTMLElement | null>;
  height: number;
  label: string;
  onAction?: (actionId: string) => void;
  onClose?: () => void;
  popupType: string;
  url: string;
  width: number;
}

export interface PopupWindowHandle {
  close: () => void;
  isOpen: boolean;
  open: (initData?: Record<string, unknown>) => Promise<void>;
}

/**
 * Estimates menu height while reserving enough room for any menu separators
 * and the popup's vertical padding.
 */
export function estimatePopupHeight(
  itemCount: number,
  screenHeight: number,
  itemHeight = 40,
  separatorCount = 1,
  paddingPx = 16,
): number {
  const contentHeight = itemCount * itemHeight + separatorCount * 8 + paddingPx;
  return Math.min(contentHeight, Math.round(screenHeight * MAX_SCREEN_HEIGHT_RATIO));
}

/**
 * Reuses one hidden WebviewWindow instead of recreating a WebView for every
 * menu interaction. New content is rendered before the hidden window is shown.
 */
export function usePopupWindow(options: PopupWindowOptions): PopupWindowHandle {
  const { anchorRef, height, label, onAction, onClose, popupType, url, width } = options;
  const [isOpen, setIsOpen] = useState(false);
  const activeTokenRef = useRef<symbol | null>(null);
  const listenersRef = useRef<UnlistenFn[]>([]);
  const openGenerationRef = useRef(0);
  const onActionRef = useRef(onAction);
  const onCloseRef = useRef(onClose);

  onActionRef.current = onAction;
  onCloseRef.current = onClose;

  const removeListeners = useCallback(() => {
    listenersRef.current.forEach((unlisten) => unlisten());
    listenersRef.current = [];
  }, []);

  const hide = useCallback((restoreFocus = true) => {
    const activeToken = activeTokenRef.current;
    openGenerationRef.current += 1;
    activeTokenRef.current = null;
    removeListeners();
    setIsOpen(false);

    if (activePopupController?.token === activeToken) {
      activePopupController = null;
    }

    persistentPopupWindow?.window.hide().catch((error) => {
      logger.warn("Failed to hide popup window", "usePopupWindow", error);
    });
    if (restoreFocus) {
      const focusTarget = anchorRef.current?.matches("button")
        ? anchorRef.current
        : anchorRef.current?.querySelector<HTMLElement>("button");
      focusTarget?.focus();
    }
    onCloseRef.current?.();
  }, [anchorRef, removeListeners]);

  const open = useCallback(async (initData: Record<string, unknown> = {}) => {
    const anchorElement = anchorRef.current;
    if (!anchorElement) {
      return;
    }

    activePopupController?.hide(false);

    const token = Symbol(label);
    const sessionId = createPopupSessionId(label);
    const openGeneration = openGenerationRef.current + 1;
    openGenerationRef.current = openGeneration;
    activeTokenRef.current = token;
    activePopupController = { hide, token };

    const isCurrentOpenRequest = () => (
      activeTokenRef.current === token && openGenerationRef.current === openGeneration
    );

    const requestListeners: UnlistenFn[] = [];
    const cleanupRequestListeners = () => {
      requestListeners.splice(0).forEach((unlisten) => unlisten());
    };
    const registerListener = async <TPayload,>(
      eventName: string,
      handler: (payload: TPayload) => void,
    ) => {
      const unlisten = await listen<TPayload>(eventName, (event) => handler(event.payload));
      if (!isCurrentOpenRequest()) {
        unlisten();
        cleanupRequestListeners();
        return false;
      }
      requestListeners.push(unlisten);
      return true;
    };

    const mainWindow = getCurrentWindow();
    const [windowPosition, scaleFactor, monitor] = await Promise.all([
      mainWindow.innerPosition(),
      mainWindow.scaleFactor(),
      currentMonitor(),
    ]);
    if (!isCurrentOpenRequest()) {
      return;
    }
    const anchorBounds = anchorElement.getBoundingClientRect();
    const monitorSize = monitor?.size;
    const monitorPosition = monitor?.position;
    const screenWidth = monitorSize ? monitorSize.width / scaleFactor : window.innerWidth;
    const screenHeight = monitorSize ? monitorSize.height / scaleFactor : window.innerHeight;
    const monitorLeft = monitorPosition ? monitorPosition.x / scaleFactor : 0;
    const monitorTop = monitorPosition ? monitorPosition.y / scaleFactor : 0;
    const monitorRight = monitorLeft + screenWidth;
    const monitorBottom = monitorTop + screenHeight;
    const popupHeight = Math.min(height, Math.round(screenHeight * MAX_SCREEN_HEIGHT_RATIO));
    const anchorScreenX = windowPosition.x / scaleFactor + anchorBounds.left;
    const belowAnchorY = windowPosition.y / scaleFactor + anchorBounds.bottom + POPUP_GAP_PX;
    const aboveAnchorY = windowPosition.y / scaleFactor + anchorBounds.top - popupHeight - POPUP_GAP_PX;
    const popupX = Math.max(monitorLeft, Math.min(anchorScreenX, monitorRight - width));
    const popupY = belowAnchorY + popupHeight <= monitorBottom
      ? belowAnchorY
      : Math.max(monitorTop, aboveAnchorY);

    const sendPopupData = async () => {
      await emitTo(label, "popup-init", {
        ...initData,
        popupType,
        sessionId,
      });
    };

    try {
      if (!await registerListener<Pick<PopupEventContext, "popupType">>("popup-ready", (payload) => {
        if (payload.popupType !== popupType || !isCurrentOpenRequest()) {
          return;
        }
        if (persistentPopupWindow) {
          persistentPopupWindow = { ...persistentPopupWindow, webviewReady: true };
        }
        void sendPopupData().catch((error) => {
          logger.error("Failed to initialize popup window", "usePopupWindow", error);
          hide();
        });
      })) {
        return;
      }

      if (!await registerListener<PopupActionEvent>("popup-action-selected", (payload) => {
        if (payload.popupType !== popupType || payload.sessionId !== sessionId || !isCurrentOpenRequest()) {
          return;
        }
        onActionRef.current?.(payload.actionId);
        hide(false);
      })) {
        return;
      }

      if (!await registerListener<PopupEventContext>("popup-close", (payload) => {
        if (payload.popupType === popupType && payload.sessionId === sessionId && isCurrentOpenRequest()) {
          hide();
        }
      })) {
        return;
      }

      if (!await registerListener<PopupEventContext>("popup-content-ready", (payload) => {
        if (payload.popupType !== popupType || payload.sessionId !== sessionId || !isCurrentOpenRequest()) {
          return;
        }
        persistentPopupWindow?.window.show()
          .then(() => persistentPopupWindow?.window.setFocus())
          .then(() => setIsOpen(true))
          .catch((error) => {
            logger.error("Failed to show popup window", "usePopupWindow", error);
            hide();
          });
      })) {
        return;
      }
    } catch (error) {
      cleanupRequestListeners();
      if (isCurrentOpenRequest()) {
        hide();
      }
      throw error;
    }

    if (!isCurrentOpenRequest()) {
      cleanupRequestListeners();
      return;
    }
    listenersRef.current = requestListeners;

    if (!persistentPopupWindow) {
      const popupWindow = new WebviewWindow(label, {
        alwaysOnTop: true,
        decorations: false,
        focus: false,
        height: popupHeight,
        resizable: false,
        skipTaskbar: true,
        transparent: true,
        url,
        visible: false,
        width,
        x: Math.round(popupX),
        y: Math.round(popupY),
      });

      persistentPopupWindow = { webviewReady: false, window: popupWindow };
      popupWindow.once("tauri://error", () => {
        persistentPopupWindow = null;
        hide();
      });
      popupWindow.once("tauri://destroyed", () => {
        persistentPopupWindow = null;
        hide();
      });
      return;
    }

    await Promise.all([
      persistentPopupWindow.window.setPosition(new LogicalPosition(popupX, popupY)),
      persistentPopupWindow.window.setSize(new LogicalSize(width, popupHeight)),
    ]);
    if (!isCurrentOpenRequest()) {
      return;
    }
    if (persistentPopupWindow.webviewReady) {
      await sendPopupData();
    }
  }, [anchorRef, height, hide, label, popupType, url, width]);

  useEffect(() => () => {
    if (activeTokenRef.current) {
      hide();
    }
  }, [hide]);

  return { close: hide, isOpen, open };
}
