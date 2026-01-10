/**
 * Frontend Constants
 *
 * Centralized configuration and constants for the frontend application.
 * Eliminates hardcoded values throughout the codebase.
 */

// ==================== Application Config ====================

export const APP_CONFIG = {
  APP_NAME: 'WSL UI',
  APP_DESCRIPTION: 'Manage your Linux distributions',
  REFRESH_INTERVAL_MS: 5000,
  DEBOUNCE_DELAY_MS: 300,
  TOAST_DURATION_MS: 3000,
} as const;

// ==================== Distribution Icons ====================

export const DISTRO_ICONS: Record<string, string> = {
  Ubuntu: '🟠',
  Debian: '🔴',
  Fedora: '🔵',
  Alpine: '🏔️',
  Arch: '🩵',
  'kali-linux': '🐉',
  openSUSE: '🦎',
  Oracle: '🔴',
  Alma: '🟢',
  Rocky: '🟢',
  CentOS: '🟣',
  docker: '🐳',
  podman: '🦭',
  default: '🐧',
};

// ==================== Animation Timings ====================

export const ANIMATION_DELAYS = {
  STAGGER_MS: 50,
  TRANSITION_MS: 150,
  LONG_TRANSITION_MS: 300,
} as const;

// ==================== Default Settings ====================

export const DEFAULT_SETTINGS = {
  WSL_VERSION: 2 as const,
  MEMORY: '4GB',
  PROCESSORS: 4,
  SWAP: '8GB',
  LOCALHOST_FORWARDING: true,
  GUI_APPLICATIONS: true,
  NESTED_VIRTUALIZATION: false,
  DEBUG_CONSOLE: false,
  AUTO_MEMORY_RECLAIM: 'gradual',
  NETWORKING_MODE: 'NAT',
} as const;

// ==================== Helper Functions ====================

/**
 * Get the icon for a distribution name.
 * Matches partial names (e.g., "Ubuntu-22.04" matches "Ubuntu").
 */
export function getDistroIcon(name: string): string {
  // Check for exact match first
  if (DISTRO_ICONS[name]) {
    return DISTRO_ICONS[name];
  }

  // Check for partial matches (e.g., "Ubuntu-22.04" -> "Ubuntu")
  const lowerName = name.toLowerCase();
  for (const [key, icon] of Object.entries(DISTRO_ICONS)) {
    if (key !== 'default' && lowerName.includes(key.toLowerCase())) {
      return icon;
    }
  }

  return DISTRO_ICONS.default;
}





