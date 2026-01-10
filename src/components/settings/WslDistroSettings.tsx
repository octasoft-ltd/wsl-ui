/**
 * WSL Per-Distribution Settings Component
 *
 * Settings that apply to individual WSL distributions (wsl.conf).
 */

import { useEffect, useState } from "react";
import { wslService } from "../../services/wslService";
import { useDistroStore } from "../../store/distroStore";
import type { WslConf } from "../../types/settings";
import { DEFAULT_WSL_CONF } from "../../types/settings";
import { Toggle, SettingInput } from "./FormControls";
import { FolderIcon, NetworkIcon, TerminalIcon, SparklesIcon, UserIcon } from "../icons";
import { logger } from "../../utils/logger";

export function WslDistroSettings() {
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
      const message = err instanceof Error ? err.message : "Failed to load wsl.conf";
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
      const message = err instanceof Error ? err.message : "Failed to save wsl.conf";
      logger.error("Failed to save wsl.conf:", "WslDistroSettings", err);
      setError(message);
    } finally {
      setIsSaving(false);
    }
  };

  if (distributions.length === 0) {
    return (
      <div className="text-center py-12 text-theme-text-muted">
        <p>No distributions installed.</p>
        <p className="text-sm">Install a distribution to configure its settings.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="wsl-distro-settings">
      <div className="relative overflow-hidden bg-linear-to-br from-amber-900/30 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-amber-700/30 rounded-xl p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent" />
        <div className="relative text-sm text-theme-status-warning space-y-1">
          <p>
            <span className="font-medium">Note:</span> These settings are stored in{" "}
            <code className="px-1 py-0.5 bg-theme-bg-tertiary rounded text-xs">/etc/wsl.conf</code> inside each
            distribution. The distribution must be <span className="font-medium">running</span> to save changes
            (settings are written as root).
          </p>
          <p>
            Changes require a <span className="font-medium">restart</span> of the distribution to take effect.
          </p>
        </div>
      </div>

      {/* Distribution selector */}
      <div className="relative overflow-hidden bg-linear-to-br from-orange-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-orange-800/30 rounded-xl p-4">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent" />
        <div className="relative">
          <label className="block text-sm font-medium text-theme-text-primary mb-2">Select Distribution</label>
          <select
            value={selectedDistro}
            onChange={(e) => setSelectedDistro(e.target.value)}
            data-testid="distro-settings-selector"
            className="w-full px-3 py-2 bg-theme-bg-secondary/50 border border-theme-border-secondary rounded-lg text-theme-text-primary focus:outline-hidden focus:border-theme-accent-primary"
          >
            {distributions.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name} {d.isDefault ? "(default)" : ""}
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
                  <h3 className="text-lg font-medium text-theme-text-primary">Automount</h3>
                  <p className="text-sm text-theme-text-muted">Windows drive mounting</p>
                </div>
              </div>
              <div className="space-y-1 divide-y divide-theme-border-primary/50">
                <Toggle
                  label="Enable Automount"
                  description="Automatically mount Windows drives in WSL"
                  checked={config.automountEnabled ?? true}
                  onChange={(v) => updateConfig("automountEnabled", v)}
                  testId="distro-automount-enabled"
                />
                <Toggle
                  label="Mount fstab"
                  description="Process /etc/fstab for additional mounts"
                  checked={config.automountMountFsTab ?? true}
                  onChange={(v) => updateConfig("automountMountFsTab", v)}
                  testId="distro-mount-fstab"
                />
                <SettingInput
                  label="Mount Root"
                  description="Directory where Windows drives are mounted"
                  value={config.automountRoot || ""}
                  onChange={(v) => updateConfig("automountRoot", v || undefined)}
                  placeholder="/mnt/"
                  testId="distro-mount-root"
                />
                <SettingInput
                  label="Mount Options"
                  description="Additional mount options (e.g., metadata,uid=1000)"
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
                  <h3 className="text-lg font-medium text-theme-text-primary">Network</h3>
                  <p className="text-sm text-theme-text-muted">DNS and hostname settings</p>
                </div>
              </div>
              <div className="space-y-1 divide-y divide-theme-border-primary/50">
                <Toggle
                  label="Generate /etc/hosts"
                  description="Auto-generate hosts file from Windows"
                  checked={config.networkGenerateHosts ?? true}
                  onChange={(v) => updateConfig("networkGenerateHosts", v)}
                  testId="distro-generate-hosts"
                />
                <Toggle
                  label="Generate /etc/resolv.conf"
                  description="Auto-generate DNS resolver configuration"
                  checked={config.networkGenerateResolvConf ?? true}
                  onChange={(v) => updateConfig("networkGenerateResolvConf", v)}
                  testId="distro-generate-resolv"
                />
                <SettingInput
                  label="Hostname"
                  description="Custom hostname for this distribution"
                  value={config.networkHostname || ""}
                  onChange={(v) => updateConfig("networkHostname", v || undefined)}
                  placeholder="Leave empty for default"
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
                  <h3 className="text-lg font-medium text-theme-text-primary">Interop</h3>
                  <p className="text-sm text-theme-text-muted">Windows integration</p>
                </div>
              </div>
              <div className="space-y-1 divide-y divide-theme-border-primary/50">
                <Toggle
                  label="Enable Windows Interop"
                  description="Allow running Windows executables from Linux"
                  checked={config.interopEnabled ?? true}
                  onChange={(v) => updateConfig("interopEnabled", v)}
                  testId="distro-interop-enabled"
                />
                <Toggle
                  label="Append Windows PATH"
                  description="Add Windows PATH directories to Linux PATH"
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
                  <h3 className="text-lg font-medium text-theme-text-primary">Boot</h3>
                  <p className="text-sm text-theme-text-muted">Startup configuration</p>
                </div>
              </div>
              <div className="space-y-1 divide-y divide-theme-border-primary/50">
                <Toggle
                  label="Enable systemd"
                  description="Start systemd as the init system (requires WSL 0.67.6+)"
                  checked={config.bootSystemd ?? true}
                  onChange={(v) => updateConfig("bootSystemd", v)}
                  testId="distro-systemd"
                />
                <SettingInput
                  label="Boot Command"
                  description="Command to run on distribution boot"
                  value={config.bootCommand || ""}
                  onChange={(v) => updateConfig("bootCommand", v || undefined)}
                  placeholder="Optional startup command"
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
                  <h3 className="text-lg font-medium text-theme-text-primary">User</h3>
                  <p className="text-sm text-theme-text-muted">Default user settings</p>
                </div>
              </div>
              <div className="space-y-1">
                <SettingInput
                  label="Default User"
                  description="Default user when launching this distribution"
                  value={config.userDefault || ""}
                  onChange={(v) => updateConfig("userDefault", v || undefined)}
                  placeholder="e.g., ubuntu"
                  testId="distro-default-user"
                />
              </div>
            </div>
          </section>

          {error && (
            <div className="p-4 bg-red-900/30 border border-red-700/50 rounded-xl" data-testid="distro-config-error">
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
                data-testid="distro-save-button"
                className="px-6 py-3 bg-theme-accent-primary hover:opacity-90 text-theme-bg-primary font-medium rounded-lg shadow-lg shadow-black/30 transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving..." : error ? "Retry Save" : "Save Changes"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}





