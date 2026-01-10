/**
 * Executable Paths Settings Component
 *
 * Allows users to configure paths to system executables.
 */

import { open } from "@tauri-apps/plugin-dialog";
import { useSettingsStore } from "../../store/settingsStore";
import { TerminalIcon } from "../icons";
import { DEFAULT_EXECUTABLE_PATHS } from "../../types/settings";
import { SettingInput, SettingPathInput } from "./FormControls";


export function ExecutablePathsSettings() {
  const { settings, updateSetting } = useSettingsStore();

  const handlePathChange = (key: keyof typeof settings.executablePaths, value: string) => {
    updateSetting("executablePaths", {
      ...settings.executablePaths,
      [key]: value,
    });
  };

  const handleResetDefaults = async () => {
    await updateSetting("executablePaths", DEFAULT_EXECUTABLE_PATHS);
    await updateSetting("defaultInstallBasePath", "");
  };

  const handleBrowseInstallLocation = async () => {
    const selectedPath = await open({
      directory: true,
      multiple: false,
      title: "Select Default Installation Folder",
    });

    if (selectedPath && !Array.isArray(selectedPath)) {
      updateSetting("defaultInstallBasePath", selectedPath);
    }
  };

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden bg-linear-to-br from-cyan-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-cyan-800/30 rounded-xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
              <TerminalIcon size="md" className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-theme-text-primary">Executable Paths</h2>
              <p className="text-sm text-theme-text-muted">Configure paths to system commands</p>
            </div>
          </div>

          {/* Info box */}
          <div className="mb-6 p-4 bg-theme-bg-tertiary/50 border border-theme-border-secondary/50 rounded-lg">
            <p className="text-xs text-theme-text-muted">
              Override default executable paths if tools are installed in non-standard locations.
              Leave as default unless you have a specific reason to change them.
            </p>
          </div>

          {/* Core Commands */}
          <div className="mb-6 pb-6 border-b border-theme-border-secondary/50">
            <h3 className="text-sm font-medium text-theme-text-secondary mb-2">Core Commands</h3>
            <SettingInput
              className="font-mono text-sm"
              label="WSL"
              description="WSL CLI executable for all distribution operations"
              value={settings.executablePaths.wsl}
              placeholder="wsl"
              onChange={(v) => handlePathChange("wsl", v)}
            />
            <SettingInput
              className="font-mono text-sm"
              label="PowerShell"
              description="Used for system health monitoring, disk operations, and Windows Terminal Preview"
              value={settings.executablePaths.powershell}
              placeholder="powershell"
              onChange={(v) => handlePathChange("powershell", v)}
            />
          </div>

          {/* Terminal Commands */}
          <div className="mb-6 pb-6 border-b border-theme-border-secondary/50">
            <h3 className="text-sm font-medium text-theme-text-secondary mb-2">Terminal</h3>
            <SettingInput
              className="font-mono text-sm"
              label="Windows Terminal"
              description="Windows Terminal executable for opening distributions"
              value={settings.executablePaths.windowsTerminal}
              placeholder="wt"
              onChange={(v) => handlePathChange("windowsTerminal", v)}
            />
            <SettingInput
              className="font-mono text-sm"
              label="Command Prompt"
              description="Fallback terminal when Windows Terminal is not available"
              value={settings.executablePaths.cmd}
              placeholder="cmd"
              onChange={(v) => handlePathChange("cmd", v)}
            />
          </div>

          {/* File System */}
          <div className="mb-6 pb-6 border-b border-theme-border-secondary/50">
            <h3 className="text-sm font-medium text-theme-text-secondary mb-2">File System</h3>
            <SettingInput
              className="font-mono text-sm"
              label="File Explorer"
              description="Windows Explorer for browsing distribution files"
              value={settings.executablePaths.explorer}
              placeholder="explorer"
              onChange={(v) => handlePathChange("explorer", v)}
            />
            <SettingInput
              className="font-mono text-sm"
              label="WSL UNC Prefix"
              description="UNC path prefix for accessing WSL distribution filesystems"
              value={settings.executablePaths.wslUncPrefix}
              placeholder="\\wsl$"
              onChange={(v) => handlePathChange("wslUncPrefix", v)}
            />
          </div>

          {/* Installation */}
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-theme-text-secondary mb-2">Installation</h3>
            <SettingPathInput
              className="font-mono text-sm"
              label="Default Install Location"
              description="Base folder for new WSL distributions (import, clone, container images). Does not apply to Microsoft Store installs which use Windows-managed locations. Supports environment variables like %LOCALAPPDATA%."
              value={settings.defaultInstallBasePath}
              placeholder="%LOCALAPPDATA%\wsl"
              onChange={(v) => updateSetting("defaultInstallBasePath", v)}
              onBrowse={handleBrowseInstallLocation}
            />
          </div>

          {/* Reset to Defaults */}
          <div className="mt-6 pt-6 border-t border-theme-border-secondary/50 flex justify-end">
            <button
              onClick={handleResetDefaults}
              className="text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              Reset paths to defaults
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
