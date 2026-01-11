/**
 * Built-in Theme Definitions
 *
 * A collection of popular color themes for the application.
 */

import type { Theme, ThemeColors } from "./types";

// Mission Control - the original cyan/dark theme
const missionControlColors: ThemeColors = {
  bgPrimary: "#0a0a0f",
  bgSecondary: "#12121a",
  bgTertiary: "#1a1a24",
  bgHover: "#22222e",
  bgSelected: "#2a2a38",

  textPrimary: "#f0f0f5",
  textSecondary: "#a0a0b0",
  textMuted: "#8585a0",      // Brightened for WCAG AA contrast (4.5:1)
  textAccent: "#00f0ff",

  borderPrimary: "#1e1e28",
  borderSecondary: "#2a2a38",
  borderAccent: "#00f0ff",

  accentPrimary: "#00f0ff",    // The signature cyan
  accentSecondary: "#00d4e0",
  accentGlow: "rgba(0, 240, 255, 0.2)",

  statusRunning: "#00ff87",    // Bright green
  statusStopped: "#6a6a80",  // Brightened for WCAG AA contrast (3:1)
  statusWarning: "#ffb800",    // Amber
  statusError: "#ff3366",      // Pink-red
  statusSuccess: "#00ff87",

  buttonPrimary: "#00d4e0",
  buttonPrimaryHover: "#00f0ff",
  buttonSecondary: "#2a2a38",
  buttonSecondaryHover: "#363648",
  buttonDanger: "#ff3366",
  buttonDangerHover: "#ff4d7a",

  scrollbarTrack: "#12121a",
  scrollbarThumb: "#2a2a38",
  scrollbarThumbHover: "#404050",
};

// Current default theme - warm stone/amber palette
// Matches logo color (#f59e0b amber-500)
const obsidianColors: ThemeColors = {
  bgPrimary: "#0c0a09",      // stone-950
  bgSecondary: "#1c1917",    // stone-900
  bgTertiary: "#292524",     // stone-800
  bgHover: "#44403c",        // stone-700
  bgSelected: "#57534e",     // stone-600

  textPrimary: "#fafaf9",    // stone-50
  textSecondary: "#d6d3d1",  // stone-300
  textMuted: "#9a938e",      // Brightened stone for WCAG AA (4.5:1)
  textAccent: "#f59e0b",     // amber-500 (logo color)

  borderPrimary: "#292524",  // stone-800 (main borders)
  borderSecondary: "#44403c", // stone-700 (hover/secondary borders)
  borderAccent: "#f59e0b",   // amber-500

  accentPrimary: "#f59e0b",  // amber-500 (logo color)
  accentSecondary: "#d97706", // amber-600 (for gradients)
  accentGlow: "rgba(245, 158, 11, 0.2)",

  statusRunning: "#22c55e",  // emerald-500
  statusStopped: "#78736e",  // Brightened stone for WCAG AA (3:1)
  statusWarning: "#fbbf24",  // amber-400
  statusError: "#f472b6",    // pink-400 (softer pink-red)
  statusSuccess: "#10b981",  // emerald-500

  buttonPrimary: "#d97706",  // amber-600 (for solid buttons)
  buttonPrimaryHover: "#b45309", // amber-700
  buttonSecondary: "#44403c", // stone-700
  buttonSecondaryHover: "#57534e", // stone-600
  buttonDanger: "#ec4899",   // pink-500
  buttonDangerHover: "#db2777", // pink-600

  scrollbarTrack: "#1c1917", // stone-900
  scrollbarThumb: "#44403c", // stone-700
  scrollbarThumbHover: "#57534e", // stone-600
};

// Cobalt theme - inspired by Cursor's Cobalt theme
const cobaltColors: ThemeColors = {
  bgPrimary: "#002240",
  bgSecondary: "#001b33",
  bgTertiary: "#003366",
  bgHover: "#004080",
  bgSelected: "#0050a0",

  textPrimary: "#ffffff",
  textSecondary: "#9effff",
  textMuted: "#6699cc",
  textAccent: "#ffc600",

  borderPrimary: "#003366",
  borderSecondary: "#004080",
  borderAccent: "#ffc600",

  accentPrimary: "#ffc600",
  accentSecondary: "#ff9d00",
  accentGlow: "rgba(255, 198, 0, 0.2)",

  statusRunning: "#3ad900",
  statusStopped: "#6699cc",
  statusWarning: "#ff9d00",
  statusError: "#ff628c",
  statusSuccess: "#3ad900",

  buttonPrimary: "#ffc600",
  buttonPrimaryHover: "#ff9d00",
  buttonSecondary: "#004080",
  buttonSecondaryHover: "#0050a0",
  buttonDanger: "#ff628c",
  buttonDangerHover: "#ff0055",

  scrollbarTrack: "#001b33",
  scrollbarThumb: "#004080",
  scrollbarThumbHover: "#0050a0",
};

// Dracula theme - popular purple/pink theme
const draculaColors: ThemeColors = {
  bgPrimary: "#282a36",
  bgSecondary: "#21222c",
  bgTertiary: "#343746",
  bgHover: "#44475a",
  bgSelected: "#6272a4",

  textPrimary: "#f8f8f2",
  textSecondary: "#f8f8f2",
  textMuted: "#6272a4",
  textAccent: "#bd93f9",

  borderPrimary: "#343746",
  borderSecondary: "#44475a",
  borderAccent: "#bd93f9",

  accentPrimary: "#bd93f9",
  accentSecondary: "#ff79c6",
  accentGlow: "rgba(189, 147, 249, 0.2)",

  statusRunning: "#50fa7b",
  statusStopped: "#6272a4",
  statusWarning: "#f1fa8c",
  statusError: "#ff5555",
  statusSuccess: "#50fa7b",

  buttonPrimary: "#bd93f9",
  buttonPrimaryHover: "#ff79c6",
  buttonSecondary: "#44475a",
  buttonSecondaryHover: "#6272a4",
  buttonDanger: "#ff5555",
  buttonDangerHover: "#ff6e6e",

  scrollbarTrack: "#21222c",
  scrollbarThumb: "#44475a",
  scrollbarThumbHover: "#6272a4",
};

// Nord theme - Arctic, north-bluish color palette
const nordColors: ThemeColors = {
  bgPrimary: "#2e3440",
  bgSecondary: "#3b4252",
  bgTertiary: "#434c5e",
  bgHover: "#4c566a",
  bgSelected: "#5e81ac",

  textPrimary: "#eceff4",
  textSecondary: "#e5e9f0",
  textMuted: "#d8dee9",
  textAccent: "#88c0d0",

  borderPrimary: "#3b4252",
  borderSecondary: "#434c5e",
  borderAccent: "#88c0d0",

  accentPrimary: "#88c0d0",
  accentSecondary: "#81a1c1",
  accentGlow: "rgba(136, 192, 208, 0.2)",

  statusRunning: "#a3be8c",
  statusStopped: "#4c566a",
  statusWarning: "#ebcb8b",
  statusError: "#bf616a",
  statusSuccess: "#a3be8c",

  buttonPrimary: "#5e81ac",
  buttonPrimaryHover: "#81a1c1",
  buttonSecondary: "#434c5e",
  buttonSecondaryHover: "#4c566a",
  buttonDanger: "#bf616a",
  buttonDangerHover: "#d08770",

  scrollbarTrack: "#3b4252",
  scrollbarThumb: "#4c566a",
  scrollbarThumbHover: "#5e81ac",
};

// Solarized Dark theme - Classic readable theme
const solarizedColors: ThemeColors = {
  bgPrimary: "#002b36",
  bgSecondary: "#073642",
  bgTertiary: "#094a58",
  bgHover: "#0a5567",
  bgSelected: "#268bd2",

  textPrimary: "#fdf6e3",
  textSecondary: "#eee8d5",
  textMuted: "#93a1a1",
  textAccent: "#2aa198",

  borderPrimary: "#073642",
  borderSecondary: "#094a58",
  borderAccent: "#2aa198",

  accentPrimary: "#2aa198",
  accentSecondary: "#268bd2",
  accentGlow: "rgba(42, 161, 152, 0.2)",

  statusRunning: "#859900",
  statusStopped: "#586e75",
  statusWarning: "#b58900",
  statusError: "#dc322f",
  statusSuccess: "#859900",

  buttonPrimary: "#268bd2",
  buttonPrimaryHover: "#2aa198",
  buttonSecondary: "#073642",
  buttonSecondaryHover: "#094a58",
  buttonDanger: "#dc322f",
  buttonDangerHover: "#cb4b16",

  scrollbarTrack: "#073642",
  scrollbarThumb: "#586e75",
  scrollbarThumbHover: "#657b83",
};

// Monokai theme - Classic editor theme
const monokaiColors: ThemeColors = {
  bgPrimary: "#272822",
  bgSecondary: "#1e1f1c",
  bgTertiary: "#3e3d32",
  bgHover: "#49483e",
  bgSelected: "#75715e",

  textPrimary: "#f8f8f2",
  textSecondary: "#e6db74",
  textMuted: "#75715e",
  textAccent: "#a6e22e",

  borderPrimary: "#3e3d32",
  borderSecondary: "#49483e",
  borderAccent: "#a6e22e",

  accentPrimary: "#a6e22e",
  accentSecondary: "#f92672",
  accentGlow: "rgba(166, 226, 46, 0.2)",

  statusRunning: "#a6e22e",
  statusStopped: "#75715e",
  statusWarning: "#e6db74",
  statusError: "#f92672",
  statusSuccess: "#a6e22e",

  buttonPrimary: "#a6e22e",
  buttonPrimaryHover: "#b8e84a",
  buttonSecondary: "#49483e",
  buttonSecondaryHover: "#75715e",
  buttonDanger: "#f92672",
  buttonDangerHover: "#ff4689",

  scrollbarTrack: "#1e1f1c",
  scrollbarThumb: "#49483e",
  scrollbarThumbHover: "#75715e",
};

// Daylight theme - Clean light theme
const daylightColors: ThemeColors = {
  bgPrimary: "#ffffff",
  bgSecondary: "#f8fafc",
  bgTertiary: "#f1f5f9",
  bgHover: "#e2e8f0",
  bgSelected: "#cbd5e1",

  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  textAccent: "#0284c7",

  borderPrimary: "#e2e8f0",
  borderSecondary: "#cbd5e1",
  borderAccent: "#0284c7",

  accentPrimary: "#0284c7",    // Sky blue
  accentSecondary: "#0369a1",
  accentGlow: "rgba(2, 132, 199, 0.15)",

  statusRunning: "#16a34a",    // Green
  statusStopped: "#94a3b8",
  statusWarning: "#d97706",    // Amber
  statusError: "#dc2626",      // Red
  statusSuccess: "#16a34a",

  buttonPrimary: "#0284c7",
  buttonPrimaryHover: "#0369a1",
  buttonSecondary: "#e2e8f0",
  buttonSecondaryHover: "#cbd5e1",
  buttonDanger: "#dc2626",
  buttonDangerHover: "#b91c1c",

  scrollbarTrack: "#f1f5f9",
  scrollbarThumb: "#cbd5e1",
  scrollbarThumbHover: "#94a3b8",
};

// Mission Control Light - Light theme with cyan accents
const missionControlLightColors: ThemeColors = {
  bgPrimary: "#f8fafa",       // grey-tinted white
  bgSecondary: "#f1f5f5",     // light grey with slight cyan
  bgTertiary: "#e8eeee",      // slightly darker grey
  bgHover: "#dce4e4",         // hover grey
  bgSelected: "#c5d1d1",      // selected grey

  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  textAccent: "#0891b2",      // cyan-600

  borderPrimary: "#dce4e4",   // light grey border
  borderSecondary: "#c5d1d1", // darker grey border
  borderAccent: "#0891b2",    // cyan-600

  accentPrimary: "#0891b2",   // cyan-600
  accentSecondary: "#0e7490", // cyan-700
  accentGlow: "rgba(8, 145, 178, 0.15)",

  statusRunning: "#16a34a",   // green-600
  statusStopped: "#94a3b8",
  statusWarning: "#d97706",   // amber-600
  statusError: "#e11d48",     // rose-600
  statusSuccess: "#16a34a",

  buttonPrimary: "#0891b2",
  buttonPrimaryHover: "#0e7490",
  buttonSecondary: "#e8eeee",
  buttonSecondaryHover: "#dce4e4",
  buttonDanger: "#e11d48",
  buttonDangerHover: "#be123c",

  scrollbarTrack: "#f1f5f5",
  scrollbarThumb: "#c5d1d1",
  scrollbarThumbHover: "#a8b5b5",
};

// Obsidian Light - Light theme with amber accents (matches logo)
const obsidianLightColors: ThemeColors = {
  bgPrimary: "#fafaf8",       // warm grey-tinted white
  bgSecondary: "#f5f5f3",     // light warm grey
  bgTertiary: "#ecece8",      // slightly darker warm grey
  bgHover: "#e2e2dc",         // hover warm grey
  bgSelected: "#d4d4cc",      // selected warm grey

  textPrimary: "#0f172a",
  textSecondary: "#475569",
  textMuted: "#94a3b8",
  textAccent: "#d97706",      // amber-600

  borderPrimary: "#e2e2dc",   // light warm grey border
  borderSecondary: "#d4d4cc", // darker warm grey border
  borderAccent: "#d97706",    // amber-600

  accentPrimary: "#f59e0b",   // amber-500 (logo color)
  accentSecondary: "#d97706", // amber-600
  accentGlow: "rgba(245, 158, 11, 0.15)",

  statusRunning: "#16a34a",   // green-600
  statusStopped: "#94a3b8",
  statusWarning: "#ea580c",   // orange-600
  statusError: "#ec4899",     // pink-500 (matches dark Obsidian)
  statusSuccess: "#16a34a",

  buttonPrimary: "#d97706",
  buttonPrimaryHover: "#b45309",
  buttonSecondary: "#ecece8",
  buttonSecondaryHover: "#e2e2dc",
  buttonDanger: "#ec4899",
  buttonDangerHover: "#db2777",

  scrollbarTrack: "#f5f5f3",
  scrollbarThumb: "#d4d4cc",
  scrollbarThumbHover: "#b8b8b0",
};

// GitHub Dark theme
const githubDarkColors: ThemeColors = {
  bgPrimary: "#0d1117",
  bgSecondary: "#161b22",
  bgTertiary: "#21262d",
  bgHover: "#30363d",
  bgSelected: "#388bfd",

  textPrimary: "#f0f6fc",
  textSecondary: "#c9d1d9",
  textMuted: "#8b949e",
  textAccent: "#58a6ff",

  borderPrimary: "#21262d",
  borderSecondary: "#30363d",
  borderAccent: "#58a6ff",

  accentPrimary: "#58a6ff",
  accentSecondary: "#1f6feb",
  accentGlow: "rgba(88, 166, 255, 0.2)",

  statusRunning: "#3fb950",
  statusStopped: "#6e7681",  // Brightened for WCAG AA (3:1)
  statusWarning: "#d29922",
  statusError: "#f85149",
  statusSuccess: "#3fb950",

  buttonPrimary: "#238636",
  buttonPrimaryHover: "#2ea043",
  buttonSecondary: "#21262d",
  buttonSecondaryHover: "#30363d",
  buttonDanger: "#da3633",
  buttonDangerHover: "#f85149",

  scrollbarTrack: "#161b22",
  scrollbarThumb: "#30363d",
  scrollbarThumbHover: "#484f58",
};

// ============================================
// MIDDLE-GROUND THEMES (Between dark and light)
// ============================================

// Slate Dusk - Sophisticated twilight blue-gray with violet accents
// Background brightness: ~40% - perfect middle ground
const slateDuskColors: ThemeColors = {
  bgPrimary: "#3d4451",       // Slate gray - the sweet spot
  bgSecondary: "#464d5c",     // Slightly lighter slate
  bgTertiary: "#505868",      // Elevated surfaces
  bgHover: "#5a6375",         // Hover state
  bgSelected: "#6b7589",      // Selected state

  textPrimary: "#f1f3f5",     // Crisp white
  textSecondary: "#c8cdd5",   // Soft gray
  textMuted: "#8b929e",       // Muted for labels
  textAccent: "#a78bfa",      // Violet accent (distinctive)

  borderPrimary: "#505868",   // Subtle borders
  borderSecondary: "#5a6375", // Slightly more visible
  borderAccent: "#a78bfa",    // Violet accent border

  accentPrimary: "#a78bfa",   // Violet-400
  accentSecondary: "#8b5cf6", // Violet-500
  accentGlow: "rgba(167, 139, 250, 0.2)",

  statusRunning: "#4ade80",   // Green-400
  statusStopped: "#6b7589",   // Matches bg
  statusWarning: "#fbbf24",   // Amber-400
  statusError: "#fb7185",     // Rose-400
  statusSuccess: "#4ade80",

  buttonPrimary: "#8b5cf6",   // Violet-500
  buttonPrimaryHover: "#a78bfa", // Violet-400
  buttonSecondary: "#505868",
  buttonSecondaryHover: "#5a6375",
  buttonDanger: "#f43f5e",    // Rose-500
  buttonDangerHover: "#fb7185",

  scrollbarTrack: "#464d5c",
  scrollbarThumb: "#5a6375",
  scrollbarThumbHover: "#6b7589",
};

// Forest Mist - Warm sage/olive with amber undertones
// Evokes a misty morning in an old-growth forest
const forestMistColors: ThemeColors = {
  bgPrimary: "#3f4a3c",       // Deep sage - earthy green-gray
  bgSecondary: "#4a5647",     // Moss undertone
  bgTertiary: "#566253",      // Lighter sage
  bgHover: "#626f5f",         // Warm hover
  bgSelected: "#6f7d6b",      // Selected with green tint

  textPrimary: "#f5f5f0",     // Warm white (slight cream)
  textSecondary: "#d4d4c8",   // Sage-tinted gray
  textMuted: "#9a9a8e",       // Olive muted
  textAccent: "#fbbf24",      // Amber accent (like sunlight through trees)

  borderPrimary: "#566253",
  borderSecondary: "#626f5f",
  borderAccent: "#fbbf24",

  accentPrimary: "#fbbf24",   // Amber-400 (sunlight)
  accentSecondary: "#f59e0b", // Amber-500
  accentGlow: "rgba(251, 191, 36, 0.2)",

  statusRunning: "#86efac",   // Green-300 (fresh growth)
  statusStopped: "#6f7d6b",
  statusWarning: "#fdba74",   // Orange-300
  statusError: "#fca5a5",     // Red-300
  statusSuccess: "#86efac",

  buttonPrimary: "#f59e0b",   // Amber-500
  buttonPrimaryHover: "#fbbf24",
  buttonSecondary: "#566253",
  buttonSecondaryHover: "#626f5f",
  buttonDanger: "#ef4444",
  buttonDangerHover: "#f87171",

  scrollbarTrack: "#4a5647",
  scrollbarThumb: "#626f5f",
  scrollbarThumbHover: "#6f7d6b",
};

// Rose Quartz - Muted mauve/dusty rose, soft and refined
// Sophisticated and calming mid-tone
const roseQuartzColors: ThemeColors = {
  bgPrimary: "#4a4048",       // Dusty mauve-gray
  bgSecondary: "#554a52",     // Warmer mauve
  bgTertiary: "#60545d",      // Elevated
  bgHover: "#6c5f68",         // Hover
  bgSelected: "#7a6c75",      // Selected with rose undertone

  textPrimary: "#faf7f8",     // Soft rose-white
  textSecondary: "#ddd5d8",   // Mauve-gray
  textMuted: "#a89ba0",       // Dusty rose muted
  textAccent: "#f472b6",      // Pink-400 (signature rose)

  borderPrimary: "#60545d",
  borderSecondary: "#6c5f68",
  borderAccent: "#f472b6",

  accentPrimary: "#f472b6",   // Pink-400
  accentSecondary: "#ec4899", // Pink-500
  accentGlow: "rgba(244, 114, 182, 0.2)",

  statusRunning: "#6ee7b7",   // Emerald-300 (complementary)
  statusStopped: "#7a6c75",
  statusWarning: "#fcd34d",   // Yellow-300
  statusError: "#fca5a5",     // Red-300
  statusSuccess: "#6ee7b7",

  buttonPrimary: "#ec4899",   // Pink-500
  buttonPrimaryHover: "#f472b6",
  buttonSecondary: "#60545d",
  buttonSecondaryHover: "#6c5f68",
  buttonDanger: "#ef4444",
  buttonDangerHover: "#f87171",

  scrollbarTrack: "#554a52",
  scrollbarThumb: "#6c5f68",
  scrollbarThumbHover: "#7a6c75",
};

// Ocean Fog - Cool blue-gray with teal accents
// Coastal, serene, like fog rolling off the sea
const oceanFogColors: ThemeColors = {
  bgPrimary: "#3c464d",       // Cool blue-gray (ocean slate)
  bgSecondary: "#465159",     // Slightly lighter
  bgTertiary: "#515d66",      // Elevated surfaces
  bgHover: "#5c6973",         // Hover
  bgSelected: "#687680",      // Selected

  textPrimary: "#f0f5f7",     // Cool white
  textSecondary: "#c5d0d6",   // Blue-tinted gray
  textMuted: "#8a9aa3",       // Ocean muted
  textAccent: "#2dd4bf",      // Teal-400 (sea foam)

  borderPrimary: "#515d66",
  borderSecondary: "#5c6973",
  borderAccent: "#2dd4bf",

  accentPrimary: "#2dd4bf",   // Teal-400
  accentSecondary: "#14b8a6", // Teal-500
  accentGlow: "rgba(45, 212, 191, 0.2)",

  statusRunning: "#4ade80",   // Green-400
  statusStopped: "#687680",
  statusWarning: "#fbbf24",   // Amber-400
  statusError: "#fb7185",     // Rose-400
  statusSuccess: "#4ade80",

  buttonPrimary: "#14b8a6",   // Teal-500
  buttonPrimaryHover: "#2dd4bf",
  buttonSecondary: "#515d66",
  buttonSecondaryHover: "#5c6973",
  buttonDanger: "#f43f5e",
  buttonDangerHover: "#fb7185",

  scrollbarTrack: "#465159",
  scrollbarThumb: "#5c6973",
  scrollbarThumbHover: "#687680",
};

// High Contrast theme - Maximum accessibility for low vision users
// Pure black/white with bright saturated colors, no subtle grays
const highContrastColors: ThemeColors = {
  bgPrimary: "#000000",       // Pure black
  bgSecondary: "#0a0a0a",     // Near black
  bgTertiary: "#1a1a1a",      // Dark gray for elevation
  bgHover: "#333333",         // Visible hover state
  bgSelected: "#0066cc",      // Bright blue selection

  textPrimary: "#ffffff",     // Pure white
  textSecondary: "#ffffff",   // White (no subtle grays)
  textMuted: "#cccccc",       // Light gray but still high contrast
  textAccent: "#00ffff",      // Bright cyan

  borderPrimary: "#666666",   // Visible borders
  borderSecondary: "#888888", // More visible borders
  borderAccent: "#00ffff",    // Bright cyan accent

  accentPrimary: "#00ffff",   // Bright cyan
  accentSecondary: "#00cccc",
  accentGlow: "rgba(0, 255, 255, 0.3)",

  statusRunning: "#00ff00",   // Bright green
  statusStopped: "#888888",   // Visible gray
  statusWarning: "#ffff00",   // Bright yellow
  statusError: "#ff0000",     // Bright red
  statusSuccess: "#00ff00",

  buttonPrimary: "#0066cc",   // Bright blue
  buttonPrimaryHover: "#0088ff",
  buttonSecondary: "#333333",
  buttonSecondaryHover: "#444444",
  buttonDanger: "#cc0000",
  buttonDangerHover: "#ff0000",

  scrollbarTrack: "#1a1a1a",
  scrollbarThumb: "#666666",
  scrollbarThumbHover: "#888888",
};

// High Contrast Light - For users who prefer light backgrounds with high contrast
const highContrastLightColors: ThemeColors = {
  bgPrimary: "#ffffff",       // Pure white
  bgSecondary: "#f5f5f5",     // Near white
  bgTertiary: "#eeeeee",      // Light gray
  bgHover: "#dddddd",         // Visible hover
  bgSelected: "#0066cc",      // Bright blue selection

  textPrimary: "#000000",     // Pure black
  textSecondary: "#000000",   // Black (no subtle grays)
  textMuted: "#333333",       // Dark gray but readable
  textAccent: "#0000cc",      // Dark blue

  borderPrimary: "#666666",   // Dark visible borders
  borderSecondary: "#444444", // Even darker borders
  borderAccent: "#0000cc",    // Dark blue accent

  accentPrimary: "#0000cc",   // Dark blue (visible on white)
  accentSecondary: "#0000aa",
  accentGlow: "rgba(0, 0, 204, 0.2)",

  statusRunning: "#008800",   // Dark green
  statusStopped: "#666666",   // Dark gray
  statusWarning: "#cc8800",   // Dark orange/amber
  statusError: "#cc0000",     // Dark red
  statusSuccess: "#008800",

  buttonPrimary: "#0000cc",
  buttonPrimaryHover: "#0000ff",
  buttonSecondary: "#dddddd",
  buttonSecondaryHover: "#cccccc",
  buttonDanger: "#cc0000",
  buttonDangerHover: "#ff0000",

  scrollbarTrack: "#eeeeee",
  scrollbarThumb: "#888888",
  scrollbarThumbHover: "#666666",
};

// Default custom theme template (starts as a copy of obsidian)
export const defaultCustomColors: ThemeColors = { ...obsidianColors };

export const BUILT_IN_THEMES: Theme[] = [
  {
    id: "mission-control",
    name: "Mission Control",
    description: "Original cyan and dark theme",
    colors: missionControlColors,
    isBuiltIn: true,
  },
  {
    id: "obsidian",
    name: "Obsidian",
    description: "Warm stone and orange tones",
    colors: obsidianColors,
    isBuiltIn: true,
  },
  {
    id: "cobalt",
    name: "Cobalt",
    description: "Deep blue with golden accents",
    colors: cobaltColors,
    isBuiltIn: true,
  },
  {
    id: "dracula",
    name: "Dracula",
    description: "Purple and pink vampire theme",
    colors: draculaColors,
    isBuiltIn: true,
  },
  {
    id: "nord",
    name: "Nord",
    description: "Arctic, north-bluish color palette",
    colors: nordColors,
    isBuiltIn: true,
  },
  {
    id: "solarized",
    name: "Solarized Dark",
    description: "Classic readable dark theme",
    colors: solarizedColors,
    isBuiltIn: true,
  },
  {
    id: "monokai",
    name: "Monokai",
    description: "Classic editor theme with vibrant colors",
    colors: monokaiColors,
    isBuiltIn: true,
  },
  {
    id: "github-dark",
    name: "GitHub Dark",
    description: "GitHub's official dark theme",
    colors: githubDarkColors,
    isBuiltIn: true,
  },
  // Middle-ground themes (between dark and light)
  {
    id: "slate-dusk",
    name: "Slate Dusk",
    description: "Twilight blue-gray with violet accents",
    colors: slateDuskColors,
    isBuiltIn: true,
  },
  {
    id: "forest-mist",
    name: "Forest Mist",
    description: "Earthy sage with warm amber highlights",
    colors: forestMistColors,
    isBuiltIn: true,
  },
  {
    id: "rose-quartz",
    name: "Rose Quartz",
    description: "Soft mauve with dusty rose accents",
    colors: roseQuartzColors,
    isBuiltIn: true,
  },
  {
    id: "ocean-fog",
    name: "Ocean Fog",
    description: "Coastal blue-gray with teal sea foam",
    colors: oceanFogColors,
    isBuiltIn: true,
  },
  {
    id: "daylight",
    name: "Daylight",
    description: "Clean and bright light theme",
    colors: daylightColors,
    isBuiltIn: true,
  },
  {
    id: "mission-control-light",
    name: "Mission Control Light",
    description: "Light theme with cyan accents",
    colors: missionControlLightColors,
    isBuiltIn: true,
  },
  {
    id: "obsidian-light",
    name: "Obsidian Light",
    description: "Light theme with amber accents",
    colors: obsidianLightColors,
    isBuiltIn: true,
  },
  // Accessibility themes
  {
    id: "high-contrast",
    name: "High Contrast",
    description: "Maximum contrast for accessibility (dark)",
    colors: highContrastColors,
    isBuiltIn: true,
  },
  {
    id: "high-contrast-light",
    name: "High Contrast Light",
    description: "Maximum contrast for accessibility (light)",
    colors: highContrastLightColors,
    isBuiltIn: true,
  },
];

export function getThemeById(id: string): Theme | undefined {
  return BUILT_IN_THEMES.find((theme) => theme.id === id);
}

export function getDefaultTheme(): Theme {
  return BUILT_IN_THEMES[0]; // Mission Control
}




