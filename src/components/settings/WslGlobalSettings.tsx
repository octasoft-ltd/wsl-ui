/**
 * WSL Global Settings Component
 *
 * Settings that apply to the entire WSL2 installation.
 */

import { useEffect, useState } from "react";
import { wslService } from "../../services/wslService";
import { useSettingsStore } from "../../store/settingsStore";
import type { WslConfig } from "../../types/settings";
import { DEFAULT_WSL_CONFIG } from "../../types/settings";
import { Toggle, SettingInput } from "./FormControls";
import { CPUIcon, SettingsIcon, NetworkIcon, DownloadIcon, ExternalLinkIcon } from "../icons";
import { logger } from "../../utils/logger";

export function WslGlobalSettings() {
  const [config, setConfig] = useState<WslConfig>(DEFAULT_WSL_CONFIG);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { settings, updateSetting } = useSettingsStore();

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const loaded = await wslService.getWslConfig();
      setConfig(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load WSL config";
      logger.error("Failed to load WSL config:", "WslGlobalSettings", err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const updateConfig = <K extends keyof WslConfig>(key: K, value: WslConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setError(null); // Clear error when user makes changes
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await wslService.saveWslConfig(config);
      setHasChanges(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save WSL config";
      logger.error("Failed to save WSL config:", "WslGlobalSettings", err);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-2 border-theme-border-secondary border-t-theme-accent-primary rounded-full animate-spin" />
      </div>
    );
  }

  const openWindowsWslSettings = async () => {
    try {
      await wslService.openWslSettings();
    } catch (error) {
      logger.error("Failed to open Windows WSL Settings:", "WslGlobalSettings", error);
    }
  };

  return (
    <div className="space-y-6" data-testid="wsl-global-settings">
      {/* Link to Windows WSL Settings app */}
      <div className="flex items-center justify-between p-4 bg-theme-bg-secondary/50 border border-theme-border-secondary rounded-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-linear-to-br from-slate-600 to-slate-700 flex items-center justify-center">
            <SettingsIcon className="text-white" size="md" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-theme-text-primary">Windows WSL Settings</h3>
            <p className="text-xs text-theme-text-muted">Open the native Windows Subsystem for Linux Settings app</p>
          </div>
        </div>
        <button
          onClick={openWindowsWslSettings}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-theme-text-primary bg-theme-bg-tertiary hover:bg-theme-bg-hover border border-theme-border-secondary rounded-lg transition-colors"
        >
          <ExternalLinkIcon size="sm" />
          <span>Open</span>
        </button>
      </div>

      <div className="relative overflow-hidden bg-linear-to-br from-amber-900/30 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-amber-700/30 rounded-xl p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent" />
        <p className="relative text-sm text-theme-status-warning">
          <span className="font-medium">Note:</span> Changes to global WSL settings require a full WSL restart
          (<code className="px-1 bg-amber-900/50 rounded-sm">wsl --shutdown</code>) to take effect.
        </p>
      </div>

      <section className="relative overflow-hidden bg-linear-to-br from-blue-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-blue-800/30 rounded-xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-linear-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
              <CPUIcon className="text-white" size="md" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-theme-text-primary">Resources</h3>
              <p className="text-sm text-theme-text-muted">Configure VM resource limits</p>
            </div>
          </div>
          <div className="space-y-1 divide-y divide-theme-border-primary/50">
            <SettingInput
              label="Memory Limit"
              description="Maximum memory for WSL2 VM (e.g., 4GB, 8GB)"
              value={config.memory || ""}
              onChange={(v) => updateConfig("memory", v || undefined)}
              placeholder="e.g., 8GB"
              testId="wsl-memory"
            />
            <SettingInput
              label="Processors"
              description="Number of CPU cores for WSL2"
              value={config.processors?.toString() || ""}
              onChange={(v) => updateConfig("processors", v ? parseInt(v) : undefined)}
              placeholder="e.g., 4"
              type="number"
              testId="wsl-processors"
            />
            <SettingInput
              label="Swap Size"
              description="Swap file size (e.g., 2GB, 4GB)"
              value={config.swap || ""}
              onChange={(v) => updateConfig("swap", v || undefined)}
              placeholder="e.g., 4GB"
              testId="wsl-swap"
            />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-linear-to-br from-emerald-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-emerald-800/30 rounded-xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/30">
              <SettingsIcon className="text-white" size="md" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-theme-text-primary">Features</h3>
              <p className="text-sm text-theme-text-muted">Enable WSL2 capabilities</p>
            </div>
          </div>
          <div className="space-y-1 divide-y divide-theme-border-primary/50">
            <Toggle
              label="GUI Applications"
              description="Enable support for WSLg (Linux GUI apps on Windows)"
              checked={config.guiApplications ?? true}
              onChange={(v) => updateConfig("guiApplications", v)}
              testId="wsl-gui-apps"
            />
            <Toggle
              label="Localhost Forwarding"
              description="Forward localhost ports from WSL to Windows"
              checked={config.localhostForwarding ?? true}
              onChange={(v) => updateConfig("localhostForwarding", v)}
              testId="wsl-localhost-forwarding"
            />
            <Toggle
              label="Nested Virtualization"
              description="Enable nested virtualization for running VMs inside WSL"
              checked={config.nestedVirtualization ?? false}
              onChange={(v) => updateConfig("nestedVirtualization", v)}
              testId="wsl-nested-virtualization"
            />
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-linear-to-br from-purple-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-purple-800/30 rounded-xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-500/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-linear-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
              <NetworkIcon className="text-white" size="md" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-theme-text-primary">Networking</h3>
              <p className="text-sm text-theme-text-muted">Network configuration</p>
            </div>
          </div>
          <div className="space-y-1">
            <div className="py-3">
              <label className="block text-sm font-medium text-theme-text-primary mb-1">Networking Mode</label>
              <p className="text-xs text-theme-text-muted mb-2">Network mode for WSL2</p>
              <select
                value={config.networkingMode || "NAT"}
                onChange={(e) => updateConfig("networkingMode", e.target.value)}
                data-testid="wsl-networking-mode-select"
                className="w-full px-3 py-2 bg-theme-bg-secondary/50 border border-theme-border-secondary rounded-lg text-theme-text-primary focus:outline-hidden focus:border-purple-500"
              >
                <option value="NAT">NAT (default)</option>
                <option value="mirrored">Mirrored</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      <section className="relative overflow-hidden bg-linear-to-br from-cyan-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-cyan-800/30 rounded-xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
              <DownloadIcon className="text-white" size="md" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-theme-text-primary">Updates</h3>
              <p className="text-sm text-theme-text-muted">WSL update preferences</p>
            </div>
          </div>
          <div className="space-y-1 divide-y divide-theme-border-primary/50">
            <Toggle
              label="Use Pre-Release Updates"
              description="Get early access to new WSL features when updating (may be less stable)"
              checked={settings.usePreReleaseUpdates}
              onChange={(v) => updateSetting("usePreReleaseUpdates", v)}
              testId="wsl-prerelease-updates"
            />
          </div>
        </div>
      </section>

      {error && (
        <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-xl" data-testid="wsl-config-error">
          <p className="text-sm text-red-400">
            <span className="font-medium">Error:</span> {error}
          </p>
        </div>
      )}

      {(hasChanges || error) && (
        <div className="sticky bottom-4 flex justify-end gap-3">
          {error && (
            <button
              onClick={() => setError(null)}
              className="px-4 py-3 bg-theme-bg-tertiary hover:bg-theme-bg-hover text-theme-text-secondary font-medium rounded-lg transition-colors"
            >
              Dismiss
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            data-testid="wsl-save-button"
            className="px-6 py-3 bg-theme-accent-primary hover:opacity-90 text-theme-bg-primary font-medium rounded-lg shadow-lg shadow-black/30 transition-colors disabled:opacity-50"
          >
            {isSaving ? "Saving..." : error ? "Retry Save" : "Save Changes"}
          </button>
        </div>
      )}
    </div>
  );
}





