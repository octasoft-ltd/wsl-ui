import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
/** Visibility for background reads. Mutations remain owned by application stores. */
export function useAppVisibility() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    let active = true;
    let sequence = 0;
    const listeners: (() => void)[] = [];
    let appWindow: ReturnType<typeof getCurrentWindow> | null = null;
    try {
      appWindow = getCurrentWindow();
    } catch {
      /* Browser development uses document visibility. */
    }
    const update = async () => {
      const request = ++sequence;
      if (document.hidden) {
        if (active) setVisible(false);
        return;
      }
      if (!appWindow) {
        if (active) setVisible(true);
        return;
      }
      try {
        const [shown, minimized] = await Promise.all([
          appWindow.isVisible(),
          appWindow.isMinimized(),
        ]);
        if (active && request === sequence)
          setVisible(shown && !minimized && !document.hidden);
      } catch {
        if (active && request === sequence) setVisible(false);
      }
    };
    const register = async () => {
      if (!appWindow) return;
      const add = async (pending: Promise<() => void>) => {
        const unlisten = await pending;
        if (active) listeners.push(unlisten);
        else unlisten();
      };
      try {
        await add(
          appWindow.onFocusChanged(({ payload }) => {
            if (!payload) {
              sequence++;
              if (active) setVisible(false);
            } else void update();
          }),
        );
        await add(
          appWindow.onResized(() => {
            void update();
          }),
        );
      } catch {
        /* document visibility remains active if native events are unavailable. */
      }
    };
    document.addEventListener("visibilitychange", update);
    void update();
    void register();
    return () => {
      active = false;
      sequence++;
      document.removeEventListener("visibilitychange", update);
      listeners.forEach((unlisten) => unlisten());
    };
  }, []);
  return visible;
}
