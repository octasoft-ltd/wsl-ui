/**
 * Theme Type Definitions
 *
 * Defines the structure for theme configuration using CSS variables.
 */

export interface ThemeColors {
  // Background colors
  bgPrimary: string;
  bgSecondary: string;
  bgTertiary: string;
  bgHover: string;
  bgSelected: string;

  // Text colors
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textAccent: string;

  // Border colors
  borderPrimary: string;
  borderSecondary: string;
  borderAccent: string;

  // Accent colors
  accentPrimary: string;
  accentSecondary: string;
  accentGlow: string;

  // Status colors
  statusRunning: string;
  statusStopped: string;
  statusWarning: string;
  statusError: string;
  statusSuccess: string;

  // Button variants
  buttonPrimary: string;
  buttonPrimaryHover: string;
  buttonSecondary: string;
  buttonSecondaryHover: string;
  buttonDanger: string;
  buttonDangerHover: string;

  // Scrollbar
  scrollbarTrack: string;
  scrollbarThumb: string;
  scrollbarThumbHover: string;
}

export interface Theme {
  id: string;
  name: string;
  description: string;
  colors: ThemeColors;
  isBuiltIn: boolean;
}

export type ThemeId =
  | "mission-control"
  | "obsidian"
  | "cobalt"
  | "dracula"
  | "nord"
  | "solarized"
  | "monokai"
  | "github-dark"
  | "slate-dusk"
  | "forest-mist"
  | "rose-quartz"
  | "ocean-fog"
  | "daylight"
  | "mission-control-light"
  | "obsidian-light"
  | "custom";

export const THEME_STORAGE_KEY = "wsl-ui-theme";
export const CUSTOM_THEME_STORAGE_KEY = "wsl-ui-custom-theme";




