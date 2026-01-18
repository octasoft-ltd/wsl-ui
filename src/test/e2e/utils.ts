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
 * browser.refresh() can cause "session deleted" errors in WebView2/Edge
 * This uses URL navigation instead which is more reliable
 */
export async function safeRefresh(): Promise<void> {
  const currentUrl = await browser.getUrl();
  await browser.url(currentUrl);
  await browser.pause(500);
}

/**
 * Wait for the application to be fully loaded and ready
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

  // Additional wait for any initial data loading
  await browser.pause(500);
}

/**
 * Reset mock state to defaults via Tauri command
 * This should be called in beforeEach to ensure clean state between tests
 * Also clears frontend Zustand store state (error banners, notifications)
 */
export async function resetMockState(): Promise<void> {
  // Execute the reset command via the app's JavaScript context
  await browser.execute(() => {
    // @ts-expect-error - Tauri API is available in the window
    return window.__TAURI__.core.invoke("reset_mock_state_cmd");
  });

  // Clear frontend state (error banners, notifications)
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
  });

  // Refresh the distribution list after resetting
  await browser.pause(200);
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
  });

  // Wait for React to process state updates
  await browser.pause(100);
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

  // Wait a bit for final events
  await browser.pause(500);

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
  const banner = await $(selectors.errorBanner);
  return banner;
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
  return $(selector);
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
  element: WebdriverIO.Element,
  expectedText: string,
  timeout: number = 5000
): Promise<string> {
  let actualText = "";
  await browser.waitUntil(
    async () => {
      actualText = await element.getText();
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
export async function waitForButtonEnabled(button: WebdriverIO.Element, timeout: number = 5000): Promise<void> {
  await browser.waitUntil(
    async () => {
      const disabled = await button.getAttribute("disabled");
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
export async function waitForButtonDisabled(button: WebdriverIO.Element, timeout: number = 5000): Promise<void> {
  await browser.waitUntil(
    async () => {
      const disabled = await button.getAttribute("disabled");
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
  element: WebdriverIO.Element,
  timeout: number = 5000
): Promise<void> {
  await browser.waitUntil(
    async () => {
      const isDisplayed = await element.isDisplayed().catch(() => false);
      if (!isDisplayed) return false;
      const disabled = await element.getAttribute("disabled");
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
  // Give React time to re-render with new data
  await browser.pause(300);
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
  return $(preflightSelectors.preflightBanner);
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
