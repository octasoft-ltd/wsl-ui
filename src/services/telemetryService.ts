/**
 * Telemetry service for tracking anonymous usage events.
 * Events are only sent if the user has opted in via settings.
 * Uses Aptabase (https://aptabase.com) for privacy-focused analytics.
 *
 * The API key is loaded from VITE_APTABASE_KEY environment variable at build time.
 * This keeps the key out of source code for this source-available project.
 * Anyone building from source can use their own Aptabase key or leave it empty.
 */

import { init, trackEvent as aptabaseTrack } from '@aptabase/web';
import { useSettingsStore } from '../store/settingsStore';
import { info, debug } from '../utils/logger';
import type { Distribution, InstallSource } from '../types/distribution';

// Initialize Aptabase with key from environment variable
// The key is only present in production builds, not in source code
const APTABASE_KEY = import.meta.env.VITE_APTABASE_KEY as string | undefined;

let initialized = false;

/**
 * Initialize Aptabase SDK (called once on first track attempt)
 */
function initAptabase(): boolean {
  if (initialized) return true;

  if (!APTABASE_KEY) {
    info('[Telemetry] No VITE_APTABASE_KEY set, telemetry disabled');
    return false;
  }

  try {
    info(`[Telemetry] Initializing Aptabase SDK (key: ${APTABASE_KEY.substring(0, 8)}...)`);
    init(APTABASE_KEY, {
      // Use EU host since the key is EU region
      host: 'https://eu.aptabase.com',
    });
    initialized = true;
    info('[Telemetry] Aptabase SDK initialized successfully');
    return true;
  } catch (error) {
    info(`[Telemetry] Failed to initialize Aptabase: ${error}`);
    return false;
  }
}

/**
 * Check if telemetry is enabled in user settings
 */
function isTelemetryEnabled(): boolean {
  const settings = useSettingsStore.getState().settings;
  return settings?.telemetryEnabled === true;
}

/**
 * Track an event (only sent if telemetry is enabled in settings and key is configured)
 * @param event Event name (e.g., "app_started")
 * @param properties Optional properties (keep minimal and anonymous)
 */
export async function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean>
): Promise<void> {
  // Check user preference first
  if (!isTelemetryEnabled()) {
    debug('[Telemetry] Event not sent - telemetry disabled by user');
    return;
  }

  // Initialize SDK if needed
  if (!initAptabase()) {
    return;
  }

  try {
    info(`[Telemetry] Sending event: ${event}`, properties ? JSON.stringify(properties) : '');
    aptabaseTrack(event, properties);
    info(`[Telemetry] Event sent successfully: ${event}`);
  } catch (error) {
    // Silently fail - telemetry should never break the app
    info(`[Telemetry] Event failed: ${error}`);
  }
}

// Events we track (keep minimal and document in PRIVACY.md)
export const TelemetryEvents = {
  APP_STARTED: 'app_started',
} as const;

/**
 * Count distributions by install source
 */
function countBySource(distributions: Distribution[]): Record<InstallSource, number> {
  const counts: Record<InstallSource, number> = {
    store: 0,
    container: 0,
    download: 0,
    lxc: 0,
    import: 0,
    clone: 0,
    unknown: 0,
  };

  for (const distro of distributions) {
    const source = distro.metadata?.installSource ?? 'unknown';
    counts[source]++;
  }

  return counts;
}

/**
 * Track app started event with distro counts by source type
 */
export async function trackAppStarted(distributions: Distribution[]): Promise<void> {
  const counts = countBySource(distributions);

  await trackEvent(TelemetryEvents.APP_STARTED, {
    distro_total: distributions.length,
    distro_store: counts.store,
    distro_container: counts.container,
    distro_download: counts.download,
    distro_lxc: counts.lxc,
    distro_import: counts.import,
    distro_clone: counts.clone,
    distro_unknown: counts.unknown,
  });
}
