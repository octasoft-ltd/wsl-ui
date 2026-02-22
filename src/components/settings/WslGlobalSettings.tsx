/**
 * WSL Global Settings Component
 *
 * Settings that apply to the entire WSL2 installation.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { wslService } from "../../services/wslService";
import { useSettingsStore } from "../../store/settingsStore";
import type { WslConfig } from "../../types/settings";
import { DEFAULT_WSL_CONFIG } from "../../types/settings";
import { Toggle, SettingInput } from "./FormControls";
import { CPUIcon, SettingsIcon, NetworkIcon, DownloadIcon, ExternalLinkIcon } from "../icons";
import { logger } from "../../utils/logger";

export function WslGlobalSettings() {
  const { t } = useTranslation("settings");
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
            <h3 className="text-sm font-medium text-theme-text-primary">{t('wslGlobal.windowsSettings')}</h3>
            <p className="text-xs text-theme-text-muted">{t('wslGlobal.windowsSettingsDesc')}</p>
          </div>
        </div>
        <button
          onClick={openWindowsWslSettings}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-theme-text-primary bg-theme-bg-tertiary hover:bg-theme-bg-hover border border-theme-border-secondary rounded-lg transition-colors"
        >
          <ExternalLinkIcon size="sm" />
          <span>{t('wslGlobal.open')}</span>
        </button>
      </div>

      <div className="relative overflow-hidden bg-linear-to-br from-amber-900/30 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-amber-700/30 rounded-xl p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent" />
        <p className="relative text-sm text-theme-status-warning">
          {t('wslGlobal.restartNote')}
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
              <h3 className="text-lg font-medium text-theme-text-primary">{t('wslGlobal.resources')}</h3>
              <p className="text-sm text-theme-text-muted">{t('wslGlobal.resourcesDesc')}</p>
            </div>
          </div>
          <div className="space-y-1 divide-y divide-theme-border-primary/50">
            <SettingInput
              label={t('wslGlobal.memory')}
              description={t('wslGlobal.memoryDesc')}
              value={config.memory || ""}
              onChange={(v) => updateConfig("memory", v || undefined)}
              placeholder="e.g., 8GB"
              testId="wsl-memory"
            />
            <SettingInput
              label={t('wslGlobal.processors')}
              description={t('wslGlobal.processorsDesc')}
              value={config.processors?.toString() || ""}
              onChange={(v) => updateConfig("processors", v ? parseInt(v) : undefined)}
              placeholder="e.g., 4"
              type="number"
              testId="wsl-processors"
            />
            <SettingInput
              label={t('wslGlobal.swap')}
              description={t('wslGlobal.swapDesc')}
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
              <h3 className="text-lg font-medium text-theme-text-primary">{t('wslGlobal.features')}</h3>
              <p className="text-sm text-theme-text-muted">{t('wslGlobal.featuresDesc')}</p>
            </div>
          </div>
          <div className="space-y-1 divide-y divide-theme-border-primary/50">
            <Toggle
              label={t('wslGlobal.guiApplications')}
              description={t('wslGlobal.guiApplicationsDesc')}
              checked={config.guiApplications ?? true}
              onChange={(v) => updateConfig("guiApplications", v)}
              testId="wsl-gui-apps"
            />
            <Toggle
              label={t('wslGlobal.localhostForwarding')}
              description={t('wslGlobal.localhostForwardingDesc')}
              checked={config.localhostForwarding ?? true}
              onChange={(v) => updateConfig("localhostForwarding", v)}
              testId="wsl-localhost-forwarding"
            />
            <Toggle
              label={t('wslGlobal.nestedVirtualization')}
              description={t('wslGlobal.nestedVirtualizationDesc')}
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
              <h3 className="text-lg font-medium text-theme-text-primary">{t('wslGlobal.networking')}</h3>
              <p className="text-sm text-theme-text-muted">{t('wslGlobal.networkingDesc')}</p>
            </div>
          </div>
          <div className="space-y-1">
            <div className="py-3">
              <label className="block text-sm font-medium text-theme-text-primary mb-1">{t('wslGlobal.networkingMode')}</label>
              <p className="text-xs text-theme-text-muted mb-2">{t('wslGlobal.networkingModeDesc')}</p>
              <select
                value={config.networkingMode || "NAT"}
                onChange={(e) => updateConfig("networkingMode", e.target.value)}
                data-testid="wsl-networking-mode-select"
                className="w-full px-3 py-2 bg-theme-bg-secondary/50 border border-theme-border-secondary rounded-lg text-theme-text-primary focus:outline-hidden focus:border-purple-500"
              >
                <option value="NAT">{t('wslGlobal.natDefault')}</option>
                <option value="mirrored">{t('wslGlobal.mirrored')}</option>
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
              <h3 className="text-lg font-medium text-theme-text-primary">{t('wslGlobal.updates')}</h3>
              <p className="text-sm text-theme-text-muted">{t('wslGlobal.updatesDesc')}</p>
            </div>
          </div>
          <div className="space-y-1 divide-y divide-theme-border-primary/50">
            <Toggle
              label={t('wslGlobal.preReleaseUpdates')}
              description={t('wslGlobal.preReleaseUpdatesDesc')}
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
              {t('common:button.dismiss')}
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={isSaving}
            data-testid="wsl-save-button"
            className="px-6 py-3 bg-theme-accent-primary hover:opacity-90 text-theme-bg-primary font-medium rounded-lg shadow-lg shadow-black/30 transition-colors disabled:opacity-50"
          >
            {isSaving ? t('wslGlobal.saving') : error ? t('wslGlobal.retrySave') : t('wslGlobal.saveChanges')}
          </button>
        </div>
      )}
    </div>
  );
}





