/**
 * E2E Test Utilities for WSL UI
 *
 * These utilities help interact with the Tauri application during E2E tests.
 * They provide helpers for common operations like resetting state, waiting for
 * elements, and interacting with the UI.
 *
 * IMPORTANT: Selector syntax for WebView2/Edge
 * The *=text selector (e.g., $("*=Startup")) is a "partial link text" selector
 * that ONLY works with <a> elements. For text matching in other elements, use:
 * - byText("text") helper below which generates proper xpath
 * - Explicit xpath: //*[contains(text(), 'text')]
 * - For buttons: //button[contains(., 'text')]
 */

import type { ChainablePromiseElement } from "webdriverio";

/**
 * Type alias for element parameters that can accept either the resolved Element
 * or the ChainablePromiseElement returned by $()
 */
type ElementParam = WebdriverIO.Element | ChainablePromiseElement;

/**
 * Find an element by partial text content (works with any element type)
 * Use this instead of *=text selector which only works with <a> elements
 */
export function byText(text: string): string {
  return `//*[contains(text(), '${text}')]`;
}

/**
 * Find a button by partial text content
 */
export function byButtonText(text: string): string {
  return `//button[contains(., '${text}')]`;
}

/**
 * Safe page reload for Tauri WebView2
 * Tries browser.refresh() first, falls back to URL navigation
 * Note: Does NOT wait for app ready - caller should call waitForAppReady() after any setup
 */
export async function safeRefresh(): Promise<void> {
  try {
    await browser.refresh();
  } catch {
    // browser.refresh() can cause "session deleted" errors in WebView2/Edge
    // Fall back to URL navigation
    const currentUrl = await browser.getUrl();
    await browser.url(currentUrl);
  }
}

// ============================================================================
// ROBUST STATE-BASED SYNCHRONIZATION UTILITIES
// These replace arbitrary timeouts with event/state-driven waiting
// ============================================================================

/**
 * Wait for a Zustand store value to match expected condition.
 * This is more robust than arbitrary pauses - it waits for actual state changes.
 *
 * @param storeName - Name of the exposed store (e.g., '__distroStore')
 * @param selector - Function to select value from store state (as string to execute in browser)
 * @param predicate - Function to test if value is ready (as string to execute in browser)
 * @param timeout - Maximum time to wait
 *
 * @example
 * // Wait for actionInProgress to be null (operation complete)
 * await waitForStoreValue('__distroStore', 'state.actionInProgress', 'value === null');
 *
 * // Wait for distro list to be loaded
 * await waitForStoreValue('__distroStore', 'state.distros.length', 'value > 0');
 */
export async function waitForStoreValue(
  storeName: string,
  selectorPath: string,
  predicateCode: string,
  timeout: number = 10000
): Promise<void> {
  await browser.waitUntil(
    async () => {
      return browser.execute(
        (store, selector, predicate) => {
          // @ts-expect-error - Stores are exposed for testing
          const storeInstance = window[store];
          if (!storeInstance) return false;

          const state = storeInstance.getState();
          // Navigate the selector path (e.g., "actionInProgress" or "distros.length")
          const parts = selector.split('.');
          let value: unknown = state;
          for (const part of parts) {
            if (value === null || value === undefined) return false;
            value = (value as Record<string, unknown>)[part];
          }

          // Evaluate the predicate with the value
          // eslint-disable-next-line no-eval
          return eval(predicate);
        },
        storeName,
        selectorPath,
        predicateCode
      );
    },
    {
      timeout,
      interval: 100,
      timeoutMsg: `Store ${storeName}.${selectorPath} did not satisfy condition "${predicateCode}" within ${timeout}ms`,
    }
  );
}

/**
 * Wait for any in-progress distro action to complete.
 * Use this after clicking start/stop/delete buttons to wait for operation completion.
 * More robust than waiting for UI changes since it watches the actual operation state.
 *
 * @example
 * await startButton.click();
 * await waitForActionComplete(); // Waits for operation to finish
 * // Now safe to verify state
 */
export async function waitForActionComplete(timeout: number = 15000): Promise<void> {
  await waitForStoreValue(
    '__distroStore',
    'actionInProgress',
    'value === null',
    timeout
  );
}

/**
 * Wait for distro store to finish loading (isLoading becomes false).
 * Use after triggering a refresh or navigation.
 */
export async function waitForDistrosLoaded(timeout: number = 10000): Promise<void> {
  await waitForStoreValue(
    '__distroStore',
    'isLoading',
    'value === false',
    timeout
  );
}

/**
 * Wait for a notification to appear in the notification store.
 * More robust than waiting for DOM elements since it watches the actual store.
 *
 * @param titlePattern - Partial text to match in notification title (case-insensitive)
 * @param timeout - Maximum time to wait
 */
export async function waitForNotification(
  titlePattern: string,
  timeout: number = 10000
): Promise<void> {
  const lowerPattern = titlePattern.toLowerCase();
  await browser.waitUntil(
    async () => {
      return browser.execute((pattern) => {
        // @ts-expect-error - Store is exposed for testing
        const store = window.__notificationStore;
        if (!store) return false;
        const notifications = store.getState().notifications;
        return notifications.some(
          (n: { title: string }) => n.title.toLowerCase().includes(pattern)
        );
      }, lowerPattern);
    },
    {
      timeout,
      interval: 100,
      timeoutMsg: `Notification with title containing "${titlePattern}" did not appear within ${timeout}ms`,
    }
  );
}

/**
 * Wait for resource stats to be available in the store (not loading).
 * More robust than checking DOM elements.
 */
export async function waitForResourceStatsLoaded(timeout: number = 10000): Promise<void> {
  // First trigger a fetch
  await triggerResourceFetch();

  // Then wait for stats to have data
  await waitForStoreValue(
    '__resourceStore',
    'stats',
    'value !== null && Object.keys(value).length > 0',
    timeout
  );
}

/**
 * Execute an action and wait for it to complete.
 * Combines clicking an element with waiting for the operation to finish.
 *
 * @param clickFn - Async function that triggers the action (e.g., button click)
 * @param timeout - Maximum time to wait for action completion
 *
 * @example
 * await executeAndWaitForComplete(async () => {
 *   const startButton = await card.$('[data-testid="start-button"]');
 *   await startButton.click();
 * });
 */
export async function executeAndWaitForComplete(
  clickFn: () => Promise<void>,
  timeout: number = 15000
): Promise<void> {
  // Execute the click
  await clickFn();

  // Wait a tick for actionInProgress to be set
  await browser.waitUntil(
    async () => {
      return browser.execute(() => {
        // @ts-expect-error - Store is exposed for testing
        const store = window.__distroStore;
        return store && store.getState().actionInProgress !== null;
      });
    },
    { timeout: 2000, interval: 50 }
  ).catch(() => {
    // Action may have already completed - that's OK
  });

  // Now wait for it to complete
  await waitForActionComplete(timeout);
}

/**
 * Wait for the application to be fully loaded and ready.
 * Waits for both DOM and store state to be ready - no arbitrary pauses.
 */
export async function waitForAppReady(): Promise<void> {
  // Wait for the main container to be visible
  await browser.waitUntil(
    async () => {
      const main = await $("main");
      return main.isDisplayed();
    },
    {
      timeout: 10000,
      timeoutMsg: "App did not load within 10 seconds",
    }
  );

  // Wait for distro store to be initialized and loaded (replaces arbitrary pause)
  // This is optional - if store isn't exposed, fall back to waiting for distro cards
  const storeReady = await browser.waitUntil(
    async () => {
      return browser.execute(() => {
        // @ts-expect-error - Store is exposed for testing
        const store = window.__distroStore;
        if (!store) return false;
        const state = store.getState();
        // Ready when: store exists, not loading, and distros array exists
        return !state.isLoading && Array.isArray(state.distros);
      });
    },
    {
      timeout: 5000,
      interval: 100,
    }
  ).then(() => true).catch(() => false);

  // If store-based check didn't work, fall back to waiting for UI elements
  if (!storeReady) {
    await browser.waitUntil(
      async () => {
        // Check for either distro cards or the "no distributions" message
        const cards = await $$('[data-testid^="distro-card"]');
        if (cards.length > 0) return true;
        // Also accept if header is visible (app is loaded even if no distros)
        const header = await $("header");
        return header.isDisplayed();
      },
      {
        timeout: 5000,
        interval: 100,
        timeoutMsg: "App UI did not load within timeout",
      }
    );
  }
}

/**
 * Reset mock state to defaults via Tauri command
 * This should be called BEFORE page refresh to ensure clean state between tests.
 * The page refresh will then fetch fresh data from the reset mock.
 */
export async function resetMockState(): Promise<void> {
  // Execute the reset command via the app's JavaScript context
  // Use executeAsync to properly wait for the Tauri IPC call to complete
  await browser.executeAsync((done) => {
    // @ts-expect-error - Tauri API is available in the window
    window.__TAURI__.core.invoke("reset_mock_state_cmd")
      .then(() => done())
      .catch((err: Error) => done(err));
  });

  // Clear frontend state that should be reset between tests
  // Note: distros will be refreshed naturally when page reloads
  await browser.execute(() => {
    // Clear notification store
    // @ts-expect-error - Store is exposed for e2e testing
    if (window.__notificationStore) {
      // @ts-expect-error - Store is exposed for e2e testing
      window.__notificationStore.getState().clearAll();
    }

    // Clear config pending store and stop its polling
    // @ts-expect-error - Store is exposed for e2e testing
    if (window.__configPendingStore) {
      // @ts-expect-error - Store is exposed for e2e testing
      const configPendingStore = window.__configPendingStore.getState();
      configPendingStore.stopPolling();
      configPendingStore.clearStatus();
    }

    // Mark telemetry prompt as seen to prevent dialog from appearing during tests
    // @ts-expect-error - Store is exposed for e2e testing
    if (window.__settingsStore) {
      // @ts-expect-error - Store is exposed for e2e testing
      const settingsStore = window.__settingsStore.getState();
      if (settingsStore.updateSetting) {
        settingsStore.updateSetting("telemetryPromptSeen", true);
        settingsStore.updateSetting("reviewPromptState", "declined");
      }
    }
  });
}

/**
 * Set a mock error for a specific operation (for testing error scenarios)
 * @param operation - The operation to fail: "start", "stop", "delete", "shutdown", "list", "update"
 * @param errorType - The type of error: "timeout", "command_failed", "not_found", "cancelled"
 * @param delayMs - Milliseconds to wait before returning the error (default: 100)
 */
export async function setMockError(
  operation: string,
  errorType: "timeout" | "command_failed" | "not_found" | "cancelled",
  delayMs: number = 100
): Promise<void> {
  await browser.execute(
    (op, errType, delay) => {
      // @ts-expect-error - Tauri API is available in the window
      return window.__TAURI__.core.invoke("set_mock_error_cmd", {
        operation: op,
        errorType: errType,
        delayMs: delay,
      });
    },
    operation,
    errorType,
    delayMs
  );
}

/**
 * Clear all mock error configurations
 */
export async function clearMockErrors(): Promise<void> {
  await browser.execute(() => {
    // @ts-expect-error - Tauri API is available in the window
    return window.__TAURI__.core.invoke("clear_mock_errors_cmd");
  });
}

/**
 * Clear frontend Zustand store state
 * This resets error banners, notifications, and other UI state that persists between tests.
 * The backend reset (resetMockState) only clears mock data - this clears the React state.
 */
export async function clearFrontendState(): Promise<void> {
  await browser.execute(() => {
    // Clear distro store error state
    // @ts-expect-error - Store is exposed for e2e testing
    if (window.__distroStore) {
      // @ts-expect-error - Store is exposed for e2e testing
      const distroStore = window.__distroStore.getState();
      distroStore.clearError();
    }

    // Clear notification store
    // @ts-expect-error - Store is exposed for e2e testing
    if (window.__notificationStore) {
      // @ts-expect-error - Store is exposed for e2e testing
      const notificationStore = window.__notificationStore.getState();
      notificationStore.clearAll();
    }

    // Clear config pending store and stop its polling
    // @ts-expect-error - Store is exposed for e2e testing
    if (window.__configPendingStore) {
      // @ts-expect-error - Store is exposed for e2e testing
      const configPendingStore = window.__configPendingStore.getState();
      configPendingStore.stopPolling();
      configPendingStore.clearStatus();
    }
  });

  // Wait for state to be cleared (replaces arbitrary pause)
  await browser.waitUntil(
    async () => {
      return browser.execute(() => {
        // @ts-expect-error - Store is exposed for testing
        const notifStore = window.__notificationStore;
        // Ready when notifications are cleared
        return notifStore && notifStore.getState().notifications.length === 0;
      });
    },
    { timeout: 2000, interval: 50 }
  ).catch(() => {
    // If it times out, that's OK - state may already be clear
  });
}

/**
 * Clear config pending state and stop polling
 * Call this after app reload to prevent the "WSL Config Pending Restart" notification
 * from interfering with other notification tests.
 */
export async function clearConfigPendingState(): Promise<void> {
  await browser.execute(() => {
    // @ts-expect-error - Store is exposed for e2e testing
    if (window.__configPendingStore) {
      // @ts-expect-error - Store is exposed for e2e testing
      const configPendingStore = window.__configPendingStore.getState();
      configPendingStore.stopPolling();
      configPendingStore.clearStatus();
    }

    // Also clear any lingering config pending notifications
    // @ts-expect-error - Store is exposed for e2e testing
    if (window.__notificationStore) {
      // @ts-expect-error - Store is exposed for e2e testing
      const notificationStore = window.__notificationStore.getState();
      const notifications = notificationStore.notifications;
      const configNotification = notifications.find(
        (n: { title: string }) => n.title === "WSL Config Pending Restart"
      );
      if (configNotification) {
        notificationStore.removeNotification(configNotification.id);
      }
    }
  });

  // Wait for config pending notification to be removed (replaces arbitrary pause)
  await browser.waitUntil(
    async () => {
      return browser.execute(() => {
        // @ts-expect-error - Store is exposed for testing
        const notifStore = window.__notificationStore;
        if (!notifStore) return true;
        const notifications = notifStore.getState().notifications;
        return !notifications.some(
          (n: { title: string }) => n.title === "WSL Config Pending Restart"
        );
      });
    },
    { timeout: 2000, interval: 50 }
  ).catch(() => {
    // If it times out, that's OK - notification may not exist
  });
}

/**
 * Set the mock update result for testing WSL update scenarios
 * @param resultType - "already_up_to_date" or "updated"
 * @param oldVersion - Previous version (only used when resultType is "updated")
 * @param newVersion - New version (only used when resultType is "updated")
 */
export async function setMockUpdateResult(
  resultType: "already_up_to_date" | "updated",
  oldVersion?: string,
  newVersion?: string
): Promise<void> {
  await browser.execute(
    (resType, oldVer, newVer) => {
      // @ts-expect-error - Tauri API is available in the window
      return window.__TAURI__.core.invoke("set_mock_update_result_cmd", {
        resultType: resType,
        oldVersion: oldVer || null,
        newVersion: newVer || null,
      });
    },
    resultType,
    oldVersion,
    newVersion
  );
}

/**
 * Configure mock download behavior (for testing installation progress)
 * @param delayMs - Total time to simulate download in milliseconds
 * @param error - Optional error message to simulate download failure
 */
export async function setMockDownload(
  delayMs: number = 2000,
  error?: string
): Promise<void> {
  await browser.execute(
    (delay, err) => {
      // @ts-expect-error - Tauri API is available in the window
      // Tauri converts camelCase to snake_case automatically
      return window.__TAURI__.core.invoke("set_mock_download_cmd", {
        delayMs: delay,
        error: err || null,
      });
    },
    delayMs,
    error
  );
}

/**
 * Reset mock download state to defaults
 */
export async function resetMockDownload(): Promise<void> {
  await browser.execute(() => {
    // @ts-expect-error - Tauri API is available in the window
    return window.__TAURI__.core.invoke("reset_mock_download_cmd");
  });
}

/**
 * Wait for download progress events to complete
 * @param distroName - Name of the distribution being installed
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForInstallComplete(
  distroName: string,
  timeout: number = 30000
): Promise<void> {
  await browser.waitUntil(
    async () => {
      // Check if the distribution card exists (installation complete)
      const card = await $(selectors.distroCardByName(distroName));
      return card.isDisplayed();
    },
    {
      timeout,
      timeoutMsg: `Distribution '${distroName}' did not appear within ${timeout}ms`,
    }
  );
}

/**
 * Interface for download progress event data
 */
export interface DownloadProgress {
  distroName: string;
  stage: "downloading" | "importing" | "complete" | "error";
  bytesDownloaded: number;
  totalBytes?: number;
  percent?: number;
}

/**
 * Collect download progress events during an installation
 * @param fn - Function that triggers the installation
 * @returns Array of progress events received
 */
export async function captureProgressEvents(
  fn: () => Promise<void>
): Promise<DownloadProgress[]> {
  const events: DownloadProgress[] = [];

  // Set up listener for progress events
  await browser.execute(() => {
    // @ts-expect-error - Custom global for test
    window.__progressEvents = [];
    // @ts-expect-error - Tauri API is available
    window.__TAURI__.event.listen("download-progress", (event: { payload: unknown }) => {
      // @ts-expect-error - Custom global for test
      window.__progressEvents.push(event.payload);
    });
  });

  // Run the installation function
  await fn();

  // Wait for completion event or timeout (replaces arbitrary pause)
  await browser.waitUntil(
    async () => {
      return browser.execute(() => {
        // @ts-expect-error - Custom global for test
        const events = window.__progressEvents || [];
        // Check if we have a completion or error event
        return events.some(
          (e: { stage: string }) => e.stage === 'complete' || e.stage === 'error'
        );
      });
    },
    { timeout: 5000, interval: 100 }
  ).catch(() => {
    // If no completion event, still collect whatever events we have
  });

  // Collect the events
  const collectedEvents = await browser.execute(() => {
    // @ts-expect-error - Custom global for test
    return window.__progressEvents || [];
  });

  return collectedEvents as DownloadProgress[];
}

/**
 * Get the count of distribution cards displayed
 */
export async function getDistroCardCount(): Promise<number> {
  const cards = await $$('[data-testid^="distro-card"]');
  return cards.length;
}

/**
 * Wait for a distribution's state badge to show a specific state
 * @param distroName - Name of the distribution
 * @param expectedState - Expected state text (e.g., "ONLINE", "OFFLINE")
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForDistroState(
  distroName: string,
  expectedState: string,
  timeout: number = 10000
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const card = await $(selectors.distroCardByName(distroName));
      const badge = await card.$(selectors.stateBadge);
      const stateText = await badge.getText();
      return stateText === expectedState;
    },
    {
      timeout,
      timeoutMsg: `Distribution '${distroName}' did not reach state '${expectedState}' within ${timeout}ms`,
    }
  );
}

/**
 * Wait for error banner to appear
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForErrorBanner(timeout: number = 5000): Promise<WebdriverIO.Element> {
  await browser.waitUntil(
    async () => {
      const banner = await $(selectors.errorBanner);
      return await banner.isDisplayed().catch(() => false);
    },
    {
      timeout,
      timeoutMsg: `Error banner did not appear within ${timeout}ms`,
      interval: 100, // Check every 100ms
    }
  );
  return await $(selectors.errorBanner) as unknown as WebdriverIO.Element;
}

/**
 * Wait for error banner to disappear
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForErrorBannerToDisappear(timeout: number = 5000): Promise<void> {
  await browser.waitUntil(
    async () => {
      const banner = await $(selectors.errorBanner);
      return !(await banner.isDisplayed().catch(() => false));
    },
    {
      timeout,
      timeoutMsg: `Error banner did not disappear within ${timeout}ms`,
    }
  );
}

/**
 * Wait for a dialog to appear
 * @param selector - Optional specific dialog selector (defaults to [role="dialog"])
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForDialog(selector: string = '[role="dialog"]', timeout: number = 5000): Promise<WebdriverIO.Element> {
  await browser.waitUntil(
    async () => {
      const dialog = await $(selector);
      return await dialog.isDisplayed().catch(() => false);
    },
    {
      timeout,
      timeoutMsg: `Dialog '${selector}' did not appear within ${timeout}ms`,
      interval: 100,
    }
  );
  return await $(selector) as unknown as WebdriverIO.Element;
}

/**
 * Wait for a dialog to disappear
 * @param selector - Optional specific dialog selector (defaults to [role="dialog"])
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForDialogToDisappear(selector: string = '[role="dialog"]', timeout: number = 5000): Promise<void> {
  await browser.waitUntil(
    async () => {
      const dialog = await $(selector);
      return !(await dialog.isDisplayed().catch(() => false));
    },
    {
      timeout,
      timeoutMsg: `Dialog '${selector}' did not disappear within ${timeout}ms`,
    }
  );
}

/**
 * Wait for element to have specific text content
 * @param element - WebdriverIO element
 * @param expectedText - Text to wait for (case-insensitive partial match)
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForElementText(
  element: ElementParam,
  expectedText: string,
  timeout: number = 5000
): Promise<string> {
  let actualText = "";
  const el = element as unknown as WebdriverIO.Element;
  await browser.waitUntil(
    async () => {
      actualText = await el.getText();
      return actualText.toLowerCase().includes(expectedText.toLowerCase());
    },
    {
      timeout,
      timeoutMsg: `Element did not contain text '${expectedText}' within ${timeout}ms. Actual: '${actualText}'`,
    }
  );
  return actualText;
}

/**
 * Wait for a button to be enabled (not disabled)
 * @param button - WebdriverIO button element
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForButtonEnabled(button: ElementParam, timeout: number = 5000): Promise<void> {
  const btn = button as unknown as WebdriverIO.Element;
  await browser.waitUntil(
    async () => {
      const disabled = await btn.getAttribute("disabled");
      return disabled === null;
    },
    {
      timeout,
      timeoutMsg: "Button did not become enabled within timeout",
    }
  );
}

/**
 * Wait for a button to be disabled
 * @param button - WebdriverIO button element
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForButtonDisabled(button: ElementParam, timeout: number = 5000): Promise<void> {
  const btn = button as unknown as WebdriverIO.Element;
  await browser.waitUntil(
    async () => {
      const disabled = await btn.getAttribute("disabled");
      return disabled !== null;
    },
    {
      timeout,
      timeoutMsg: "Button did not become disabled within timeout",
    }
  );
}

/**
 * Verify error banner contains expected text patterns
 * @param expectedPatterns - Array of text patterns (any one must match)
 * @param timeout - Maximum time to wait for error banner
 */
export async function verifyErrorBannerContent(
  expectedPatterns: string[],
  timeout: number = 5000
): Promise<{ banner: WebdriverIO.Element; errorText: string }> {
  const banner = await waitForErrorBanner(timeout);

  // Wait for error message text to be populated (allow time for React to render)
  await browser.waitUntil(
    async () => {
      const errorMessage = await banner.$(selectors.errorMessage);
      const text = await errorMessage.getText();
      return text.length > 0;
    },
    { timeout: 3000, timeoutMsg: "Error message text did not appear" }
  );

  const errorMessage = await banner.$(selectors.errorMessage);
  const errorText = await errorMessage.getText();

  const lowerText = errorText.toLowerCase();
  const hasMatch = expectedPatterns.some(pattern => lowerText.includes(pattern.toLowerCase()));

  if (!hasMatch) {
    throw new Error(`Error banner does not contain any of: [${expectedPatterns.join(", ")}]. Actual: '${errorText}'`);
  }

  return { banner, errorText };
}

/**
 * Verify distro card exists and has expected state
 * @param distroName - Name of the distribution
 * @param expectedState - Expected state (ONLINE/OFFLINE)
 */
export async function verifyDistroCardState(distroName: string, expectedState: string): Promise<void> {
  const card = await $(selectors.distroCardByName(distroName));
  await expect(card).toBeDisplayed();

  const badge = await card.$(selectors.stateBadge);
  const stateText = await badge.getText();
  expect(stateText).toBe(expectedState);
}

/**
 * Wait for an element to be clickable (not disabled)
 * @param element - WebdriverIO element
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForElementClickable(
  element: ElementParam,
  timeout: number = 5000
): Promise<void> {
  const el = element as unknown as WebdriverIO.Element;
  await browser.waitUntil(
    async () => {
      const isDisplayed = await el.isDisplayed().catch(() => false);
      if (!isDisplayed) return false;
      const disabled = await el.getAttribute("disabled");
      return disabled === null;
    },
    {
      timeout,
      timeoutMsg: "Element did not become clickable within timeout",
    }
  );
}

/**
 * Wait for and click a confirmation dialog button
 * @param confirm - true to click confirm button, false to click cancel
 * @param confirmText - optional text for the confirm button (defaults to "Delete")
 */
export async function confirmDialog(confirm: boolean = true, confirmText: string = "Delete"): Promise<void> {
  const buttonText = confirm ? confirmText : "Cancel";

  // First find the dialog, then find the button within it
  let dialog = await $('[role="dialog"]');
  if (!(await dialog.isDisplayed().catch(() => false))) {
    dialog = await $('[data-testid="confirm-dialog"]');
  }

  const button = await dialog.$(`button*=${buttonText}`);
  await button.waitForDisplayed({ timeout: 5000 });
  await button.click();
}

// ============================================================================
// STORY-005: Error Message Verification Helpers
// ============================================================================

/**
 * Expected error message patterns for consistent verification.
 * Use these constants instead of ad-hoc strings in tests.
 */
export const EXPECTED_ERRORS = {
  TIMEOUT: {
    patterns: ["timed out", "timeout"],
    tip: "Force Shutdown WSL",
  },
  ALREADY_EXISTS: {
    patterns: ["already exists"],
  },
  PERMISSION: {
    patterns: ["permission denied", "access denied"],
  },
  NOT_FOUND: {
    patterns: ["not found", "does not exist"],
  },
  CANCELLED: {
    patterns: ["cancelled", "canceled"],
  },
  COMMAND_FAILED: {
    patterns: ["failed", "error"],
  },
  VALIDATION: {
    NAME_REQUIRED: "name is required",
    NAME_EXISTS: "already exists",
    INVALID_PATH: "invalid path",
    INVALID_CHARS: "can only contain",
  },
};

/**
 * Options for comprehensive error banner verification
 */
export interface VerifyErrorBannerOptions {
  /** Pattern(s) that must appear in error message (any one must match) */
  expectedPatterns: string[];
  /** Context strings that should appear (e.g., distro name, operation type) */
  shouldContainContext?: string[];
  /** Whether to verify timeout tip is shown */
  shouldHaveTip?: boolean;
  /** Whether to click dismiss and verify banner closes */
  shouldDismiss?: boolean;
  /** Timeout for waiting for error banner */
  timeout?: number;
}

/**
 * Comprehensive error banner verification with all checks.
 * Use this for thorough error message testing.
 *
 * @example
 * await verifyErrorBanner({
 *   expectedPatterns: EXPECTED_ERRORS.TIMEOUT.patterns,
 *   shouldContainContext: ["Debian", "start"],
 *   shouldHaveTip: true,
 *   shouldDismiss: true,
 * });
 */
export async function verifyErrorBanner(options: VerifyErrorBannerOptions): Promise<{
  banner: WebdriverIO.Element;
  errorText: string;
}> {
  const timeout = options.timeout ?? 5000;

  // Wait for and get error banner
  const banner = await waitForErrorBanner(timeout);

  // Wait for error message text to be populated
  await browser.waitUntil(
    async () => {
      const errorMessage = await banner.$(selectors.errorMessage);
      const text = await errorMessage.getText();
      return text.length > 0;
    },
    { timeout: 3000, timeoutMsg: "Error message text did not appear" }
  );

  const errorMessage = await banner.$(selectors.errorMessage);
  const errorText = await errorMessage.getText();
  const lowerText = errorText.toLowerCase();

  // Verify at least one expected pattern matches
  const hasPattern = options.expectedPatterns.some(p =>
    lowerText.includes(p.toLowerCase())
  );
  if (!hasPattern) {
    throw new Error(
      `Error banner missing expected pattern. ` +
      `Expected one of: [${options.expectedPatterns.join(", ")}]. ` +
      `Actual: "${errorText}"`
    );
  }

  // Verify context (distro name, operation type)
  if (options.shouldContainContext) {
    for (const ctx of options.shouldContainContext) {
      if (!lowerText.includes(ctx.toLowerCase())) {
        throw new Error(
          `Error banner missing context "${ctx}". Actual: "${errorText}"`
        );
      }
    }
  }

  // Verify tip for timeout errors
  if (options.shouldHaveTip) {
    // Check for either the tip text OR the Force Shutdown button
    const tipElement = await banner.$(selectors.timeoutErrorTip);
    const tipDisplayed = await tipElement.isDisplayed().catch(() => false);
    const forceShutdownBtn = await banner.$(selectors.forceShutdownButton);
    const forceShutdownDisplayed = await forceShutdownBtn.isDisplayed().catch(() => false);

    // Timeout errors should show either the tip text or Force Shutdown button
    if (!tipDisplayed && !forceShutdownDisplayed) {
      throw new Error("Timeout tip section not displayed - neither tip text nor Force Shutdown button found");
    }
    // Note: Tip content varies - may mention terminal windows or other context
  }

  // Verify dismiss functionality
  if (options.shouldDismiss) {
    const dismissBtn = await banner.$(selectors.errorDismissButton);
    const dismissDisplayed = await dismissBtn.isDisplayed().catch(() => false);
    if (dismissDisplayed) {
      await dismissBtn.click();
      await waitForErrorBannerToDisappear(3000);
    }
  }

  return { banner, errorText };
}

/**
 * Verify error banner appears and then dismiss it.
 * Convenience function for tests that just need to check error occurred.
 */
export async function verifyAndDismissError(
  expectedPatterns: string[],
  timeout: number = 5000
): Promise<string> {
  const { errorText } = await verifyErrorBanner({
    expectedPatterns,
    shouldDismiss: true,
    timeout,
  });
  return errorText;
}

// ============================================================================
// STORY-006: State Consistency Verification Helpers
// ============================================================================

/**
 * Snapshot of a distribution's state
 */
export interface DistroSnapshot {
  name: string;
  state: string;
}

/**
 * Capture current state of all visible distribution cards.
 * Use before operations to verify no unintended side effects.
 *
 * @example
 * const snapshot = await captureDistroStates();
 * await startDistro("Debian");
 * await verifyStatesUnchanged(snapshot, [{ name: "Debian", newState: "ONLINE" }]);
 */
export async function captureDistroStates(): Promise<DistroSnapshot[]> {
  const cards = await $$(selectors.distroCard);
  const states: DistroSnapshot[] = [];

  for (const card of cards) {
    const testId = await card.getAttribute("data-testid");
    const name = testId?.replace("distro-card-", "") || "";
    if (!name) continue;

    const badge = await card.$(selectors.stateBadge);
    const state = await badge.getText().catch(() => "UNKNOWN");
    states.push({ name, state });
  }

  return states;
}

/**
 * Verify distro states match snapshot, except for specified changes.
 * Use after operations to verify only intended distros changed state.
 *
 * @param snapshot - State snapshot from before the operation
 * @param exceptChanges - Expected state changes (distros that should have new states)
 * @param allowNewDistros - If true, allows new distros to appear (for clone operations)
 */
export async function verifyStatesUnchanged(
  snapshot: DistroSnapshot[],
  exceptChanges: { name: string; newState: string }[] = [],
  allowNewDistros: boolean = false
): Promise<void> {
  const currentStates = await captureDistroStates();

  // Build expected states
  const expected = snapshot.map(s => {
    const change = exceptChanges.find(c => c.name === s.name);
    return change ? { ...s, state: change.newState } : s;
  });

  // Verify expected distros have correct state
  for (const exp of expected) {
    const current = currentStates.find(c => c.name === exp.name);
    if (!current) {
      throw new Error(`Distro "${exp.name}" missing from list after operation`);
    }
    if (current.state !== exp.state) {
      throw new Error(
        `Distro "${exp.name}" state mismatch: expected "${exp.state}", got "${current.state}"`
      );
    }
  }

  // Check no unexpected distros disappeared
  if (!allowNewDistros && currentStates.length < expected.length) {
    const missingNames = expected
      .filter(e => !currentStates.find(c => c.name === e.name))
      .map(e => e.name);
    throw new Error(`Distros unexpectedly removed: [${missingNames.join(", ")}]`);
  }

  // If not allowing new distros, verify count matches
  if (!allowNewDistros && currentStates.length !== expected.length) {
    throw new Error(
      `Distro count mismatch: expected ${expected.length}, got ${currentStates.length}`
    );
  }
}

/**
 * Verify state after a start operation.
 * Checks the started distro is ONLINE and all others unchanged.
 */
export async function verifyAfterStart(
  startedDistro: string,
  preSnapshot: DistroSnapshot[]
): Promise<void> {
  await waitForDistroState(startedDistro, "ONLINE");
  await verifyStatesUnchanged(preSnapshot, [{ name: startedDistro, newState: "ONLINE" }]);
}

/**
 * Verify state after a stop operation.
 * Checks the stopped distro is OFFLINE and all others unchanged.
 */
export async function verifyAfterStop(
  stoppedDistro: string,
  preSnapshot: DistroSnapshot[]
): Promise<void> {
  await waitForDistroState(stoppedDistro, "OFFLINE");
  await verifyStatesUnchanged(preSnapshot, [{ name: stoppedDistro, newState: "OFFLINE" }]);
}

/**
 * Verify state after a clone operation.
 * Checks clone appeared OFFLINE, original unchanged, count increased by 1.
 */
export async function verifyAfterClone(
  sourceDistro: string,
  cloneName: string,
  preSnapshot: DistroSnapshot[]
): Promise<void> {
  // Wait for clone to appear
  await waitForDistroState(cloneName, "OFFLINE");

  // Verify original unchanged
  const sourceState = preSnapshot.find(s => s.name === sourceDistro)?.state;
  if (sourceState) {
    await verifyDistroCardState(sourceDistro, sourceState);
  }

  // Verify total count increased by 1
  const count = await getDistroCardCount();
  if (count !== preSnapshot.length + 1) {
    throw new Error(
      `After clone, expected ${preSnapshot.length + 1} distros, got ${count}`
    );
  }

  // Verify other distros unchanged (allow new clone)
  await verifyStatesUnchanged(preSnapshot, [], true);
}

/**
 * Verify state after a delete operation.
 * Checks deleted distro is gone, others unchanged, count decreased by 1.
 */
export async function verifyAfterDelete(
  deletedDistro: string,
  preSnapshot: DistroSnapshot[]
): Promise<void> {
  // Wait for distro to disappear
  await browser.waitUntil(
    async () => {
      const card = await $(selectors.distroCardByName(deletedDistro));
      return !(await card.isDisplayed().catch(() => false));
    },
    { timeout: 5000, timeoutMsg: `Distro "${deletedDistro}" was not removed from list` }
  );

  // Verify count decreased
  const count = await getDistroCardCount();
  if (count !== preSnapshot.length - 1) {
    throw new Error(
      `After delete, expected ${preSnapshot.length - 1} distros, got ${count}`
    );
  }

  // Verify other distros unchanged
  const remainingExpected = preSnapshot.filter(s => s.name !== deletedDistro);
  for (const exp of remainingExpected) {
    await verifyDistroCardState(exp.name, exp.state);
  }
}

/**
 * Verify resource stats are cleared after stopping a distribution.
 * Memory/CPU should show placeholder values.
 */
export async function verifyResourcesCleared(distroName: string): Promise<void> {
  await browser.waitUntil(
    async () => {
      const card = await $(selectors.distroCardByName(distroName));
      const memory = await card.$(selectors.memoryLabel);
      const text = await memory.getText().catch(() => "");
      // Empty, dash, or em-dash indicates cleared
      return text === "" || text === "—" || text === "-" || text === "–";
    },
    { timeout: 5000, timeoutMsg: `Resource stats for "${distroName}" were not cleared` }
  );
}

/**
 * Test data representing the default mock distributions
 * This matches the data in src-tauri/src/wsl/executor/wsl_command/mock.rs
 * and src-tauri/src/metadata.rs
 *
 * Includes varied:
 * - WSL versions (1 and 2)
 * - States (Running and Stopped)
 * - Install sources (store, lxc, container, download, import, clone, unknown)
 */
export const mockDistributions = [
  // WSL 2 - Running - Store install (default)
  { name: "Ubuntu", state: "Running", version: 2, isDefault: true, source: "store" },
  // WSL 2 - Stopped - LXC install
  { name: "Debian", state: "Stopped", version: 2, isDefault: false, source: "lxc" },
  // WSL 2 - Stopped - Container install
  { name: "Alpine", state: "Stopped", version: 2, isDefault: false, source: "container" },
  // WSL 2 - Running - Download install
  { name: "Ubuntu-22.04", state: "Running", version: 2, isDefault: false, source: "download" },
  // WSL 2 - Stopped - Import
  { name: "Fedora", state: "Stopped", version: 2, isDefault: false, source: "import" },
  // WSL 1 - Stopped - Clone
  { name: "Ubuntu-legacy", state: "Stopped", version: 1, isDefault: false, source: "clone" },
  // WSL 1 - Running - Unknown source
  { name: "Arch", state: "Running", version: 1, isDefault: false, source: "unknown" },
];

/**
 * Helper functions for mock data analysis
 */
export const mockDataHelpers = {
  getRunningCount: () => mockDistributions.filter(d => d.state === "Running").length,
  getStoppedCount: () => mockDistributions.filter(d => d.state !== "Running").length,
  getWsl1Count: () => mockDistributions.filter(d => d.version === 1).length,
  getWsl2Count: () => mockDistributions.filter(d => d.version === 2).length,
  getBySource: (source: string) => mockDistributions.filter(d => d.source === source),
  getSources: () => [...new Set(mockDistributions.map(d => d.source))],
};

/**
 * Mock resource data for running distributions
 * This matches the data in src-tauri/src/wsl/mock.rs get_distro_resource_usage()
 */
export const mockResourceData: Record<string, { memory: string; cpu: string }> = {
  "Ubuntu": { memory: "512", cpu: "2.5" },          // ~512MB, 2.5% CPU
  "Ubuntu-22.04": { memory: "384", cpu: "1.8" },    // ~384MB, 1.8% CPU
  "Arch": { memory: "256", cpu: "0.5" },            // ~256MB, 0.5% CPU (WSL 1)
};

/**
 * Force trigger a resource stats fetch by calling the exposed store directly
 * This bypasses the polling system which may be paused due to window being unfocused during tests
 */
export async function triggerResourceFetch(): Promise<void> {
  // Call the exposed resource store's fetchStats method directly
  await browser.execute(async () => {
    // @ts-expect-error - Store is exposed for testing
    if (window.__resourceStore) {
      // @ts-expect-error - Store API
      await window.__resourceStore.getState().fetchStats();
    }
  });

  // Wait for resource store to have data (replaces arbitrary pause)
  await browser.waitUntil(
    async () => {
      return browser.execute(() => {
        // @ts-expect-error - Store is exposed for testing
        const store = window.__resourceStore;
        if (!store) return false;
        const state = store.getState();
        // Ready when not loading and stats object has entries
        return !state.isLoading && state.stats && Object.keys(state.stats).length > 0;
      });
    },
    { timeout: 5000, interval: 50 }
  ).catch(() => {
    // If no stats after timeout, continue - test will catch the actual issue
  });
}

/**
 * Wait for resource stats to be fetched and displayed
 * Resources are polled every 5 seconds when running distros exist
 * This waits until at least one memory element shows an actual value (not placeholder)
 */
export async function waitForResourceStats(): Promise<void> {
  // First, force a resource fetch since polling may be paused (window unfocused during tests)
  await triggerResourceFetch();

  await browser.waitUntil(
    async () => {
      // Check if any Memory stats show actual values (not placeholder "—")
      const memoryElements = await $$('[data-testid="memory-usage"]');
      for (const el of memoryElements) {
        const text = await el.getText();
        // Check if the text contains a memory value pattern (e.g., "488.3 MB", "1.5 GB")
        if (text !== "—" && /\d+(\.\d+)?\s*(B|KB|MB|GB|TB)/i.test(text)) {
          return true;
        }
      }
      // Trigger another fetch in case the first one didn't update yet
      await triggerResourceFetch();
      return false;
    },
    {
      timeout: 15000,
      interval: 1000,
      timeoutMsg: "Resource stats with actual values did not load within 15 seconds",
    }
  );
}

/**
 * Selectors for common UI elements
 */
export const selectors = {
  // Main page
  header: "header",
  main: "main",
  distroGrid: ".grid",

  // Distribution cards
  distroCard: '[data-testid^="distro-card"]',
  distroCardByName: (name: string) => `[data-testid="distro-card-${name}"]`,
  startButton: '[data-testid="start-button"]',
  stopButton: '[data-testid="stop-button"]',
  deleteButton: '[data-testid="delete-button"]',
  stateBadge: '[data-testid="state-badge"]',

  // Header buttons
  newDistroButton: '[data-testid="new-distro-button"]',
  importButton: '[data-testid="import-button"]',
  refreshButton: '[data-testid="refresh-button"]',
  shutdownAllButton: '[data-testid="shutdown-all-button"]',
  settingsButton: '[data-testid="settings-button"]',

  // Dialogs
  dialog: '[role="dialog"]',
  confirmDialog: '[data-testid="confirm-dialog"]',
  dialogTitle: '[role="dialog"] h3',
  dialogConfirmButton: '[data-testid="dialog-confirm-button"]',
  dialogCancelButton: '[data-testid="dialog-cancel-button"]',

  // Settings page
  backButton: '[data-testid="back-button"]',
  settingsTab: (tabId: string) => `[data-testid="settings-tab-${tabId}"]`,

  // Loading states
  loadingSpinner: ".animate-spin",
  loadingText: '*=Loading',

  // Quick Actions
  quickActionsButton: '[data-testid="quick-actions-button"]',
  quickActionsMenu: '[data-testid="quick-actions-menu"]',
  quickAction: (id: string) => `[data-testid="quick-action-${id}"]`,
  explorerAction: '[data-testid="quick-action-explorer"]',
  ideAction: '[data-testid="quick-action-ide"]',
  exportAction: '[data-testid="quick-action-export"]',
  setDefaultAction: '[data-testid="quick-action-default"]',
  restartAction: '[data-testid="quick-action-restart"]',
  infoAction: '[data-testid="quick-action-info"]',

  // Manage Submenu Actions
  manageSubmenu: '[data-testid="quick-action-manage"]',
  manageAction: (id: string) => `[data-testid="manage-action-${id}"]`,
  moveAction: '[data-testid="manage-action-move"]',
  resizeAction: '[data-testid="manage-action-resize"]',
  setUserAction: '[data-testid="manage-action-user"]',
  sparseAction: '[data-testid="manage-action-sparse"]',
  forceStopAction: '[data-testid="quick-action-force-stop"]',

  // Custom Actions
  newActionButton: '[data-testid="new-action-button"]',
  importActionsButton: '[data-testid="import-actions-button"]',
  exportActionsButton: '[data-testid="export-actions-button"]',
  actionNameInput: '[data-testid="action-name-input"]',
  actionCommandInput: '[data-testid="action-command-input"]',
  saveActionButton: '[data-testid="save-action-button"]',

  // Theme Settings
  themeButton: (id: string) => `[data-testid="theme-${id}"]`,

  // Resource display
  memoryLabel: '[data-testid="memory-usage"]',
  cpuLabel: '[data-testid="cpu-usage"]',
  statusBar: '[data-testid="status-bar"]',

  // Disk Mount
  diskMountButton: 'button[title*="Disk"]',
  mountedDisksPanel: '*=WSL Disk Mounts',
  mountDiskButton: 'button*=Mount Disk',
  unmountAllButton: 'button*=Unmount All',
  vhdTab: 'button*=Mount VHD',
  physicalDiskTab: 'button*=Mount Physical Disk',

  // Rename Dialog
  renameAction: '[data-testid="manage-action-rename"]',
  renameDialog: '[data-testid="rename-dialog"]',
  renameNameInput: '[data-testid="rename-name-input"]',
  renameUpdateTerminal: '[data-testid="rename-update-terminal"]',
  renameUpdateShortcut: '[data-testid="rename-update-shortcut"]',
  renameTerminalOption: '[data-testid="rename-terminal-option"]',
  renameShortcutOption: '[data-testid="rename-shortcut-option"]',
  renameCancelButton: '[data-testid="rename-cancel-button"]',
  renameConfirmButton: '[data-testid="rename-confirm-button"]',
  renameError: '[data-testid="rename-error"]',
  renameValidationError: '[data-testid="rename-validation-error"]',

  // Error Banner (global error display)
  errorBanner: '[data-testid="error-banner"]',
  errorMessage: '[data-testid="error-message"]',
  errorDismissButton: '[data-testid="error-dismiss-button"]',
  forceShutdownButton: 'button*=Force Shutdown WSL',
  timeoutErrorTip: '[data-testid="error-banner"] .text-xs', // Tip text for timeout errors

  // Compact Dialog
  compactAction: '[data-testid="manage-action-compact"]',
  compactDialog: '[role="dialog"]', // Uses role="dialog" from Modal component
  compactVirtualSize: '[data-testid="compact-virtual-size"]',
  compactFileSize: '[data-testid="compact-file-size"]',
  compactProgress: '[data-testid="compact-progress"]',
  compactElapsedTime: '[data-testid="compact-elapsed-time"]',
  compactError: '[data-testid="compact-error"]',
  compactCancelButton: '[data-testid="compact-cancel-button"]',
  compactConfirmButton: '[data-testid="compact-confirm-button"]',
  compactingBadge: '[data-testid="compacting-badge"]',

  // Clone Dialog
  cloneAction: '[data-testid="quick-action-clone"]',
  cloneDialog: '[data-testid="clone-dialog"]',
  cloneNameInput: '[data-testid="clone-name-input"]',
  cloneLocationInput: '[data-testid="clone-location-input"]',
  cloneBrowseButton: '[data-testid="browse-button"]',
  cloneCancelButton: '[data-testid="clone-cancel-button"]',
  cloneConfirmButton: '[data-testid="clone-confirm-button"]',
  cloneError: '[data-testid="clone-error"]',
  cloneValidationError: '[data-testid="clone-validation-error"]',
  clonePathError: '[data-testid="clone-path-error"]',
  cloneProgress: '[data-testid="clone-progress"]',

  // New Distribution Dialog
  newDistroDialog: '[data-testid="new-distro-dialog"]',
  newDistroTabs: '[data-testid="new-distro-tabs"]',
  newDistroTabQuickInstall: '[data-testid="new-distro-tab-quick-install"]',
  newDistroTabDownload: '[data-testid="new-distro-tab-download"]',
  newDistroTabContainer: '[data-testid="new-distro-tab-container"]',
  newDistroTabLxc: '[data-testid="new-distro-tab-lxc"]',
  newDistroNameInput: '[data-testid="new-distro-name-input"]',
  newDistroLocationInput: '[data-testid="new-distro-location-input"]',
  newDistroCancelButton: '[data-testid="new-distro-cancel-button"]',
  newDistroInstallButton: '[data-testid="new-distro-install-button"]',
  newDistroProgress: '[data-testid="new-distro-progress"]',
  newDistroError: '[data-testid="new-distro-error"]',
  distroSelectDropdown: '[data-testid="distro-select"]',

  // Install Progress
  installProgress: '[data-testid="install-progress"]',
  installProgressBar: '[data-testid="install-progress-bar"]',
  installProgressText: '[data-testid="install-progress-text"]',
  installError: '[data-testid="install-error"]',
  installErrorText: '[data-testid="install-error-text"]',

  // Stop And Action Dialog
  stopAndActionDialog: '[data-testid="stop-and-action-dialog"]',
  stopAndContinueButton: '[data-testid="stop-and-continue-button"]',
  stopDialogCancelButton: '[data-testid="stop-dialog-cancel-button"]',
  stopDialogLoading: '[data-testid="stop-dialog-loading"]',
  requiresStopIndicator: '[data-testid="requires-stop-indicator"]',

  // Distribution Info Dialog
  wslVersionBadge: '[data-testid="wsl-version-badge"]',
  distroInfoDialog: '[data-testid="distro-info-dialog"]',
  infoName: '[data-testid="info-name"]',
  infoId: '[data-testid="info-id"]',
  infoVersion: '[data-testid="info-version"]',
  infoDefault: '[data-testid="info-default"]',
  infoLocation: '[data-testid="info-location"]',
  infoDiskSize: '[data-testid="info-disk-size"]',
  infoSource: '[data-testid="info-source"]',
  infoSourceRef: '[data-testid="info-source-ref"]',
  infoInstalledAt: '[data-testid="info-installed-at"]',
  infoCloseButton: '[data-testid="info-close-button"]',

  // Install Config Dialog (used for Community, Container, Download modes)
  installConfigDialog: '[data-testid="install-config-dialog"]',
  installConfigNameInput: '[data-testid="install-config-name-input"]',
  installConfigLocationInput: '[data-testid="install-config-location-input"]',
  installConfigCancelButton: '[data-testid="install-config-cancel-button"]',
  installConfigConfirmButton: '[data-testid="install-config-confirm-button"]',
  installConfigNameError: '[data-testid="install-config-name-error"]',
  installConfigPathError: '[data-testid="install-config-path-error"]',

  // WSL Update (Status Bar)
  wslUpdateButton: '[data-testid="wsl-update-button"]',
  wslUpdateSpinner: '[data-testid="wsl-update-spinner"]',

  // Notification Banner
  notificationBanner: '[data-testid="notification-banner"]',
  notificationTitle: '[data-testid="notification-title"]',
  notificationMessage: '[data-testid="notification-message"]',
  notificationDismissButton: '[data-testid="notification-dismiss-button"]',
};





// Preflight Banner selectors
export const preflightSelectors = {
  preflightBanner: '[data-testid="preflight-banner"]',
  preflightRetryButton: 'button*=Retry Check',
  preflightLearnMoreButton: 'button*=Learn More',
};

/**
 * Set a mock preflight error for testing WSL unavailable scenarios
 * This configures the mock to return a preflight error on next check
 * @param errorPattern - The error pattern to trigger specific status:
 *   - "not found" or "not installed" -> NotInstalled
 *   - "0x8007019e" -> FeatureDisabled  
 *   - "0x80370102" -> VirtualizationDisabled
 *   - anything else -> Unknown
 */
export async function setMockPreflightError(errorPattern: string): Promise<void> {
  await browser.execute((pattern) => {
    // @ts-expect-error - Tauri API is available in the window
    return window.__TAURI__.core.invoke("set_mock_error_cmd", {
      operation: "preflight",
      errorType: "command_failed",
      errorMessage: pattern,
    });
  }, errorPattern);
}

/**
 * Clear the preflight error and reset to ready state
 */
export async function clearMockPreflightError(): Promise<void> {
  await clearMockErrors();
}

/**
 * Wait for preflight banner to appear
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForPreflightBanner(timeout: number = 5000): Promise<WebdriverIO.Element> {
  await browser.waitUntil(
    async () => {
      const banner = await $(preflightSelectors.preflightBanner);
      return await banner.isDisplayed().catch(() => false);
    },
    {
      timeout,
      timeoutMsg: `Preflight banner did not appear within ${timeout}ms`,
      interval: 100,
    }
  );
  return await $(preflightSelectors.preflightBanner) as unknown as WebdriverIO.Element;
}

/**
 * Wait for preflight banner to disappear (WSL becomes ready)
 * @param timeout - Maximum time to wait in milliseconds
 */
export async function waitForPreflightBannerToDisappear(timeout: number = 5000): Promise<void> {
  await browser.waitUntil(
    async () => {
      const banner = await $(preflightSelectors.preflightBanner);
      return !(await banner.isDisplayed().catch(() => false));
    },
    {
      timeout,
      timeoutMsg: `Preflight banner did not disappear within ${timeout}ms`,
    }
  );
}

/**
 * Trigger a manual preflight re-check via the Retry Check button
 * This is useful for testing recovery scenarios
 */
export async function clickPreflightRetry(): Promise<void> {
  const retryButton = await $(preflightSelectors.preflightRetryButton);
  await retryButton.waitForDisplayed({ timeout: 5000 });
  await retryButton.click();
}
