/**
 * Theme Provider Component
 *
 * Manages theme state and applies CSS variables to the document root.
 */

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import type { Theme, ThemeColors, ThemeId } from "./types";
import { THEME_STORAGE_KEY, CUSTOM_THEME_STORAGE_KEY } from "./types";
import { BUILT_IN_THEMES, getThemeById, getDefaultTheme, defaultCustomColors } from "./themes";

interface ThemeContextValue {
  currentTheme: Theme;
  themeId: ThemeId;
  customColors: ThemeColors;
  setTheme: (id: ThemeId) => void;
  updateCustomColors: (colors: Partial<ThemeColors>) => void;
  resetCustomColors: () => void;
  availableThemes: Theme[];
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * Convert hex color to RGB values string for use in rgba()
 * @param hex - Hex color string (e.g., "#00f0ff" or "00f0ff")
 * @returns RGB values as comma-separated string (e.g., "0, 240, 255")
 */
function hexToRgb(hex: string): string {
  const cleanHex = hex.replace("#", "");
  const result = /^([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(cleanHex);
  if (!result) return "0, 0, 0";
  return `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`;
}

function applyThemeToDocument(colors: ThemeColors): void {
  const root = document.documentElement;

  // Background colors
  root.style.setProperty("--bg-primary", colors.bgPrimary);
  root.style.setProperty("--bg-secondary", colors.bgSecondary);
  root.style.setProperty("--bg-tertiary", colors.bgTertiary);
  root.style.setProperty("--bg-hover", colors.bgHover);
  root.style.setProperty("--bg-selected", colors.bgSelected);

  // Text colors
  root.style.setProperty("--text-primary", colors.textPrimary);
  root.style.setProperty("--text-secondary", colors.textSecondary);
  root.style.setProperty("--text-muted", colors.textMuted);
  root.style.setProperty("--text-accent", colors.textAccent);

  // Border colors
  root.style.setProperty("--border-primary", colors.borderPrimary);
  root.style.setProperty("--border-secondary", colors.borderSecondary);
  root.style.setProperty("--border-accent", colors.borderAccent);

  // Accent colors
  root.style.setProperty("--accent-primary", colors.accentPrimary);
  root.style.setProperty("--accent-secondary", colors.accentSecondary);
  root.style.setProperty("--accent-glow", colors.accentGlow);

  // Status colors
  root.style.setProperty("--status-running", colors.statusRunning);
  root.style.setProperty("--status-stopped", colors.statusStopped);
  root.style.setProperty("--status-warning", colors.statusWarning);
  root.style.setProperty("--status-error", colors.statusError);
  root.style.setProperty("--status-success", colors.statusSuccess);

  // Button colors
  root.style.setProperty("--button-primary", colors.buttonPrimary);
  root.style.setProperty("--button-primary-hover", colors.buttonPrimaryHover);
  root.style.setProperty("--button-secondary", colors.buttonSecondary);
  root.style.setProperty("--button-secondary-hover", colors.buttonSecondaryHover);
  root.style.setProperty("--button-danger", colors.buttonDanger);
  root.style.setProperty("--button-danger-hover", colors.buttonDangerHover);

  // Scrollbar colors
  root.style.setProperty("--scrollbar-track", colors.scrollbarTrack);
  root.style.setProperty("--scrollbar-thumb", colors.scrollbarThumb);
  root.style.setProperty("--scrollbar-thumb-hover", colors.scrollbarThumbHover);

  // RGB variants for use in rgba() shadows and glows
  root.style.setProperty("--accent-primary-rgb", hexToRgb(colors.accentPrimary));
  root.style.setProperty("--accent-secondary-rgb", hexToRgb(colors.accentSecondary));
  root.style.setProperty("--status-running-rgb", hexToRgb(colors.statusRunning));
  root.style.setProperty("--status-stopped-rgb", hexToRgb(colors.statusStopped));
  root.style.setProperty("--status-warning-rgb", hexToRgb(colors.statusWarning));
  root.style.setProperty("--status-error-rgb", hexToRgb(colors.statusError));
  root.style.setProperty("--status-success-rgb", hexToRgb(colors.statusSuccess));
  root.style.setProperty("--text-primary-rgb", hexToRgb(colors.textPrimary));
  root.style.setProperty("--text-secondary-rgb", hexToRgb(colors.textSecondary));
  root.style.setProperty("--text-muted-rgb", hexToRgb(colors.textMuted));
}

function loadThemeId(): ThemeId {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored && (BUILT_IN_THEMES.some((t) => t.id === stored) || stored === "custom")) {
      return stored as ThemeId;
    }
  } catch {
    // Ignore localStorage errors
  }
  return "obsidian";
}

function loadCustomColors(): ThemeColors {
  try {
    const stored = localStorage.getItem(CUSTOM_THEME_STORAGE_KEY);
    if (stored) {
      return { ...defaultCustomColors, ...JSON.parse(stored) };
    }
  } catch {
    // Ignore parse errors
  }
  return { ...defaultCustomColors };
}

function saveThemeId(id: ThemeId): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, id);
  } catch {
    // Ignore localStorage errors
  }
}

function saveCustomColors(colors: ThemeColors): void {
  try {
    localStorage.setItem(CUSTOM_THEME_STORAGE_KEY, JSON.stringify(colors));
  } catch {
    // Ignore localStorage errors
  }
}

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [themeId, setThemeId] = useState<ThemeId>(loadThemeId);
  const [customColors, setCustomColors] = useState<ThemeColors>(loadCustomColors);

  // Derive current theme
  const currentTheme: Theme =
    themeId === "custom"
      ? {
          id: "custom",
          name: "Custom",
          description: "Your personalized color scheme",
          colors: customColors,
          isBuiltIn: false,
        }
      : getThemeById(themeId) || getDefaultTheme();

  // Apply theme on mount and when it changes
  useEffect(() => {
    applyThemeToDocument(currentTheme.colors);
  }, [currentTheme.colors]);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeId(id);
    saveThemeId(id);
  }, []);

  const updateCustomColors = useCallback((colors: Partial<ThemeColors>) => {
    setCustomColors((prev) => {
      const updated = { ...prev, ...colors };
      saveCustomColors(updated);
      return updated;
    });
  }, []);

  const resetCustomColors = useCallback(() => {
    const reset = { ...defaultCustomColors };
    setCustomColors(reset);
    saveCustomColors(reset);
  }, []);

  const availableThemes: Theme[] = [
    ...BUILT_IN_THEMES,
    {
      id: "custom",
      name: "Custom",
      description: "Your personalized color scheme",
      colors: customColors,
      isBuiltIn: false,
    },
  ];

  return (
    <ThemeContext.Provider
      value={{
        currentTheme,
        themeId,
        customColors,
        setTheme,
        updateCustomColors,
        resetCustomColors,
        availableThemes,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}




