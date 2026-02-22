/**
 * Privacy Settings Component
 *
 * Allows users to control telemetry and data sharing preferences.
 */

import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../store/settingsStore";
import { Toggle } from "./FormControls";
import { ChartBarIcon, ShieldCheckIcon } from "../icons";

export function PrivacySettings() {
  const { t } = useTranslation("settings");
  const { settings, updateSetting } = useSettingsStore();

  if (!settings) return null;

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden bg-linear-to-br from-emerald-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-emerald-800/30 rounded-xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-emerald-500/5 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/30">
              <ChartBarIcon size="md" className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-theme-text-primary">{t('privacy.title')}</h2>
              <p className="text-sm text-theme-text-secondary">{t('privacy.description')}</p>
            </div>
          </div>

          <div className="space-y-4">
            <Toggle
              label={t('privacy.telemetryEnabled')}
              description={t('privacy.telemetryEnabledDesc')}
              checked={settings.telemetryEnabled}
              onChange={(checked) => updateSetting("telemetryEnabled", checked)}
            />

            {/* Info box about what's collected */}
            <div className="p-4 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <ShieldCheckIcon size="sm" className="text-theme-status-success" />
                <span className="text-sm font-medium text-theme-text-primary">
                  {t('privacy.privacyFocused')}
                </span>
              </div>
              <p className="text-sm text-theme-text-secondary mb-3">
                {t('privacy.whenEnabled')}
              </p>
              <ul className="text-sm text-theme-text-secondary space-y-1 ml-4">
                <li className="flex items-start gap-2">
                  <span className="text-theme-accent-primary mt-0.5">•</span>
                  <span>{t('privacy.collectItem1')}</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-theme-accent-primary mt-0.5">•</span>
                  <span>{t('privacy.collectItem2')}</span>
                </li>
              </ul>
              <div className="mt-3 pt-3 border-t border-theme-border-primary">
                <p className="text-xs text-theme-text-muted">
                  {t('privacy.neverCollect')}{" "}
                  {t('privacy.providerPrefix')}
                  <a
                    href="https://aptabase.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-theme-accent-primary hover:underline"
                  >
                    {t('privacy.providerLinkText')}
                  </a>
                  {t('privacy.providerSuffix')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
