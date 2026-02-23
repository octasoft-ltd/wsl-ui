/**
 * WSL Per-Distribution Settings Component
 *
 * Settings that apply to individual WSL distributions (wsl.conf).
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { wslService } from "../../services/wslService";
import { useDistroStore } from "../../store/distroStore";
import type { WslConf } from "../../types/settings";
import { DEFAULT_WSL_CONF } from "../../types/settings";
import { Toggle, SettingInput } from "./FormControls";
import { FolderIcon, NetworkIcon, TerminalIcon, SparklesIcon, UserIcon } from "../icons";
import { logger } from "../../utils/logger";

export function WslDistroSettings() {
  const { t } = useTranslation("settings");
  const { distributions } = useDistroStore();
  const [selectedDistro, setSelectedDistro] = useState<string>("");
  const [config, setConfig] = useState<WslConf>(DEFAULT_WSL_CONF);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (distributions.length > 0 && !selectedDistro) {
      setSelectedDistro(distributions[0].name);
    }
  }, [distributions, selectedDistro]);

  useEffect(() => {
    if (selectedDistro) {
      loadConfig(selectedDistro);
    }
  }, [selectedDistro]);

  const loadConfig = async (distroName: string) => {
    setIsLoading(true);
    setHasChanges(false);
    setError(null);
    try {
      // Find the distribution to get its id for more reliable identification
      const distro = distributions.find(d => d.name === distroName);
      const loaded = await wslService.getWslConf(distroName, distro?.id);
      setConfig(loaded);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('wslDistro.loadError');
      logger.error("Failed to load wsl.conf:", "WslDistroSettings", err);
      setError(message);
      setConfig(DEFAULT_WSL_CONF);
    } finally {
      setIsLoading(false);
    }
  };

  const updateConfig = <K extends keyof WslConf>(key: K, value: WslConf[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
    setHasChanges(true);
    setError(null); // Clear error when user makes changes
  };

  const handleSave = async () => {
    if (!selectedDistro) return;
    setIsSaving(true);
    setError(null);
    try {
      await wslService.saveWslConf(selectedDistro, config);
      setHasChanges(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : t('wslDistro.saveError');
      logger.error("Failed to save wsl.conf:", "WslDistroSettings", err);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (distributions.length === 0) {
    return (
      <div className="text-center py-12 text-theme-text-muted">
        <p>{t('wslDistro.noDistros')}</p>
        <p className="text-sm">{t('wslDistro.noDistrosHint')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="wsl-distro-settings">
      <div className="relative overflow-hidden bg-linear-to-br from-amber-900/30 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-amber-700/30 rounded-xl p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent" />
        <div className="relative text-sm text-theme-status-warning space-y-1">
          <p>
            {t('wslDistro.noteWslConf')}
          </p>
          <p>
            {t('wslDistro.noteRestart')}
          </p>
        </div>
      </div>

      {/* Distribution selector */}
      <div className="relative overflow-hidden bg-linear-to-br from-orange-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-orange-800/30 rounded-xl p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent" />
        <div className="relative">
          <label className="block text-sm font-medium text-theme-text-primary mb-2">{t('wslDistro.selectDistro')}</label>
          <select
            value={selectedDistro}
            onChange={(e) => setSelectedDistro(e.target.value)}
            data-testid="distro-settings-selector"
            className="w-full px-3 py-2 bg-theme-bg-secondary/50 border border-theme-border-secondary rounded-lg text-theme-text-primary focus:outline-hidden focus:border-theme-accent-primary"
          >
            {distributions.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} {d.isDefault ? t('wslDistro.defaultIndicator') : ""}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="w-8 h-8 border-2 border-theme-border-secondary border-t-theme-accent-primary rounded-full animate-spin" />
        </div>
      ) : (
        <>
          <section className="relative overflow-hidden bg-linear-to-br from-blue-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-blue-800/30 rounded-xl p-6">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-linear-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
                  <FolderIcon className="text-white" size="md" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-theme-text-primary">{t('wslDistro.automount')}</h3>
                  <p className="text-sm text-theme-text-muted">{t('wslDistro.automountDesc')}</p>
                </div>
              </div>
              <div className="space-y-1 divide-y divide-theme-border-primary/50">
                <Toggle
                  label={t('wslDistro.automountEnabled')}
                  description={t('wslDistro.automountEnabledDesc')}
                  checked={config.automountEnabled ?? true}
                  onChange={(v) => updateConfig("automountEnabled", v)}
                  testId="distro-automount-enabled"
                />
                <Toggle
                  label={t('wslDistro.automountFstab')}
                  description={t('wslDistro.automountFstabDesc')}
                  checked={config.automountMountFsTab ?? true}
                  onChange={(v) => updateConfig("automountMountFsTab", v)}
                  testId="distro-mount-fstab"
                />
                <SettingInput
                  label={t('wslDistro.automountRoot')}
                  description={t('wslDistro.automountRootDesc')}
                  value={config.automountRoot || ""}
                  onChange={(v) => updateConfig("automountRoot", v || undefined)}
                  placeholder="/mnt/"
                  testId="distro-mount-root"
                />
                <SettingInput
                  label={t('wslDistro.automountOptions')}
                  description={t('wslDistro.automountOptionsDesc')}
                  value={config.automountOptions || ""}
                  onChange={(v) => updateConfig("automountOptions", v || undefined)}
                  placeholder="metadata,uid=1000,gid=1000"
                  testId="distro-mount-options"
                />
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden bg-linear-to-br from-emerald-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-emerald-800/30 rounded-xl p-6">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/30">
                  <NetworkIcon className="text-white" size="md" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-theme-text-primary">{t('wslDistro.network')}</h3>
                  <p className="text-sm text-theme-text-muted">{t('wslDistro.networkDesc')}</p>
                </div>
              </div>
              <div className="space-y-1 divide-y divide-theme-border-primary/50">
                <Toggle
                  label={t('wslDistro.generateHosts')}
                  description={t('wslDistro.generateHostsDesc')}
                  checked={config.networkGenerateHosts ?? true}
                  onChange={(v) => updateConfig("networkGenerateHosts", v)}
                  testId="distro-generate-hosts"
                />
                <Toggle
                  label={t('wslDistro.generateResolvConf')}
                  description={t('wslDistro.generateResolvConfDesc')}
                  checked={config.networkGenerateResolvConf ?? true}
                  onChange={(v) => updateConfig("networkGenerateResolvConf", v)}
                  testId="distro-generate-resolv"
                />
                <SettingInput
                  label={t('wslDistro.hostname')}
                  description={t('wslDistro.hostnameDesc')}
                  value={config.networkHostname || ""}
                  onChange={(v) => updateConfig("networkHostname", v || undefined)}
                  placeholder={t('wslDistro.hostnamePlaceholder')}
                  testId="distro-hostname"
                />
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden bg-linear-to-br from-purple-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-purple-800/30 rounded-xl p-6">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-500/10 via-transparent to-transparent" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-linear-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
                  <TerminalIcon className="text-white" size="md" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-theme-text-primary">{t('wslDistro.interop')}</h3>
                  <p className="text-sm text-theme-text-muted">{t('wslDistro.interopDesc')}</p>
                </div>
              </div>
              <div className="space-y-1 divide-y divide-theme-border-primary/50">
                <Toggle
                  label={t('wslDistro.interopEnabled')}
                  description={t('wslDistro.interopEnabledDesc')}
                  checked={config.interopEnabled ?? true}
                  onChange={(v) => updateConfig("interopEnabled", v)}
                  testId="distro-interop-enabled"
                />
                <Toggle
                  label={t('wslDistro.appendWindowsPath')}
                  description={t('wslDistro.appendWindowsPathDesc')}
                  checked={config.interopAppendWindowsPath ?? true}
                  onChange={(v) => updateConfig("interopAppendWindowsPath", v)}
                  testId="distro-append-path"
                />
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden bg-linear-to-br from-amber-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-amber-800/30 rounded-xl p-6">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-linear-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg shadow-amber-900/30">
                  <SparklesIcon className="text-white" size="md" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-theme-text-primary">{t('wslDistro.boot')}</h3>
                  <p className="text-sm text-theme-text-muted">{t('wslDistro.bootDesc')}</p>
                </div>
              </div>
              <div className="space-y-1 divide-y divide-theme-border-primary/50">
                <Toggle
                  label={t('wslDistro.systemd')}
                  description={t('wslDistro.systemdDesc')}
                  checked={config.bootSystemd ?? true}
                  onChange={(v) => updateConfig("bootSystemd", v)}
                  testId="distro-systemd"
                />
                <SettingInput
                  label={t('wslDistro.bootCommand')}
                  description={t('wslDistro.bootCommandDesc')}
                  value={config.bootCommand || ""}
                  onChange={(v) => updateConfig("bootCommand", v || undefined)}
                  placeholder={t('wslDistro.bootCommandPlaceholder')}
                  testId="distro-boot-command"
                />
              </div>
            </div>
          </section>

          <section className="relative overflow-hidden bg-linear-to-br from-cyan-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-cyan-800/30 rounded-xl p-6">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent" />
            <div className="relative">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
                  <UserIcon className="text-white" size="md" />
                </div>
                <div>
                  <h3 className="text-lg font-medium text-theme-text-primary">{t('wslDistro.user')}</h3>
                  <p className="text-sm text-theme-text-muted">{t('wslDistro.userDesc')}</p>
                </div>
              </div>
              <div className="space-y-1">
                <SettingInput
                  label={t('wslDistro.defaultUser')}
                  description={t('wslDistro.defaultUserDesc')}
                  value={config.userDefault || ""}
                  onChange={(v) => updateConfig("userDefault", v || undefined)}
                  placeholder={t('wslDistro.defaultUserPlaceholder')}
                  testId="distro-default-user"
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-xl" data-testid="distro-config-error">
              <p className="text-sm text-red-400">
                <span className="font-medium">{t('wslDistro.errorLabel')}</span> {error}
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
                data-testid="distro-save-button"
                className="px-6 py-3 bg-theme-accent-primary hover:opacity-90 text-theme-bg-primary font-medium rounded-lg shadow-lg shadow-black/30 transition-colors disabled:opacity-50"
              >
                {isSaving ? t('wslDistro.saving') : error ? t('wslDistro.retrySave') : t('wslDistro.saveChanges')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}





