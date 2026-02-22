/**
 * Timeout Settings Component
 *
 * Allows users to configure WSL command timeout values.
 */

import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../store/settingsStore";
import { ClockIcon } from "../icons";
import { DEFAULT_WSL_TIMEOUTS } from "../../types/settings";
import { SettingSelect } from "./FormControls";

// Timeout options in seconds
const QUICK_TIMEOUT_OPTIONS = [
  { value: 5, label: "5 seconds" },
  { value: 10, label: "10 seconds" },
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
];

const DEFAULT_TIMEOUT_OPTIONS = [
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
];

const LONG_TIMEOUT_OPTIONS = [
  { value: 300, label: "5 minutes" },
  { value: 600, label: "10 minutes" },
  { value: 900, label: "15 minutes" },
  { value: 1200, label: "20 minutes" },
  { value: 1800, label: "30 minutes" },
];

const SHELL_TIMEOUT_OPTIONS = [
  { value: 15, label: "15 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
  { value: 300, label: "5 minutes" },
];

const SUDO_TIMEOUT_OPTIONS = [
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
  { value: 180, label: "3 minutes" },
  { value: 300, label: "5 minutes" },
];


export function TimeoutSettings() {
  const { t } = useTranslation("settings");
  const { settings, updateSetting } = useSettingsStore();

  const handleTimeoutChange = (key: keyof typeof settings.wslTimeouts, value: number) => {
    updateSetting("wslTimeouts", {
      ...settings.wslTimeouts,
      [key]: value,
    });
  };

  const handleResetDefaults = () => {
    updateSetting("wslTimeouts", DEFAULT_WSL_TIMEOUTS);
  };

  return (
    <div className="space-y-8">
      {/* Timeout Section Header */}
      <section className="relative overflow-hidden bg-linear-to-br from-orange-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-orange-800/30 rounded-xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-linear-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-900/30">
              <ClockIcon size="md" className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-theme-text-primary">{t('timeouts.title')}</h2>
              <p className="text-sm text-theme-text-muted">{t('timeouts.description')}</p>
            </div>
          </div>

          {/* Info box */}
          <div className="mb-6 p-4 bg-theme-bg-tertiary/50 border border-theme-border-secondary/50 rounded-lg">
            <p className="text-xs text-theme-text-muted">
              {t('timeouts.infoBox')}
            </p>
          </div>

          {/* Quick Operations */}
          <div className="mb-6 pb-6 border-b border-theme-border-secondary/50">
            <h3 className="text-sm font-medium text-theme-text-secondary mb-2">{t('timeouts.quick')}</h3>
            <SettingSelect
              label={t('timeouts.quickLabel')}
              description={t('timeouts.quickDesc')}
              value={settings.wslTimeouts.quickSecs}
              options={QUICK_TIMEOUT_OPTIONS}
              onChange={(v) => handleTimeoutChange("quickSecs", v as number)}
            />
          </div>

          {/* Standard Operations */}
          <div className="mb-6 pb-6 border-b border-theme-border-secondary/50">
            <h3 className="text-sm font-medium text-theme-text-secondary mb-2">{t('timeouts.default')}</h3>
            <SettingSelect
              label={t('timeouts.defaultLabel')}
              description={t('timeouts.defaultDesc')}
              value={settings.wslTimeouts.defaultSecs}
              options={DEFAULT_TIMEOUT_OPTIONS}
              onChange={(v) => handleTimeoutChange("defaultSecs", v as number)}
            />
          </div>

          {/* Long Operations */}
          <div className="mb-6 pb-6 border-b border-theme-border-secondary/50">
            <h3 className="text-sm font-medium text-theme-text-secondary mb-2">{t('timeouts.long')}</h3>
            <SettingSelect
              label={t('timeouts.longLabel')}
              description={t('timeouts.longDesc')}
              value={settings.wslTimeouts.longSecs}
              options={LONG_TIMEOUT_OPTIONS}
              onChange={(v) => handleTimeoutChange("longSecs", v as number)}
            />
          </div>

          {/* Shell Commands */}
          <div className="space-y-1">
            <h3 className="text-sm font-medium text-theme-text-secondary mb-2">{t('timeouts.customActions')}</h3>
            <SettingSelect
              label={t('timeouts.shell')}
              description={t('timeouts.shellDesc')}
              value={settings.wslTimeouts.shellSecs}
              options={SHELL_TIMEOUT_OPTIONS}
              onChange={(v) => handleTimeoutChange("shellSecs", v as number)}
            />

            <SettingSelect
              label={t('timeouts.sudoShell')}
              description={t('timeouts.sudoShellDesc')}
              value={settings.wslTimeouts.sudoShellSecs}
              options={SUDO_TIMEOUT_OPTIONS}
              onChange={(v) => handleTimeoutChange("sudoShellSecs", v as number)}
            />
          </div>

          {/* Reset to Defaults */}
          <div className="mt-6 pt-6 border-t border-theme-border-secondary/50 flex justify-end">
            <button
              onClick={handleResetDefaults}
              className="text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              {t('timeouts.resetDefaults')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
