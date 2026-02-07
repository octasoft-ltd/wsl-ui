/**
 * Shared Test Base for E2E Tests
 *
 * This module provides common test setup and action helpers to reduce duplication
 * across test files. Import and use these instead of writing boilerplate in each file.
 *
 * Usage:
 *   import { setupHooks, actions } from "../base";
 *
 *   describe("My Test Suite", () => {
 *     setupHooks.standard();  // Adds beforeEach with standard setup
 *
 *     it("should do something", async () => {
 *       const menu = await actions.openQuickActionsMenu("Ubuntu");
 *       // ...
 *     });
 *   });
 */

import {
  safeRefresh,
  resetMockState,
  waitForAppReady,
  clearConfigPendingState,
  selectors,
  waitForDialog,
  waitForDialogToDisappear,
  waitForDistroState,
} from "./utils";

// ============================================================================
// Standard Setup Functions
// ============================================================================

/**
 * Dismiss any blocking dialogs (like telemetry opt-in, review prompt) that may appear
 */
async function dismissBlockingDialogs(): Promise<void> {
  // Try to dismiss telemetry opt-in dialog if present
  try {
    const telemetryDialog = await $('[data-testid="telemetry-opt-in-dialog"]');
    const isDisplayed = await telemetryDialog.isDisplayed().catch(() => false);
    if (isDisplayed) {
      const declineButton = await $('[data-testid="telemetry-decline-button"]');
      const buttonDisplayed = await declineButton.isDisplayed().catch(() => false);
      if (buttonDisplayed) {
        await declineButton.click();
        await browser.waitUntil(
          async () => !(await telemetryDialog.isDisplayed().catch(() => false)),
          { timeout: 3000 }
        );
      }
    }
  } catch {
    // Dialog not present, which is fine
  }

  // Try to dismiss review prompt dialog if present
  try {
    const reviewDialog = await $('[data-testid="review-prompt-dialog"]');
    const isDisplayed = await reviewDialog.isDisplayed().catch(() => false);
    if (isDisplayed) {
      const noThanksButton = await $('[data-testid="review-no-thanks-button"]');
      const buttonDisplayed = await noThanksButton.isDisplayed().catch(() => false);
      if (buttonDisplayed) {
        await noThanksButton.click();
        await browser.waitUntil(
          async () => !(await reviewDialog.isDisplayed().catch(() => false)),
          { timeout: 3000 }
        );
      }
    }
  } catch {
    // Dialog not present, which is fine
  }
}

/**
 * Standard test setup that should be used in most test files.
 * - Resets mock state (while previous page is still loaded)
 * - Refreshes the page (will fetch fresh data from reset mock)
 * - Waits for app to be ready
 * - Dismisses any blocking dialogs (telemetry, etc.)
 */
export async function standardSetup(): Promise<void> {
  // Reset mock FIRST while page is loaded, THEN refresh to get clean state
  await resetMockState();
  await safeRefresh();
  await waitForAppReady();
  await dismissBlockingDialogs();
}

/**
 * Extended setup that also clears config pending notifications.
 * Use this for tests that verify notifications to avoid interference.
 */
export async function standardSetupWithCleanNotifications(): Promise<void> {
  await standardSetup();
  await clearConfigPendingState();
}

/**
 * Setup that scrolls to a specific distro after standard setup.
 * Useful when testing a specific distribution.
 */
export async function standardSetupWithDistro(distroName: string): Promise<void> {
  await standardSetup();
  // Scroll to ensure the distro card is visible
  const card = await $(selectors.distroCardByName(distroName));
  await card.scrollIntoView();
}

// ============================================================================
// Setup Hook Factories
// ============================================================================

/**
 * Pre-configured beforeEach hooks for common test scenarios.
 * Call the function inside your describe block to add the hook.
 */
export const setupHooks = {
  /**
   * Standard setup for most tests.
   * Usage: setupHooks.standard();
   */
  standard: () => {
    beforeEach(async () => {
      await standardSetup();
    });
  },

  /**
   * Setup with clean notifications (clears config pending state).
   * Usage: setupHooks.withCleanNotifications();
   */
  withCleanNotifications: () => {
    beforeEach(async () => {
      await standardSetupWithCleanNotifications();
    });
  },

  /**
   * Setup that scrolls to a specific distro.
   * Usage: setupHooks.withDistro("Ubuntu");
   */
  withDistro: (distroName: string) => {
    beforeEach(async () => {
      await standardSetupWithDistro(distroName);
    });
  },
};

// ============================================================================
// Action Helpers
// ============================================================================

/**
 * Helper to check if an element is displayed safely (no throw on missing element)
 */
export async function isElementDisplayed(selector: string): Promise<boolean> {
  try {
    const element = await $(selector);
    return await element.isDisplayed();
  } catch {
    return false;
  }
}

/**
 * Common action helpers for interacting with the UI.
 * These consolidate duplicated code from individual test files.
 */
export const actions = {
  /**
   * Open quick actions menu for a distribution
   * @param distroName - Name of the distribution
   * @returns The menu element
   */
  openQuickActionsMenu: async (distroName: string): Promise<WebdriverIO.Element> => {
    const card = await $(selectors.distroCardByName(distroName));
    await card.waitForDisplayed({ timeout: 5000 });
    const quickActionsButton = await card.$(selectors.quickActionsButton);
    await quickActionsButton.waitForClickable({ timeout: 5000 });
    await quickActionsButton.click();

    // Wait for menu to appear
    await browser.waitUntil(
      async () => isElementDisplayed(selectors.quickActionsMenu),
      { timeout: 5000, timeoutMsg: "Quick actions menu did not appear" }
    );

    return (await $(selectors.quickActionsMenu)) as unknown as WebdriverIO.Element;
  },

  /**
   * Open the manage submenu for a distribution
   * @param distroName - Name of the distribution
   * @returns The manage submenu element
   */
  openManageSubmenu: async (distroName: string): Promise<WebdriverIO.Element> => {
    await actions.openQuickActionsMenu(distroName);
    const manageButton = await $(selectors.manageSubmenu);
    await manageButton.waitForClickable({ timeout: 5000 });
    await manageButton.click();

    // Wait for submenu to expand (look for a manage action item)
    await browser.waitUntil(
      async () => isElementDisplayed(selectors.compactAction),
      { timeout: 5000, timeoutMsg: "Manage submenu did not expand" }
    );

    return (await $(selectors.manageSubmenu)) as unknown as WebdriverIO.Element;
  },

  /**
   * Open clone dialog for a distribution
   * Handles the stop-before-action dialog if it appears (for running distros).
   * @param distroName - Name of the distribution to clone
   * @returns The clone dialog element
   */
  openCloneDialog: async (distroName: string): Promise<WebdriverIO.Element> => {
    await actions.openQuickActionsMenu(distroName);
    const cloneAction = await $(selectors.cloneAction);
    await cloneAction.waitForClickable({ timeout: 5000 });
    await cloneAction.click();

    // Handle stop dialog if it appears (for running distros)
    await actions.handleStopDialogIfPresent();

    // Wait for clone dialog
    return waitForDialog(selectors.cloneDialog, 10000);
  },

  /**
   * Open rename dialog for a distribution
   * @param distroName - Name of the distribution to rename
   * @returns The rename dialog element
   */
  openRenameDialog: async (distroName: string): Promise<WebdriverIO.Element> => {
    await actions.openManageSubmenu(distroName);
    const renameAction = await $(selectors.renameAction);
    await renameAction.waitForClickable({ timeout: 5000 });
    await renameAction.click();

    // Handle stop dialog if it appears
    await actions.handleStopDialogIfPresent();

    // Wait for rename dialog
    return waitForDialog(selectors.renameDialog, 5000);
  },

  /**
   * Open compact dialog for a distribution
   * Note: Compact handles WSL shutdown internally, no stop dialog is shown.
   * @param distroName - Name of the distribution to compact
   * @returns The compact dialog element
   */
  openCompactDialog: async (distroName: string): Promise<WebdriverIO.Element> => {
    await actions.openManageSubmenu(distroName);
    const compactAction = await $(selectors.compactAction);
    await compactAction.waitForClickable({ timeout: 5000 });
    await compactAction.click();

    // Wait for compact dialog (it opens directly, no stop dialog)
    await browser.waitUntil(
      async () => {
        const dialog = await $(selectors.compactDialog);
        const dialogText = await dialog.getText().catch(() => "");
        return (await dialog.isDisplayed()) && dialogText.includes("Compact");
      },
      { timeout: 5000, timeoutMsg: "Compact dialog did not appear" }
    );

    return (await $(selectors.compactDialog)) as unknown as WebdriverIO.Element;
  },

  /**
   * Handle the stop-before-action dialog if it appears.
   * Clicks "Stop & Continue" to proceed with the action.
   * @param shouldContinue - Whether to click continue (true) or cancel (false)
   * @returns true if dialog was present and handled, false if no dialog
   */
  handleStopDialogIfPresent: async (shouldContinue: boolean = true): Promise<boolean> => {
    try {
      // Give the dialog a moment to appear
      await browser.waitUntil(
        async () => isElementDisplayed(selectors.stopAndActionDialog),
        { timeout: 2000 }
      );

      if (shouldContinue) {
        const continueButton = await $(selectors.stopAndContinueButton);
        await continueButton.waitForClickable({ timeout: 5000 });
        await continueButton.click();
        // Wait for dialog to close and action to complete
        await waitForDialogToDisappear(selectors.stopAndActionDialog, 10000);
      } else {
        const cancelButton = await $(selectors.stopDialogCancelButton);
        await cancelButton.waitForClickable({ timeout: 5000 });
        await cancelButton.click();
        await waitForDialogToDisappear(selectors.stopAndActionDialog, 5000);
      }
      return true;
    } catch {
      // Dialog didn't appear, which is fine for stopped distros
      return false;
    }
  },

  /**
   * Start a distribution and wait for it to be online
   * @param distroName - Name of the distribution to start
   */
  startDistro: async (distroName: string): Promise<void> => {
    const card = await $(selectors.distroCardByName(distroName));
    const startButton = await card.$(selectors.startButton);
    await startButton.waitForClickable({ timeout: 5000 });
    await startButton.click();
    await waitForDistroState(distroName, "ONLINE", 10000);
  },

  /**
   * Stop a distribution and wait for it to be offline
   * @param distroName - Name of the distribution to stop
   */
  stopDistro: async (distroName: string): Promise<void> => {
    const card = await $(selectors.distroCardByName(distroName));
    const stopButton = await card.$(selectors.stopButton);
    await stopButton.waitForClickable({ timeout: 5000 });
    await stopButton.click();
    await waitForDistroState(distroName, "OFFLINE", 10000);
  },

  /**
   * Delete a distribution with confirmation
   * @param distroName - Name of the distribution to delete
   */
  deleteDistro: async (distroName: string): Promise<void> => {
    const card = await $(selectors.distroCardByName(distroName));
    const deleteButton = await card.$(selectors.deleteButton);
    await deleteButton.waitForClickable({ timeout: 5000 });
    await deleteButton.click();

    // Wait for and handle confirm dialog
    await waitForDialog(selectors.confirmDialog, 5000);
    const confirmButton = await $(selectors.dialogConfirmButton);
    await confirmButton.waitForClickable({ timeout: 5000 });
    await confirmButton.click();

    // Wait for dialog to close
    await waitForDialogToDisappear(selectors.confirmDialog, 5000);
  },

  /**
   * Close any open quick actions menu by pressing Escape
   */
  closeQuickActionsMenu: async (): Promise<void> => {
    if (await isElementDisplayed(selectors.quickActionsMenu)) {
      await browser.keys("Escape");
      await browser.waitUntil(
        async () => !(await isElementDisplayed(selectors.quickActionsMenu)),
        { timeout: 3000, timeoutMsg: "Quick actions menu did not close" }
      );
    }
  },

  /**
   * Navigate to settings page
   */
  goToSettings: async (): Promise<void> => {
    const settingsButton = await $(selectors.settingsButton);
    await settingsButton.waitForClickable({ timeout: 5000 });
    await settingsButton.click();

    // Wait for settings page to load (back button appears)
    await browser.waitUntil(
      async () => isElementDisplayed(selectors.backButton),
      { timeout: 5000, timeoutMsg: "Settings page did not load" }
    );
  },

  /**
   * Navigate back from settings to main page
   */
  goBackFromSettings: async (): Promise<void> => {
    const backButton = await $(selectors.backButton);
    await backButton.waitForClickable({ timeout: 5000 });
    await backButton.click();

    // Wait for main page to load (settings button visible)
    await browser.waitUntil(
      async () => isElementDisplayed(selectors.settingsButton),
      { timeout: 5000, timeoutMsg: "Main page did not load" }
    );
  },
};

// ============================================================================
// Test Ownership Documentation
// ============================================================================

/**
 * Test Ownership Matrix
 *
 * This documents which test file "owns" which behavior to avoid duplicate coverage.
 * Other files may use these behaviors as setup but should not duplicate the tests.
 *
 * | Behavior                  | Owner File                        | Notes                           |
 * |---------------------------|-----------------------------------|---------------------------------|
 * | Quick actions menu        | quick-actions.spec.ts             | Opening, closing, navigation    |
 * | Clone workflow            | clone-distribution.spec.ts        | Full clone flow                 |
 * | Export workflow           | export-distribution.spec.ts       | Full export flow                |
 * | Rename workflow           | rename-distribution.spec.ts       | Full rename flow                |
 * | Compact workflow          | compact-disk.spec.ts              | Full compact flow               |
 * | Stop before action        | stop-before-action.spec.ts        | Dialog behavior                 |
 * | Start/stop distributions  | distro-actions.spec.ts            | State transitions               |
 * | Distribution list         | distro-list.spec.ts               | Cards, sorting, filtering       |
 * | Error display             | error-handling.spec.ts            | Error banners, messages         |
 * | Timeout errors            | timeout-errors.spec.ts            | Timeout-specific scenarios      |
 * | Error edge cases          | error-edge-cases.spec.ts          | Unusual error scenarios         |
 * | Settings navigation       | settings.spec.ts                  | Settings page navigation        |
 * | Theme settings            | theme-settings.spec.ts            | Theme switching                 |
 * | Keyboard navigation       | keyboard-navigation.spec.ts       | Tab, Escape, Enter handling     |
 * | WSL status bar            | wsl-status.spec.ts                | Status display, update button   |
 * | Resource display          | resource-display.spec.ts          | Memory, CPU stats               |
 * | Disk mount                | disk-mount.spec.ts                | VHD and physical disk mounting  |
 * | New distribution          | distro-create.spec.ts             | Creation dialog                 |
 * | Installation flow         | new-distribution-installation.spec.ts | Download/install process    |
 * | Custom actions            | custom-actions.spec.ts            | Custom action CRUD              |
 * | WSL preflight             | preflight.spec.ts                 | WSL availability checks         |
 * | WSL update                | wsl-update.spec.ts                | WSL update workflow             |
 */
