import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { emitTo, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { loadLanguage } from "../i18n";

export interface PopupInitData<TPayload> {
  locale?: string;
  payload: TPayload;
  popupType: string;
  sessionId: string;
}

interface ActivePopupPayload<TPayload> {
  data: TPayload;
  sessionId: string;
}

export interface PopupHostProps<TPayload> {
  children: (payload: TPayload, requestAction: (actionId: string) => void) => ReactNode;
  popupType: string;
  /** Removes the application shell background so content owns popup visuals. */
  transparentSurface?: boolean;
}

/**
 * Shared popup-window runtime. It owns Tauri event transport and window
 * closing; feature popup content only receives data and emits actions.
 */
export function PopupHost<TPayload>({
  children,
  popupType,
  transparentSurface = false,
}: PopupHostProps<TPayload>) {
  const [activePayload, setActivePayload] = useState<ActivePopupPayload<TPayload> | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  const initGenerationRef = useRef(0);
  const closedRef = useRef(false);

  const hidePopupWindow = () => {
    getCurrentWindow().hide().catch((error) => {
      console.error("[PopupHost] Failed to hide popup window", error);
    });
  };

  const requestClose = () => {
    const sessionId = activeSessionRef.current;
    if (closedRef.current || !sessionId) {
      return;
    }
    closedRef.current = true;

    // The main window also hides this popup after receiving popup-close, but
    // hide locally first so a lost or delayed cross-window event cannot leave
    // an always-on-top menu visible after it loses focus.
    hidePopupWindow();
    emitTo("main", "popup-close", { popupType, sessionId }).catch((error) => {
      console.error("[PopupHost] Failed to request popup close", error);
    });
  };

  const requestAction = async (actionId: string) => {
    const sessionId = activeSessionRef.current;
    if (!sessionId) {
      return;
    }

    try {
      // Deliver the action first so the main window can open any follow-up
      // dialog before the local fallback hides the menu.
      await emitTo("main", "popup-action-selected", { actionId, popupType, sessionId });
    } catch (error) {
      console.error("[PopupHost] Failed to send popup action", error);
    } finally {
      // Do not send popup-close here: Tauri window events are delivered
      // independently, so a close event can overtake the action event and
      // make the main window discard that action. The action handler already
      // closes the popup; this local fallback only guarantees it is hidden.
      closedRef.current = true;
      hidePopupWindow();
    }
  };

  useEffect(() => {
    let unlistenInit: (() => void) | null = null;
    let unlistenFocus: (() => void) | null = null;
    let disposed = false;

    const initializeTransport = async () => {
      const initListener = await listen<PopupInitData<TPayload>>("popup-init", async (event) => {
        if (event.payload.popupType !== popupType) {
          return;
        }
        const initGeneration = initGenerationRef.current + 1;
        initGenerationRef.current = initGeneration;
        if (event.payload.locale) {
          try {
            await loadLanguage(event.payload.locale);
          } catch (error) {
            console.error("[PopupHost] Failed to load popup language", error);
          }
        }
        if (disposed || initGenerationRef.current !== initGeneration) {
          return;
        }
        activeSessionRef.current = event.payload.sessionId;
        closedRef.current = false;
        setActivePayload({ data: event.payload.payload, sessionId: event.payload.sessionId });
      });
      if (disposed) {
        initListener();
        return;
      }
      unlistenInit = initListener;

      const focusListener = await getCurrentWindow().onFocusChanged(({ payload: focused }) => {
        if (!focused) {
          requestClose();
        }
      });
      if (disposed) {
        focusListener();
        return;
      }
      unlistenFocus = focusListener;

      emitTo("main", "popup-ready", { popupType }).catch((error) => {
        console.error("[PopupHost] Failed to announce popup readiness", error);
      });
    };

    void initializeTransport();

    return () => {
      disposed = true;
      unlistenInit?.();
      unlistenFocus?.();
    };
  }, [popupType]);

  useEffect(() => {
    if (activePayload) {
      emitTo("main", "popup-content-ready", {
        popupType,
        sessionId: activePayload.sessionId,
      }).catch((error) => {
        console.error("[PopupHost] Failed to announce popup content readiness", error);
      });
    }
  }, [activePayload, popupType]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        requestClose();
      }
    };
    const handleWindowBlur = () => requestClose();

    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("blur", handleWindowBlur);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("blur", handleWindowBlur);
    };
  }, []);

  useEffect(() => {
    if (!transparentSurface) {
      return;
    }

    document.body.classList.add("popup-window-transparent-surface");
    return () => document.body.classList.remove("popup-window-transparent-surface");
  }, [transparentSurface]);

  if (!activePayload) {
    return null;
  }

  return (
    <Fragment key={activePayload.sessionId}>
      {children(activePayload.data, requestAction)}
    </Fragment>
  );
}
