/**
 * Settings Page Component
 *
 * Main settings page with collapsible sidebar navigation.
 */

import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useSettingsStore } from "../store/settingsStore";
import { wslService, type WslVersionInfo } from "../services/wslService";
import { CustomActionsSettings } from "./CustomActionsSettings";
import { StartupActionsSettings } from "./StartupActionsSettings";
import { DistroSourcesSettings } from "./DistroSourcesSettings";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeIcon,
  TerminalIcon,
  ExternalLinkIcon,
  SettingsIcon,
  PaletteIcon,
  ServerIcon,
  FolderIcon,
  SparklesIcon,
  PlayIcon,
  GridIcon,
  DownloadIcon,
  InfoIcon,
  RefreshIcon,
  ClockIcon,
  WindowIcon,
  ShieldIcon,
} from "./icons";
import {
  SettingSection,
  WslGlobalSettings,
  WslDistroSettings,
  ThemeSettings,
  PollingSettings,
  TimeoutSettings,
  ExecutablePathsSettings,
  DistributionSourcesSettings,
  ContainerRuntimeSettings,
  PrivacySettings,
  IDE_PRESETS,
  TERMINAL_PRESETS,
  SETTINGS_TABS,
  getTerminalPresetsWithStatus,
} from "./settings";
import type { SettingsTab, SettingsIconName, PresetOption } from "./settings";

interface SettingsPageProps {
  onBack: () => void;
}

// Map icon names to components
const ICON_MAP: Record<SettingsIconName, React.FC<{ size?: "sm" | "md" | "lg"; className?: string }>> = {
  settings: SettingsIcon,
  palette: PaletteIcon,
  refresh: RefreshIcon,
  clock: ClockIcon,
  terminal: TerminalIcon,
  server: ServerIcon,
  folder: FolderIcon,
  sparkles: SparklesIcon,
  play: PlayIcon,
  grid: GridIcon,
  download: DownloadIcon,
  shield: ShieldIcon,
  info: InfoIcon,
};

const SETTINGS_TAB_STORAGE_KEY = "wslui-settings-active-tab";

export function SettingsPage({ onBack }: SettingsPageProps) {
  const { settings, loadSettings, updateSetting, saveSettings, isLoading } = useSettingsStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => {
    // Restore saved tab from localStorage
    const saved = localStorage.getItem(SETTINGS_TAB_STORAGE_KEY);
    if (saved && SETTINGS_TABS.some(tab => tab.id === saved)) {
      return saved as SettingsTab;
    }
    return "app";
  });
  const [wslVersion, setWslVersion] = useState<WslVersionInfo | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [terminalPresets, setTerminalPresets] = useState<PresetOption[]>(TERMINAL_PRESETS);

  // Persist active tab to localStorage
  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, tab);
  };

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  // Fetch installed terminals on component mount
  useEffect(() => {
    wslService.getInstalledTerminals()
      .then((terminals) => {
        setTerminalPresets(getTerminalPresetsWithStatus(terminals));
      })
      .catch(() => {
        // Keep default presets if detection fails
      });
  }, []);

  // Fetch WSL version and app version when About tab is active
  useEffect(() => {
    if (activeTab === "about") {
      wslService.getWslVersion().then(setWslVersion).catch(() => {});
      getVersion().then(setAppVersion).catch(() => {});
    }
  }, [activeTab]);

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <div
        className={`flex flex-col border-r border-(--border-primary) bg-(--bg-secondary)/50 transition-all duration-200 ${
          sidebarExpanded ? "w-56" : "w-16"
        }`}
      >
        {/* Sidebar Header */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-(--border-primary)">
          <button
            onClick={onBack}
            data-testid="back-button"
            className="p-2 text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-hover) rounded-lg transition-colors"
            title="Back"
          >
            <ChevronLeftIcon size="md" />
          </button>
          {sidebarExpanded && (
            <h1 className="text-lg font-semibold text-(--text-primary)">Settings</h1>
          )}
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {SETTINGS_TABS.map((tab) => {
            const IconComponent = ICON_MAP[tab.icon];
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => handleTabChange(tab.id)}
                data-testid={`settings-tab-${tab.id}`}
                title={!sidebarExpanded ? tab.label : undefined}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                  isActive
                    ? "bg-(--accent-primary)/10 text-(--accent-primary) border-r-2 border-(--accent-primary)"
                    : "text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-hover)"
                } ${sidebarExpanded ? "" : "justify-center"}`}
              >
                <IconComponent
                  size="md"
                  className={isActive ? "text-(--accent-primary)" : "text-(--text-muted)"}
                />
                {sidebarExpanded && (
                  <span className={`font-medium ${isActive ? "" : ""}`}>{tab.label}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Collapse Toggle */}
        <div className="border-t border-(--border-primary) p-2">
          <button
            onClick={() => setSidebarExpanded(!sidebarExpanded)}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-(--text-muted) hover:text-(--text-primary) hover:bg-(--bg-hover) rounded-lg transition-colors"
            title={sidebarExpanded ? "Collapse sidebar" : "Expand sidebar"}
          >
            {sidebarExpanded ? (
              <>
                <ChevronLeftIcon size="sm" />
                <span className="text-xs">Collapse</span>
              </>
            ) : (
              <ChevronRightIcon size="sm" />
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="p-6">
          <div className="max-w-2xl mx-auto">
            {activeTab === "app" && (
              <div className="space-y-8">
                <SettingSection
                  title="IDE Integration"
                  description="Choose your preferred code editor"
                  icon={<CodeIcon size="md" className="text-white" />}
                  iconGradient="from-violet-500 to-purple-600"
                  presets={IDE_PRESETS}
                  currentValue={settings.ideCommand}
                  onValueChange={(value) => updateSetting("ideCommand", value)}
                  savedCustomValue={settings.savedCustomIdeCommand}
                  onCustomValueSave={(value) => saveSettings({
                    ...settings,
                    ideCommand: value,
                    savedCustomIdeCommand: value,
                  })}
                  customPlaceholder={`"C:\\path\\to\\ide.exe" $WSL_PATH\\$DISTRO_NAME\\home`}
                  customHelpText={
                    <div className="space-y-2">
                      <p><strong>Note:</strong> Paths with spaces must be wrapped in quotes.</p>
                      <div>
                        <strong>Placeholders:</strong>
                        <ul className="list-disc list-inside ml-2 mt-1">
                          <li><code className="text-theme-accent-primary">$WSL_PATH</code> — expands to <code className="text-theme-text-secondary">\\wsl$</code></li>
                          <li><code className="text-theme-accent-primary">$DISTRO_NAME</code> — distribution name</li>
                        </ul>
                      </div>
                      <div>
                        <strong>Example (IntelliJ):</strong>
                        <code className="block mt-1 p-2 bg-theme-bg-tertiary rounded text-theme-text-secondary break-all">
                          "C:\Program Files\JetBrains\IntelliJ IDEA\bin\idea64.exe" $WSL_PATH\$DISTRO_NAME\home
                        </code>
                      </div>
                    </div>
                  }
                  isLoading={isLoading}
                />

                <SettingSection
                  title="Terminal"
                  description="Choose your preferred terminal application"
                  icon={<TerminalIcon size="md" className="text-white" />}
                  iconGradient="from-emerald-500 to-teal-600"
                  presets={terminalPresets}
                  currentValue={settings.terminalCommand}
                  onValueChange={(value) => updateSetting("terminalCommand", value)}
                  savedCustomValue={settings.savedCustomTerminalCommand}
                  onCustomValueSave={(value) => saveSettings({
                    ...settings,
                    terminalCommand: value,
                    savedCustomTerminalCommand: value,
                  })}
                  customPlaceholder="alacritty -e $WSL $DISTRO_ARGS"
                  customHelpText={
                    <div className="space-y-2">
                      <p><strong>Note:</strong> Paths with spaces must be wrapped in quotes.</p>
                      <div>
                        <strong>Placeholders:</strong>
                        <ul className="list-disc list-inside ml-2 mt-1">
                          <li><code className="text-theme-accent-primary">$WSL</code> — path to wsl.exe</li>
                          <li><code className="text-theme-accent-primary">$DISTRO_ARGS</code> — auto-expands to <code className="text-theme-text-secondary">--distribution-id &lt;guid&gt;</code> or <code className="text-theme-text-secondary">--system</code></li>
                        </ul>
                      </div>
                      <div>
                        <strong>Examples:</strong>
                        <ul className="list-disc list-inside ml-2 mt-1">
                          <li>Alacritty: <code className="text-theme-text-secondary">alacritty -e $WSL $DISTRO_ARGS</code></li>
                          <li>Kitty: <code className="text-theme-text-secondary">kitty $WSL $DISTRO_ARGS</code></li>
                          <li>WezTerm: <code className="text-theme-text-secondary">wezterm start -- $WSL $DISTRO_ARGS</code></li>
                        </ul>
                      </div>
                    </div>
                  }
                  isLoading={isLoading}
                />

                {/* Window Behavior Section */}
                <div className="relative overflow-hidden bg-linear-to-br from-blue-900/20 via-stone-900/50 to-stone-900/50 border border-blue-800/30 rounded-xl p-6">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
                        <WindowIcon size="md" className="text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-medium text-stone-100">Window Behavior</h2>
                        <p className="text-sm text-stone-500">Configure what happens when you close the window</p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <label className="flex items-center gap-3 p-4 bg-stone-800/50 rounded-lg border border-stone-700/50 cursor-pointer hover:bg-stone-800/70 transition-colors">
                        <input
                          type="radio"
                          name="closeAction"
                          value="ask"
                          checked={settings.closeAction === "ask"}
                          onChange={() => updateSetting("closeAction", "ask")}
                          className="w-4 h-4 text-blue-500 bg-stone-700 border-stone-600 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        <div>
                          <p className="text-sm font-medium text-stone-200">Ask every time</p>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Show a dialog to choose between minimizing to tray or quitting
                          </p>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-4 bg-stone-800/50 rounded-lg border border-stone-700/50 cursor-pointer hover:bg-stone-800/70 transition-colors">
                        <input
                          type="radio"
                          name="closeAction"
                          value="minimize"
                          checked={settings.closeAction === "minimize"}
                          onChange={() => updateSetting("closeAction", "minimize")}
                          className="w-4 h-4 text-blue-500 bg-stone-700 border-stone-600 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        <div>
                          <p className="text-sm font-medium text-stone-200">Always minimize to tray</p>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Hide the window to the system tray instead of closing
                          </p>
                        </div>
                      </label>

                      <label className="flex items-center gap-3 p-4 bg-stone-800/50 rounded-lg border border-stone-700/50 cursor-pointer hover:bg-stone-800/70 transition-colors">
                        <input
                          type="radio"
                          name="closeAction"
                          value="quit"
                          checked={settings.closeAction === "quit"}
                          onChange={() => updateSetting("closeAction", "quit")}
                          className="w-4 h-4 text-blue-500 bg-stone-700 border-stone-600 focus:ring-blue-500 focus:ring-offset-0"
                        />
                        <div>
                          <p className="text-sm font-medium text-stone-200">Always quit</p>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Close the application completely when clicking the X button
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>
                </div>

                {/* Debug Logging Section */}
                <div className="relative overflow-hidden bg-linear-to-br from-orange-900/20 via-stone-900/50 to-stone-900/50 border border-orange-800/30 rounded-xl p-6">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-orange-500/5 via-transparent to-transparent" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-linear-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-900/30">
                        <InfoIcon size="md" className="text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-medium text-stone-100">Troubleshooting</h2>
                        <p className="text-sm text-stone-500">Debug logging and diagnostics</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 bg-stone-800/50 rounded-lg border border-stone-700/50">
                        <div>
                          <p className="text-sm font-medium text-stone-200">Debug Logging</p>
                          <p className="text-xs text-stone-500 mt-0.5">
                            Enable verbose logs for troubleshooting. Logs more detail to help diagnose issues.
                          </p>
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input
                            type="checkbox"
                            checked={settings.debugLogging}
                            onChange={(e) => {
                              updateSetting("debugLogging", e.target.checked);
                              // Also update runtime log level immediately
                              wslService.setDebugLogging(e.target.checked);
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-stone-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-stone-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500" />
                        </label>
                      </div>

                      <button
                        onClick={async () => {
                          const logPath = await wslService.getLogPath();
                          wslService.openFolder(logPath);
                        }}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium text-stone-300 bg-stone-800/50 hover:bg-stone-700/50 border border-stone-700 rounded-lg transition-colors"
                      >
                        <FolderIcon size="sm" />
                        <span>Open Log Folder</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === "appearance" && <ThemeSettings />}

            {activeTab === "polling" && <PollingSettings />}

            {activeTab === "timeouts" && <TimeoutSettings />}

            {activeTab === "executables" && <ExecutablePathsSettings />}

            {activeTab === "wsl-global" && <WslGlobalSettings />}

            {activeTab === "wsl-distro" && <WslDistroSettings />}

            {activeTab === "actions" && <CustomActionsSettings />}

            {activeTab === "startup" && <StartupActionsSettings />}

            {activeTab === "distros" && <DistroSourcesSettings />}

            {activeTab === "sources" && (
              <div className="space-y-6">
                <ContainerRuntimeSettings />
                <DistributionSourcesSettings />
              </div>
            )}

            {activeTab === "privacy" && <PrivacySettings />}

            {activeTab === "about" && (
              <div className="space-y-6">
                {/* App Hero */}
                <section className="relative overflow-hidden bg-linear-to-br from-amber-900/30 via-stone-900/50 to-stone-900/50 border border-amber-800/30 rounded-xl p-8">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent" />
                  <div className="relative flex items-center gap-5">
                    <svg width="64" height="64" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-lg flex-shrink-0">
                      <defs>
                        <linearGradient id="aboutLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#f59e0b"/>
                          <stop offset="100%" stopColor="#d97706"/>
                        </linearGradient>
                      </defs>
                      <rect x="15" y="15" width="90" height="90" rx="18" fill="url(#aboutLogoGrad)"/>
                      <path d="M35 45 L55 60 L35 75" stroke="#1a1a1a" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round"/>
                      <rect x="62" y="70" width="26" height="5" rx="2.5" fill="#1a1a1a"/>
                    </svg>
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h2 className="text-2xl font-semibold text-stone-100">
                          WSL<span className="font-bold text-amber-500">UI</span>
                        </h2>
                        {appVersion && (
                          <span className="px-2 py-0.5 text-xs font-medium bg-amber-500/20 text-amber-400 rounded-full border border-amber-500/30">
                            v{appVersion}
                          </span>
                        )}
                      </div>
                      <p className="text-stone-400 mt-1">A lightweight desktop application to manage WSL distributions.</p>
                      <p className="text-stone-600 text-sm mt-1">Built with Tauri, React, and Rust.</p>
                    </div>
                  </div>
                  <div className="relative mt-6 pt-4 border-t border-stone-700/50 flex items-center justify-between">
                    <a
                      href="https://github.com/octasoft-ltd/wsl-ui"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-300 bg-stone-800/50 hover:bg-stone-700/50 border border-stone-700 rounded-lg transition-colors"
                    >
                      <ExternalLinkIcon size="sm" />
                      <span>View on GitHub</span>
                    </a>
                    <a
                      href="http://www.octasoft.co.uk"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-stone-400 hover:text-stone-200 transition-colors"
                    >
                      <span className="text-stone-500 text-sm">Developed by</span>
                      <img
                        src="/octasoft-logo.png"
                        alt="Octasoft Ltd"
                        className="h-6 w-6 rounded"
                      />
                      <span className="font-medium text-sm">Octasoft Ltd</span>
                    </a>
                  </div>
                </section>

                {/* License Info */}
                <section className="relative overflow-hidden bg-linear-to-br from-emerald-900/20 via-stone-900/50 to-stone-900/50 border border-emerald-800/30 rounded-xl p-6">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-lg bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/30">
                        <InfoIcon size="md" className="text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-medium text-stone-100">License</h2>
                        <p className="text-sm text-stone-500">Business Source License 1.1</p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <div className="bg-stone-900/30 rounded-lg p-4 border border-stone-800/50">
                        <p className="text-sm text-stone-300">
                          Free for personal use and organizations with annual revenue under{" "}
                          <span className="text-emerald-400 font-medium">$1,000,000 USD</span>.
                        </p>
                        <p className="text-xs text-stone-500 mt-2">
                          Converts to Apache License 2.0 four years after each release.
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        <a
                          href="https://github.com/octasoft-ltd/wsl-ui/blob/main/LICENSE"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-emerald-400 hover:text-emerald-300 bg-emerald-900/20 hover:bg-emerald-900/30 border border-emerald-800/50 rounded-lg transition-colors"
                        >
                          <ExternalLinkIcon size="sm" />
                          <span>View License</span>
                        </a>
                        <a
                          href="mailto:wsl-ui@octasoft.co.uk"
                          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-stone-400 hover:text-stone-300 bg-stone-800/50 hover:bg-stone-700/50 border border-stone-700 rounded-lg transition-colors"
                        >
                          <span>Commercial Licensing</span>
                        </a>
                      </div>
                    </div>
                  </div>
                </section>

                {/* WSL Version Info */}
                <section className="relative overflow-hidden bg-linear-to-br from-cyan-900/20 via-stone-900/50 to-stone-900/50 border border-cyan-800/30 rounded-xl p-6">
                  <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-cyan-500/5 via-transparent to-transparent" />
                  <div className="relative">
                    <div className="flex items-center gap-3 mb-5">
                      <div className="w-10 h-10 rounded-lg bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
                        <TerminalIcon size="md" className="text-white" />
                      </div>
                      <div>
                        <h2 className="text-lg font-medium text-stone-100">WSL Information</h2>
                        <p className="text-sm text-stone-500">Windows Subsystem for Linux</p>
                      </div>
                    </div>
                    {wslVersion ? (
                      <div className="text-sm space-y-2">
                        <div className="grid grid-cols-2 gap-x-6 gap-y-3 bg-stone-900/30 rounded-lg p-4 border border-stone-800/50">
                          <span className="text-stone-500">WSL Version</span>
                          <span className="text-cyan-300 font-mono">{wslVersion.wslVersion}</span>
                          <span className="text-stone-500">Kernel Version</span>
                          <span className="text-stone-200 font-mono">{wslVersion.kernelVersion}</span>
                          <span className="text-stone-500">WSLg Version</span>
                          <span className="text-stone-200 font-mono">{wslVersion.wslgVersion}</span>
                          <span className="text-stone-500">MSRDC Version</span>
                          <span className="text-stone-200 font-mono">{wslVersion.msrdcVersion}</span>
                          <span className="text-stone-500">Direct3D Version</span>
                          <span className="text-stone-300 font-mono text-xs">{wslVersion.direct3dVersion}</span>
                          <span className="text-stone-500">DXCore Version</span>
                          <span className="text-stone-300 font-mono text-xs">{wslVersion.dxcoreVersion}</span>
                          <span className="text-stone-500">Windows Version</span>
                          <span className="text-stone-200 font-mono">{wslVersion.windowsVersion}</span>
                        </div>
                        <div className="pt-3 mt-1">
                          <a
                            href="https://github.com/microsoft/WSL"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-cyan-400 hover:text-cyan-300 bg-cyan-900/20 hover:bg-cyan-900/30 border border-cyan-800/50 rounded-lg transition-colors"
                          >
                            <ExternalLinkIcon size="sm" />
                            <span>WSL on GitHub</span>
                          </a>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-stone-500 p-4">
                        <div className="w-4 h-4 border-2 border-cyan-600 border-t-cyan-400 rounded-full animate-spin" />
                        <span>Loading WSL information...</span>
                      </div>
                    )}
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
