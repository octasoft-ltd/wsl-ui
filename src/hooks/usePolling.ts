import { useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { usePollingStore } from "../store/pollingStore";
import { useHealthStore } from "../store/healthStore";
import { useSettingsStore } from "../store/settingsStore";
import { usePreflightStore } from "../store/preflightStore";
import { logger } from "../utils/logger";

/**
 * Hook to manage polling lifecycle with visibility detection.
 * Should be called once at the app root level (App.tsx).
 *
 * Features:
 * - Starts polling on mount
 * - Pauses when window loses focus (minimized to tray, etc.)
 * - Resumes when window gains focus
 * - Syncs polling intervals from settings
 * - Fetches WSL version once on mount
 */
export function usePolling() {
  const hasStarted = useRef(false);

  // Get stable function references from stores (these don't change)
  const start = usePollingStore((state) => state.start);
  const stop = usePollingStore((state) => state.stop);
  const pause = usePollingStore((state) => state.pause);
  const resume = usePollingStore((state) => state.resume);
  const fetchVersion = useHealthStore((state) => state.fetchVersion);

  // Get settings - only subscribe to what we need
  const pollingIntervals = useSettingsStore((state) => state.settings.pollingIntervals);
  const pollingEnabled = useSettingsStore((state) => state.settings.pollingEnabled);
  const isRunning = usePollingStore((state) => state.isRunning);

  // Get preflight status
  const wslReady = usePreflightStore((state) => state.isReady);

  // Start polling on mount (polling itself checks preflight before each poll)
  useEffect(() => {
    if (!hasStarted.current) {
      hasStarted.current = true;
      logger.info("Initializing polling from usePolling hook", "usePolling");
      start();
    }

    return () => {
      stop();
      hasStarted.current = false;
    };
  }, [start, stop]);

  // Fetch version info once when WSL becomes ready
  const versionFetched = useRef(false);
  useEffect(() => {
    if (wslReady && !versionFetched.current) {
      versionFetched.current = true;
      logger.info("WSL ready, fetching version info", "usePolling");
      fetchVersion();
    }
  }, [wslReady, fetchVersion]);

  // Handle window focus changes (Tauri window API)
  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupFocusListener = async () => {
      try {
        const appWindow = getCurrentWindow();
        unlisten = await appWindow.onFocusChanged(({ payload: focused }) => {
          if (focused) {
            logger.debug("Window focused, resuming polls", "usePolling");
            resume();
          } else {
            logger.debug("Window unfocused, pausing polls", "usePolling");
            pause();
          }
        });
      } catch (error) {
        // Fallback to Page Visibility API if Tauri API not available (e.g., in browser dev mode)
        logger.debug("Tauri window API not available, using Page Visibility API", "usePolling");
        
        const handleVisibilityChange = () => {
          if (document.hidden) {
            logger.debug("App hidden, pausing polls", "usePolling");
            pause();
          } else {
            logger.debug("App visible, resuming polls", "usePolling");
            resume();
          }
        };

        document.addEventListener("visibilitychange", handleVisibilityChange);
        unlisten = () => document.removeEventListener("visibilitychange", handleVisibilityChange);
      }
    };

    setupFocusListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [pause, resume]);

  // Sync settings with polling intervals (only on settings change, not on every render)
  const intervalsRef = useRef(pollingIntervals);
  useEffect(() => {
    // Skip if intervals haven't changed
    if (
      intervalsRef.current.distros === pollingIntervals.distros &&
      intervalsRef.current.resources === pollingIntervals.resources &&
      intervalsRef.current.health === pollingIntervals.health
    ) {
      return;
    }
    intervalsRef.current = pollingIntervals;

    // Only update if different from current config
    const { config, updateInterval } = usePollingStore.getState();

    if (pollingIntervals.distros !== config.distros.defaultInterval) {
      updateInterval("distros", pollingIntervals.distros);
    }
    if (pollingIntervals.resources !== config.resources.defaultInterval) {
      updateInterval("resources", pollingIntervals.resources);
    }
    if (pollingIntervals.health !== config.health.defaultInterval) {
      updateInterval("health", pollingIntervals.health);
    }
  }, [pollingIntervals]);

  // Handle global polling enable/disable from settings
  useEffect(() => {
    const { setGlobalEnabled } = usePollingStore.getState();
    if (pollingEnabled && !isRunning) {
      setGlobalEnabled(true);
    } else if (!pollingEnabled && isRunning) {
      setGlobalEnabled(false);
    }
  }, [pollingEnabled, isRunning]);
}
