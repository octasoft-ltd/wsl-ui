import { invoke } from '@tauri-apps/api/core';

/**
 * Telemetry service for tracking anonymous usage events.
 * Events are only sent if the user has opted in via settings.
 * Uses Aptabase (https://aptabase.com) for privacy-focused analytics.
 *
 * The actual tracking is handled by the Rust backend via the Aptabase plugin.
 * The APTABASE_APP_KEY environment variable must be set at build time.
 */

export interface TelemetryEvent {
  event: string;
  properties?: Record<string, string | number | boolean>;
}

/**
 * Track an event (only sent if telemetry is enabled in settings)
 * @param event Event name (e.g., "app_started", "distro_created")
 * @param properties Optional properties (keep minimal and anonymous)
 */
export async function trackEvent(
  event: string,
  properties?: Record<string, string | number | boolean>
): Promise<void> {
  try {
    await invoke('track_event', {
      event,
      properties: properties ? properties : null,
    });
  } catch (error) {
    // Silently fail - telemetry should never break the app
    console.debug('Telemetry event failed:', error);
  }
}

/**
 * Get current telemetry status from backend settings
 * @returns [enabled, promptSeen]
 */
export async function getTelemetryStatus(): Promise<[boolean, boolean]> {
  return invoke('get_telemetry_status');
}

// Events we actually track (keep minimal and document in PRIVACY.md)
export const TelemetryEvents = {
  APP_STARTED: 'app_started',
} as const;

/**
 * Track app started event with basic info
 */
export async function trackAppStarted(distroCount: number): Promise<void> {
  await trackEvent(TelemetryEvents.APP_STARTED, {
    distro_count: distroCount,
  });
}
