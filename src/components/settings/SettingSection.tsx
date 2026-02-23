/**
 * Setting Section Component
 *
 * A reusable section for settings with preset options.
 */

import { useState, useMemo, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { PresetOption } from "./constants";

interface SettingSectionProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  iconGradient: string;
  presets: PresetOption[];
  currentValue: string;
  onValueChange: (value: string) => void;
  customPlaceholder: string;
  customHelpText: React.ReactNode;
  isLoading: boolean;
  /** Previously saved custom value (persisted even when preset is active) */
  savedCustomValue?: string;
  /** Callback to save a custom value (saves both active and persisted custom value together) */
  onCustomValueSave?: (value: string) => void;
  /** Test ID prefix for e2e tests */
  testId?: string;
}

export function SettingSection({
  title,
  description,
  icon,
  iconGradient,
  presets,
  currentValue,
  onValueChange,
  customPlaceholder,
  customHelpText,
  isLoading,
  savedCustomValue = "",
  onCustomValueSave,
  testId,
}: SettingSectionProps) {
  const { t } = useTranslation("settings");
  // Track if user explicitly selected custom mode (even if currentValue matches a preset)
  const [isCustomMode, setIsCustomMode] = useState(false);

  // Derive which preset matches the current value
  const matchingPreset = useMemo(() => {
    const preset = presets.find((p) => p.value === currentValue && p.value !== "custom");
    return preset?.value ?? null;
  }, [currentValue, presets]);

  // Selected preset: custom mode if explicitly selected OR if no preset matches
  const selectedPreset = isCustomMode || !matchingPreset ? "custom" : matchingPreset;

  // Local state for custom command input (for typing before save)
  // Initialize with saved custom value if available
  const [customCommandInput, setCustomCommandInput] = useState(savedCustomValue);

  // Sync with savedCustomValue when it changes (e.g., on initial load)
  useEffect(() => {
    if (savedCustomValue) {
      setCustomCommandInput(savedCustomValue);
    }
  }, [savedCustomValue]);

  // If current value is custom (not matching a preset), sync it
  useEffect(() => {
    if (!matchingPreset && currentValue) {
      setCustomCommandInput(currentValue);
    }
  }, [currentValue, matchingPreset]);

  // Reset custom mode when value changes to match a preset
  useEffect(() => {
    if (matchingPreset) {
      setIsCustomMode(false);
    }
  }, [matchingPreset]);

  const handlePresetChange = (value: string) => {
    if (value === "custom") {
      // Enter custom mode - show saved custom value if available
      setIsCustomMode(true);
    } else {
      // Select a preset - exit custom mode and save
      setIsCustomMode(false);
      onValueChange(value);
    }
  };

  const handleCustomCommandSave = () => {
    if (customCommandInput.trim()) {
      const trimmed = customCommandInput.trim();
      // Use combined callback if available, otherwise fall back to onValueChange
      if (onCustomValueSave) {
        onCustomValueSave(trimmed);
      } else {
        onValueChange(trimmed);
      }
    }
  };

  // Extract gradient color from iconGradient for section styling
  function resolveGradientColor(): "violet" | "emerald" | "amber" {
    if (iconGradient.includes("violet") || iconGradient.includes("purple")) return "violet";
    if (iconGradient.includes("emerald") || iconGradient.includes("teal")) return "emerald";
    return "amber";
  }
  const gradientColor = resolveGradientColor();

  const sectionStyles = {
    violet: "from-violet-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border-violet-800/30",
    emerald: "from-emerald-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border-emerald-800/30",
    amber: "from-amber-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border-amber-800/30",
  };

  const glowStyles = {
    violet: "from-violet-500/10",
    emerald: "from-emerald-500/10",
    amber: "from-amber-500/10",
  };

  return (
    <section className={`relative overflow-hidden bg-linear-to-br ${sectionStyles[gradientColor]} border rounded-xl p-6`}>
      <div className={`absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] ${glowStyles[gradientColor]} via-transparent to-transparent`} />
      <div className="relative">
        <div className="flex items-center gap-3 mb-6">
          <div className={`w-10 h-10 rounded-lg bg-linear-to-br ${iconGradient} flex items-center justify-center shadow-lg`}>
            {icon}
          </div>
          <div>
            <h2 className="text-lg font-medium text-theme-text-primary">{title}</h2>
            <p className="text-sm text-theme-text-muted">{description}</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="w-6 h-6 border-2 border-theme-border-secondary border-t-theme-accent-primary rounded-full animate-spin" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {presets.map((preset) => {
                const isDisabled = preset.disabled === true;
                return (
                  <button
                    key={preset.value}
                    onClick={() => !isDisabled && handlePresetChange(preset.value)}
                    disabled={isDisabled}
                    className={`flex items-center gap-3 p-4 rounded-lg border transition-all text-left ${
                      isDisabled
                        ? "border-theme-border-secondary bg-theme-bg-tertiary/30 text-theme-text-muted opacity-50 cursor-not-allowed"
                        : selectedPreset === preset.value
                        ? "border-theme-accent-primary bg-theme-accent-primary/10 text-theme-text-primary"
                        : "border-theme-border-secondary bg-theme-bg-tertiary/50 text-theme-text-muted hover:border-theme-border-primary hover:text-theme-text-secondary"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                        isDisabled
                          ? "border-theme-border-primary opacity-50"
                          : selectedPreset === preset.value
                          ? "border-theme-accent-primary bg-theme-accent-primary"
                          : "border-theme-border-primary"
                      }`}
                    >
                      {selectedPreset === preset.value && !isDisabled && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium truncate ${isDisabled ? "line-through" : ""}`}>{preset.label}</p>
                      <p className={`text-xs truncate ${isDisabled ? "text-theme-text-muted/70" : "text-theme-text-muted"}`}>{preset.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedPreset === "custom" && (
              <div className="mt-4 p-4 bg-theme-bg-secondary/50 rounded-lg border border-theme-border-secondary/50" data-testid={testId ? `${testId}-custom-section` : undefined}>
                <label className="block text-sm font-medium text-theme-text-secondary mb-2">{t('settingSection.customCommand')}</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={customCommandInput}
                    onChange={(e) => setCustomCommandInput(e.target.value)}
                    placeholder={customPlaceholder}
                    data-testid={testId ? `${testId}-custom-input` : undefined}
                    className="flex-1 px-4 py-2 bg-theme-bg-secondary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-hidden focus:border-theme-accent-primary"
                  />
                  <button
                    onClick={handleCustomCommandSave}
                    disabled={!customCommandInput.trim() || customCommandInput.trim() === savedCustomValue}
                    data-testid={testId ? `${testId}-custom-save` : undefined}
                    className="px-4 py-2 bg-theme-accent-primary hover:opacity-90 text-theme-bg-primary font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {t('common:button.save')}
                  </button>
                </div>
                <div className="mt-3 text-xs text-theme-text-muted">{customHelpText}</div>
              </div>
            )}

            <div className="mt-4 p-3 bg-theme-bg-secondary/30 rounded-lg border border-theme-border-primary/50">
              <div className="flex items-center gap-2 text-sm">
                <span className="text-theme-text-muted">{t('settingSection.currentSetting')}</span>
                <code className="px-2 py-0.5 bg-theme-bg-secondary rounded-sm text-theme-accent-primary font-mono">{currentValue}</code>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

