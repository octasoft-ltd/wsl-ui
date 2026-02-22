/**
 * Theme Settings Component
 *
 * Allows users to select from built-in themes or customize their own.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "../../themes";
import type { ThemeColors, ThemeId } from "../../themes";
import { PaletteIcon, CheckIcon, ResetIcon, ChevronDownIcon, ChevronUpIcon } from "../icons";

// Color groups for the custom theme editor
const COLOR_GROUPS = [
  {
    name: "Background",
    colors: [
      { key: "bgPrimary" as const, label: "Primary" },
      { key: "bgSecondary" as const, label: "Secondary" },
      { key: "bgTertiary" as const, label: "Tertiary" },
      { key: "bgHover" as const, label: "Hover" },
      { key: "bgSelected" as const, label: "Selected" },
    ],
  },
  {
    name: "Text",
    colors: [
      { key: "textPrimary" as const, label: "Primary" },
      { key: "textSecondary" as const, label: "Secondary" },
      { key: "textMuted" as const, label: "Muted" },
      { key: "textAccent" as const, label: "Accent" },
    ],
  },
  {
    name: "Border",
    colors: [
      { key: "borderPrimary" as const, label: "Primary" },
      { key: "borderSecondary" as const, label: "Secondary" },
      { key: "borderAccent" as const, label: "Accent" },
    ],
  },
  {
    name: "Accent",
    colors: [
      { key: "accentPrimary" as const, label: "Primary" },
      { key: "accentSecondary" as const, label: "Secondary" },
    ],
  },
  {
    name: "Status",
    colors: [
      { key: "statusRunning" as const, label: "Running" },
      { key: "statusStopped" as const, label: "Stopped" },
      { key: "statusWarning" as const, label: "Warning" },
      { key: "statusError" as const, label: "Error" },
      { key: "statusSuccess" as const, label: "Success" },
    ],
  },
  {
    name: "Buttons",
    colors: [
      { key: "buttonPrimary" as const, label: "Primary" },
      { key: "buttonPrimaryHover" as const, label: "Primary Hover" },
      { key: "buttonSecondary" as const, label: "Secondary" },
      { key: "buttonSecondaryHover" as const, label: "Secondary Hover" },
      { key: "buttonDanger" as const, label: "Danger" },
      { key: "buttonDangerHover" as const, label: "Danger Hover" },
    ],
  },
  {
    name: "Scrollbar",
    colors: [
      { key: "scrollbarTrack" as const, label: "Track" },
      { key: "scrollbarThumb" as const, label: "Thumb" },
      { key: "scrollbarThumbHover" as const, label: "Thumb Hover" },
    ],
  },
];

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
}

function ColorPicker({ label, value, onChange }: ColorPickerProps) {
  return (
    <div className="flex items-center gap-3">
      <label className="flex-1 text-sm text-(--text-secondary)">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded-sm cursor-pointer border border-(--border-secondary) bg-transparent"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-20 px-2 py-1 text-xs font-mono bg-(--bg-tertiary) border border-(--border-secondary) rounded-sm text-(--text-primary)"
        />
      </div>
    </div>
  );
}

interface ColorGroupProps {
  name: string;
  colors: { key: keyof ThemeColors; label: string }[];
  values: ThemeColors;
  onChange: (key: keyof ThemeColors, value: string) => void;
}

function ColorGroup({ name, colors, values, onChange }: ColorGroupProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-(--border-primary) rounded-lg overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 bg-(--bg-tertiary) hover:bg-(--bg-hover) transition-colors"
      >
        <span className="text-sm font-medium text-(--text-primary)">{name}</span>
        {isExpanded ? (
          <ChevronUpIcon size="sm" className="text-(--text-muted)" />
        ) : (
          <ChevronDownIcon size="sm" className="text-(--text-muted)" />
        )}
      </button>
      {isExpanded && (
        <div className="p-4 space-y-3 bg-(--bg-secondary)">
          {colors.map(({ key, label }) => (
            <ColorPicker
              key={key}
              label={label}
              value={values[key]}
              onChange={(value) => onChange(key, value)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ThemeSettings() {
  const { t } = useTranslation("settings");
  const { themeId, setTheme, availableThemes, customColors, updateCustomColors, resetCustomColors } =
    useTheme();

  const handleThemeSelect = (id: ThemeId) => {
    setTheme(id);
  };

  const handleColorChange = (key: keyof ThemeColors, value: string) => {
    updateCustomColors({ [key]: value });
  };

  return (
    <div className="space-y-8">
      {/* Theme Section Header */}
      <section className="relative overflow-hidden bg-linear-to-br from-purple-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-purple-800/30 rounded-xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-purple-500/10 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-lg bg-linear-to-br from-purple-500 to-pink-600 flex items-center justify-center shadow-lg shadow-purple-900/30">
              <PaletteIcon size="md" className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-(--text-primary)">{t('theme.title')}</h2>
              <p className="text-sm text-(--text-muted)">{t('theme.description')}</p>
            </div>
          </div>

          {/* Theme Grid */}
          <div className="grid grid-cols-2 gap-3">
            {availableThemes.map((theme) => {
              const isSelected = themeId === theme.id;
              const colors = theme.colors;

              return (
                <button
                  key={theme.id}
                  onClick={() => handleThemeSelect(theme.id as ThemeId)}
                  data-testid={`theme-${theme.id}`}
                  className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                    isSelected
                      ? "border-(--accent-primary) bg-(--accent-glow)"
                      : "border-(--border-primary) hover:border-(--border-secondary) bg-(--bg-tertiary)"
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-(--accent-primary) flex items-center justify-center">
                      <CheckIcon size="sm" className="text-white w-3 h-3" />
                    </div>
                  )}

                  {/* Theme Preview */}
                  <div className="mb-3 h-12 rounded-md overflow-hidden flex">
                    <div className="flex-1" style={{ backgroundColor: colors.bgPrimary }} />
                    <div className="flex-1" style={{ backgroundColor: colors.bgSecondary }} />
                    <div className="flex-1" style={{ backgroundColor: colors.accentPrimary }} />
                    <div className="flex-1" style={{ backgroundColor: colors.accentSecondary }} />
                  </div>

                  <div className="font-medium text-(--text-primary) text-sm">{theme.name}</div>
                  <div className="text-xs text-(--text-muted) mt-0.5">{theme.description}</div>
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Custom Theme Editor */}
      {themeId === "custom" && (
        <section className="relative overflow-hidden bg-linear-to-br from-cyan-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-cyan-800/30 rounded-xl p-6">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent" />
          <div className="relative">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-linear-to-br from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
                  <PaletteIcon size="md" className="text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-medium text-(--text-primary)">{t('theme.customColors')}</h2>
                  <p className="text-sm text-(--text-muted)">{t('theme.customColorsDesc')}</p>
                </div>
              </div>
              <button
                onClick={resetCustomColors}
                className="flex items-center gap-2 px-3 py-2 text-sm text-(--text-muted) hover:text-(--text-primary) bg-(--bg-tertiary) hover:bg-(--bg-hover) border border-(--border-secondary) rounded-lg transition-colors"
              >
                <ResetIcon size="sm" />
                {t('theme.resetToDefault')}
              </button>
            </div>

            <div className="space-y-3">
              {COLOR_GROUPS.map((group) => (
                <ColorGroup
                  key={group.name}
                  name={group.name}
                  colors={group.colors}
                  values={customColors}
                  onChange={handleColorChange}
                />
              ))}
            </div>

            <p className="mt-4 text-xs text-(--text-muted)">
              {t('theme.tip')}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}




