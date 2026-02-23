/**
 * Container Runtime Settings Component
 *
 * Allows users to configure which container runtime to use for pulling OCI images.
 */

import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../store/settingsStore";
import { DockerLogo } from "../icons/DistroLogos";
import type { ContainerRuntime } from "../../types/settings";

const RUNTIME_OPTION_KEYS = [
  { value: "builtin", labelKey: "containerRuntime.builtin", descKey: "containerRuntime.builtinDesc" },
  { value: "docker", labelKey: "containerRuntime.docker", descKey: "containerRuntime.dockerDesc" },
  { value: "podman", labelKey: "containerRuntime.podman", descKey: "containerRuntime.podmanDesc" },
  { value: "custom", labelKey: "containerRuntime.custom", descKey: "containerRuntime.customDesc" },
];

export function ContainerRuntimeSettings() {
  const { t } = useTranslation("settings");
  const { settings, updateSetting } = useSettingsStore();

  const currentRuntime = settings.containerRuntime;
  const isCustom = typeof currentRuntime === "object" && "custom" in currentRuntime;
  const selectedValue = isCustom ? "custom" : currentRuntime;
  const customCommand = isCustom ? currentRuntime.custom : "";

  const handleRuntimeChange = (value: string) => {
    if (value === "custom") {
      updateSetting("containerRuntime", { custom: customCommand || "docker" });
    } else {
      updateSetting("containerRuntime", value as ContainerRuntime);
    }
  };

  const handleCustomCommandChange = (command: string) => {
    updateSetting("containerRuntime", { custom: command });
  };

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden bg-linear-to-br from-orange-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-orange-800/30 rounded-xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-orange-500/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-linear-to-br from-orange-500 to-red-600 flex items-center justify-center shadow-lg shadow-orange-900/30">
              <DockerLogo size={24} />
            </div>
            <div>
              <h2 className="text-lg font-medium text-theme-text-primary">{t('containerRuntime.title')}</h2>
              <p className="text-sm text-theme-text-muted">{t('containerRuntime.description')}</p>
            </div>
          </div>

          {/* Info box */}
          <div className="mb-6 p-4 bg-theme-bg-tertiary/50 border border-theme-border-secondary/50 rounded-lg">
            <p className="text-xs text-theme-text-muted">
              {t('containerRuntime.infoBox')}
            </p>
          </div>

          {/* Runtime Options */}
          <div className="space-y-3">
            {RUNTIME_OPTION_KEYS.map((option) => (
              <label
                key={option.value}
                className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedValue === option.value
                    ? "border-orange-500/50 bg-orange-500/10"
                    : "border-theme-border-secondary bg-theme-bg-tertiary/30 hover:border-theme-border-primary"
                }`}
              >
                <input
                  type="radio"
                  name="containerRuntime"
                  value={option.value}
                  checked={selectedValue === option.value}
                  onChange={(e) => handleRuntimeChange(e.target.value)}
                  className="mt-1 accent-orange-500"
                />
                <div className="flex-1">
                  <div className="font-medium text-theme-text-primary">{t(option.labelKey)}</div>
                  <div className="text-xs text-theme-text-muted mt-0.5">{t(option.descKey)}</div>
                </div>
              </label>
            ))}
          </div>

          {/* Custom command input */}
          {selectedValue === "custom" && (
            <div className="mt-4 pl-7">
              <label className="block text-sm font-medium text-theme-text-primary mb-1">
                {t('containerRuntime.customCommand')}
              </label>
              <p className="text-xs text-theme-text-muted mb-2">
                {t('containerRuntime.customCommandDesc')}
              </p>
              <input
                type="text"
                value={customCommand}
                onChange={(e) => handleCustomCommandChange(e.target.value)}
                placeholder={t('containerRuntime.customPlaceholder')}
                className="w-full px-3 py-2 bg-theme-bg-secondary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder:text-theme-text-muted/50 focus:outline-hidden focus:border-orange-500 font-mono text-sm"
              />
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
