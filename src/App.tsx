import { useEffect, useState, useRef, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import { useDistroStore } from "./store/distroStore";
import { useMountStore } from "./store/mountStore";
import { useSettingsStore } from "./store/settingsStore";
import { useNotificationStore } from "./store/notificationStore";
import { usePreflightStore } from "./store/preflightStore";
import { usePolling } from "./hooks/usePolling";
import { Header } from "./components/Header";
import { DistroList } from "./components/DistroList";
import { StatusBar } from "./components/StatusBar";
import { SettingsPage } from "./components/SettingsPage";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { NotificationBanner } from "./components/NotificationBanner";
import { PreflightBanner } from "./components/PreflightBanner";
import { Button } from "./components/ui/Button";
import { DiskMountDialog } from "./components/DiskMountDialog";
import { ConfirmDialog } from "./components/ConfirmDialog";
import { CloseActionDialog } from "./components/CloseActionDialog";
import { TelemetryOptInDialog } from "./components/TelemetryOptInDialog";
import { wslService } from "./services/wslService";
import { trackAppStarted } from "./services/telemetryService";
import { info, debug } from "./utils/logger";

type AppPage = "main" | "settings";

function App() {
  const { distributions, fetchDistros, error, isTimeoutError, clearError, forceKillWsl, actionInProgress } = useDistroStore();
  const { showMountDialog, closeMountDialog, loadMountedDisks } = useMountStore();
  const { settings, loadSettings, updateSetting } = useSettingsStore();
  const { notifications, removeNotification } = useNotificationStore();
  const { checkPreflight, isReady: wslReady } = usePreflightStore();
  const [currentPage, setCurrentPage] = useState<AppPage>("main");
  const [showForceRestartConfirm, setShowForceRestartConfirm] = useState(false);
  const [showCloseDialog, setShowCloseDialog] = useState(false);
  const [showTelemetryOptIn, setShowTelemetryOptIn] = useState(false);
  const telemetryTrackedRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const mainContentRef = useRef<HTMLElement>(null);

  // Handle close action dialog
  const handleMinimize = useCallback(() => {
    setShowCloseDialog(false);
    wslService.hideWindow().catch((e) => {
      console.error("Failed to hide window:", e);
    });
  }, []);

  const handleQuit = useCallback(() => {
    setShowCloseDialog(false);
    wslService.quitApp().catch((e) => {
      console.error("Failed to quit app:", e);
    });
  }, []);

  const handleRememberChoice = useCallback((action: "minimize" | "quit") => {
    // Save the choice to settings
    updateSetting("closeAction", action);
  }, [updateSetting]);

  // Telemetry opt-in handlers
  const handleTelemetryAccept = useCallback(async () => {
    // Must await settings save before tracking, as Rust checks telemetry_enabled from disk
    await updateSetting("telemetryEnabled", true);
    await updateSetting("telemetryPromptSeen", true);
    setShowTelemetryOptIn(false);
    // Track app started now that settings are saved
    trackAppStarted(distributions.length);
  }, [updateSetting, distributions.length]);

  const handleTelemetryDecline = useCallback(async () => {
    await updateSetting("telemetryEnabled", false);
    await updateSetting("telemetryPromptSeen", true);
    setShowTelemetryOptIn(false);
  }, [updateSetting]);

  // Load settings and run preflight check on app start (before polling starts)
  useEffect(() => {
    info("[App] Application starting");
    loadSettings();
    // Run preflight check to verify WSL is installed
    checkPreflight();
  }, [loadSettings, checkPreflight]);

  // Show telemetry opt-in dialog if user hasn't seen it yet
  useEffect(() => {
    if (settings && !settings.telemetryPromptSeen) {
      // Delay slightly so user sees the app first
      const timer = setTimeout(() => {
        setShowTelemetryOptIn(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [settings]);

  // Track app_started event (once per session, if telemetry enabled)
  useEffect(() => {
    if (settings?.telemetryEnabled && settings?.telemetryPromptSeen && !telemetryTrackedRef.current) {
      telemetryTrackedRef.current = true;
      trackAppStarted(distributions.length);
    }
  }, [settings?.telemetryEnabled, settings?.telemetryPromptSeen, distributions.length]);

  // Scroll to top when error appears so user can see the error banner
  useEffect(() => {
    if (error && mainContentRef.current) {
      mainContentRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [error]);

  // Initialize centralized polling (handles distros, resources, health)
  usePolling();

  useEffect(() => {
    // Listen for state changes triggered by tray actions
    // This triggers an immediate refresh instead of waiting for the next poll
    debug("[App] Setting up distro-state-changed event listener");
    const unlisten = listen("distro-state-changed", () => {
      debug("[App] Received distro-state-changed event");
      // Clear any pending timeout to prevent multiple fetches
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
      }

      // Small delay to let WSL state settle after terminal opens
      timeoutRef.current = window.setTimeout(() => {
        fetchDistros();
        // Also refresh mounted disks (clears when WSL shuts down)
        loadMountedDisks();
        timeoutRef.current = null;
      }, 1000);
    });

    return () => {
      debug("[App] Cleaning up event listener");
      // Clean up event listener
      unlisten.then((fn) => fn());

      // Clear any pending timeout to prevent state updates after unmount
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [fetchDistros, loadMountedDisks]);

  // Listen for close-requested event from backend
  useEffect(() => {
    debug("[App] Setting up close-requested event listener");
    const unlisten = listen("close-requested", () => {
      debug("[App] Received close-requested event");
      setShowCloseDialog(true);
    });

    return () => {
      debug("[App] Cleaning up close-requested event listener");
      unlisten.then((fn) => fn());
    };
  }, []);

  if (currentPage === "settings") {
    return (
      <ErrorBoundary>
        <div className="flex flex-col h-screen">
          <SettingsPage onBack={() => setCurrentPage("main")} />
        </div>
        {/* Close dialog must be rendered on all pages */}
        <CloseActionDialog
          isOpen={showCloseDialog}
          onMinimize={handleMinimize}
          onQuit={handleQuit}
          onRememberChoice={handleRememberChoice}
        />
        {/* Telemetry opt-in dialog */}
        <TelemetryOptInDialog
          isOpen={showTelemetryOptIn}
          onAccept={handleTelemetryAccept}
          onDecline={handleTelemetryDecline}
        />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-col h-screen">
        <Header onOpenSettings={() => setCurrentPage("settings")} />
        <main ref={mainContentRef} className="flex-1 overflow-auto px-6 pb-6">
          {/* WSL Preflight Banner - shows when WSL is not installed/configured */}
          <PreflightBanner />
          {/* System Error Banner */}
          {error && wslReady && (
            <NotificationBanner
              type="error"
              title="System Error"
              message={error}
              onDismiss={clearError}
              testId="error-banner"
            >
              {isTimeoutError && (
                <div className="space-y-3">
                  <p className="text-xs text-theme-text-muted">
                    Tip: If you recently installed a new distribution, close any terminal windows that were automatically opened during installation.
                  </p>
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={() => setShowForceRestartConfirm(true)}
                    loading={actionInProgress?.includes("Force")}
                  >
                    Force Shutdown WSL
                  </Button>
                </div>
              )}
            </NotificationBanner>
          )}
          {/* Notifications */}
          {notifications.map((notification) => (
            <NotificationBanner
              key={notification.id}
              type={notification.type}
              title={notification.title}
              message={notification.message}
              autoDismiss={notification.autoDismiss}
              onDismiss={() => removeNotification(notification.id)}
            />
          ))}
          <DistroList />
        </main>
        <StatusBar />

        {/* Global Dialogs */}
        <DiskMountDialog isOpen={showMountDialog} onClose={closeMountDialog} />

        <ConfirmDialog
          isOpen={showForceRestartConfirm}
          title="Force Shutdown WSL"
          message="This will forcibly terminate all WSL processes using 'wsl --shutdown --force'. Any unsaved work in your Linux distributions may be lost. This action cannot be undone."
          confirmLabel="Force Shutdown"
          onConfirm={() => {
            setShowForceRestartConfirm(false);
            forceKillWsl();
          }}
          onCancel={() => setShowForceRestartConfirm(false)}
          danger
        />

        <CloseActionDialog
          isOpen={showCloseDialog}
          onMinimize={handleMinimize}
          onQuit={handleQuit}
          onRememberChoice={handleRememberChoice}
        />

        {/* Telemetry opt-in dialog */}
        <TelemetryOptInDialog
          isOpen={showTelemetryOptIn}
          onAccept={handleTelemetryAccept}
          onDecline={handleTelemetryDecline}
        />
      </div>
    </ErrorBoundary>
  );
}

export default App;
