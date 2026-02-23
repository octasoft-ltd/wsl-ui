/**
 * Polling Settings Component
 *
 * Allows users to configure automatic refresh intervals and enable/disable polling.
 */

import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../store/settingsStore";
import { usePollingStore } from "../../store/pollingStore";
import { RefreshIcon, WarningIcon } from "../icons";
import { Toggle, SettingSelect } from "./FormControls";
import { DEFAULT_POLLING_INTERVALS } from "../../types/polling";

// Interval options in seconds
const INTERVAL_OPTION_KEYS = [
  { value: 5000, labelKey: "polling.intervals.5seconds" },
  { value: 10000, labelKey: "polling.intervals.10seconds" },
  { value: 15000, labelKey: "polling.intervals.15seconds" },
  { value: 30000, labelKey: "polling.intervals.30seconds" },
  { value: 60000, labelKey: "polling.intervals.1minute" },
  { value: 120000, labelKey: "polling.intervals.2minutes" },
];


export function PollingSettings() {
  const { t } = useTranslation("settings");
  const { settings, updateSetting } = useSettingsStore();
  const { polls, hasBackoff, resetAllBackoff } = usePollingStore();

  const intervalOptions = INTERVAL_OPTION_KEYS.map((opt) => ({
    value: opt.value,
    label: t(opt.labelKey),
  }));

  const isBackedOff = hasBackoff();

  const handlePollingEnabledChange = (enabled: boolean) => {
    updateSetting("pollingEnabled", enabled);
  };

  const handleIntervalChange = (key: keyof typeof settings.pollingIntervals, value: number) => {
    updateSetting("pollingIntervals", {
      ...settings.pollingIntervals,
      [key]: value,
    });
  };

  const handleResetDefaults = () => {
    updateSetting("pollingIntervals", DEFAULT_POLLING_INTERVALS);
  };

  return (
    <div className="space-y-8">
      {/* Polling Section Header */}
      <section className="relative overflow-hidden bg-linear-to-br from-blue-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-blue-800/30 rounded-xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-blue-500/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-linear-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
              <RefreshIcon size="md" className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-theme-text-primary">{t('polling.title')}</h2>
              <p className="text-sm text-theme-text-muted">{t('polling.description')}</p>
            </div>
          </div>

          {/* Backoff Warning */}
          {isBackedOff && (
            <div className="mb-6 p-4 bg-[rgba(var(--status-warning-rgb),0.15)] border border-[rgba(var(--status-warning-rgb),0.3)] rounded-lg">
              <div className="flex items-start gap-3">
                <WarningIcon size="md" className="text-theme-status-warning mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-theme-status-warning">{t('polling.backoffWarning')}</p>
                  <p className="text-xs text-theme-status-warning/80 mt-1">
                    {t('polling.backoffDesc')}
                  </p>
                  <button
                    onClick={resetAllBackoff}
                    className="mt-2 text-xs text-theme-status-warning hover:text-theme-status-warning/90 underline"
                  >
                    {t('polling.resetBackoff')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Enable/Disable Toggle */}
          <div className="mb-6 pb-6 border-b border-theme-border-secondary/50">
            <Toggle
              label={t('polling.enabled')}
              description={t('polling.enabledDesc')}
              checked={settings.pollingEnabled}
              onChange={handlePollingEnabledChange}
            />
          </div>

          {/* Interval Settings */}
          <div className="space-y-1">
            <SettingSelect
              label={t('polling.distros')}
              description={t('polling.distrosDesc')}
              value={settings.pollingIntervals.distros}
              options={intervalOptions}
              onChange={(v) => handleIntervalChange("distros", v as number)}
              disabled={!settings.pollingEnabled}
              testId="polling-interval-distros"
            />

            <SettingSelect
              label={t('polling.resources')}
              description={t('polling.resourcesDesc')}
              value={settings.pollingIntervals.resources}
              options={intervalOptions}
              onChange={(v) => handleIntervalChange("resources", v as number)}
              disabled={!settings.pollingEnabled}
              testId="polling-interval-resources"
            />

            <SettingSelect
              label={t('polling.health')}
              description={t('polling.healthDesc')}
              value={settings.pollingIntervals.health}
              options={intervalOptions}
              onChange={(v) => handleIntervalChange("health", v as number)}
              disabled={!settings.pollingEnabled}
              testId="polling-interval-health"
            />
          </div>

          {/* Current Status */}
          <div className="mt-6 pt-6 border-t border-theme-border-secondary/50">
            <p className="text-xs text-theme-text-muted mb-3">{t('polling.currentStatus')}</p>
            <div className="grid grid-cols-3 gap-3 text-xs">
              <div className="p-2 bg-theme-bg-tertiary/50 rounded-md">
                <div className="text-theme-text-secondary">{t('polling.distros')}</div>
                <div className="text-theme-text-primary font-mono">
                  {polls.distros.consecutiveTimeouts > 0 ? (
                    <span className="text-theme-status-warning">
                      {t('polling.backedOff', { interval: Math.round(polls.distros.currentInterval / 1000) })}
                    </span>
                  ) : (
                    `${Math.round(polls.distros.currentInterval / 1000)}s`
                  )}
                </div>
              </div>
              <div className="p-2 bg-theme-bg-tertiary/50 rounded-md">
                <div className="text-theme-text-secondary">{t('polling.resources')}</div>
                <div className="text-theme-text-primary font-mono">
                  {polls.resources.consecutiveTimeouts > 0 ? (
                    <span className="text-theme-status-warning">
                      {t('polling.backedOff', { interval: Math.round(polls.resources.currentInterval / 1000) })}
                    </span>
                  ) : (
                    `${Math.round(polls.resources.currentInterval / 1000)}s`
                  )}
                </div>
              </div>
              <div className="p-2 bg-theme-bg-tertiary/50 rounded-md">
                <div className="text-theme-text-secondary">{t('polling.health')}</div>
                <div className="text-theme-text-primary font-mono">
                  {polls.health.consecutiveTimeouts > 0 ? (
                    <span className="text-theme-status-warning">
                      {t('polling.backedOff', { interval: Math.round(polls.health.currentInterval / 1000) })}
                    </span>
                  ) : (
                    `${Math.round(polls.health.currentInterval / 1000)}s`
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Reset to Defaults */}
          <div className="mt-4 flex justify-end">
            <button
              onClick={handleResetDefaults}
              className="text-xs text-theme-text-muted hover:text-theme-text-secondary transition-colors"
            >
              {t('polling.resetDefaults')}
            </button>
          </div>

          <p className="mt-4 text-xs text-theme-text-muted">
            {t('polling.tip')}
          </p>
        </div>
      </section>
    </div>
  );
}
