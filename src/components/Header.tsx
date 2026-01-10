import { useState, useEffect } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useDistroStore } from "../store/distroStore";
import { ImportDialog } from "./ImportDialog";
import { NewDistroDialog } from "./NewDistroDialog";
import { ConfirmDialog } from "./ConfirmDialog";
import { PlusIcon, DownloadIcon, RefreshIcon, ShutdownIcon, SettingsIcon, TerminalWindowIcon, HelpIcon } from "./icons";
import { HelpDialog } from "./HelpDialog";
import { Button, IconButton } from "./ui/Button";
import { wslService, SystemDistroInfo } from "../services/wslService";

interface HeaderProps {
  onOpenSettings: () => void;
}

export function Header({ onOpenSettings }: HeaderProps) {
  const { shutdownAll, fetchDistros, openSystemTerminal, isLoading, actionInProgress, distributions } = useDistroStore();
  const [showImportDialog, setShowImportDialog] = useState(false);
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showShutdownConfirm, setShowShutdownConfirm] = useState(false);
  const [showHelpDialog, setShowHelpDialog] = useState(false);
  const [systemInfo, setSystemInfo] = useState<SystemDistroInfo | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [prevDistroCount, setPrevDistroCount] = useState<number | null>(null);

  // Fetch system distro info helper
  const fetchSystemInfo = () => {
    wslService.getSystemDistroInfo()
      .then(setSystemInfo)
      .catch(() => setSystemInfo(null));
  };

  // Fetch system distro info and app version on mount
  useEffect(() => {
    fetchSystemInfo();
    getVersion()
      .then(setAppVersion)
      .catch(() => setAppVersion(null));
  }, []);

  // Re-fetch system info when transitioning between 0 and 1+ distros
  useEffect(() => {
    const currentCount = distributions.length;

    // Skip the initial render (when prevDistroCount is null)
    if (prevDistroCount !== null) {
      // Detect 0→1 or 1→0 transitions
      const wasEmpty = prevDistroCount === 0;
      const isEmpty = currentCount === 0;

      if (wasEmpty !== isEmpty) {
        fetchSystemInfo();
      }
    }

    setPrevDistroCount(currentCount);
  }, [distributions.length]);

  const handleShutdownAll = async () => {
    setShowShutdownConfirm(false);
    await shutdownAll();
  };

  return (
    <>
      <header className="relative flex items-center justify-between px-6 py-4 border-b border-theme-border-primary bg-gradient-to-r from-theme-bg-primary via-theme-bg-secondary to-theme-bg-primary">
        {/* Ambient glow effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 left-1/4 w-96 h-32 bg-[#f97316]/5 blur-3xl rounded-full" />
          <div className="absolute top-0 right-1/4 w-64 h-24 bg-[#f59e0b]/5 blur-3xl rounded-full" />
        </div>

        {/* Left: Logo, title, and system info */}
        <div className="relative flex items-center gap-6">
          {/* Logo and title */}
          <div className="flex items-center gap-4">
            {/* Cyber-styled logo */}
            <div className="relative group">
              <div className="absolute inset-0 bg-[#f97316]/20 blur-xl rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
              <svg width="44" height="44" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="relative drop-shadow-lg">
                <defs>
                  <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#f59e0b"/>
                    <stop offset="100%" stopColor="#d97706"/>
                  </linearGradient>
                </defs>
                <rect x="15" y="15" width="90" height="90" rx="16" fill="url(#logoGrad)"/>
                <path d="M38 48 L58 60 L38 72" stroke="#1a1a1a" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round"/>
                <rect x="64" y="68" width="22" height="4" rx="2" fill="#1a1a1a"/>
              </svg>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-semibold tracking-tight text-theme-text-primary">
                  WSL<span className="font-bold text-[#f59e0b]">UI</span>
                </h1>
                {appVersion && (
                  <span className="px-1.5 py-0.5 text-[10px] font-medium bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30">
                    v{appVersion}
                  </span>
                )}
              </div>
              <p className="text-xs font-mono text-theme-text-muted tracking-wider uppercase whitespace-nowrap">
                Mission Control
              </p>
            </div>
          </div>

          {/* System Distro Info Box - hidden below lg breakpoint */}
          {systemInfo && (
            <div className="hidden lg:flex items-center gap-4">
              {/* Divider */}
              <div className="w-px h-8 bg-gradient-to-b from-transparent via-theme-border-secondary to-transparent" />

              <div
                className="px-2.5 py-1 bg-theme-bg-tertiary/50 border border-theme-border-secondary rounded-md cursor-help"
                title={`WSL2 System Distribution\n${systemInfo.name}\nVersion: ${systemInfo.version}`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-theme-text-muted font-mono">SYS</span>
                  <span className="text-[10px] text-theme-accent-primary font-mono font-medium">
                    {systemInfo.name}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[9px] uppercase tracking-wider text-theme-text-muted font-mono">VER</span>
                  <span className="text-[10px] text-theme-text-secondary font-mono">
                    {systemInfo.version}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right: Action buttons */}
        <div className="relative flex items-center gap-3">
          {/* Primary action - New */}
          <Button
            variant="success"
            size="sm"
            className="btn-cyber"
            icon={<PlusIcon size="sm" />}
            onClick={() => setShowNewDialog(true)}
            disabled={isLoading || !!actionInProgress}
            data-testid="new-distro-button"
          >
            New
          </Button>

          {/* Secondary actions */}
          <Button
            variant="accent"
            size="sm"
            className="btn-cyber"
            icon={<DownloadIcon size="sm" />}
            onClick={() => setShowImportDialog(true)}
            disabled={isLoading || !!actionInProgress}
            data-testid="import-button"
          >
            Import
          </Button>

          <Button
            variant="secondary"
            size="sm"
            className="btn-cyber"
            icon={<RefreshIcon size="sm" className={isLoading ? "animate-spin" : ""} />}
            onClick={() => fetchDistros()}
            disabled={isLoading || !!actionInProgress}
            data-testid="refresh-button"
          >
            Sync
          </Button>

          {/* Danger action */}
          <Button
            variant="danger"
            size="sm"
            className="btn-cyber"
            icon={<ShutdownIcon size="sm" />}
            onClick={() => setShowShutdownConfirm(true)}
            disabled={isLoading || !!actionInProgress}
            data-testid="shutdown-all-button"
          >
            Shutdown
          </Button>

          {/* Divider */}
          <div className="w-px h-8 bg-gradient-to-b from-transparent via-theme-border-secondary to-transparent mx-1" />

          {/* System Terminal */}
          <IconButton
            icon={<TerminalWindowIcon size="md" />}
            label="Open WSL System Shell"
            variant="ghost"
            colorScheme="amber"
            onClick={() => openSystemTerminal()}
            disabled={isLoading || !!actionInProgress}
            data-testid="system-terminal-button"
          />

          {/* Help */}
          <IconButton
            icon={<HelpIcon size="md" />}
            label="Help"
            variant="ghost"
            onClick={() => setShowHelpDialog(true)}
            data-testid="help-button"
          />

          {/* Settings */}
          <IconButton
            icon={<SettingsIcon size="md" />}
            label="Settings"
            variant="ghost"
            onClick={onOpenSettings}
            data-testid="settings-button"
          />
        </div>

        {/* Bottom accent line */}
        <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#f97316]/30 to-transparent" />
      </header>

      <ImportDialog isOpen={showImportDialog} onClose={() => setShowImportDialog(false)} />
      <NewDistroDialog isOpen={showNewDialog} onClose={() => setShowNewDialog(false)} />
      <ConfirmDialog
        isOpen={showShutdownConfirm}
        title="Shutdown All Distributions"
        message="This will shutdown all running WSL distributions. Any unsaved work will be lost."
        confirmLabel="Shutdown All"
        onConfirm={handleShutdownAll}
        onCancel={() => setShowShutdownConfirm(false)}
        danger
      />
      {showHelpDialog && <HelpDialog onClose={() => setShowHelpDialog(false)} />}
    </>
  );
}

