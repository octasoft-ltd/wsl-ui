/**
 * Custom hook for managing Microsoft Store review prompt
 *
 * Encapsulates all logic for:
 * - Determining when to show the review prompt
 * - Handling user responses (review, maybe later, no thanks)
 * - Tracking launch counts for "maybe later" flow
 * - Opening the Microsoft Store review page
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useSettingsStore } from "../store/settingsStore";
import { useDistroStore } from "../store/distroStore";
import { debug, info } from "../utils/logger";

/** Number of launches to wait after "Maybe Later" before showing again */
const REMINDER_LAUNCH_COUNT = 3;

export interface UseReviewPromptReturn {
  /** Whether the review prompt dialog should be shown */
  shouldShowPrompt: boolean;
  /** Handler for when user clicks "Leave a Review" */
  handleReview: () => Promise<void>;
  /** Handler for when user clicks "Maybe Later" */
  handleMaybeLater: () => Promise<void>;
  /** Handler for when user clicks "No Thanks" */
  handleNoThanks: () => Promise<void>;
  /** Call this after a successful distro installation */
  markFirstInstallComplete: () => Promise<void>;
}

export function useReviewPrompt(): UseReviewPromptReturn {
  const { settings, updateSetting, hasLoaded } = useSettingsStore();
  const { distributions } = useDistroStore();
  const [shouldShowPrompt, setShouldShowPrompt] = useState(false);
  const hasProcessedLaunch = useRef(false);

  // Process launch logic once when settings are loaded from disk
  useEffect(() => {
    // Wait until settings have actually been loaded from disk
    if (!hasLoaded || !settings || hasProcessedLaunch.current) return;
    hasProcessedLaunch.current = true;

    const {
      reviewPromptState,
      reviewPromptLaunchCount,
      hasCompletedFirstInstall,
    } = settings;

    debug("[ReviewPrompt] Checking prompt state", {
      reviewPromptState,
      reviewPromptLaunchCount,
      hasCompletedFirstInstall,
      distroCount: distributions.length,
    });

    // For existing users who upgrade: if they have distros but hasCompletedFirstInstall is false,
    // set it to true so they get the prompt
    if (!hasCompletedFirstInstall && distributions.length > 0) {
      info("[ReviewPrompt] Existing user with distros detected, marking first install complete");
      updateSetting("hasCompletedFirstInstall", true);
      // Will trigger prompt on this launch since we're setting it now
      if (reviewPromptState === "pending") {
        setShouldShowPrompt(true);
      }
      return;
    }

    // Already completed or declined - never show again
    if (reviewPromptState === "completed" || reviewPromptState === "declined") {
      debug("[ReviewPrompt] User already completed/declined, not showing");
      return;
    }

    // Pending state - show if first install is complete
    if (reviewPromptState === "pending" && hasCompletedFirstInstall) {
      info("[ReviewPrompt] Showing first review prompt");
      setShouldShowPrompt(true);
      return;
    }

    // Reminded state - check launch count
    if (reviewPromptState === "reminded") {
      if (reviewPromptLaunchCount >= REMINDER_LAUNCH_COUNT) {
        info("[ReviewPrompt] Showing reminder prompt after", reviewPromptLaunchCount, "launches");
        setShouldShowPrompt(true);
      } else {
        // Increment launch counter
        const newCount = reviewPromptLaunchCount + 1;
        debug("[ReviewPrompt] Incrementing launch count to", newCount);
        updateSetting("reviewPromptLaunchCount", newCount);
      }
    }
  }, [hasLoaded, settings, distributions.length, updateSetting]);

  // Handle "Leave a Review" click
  const handleReview = useCallback(async () => {
    info("[ReviewPrompt] User clicked Leave a Review");
    setShouldShowPrompt(false);

    try {
      await invoke("open_store_review");
      info("[ReviewPrompt] Opened Store review page successfully");
    } catch (err) {
      console.error("[ReviewPrompt] Failed to open Store:", err);
    }

    // Mark as completed - never show again
    await updateSetting("reviewPromptState", "completed");
  }, [updateSetting]);

  // Handle "Maybe Later" click
  const handleMaybeLater = useCallback(async () => {
    info("[ReviewPrompt] User clicked Maybe Later");
    setShouldShowPrompt(false);

    const currentState = settings?.reviewPromptState;

    if (currentState === "reminded") {
      // Second time clicking "Maybe Later" - treat as declined
      info("[ReviewPrompt] Second dismissal, marking as declined");
      await updateSetting("reviewPromptState", "declined");
    } else {
      // First time - move to reminded state and reset counter
      info("[ReviewPrompt] Moving to reminded state");
      await updateSetting("reviewPromptState", "reminded");
      await updateSetting("reviewPromptLaunchCount", 0);
    }
  }, [settings?.reviewPromptState, updateSetting]);

  // Handle "No Thanks" click
  const handleNoThanks = useCallback(async () => {
    info("[ReviewPrompt] User clicked No Thanks");
    setShouldShowPrompt(false);
    await updateSetting("reviewPromptState", "declined");
  }, [updateSetting]);

  // Mark first install complete (called after successful distro installation)
  const markFirstInstallComplete = useCallback(async () => {
    if (settings?.hasCompletedFirstInstall) {
      debug("[ReviewPrompt] First install already marked complete");
      return;
    }
    info("[ReviewPrompt] Marking first install complete");
    await updateSetting("hasCompletedFirstInstall", true);
  }, [settings?.hasCompletedFirstInstall, updateSetting]);

  return {
    shouldShowPrompt,
    handleReview,
    handleMaybeLater,
    handleNoThanks,
    markFirstInstallComplete,
  };
}
