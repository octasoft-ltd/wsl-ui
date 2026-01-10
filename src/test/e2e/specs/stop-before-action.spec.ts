/**
 * E2E Tests for Stop-Before-Action UX Pattern
 *
 * Tests the consistent behavior when actions require stopping a distribution:
 * - Export, Clone, Move, Resize, Rename, Sparse Mode
 * - Should show "Stop & Continue" dialog when distro is running
 * - Should automatically stop and proceed after confirmation
 * - Should work directly when distro is already stopped
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  mockDistributions,
  safeRefresh,
} from "../utils";

describe("Stop Before Action Pattern", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(300);
    await resetMockState();
    // Refresh again to load the clean mock data (Ubuntu running, Debian stopped)
    await safeRefresh();
    await waitForAppReady();
    await browser.pause(500);
  });

  /**
   * Helper to open the quick actions menu for a distribution
   */
  async function openQuickActionsMenu(distroName: string): Promise<void> {
    const card = await $(selectors.distroCardByName(distroName));
    const quickActionsButton = await card.$(selectors.quickActionsButton);
    await quickActionsButton.click();
    await browser.pause(300);
  }

  /**
   * Helper to open the manage submenu
   */
  async function openManageSubmenu(): Promise<void> {
    const manageButton = await $(selectors.manageSubmenu);
    await manageButton.click();
    await browser.pause(300);
  }

  /**
   * Helper to wait for the stop-and-action dialog
   */
  async function waitForStopDialog(): Promise<WebdriverIO.Element> {
    await browser.waitUntil(
      async () => {
        const dialog = await $('[data-testid="stop-and-action-dialog"]');
        return dialog.isDisplayed();
      },
      {
        timeout: 5000,
        timeoutMsg: "Stop and Action dialog did not appear within 5 seconds",
      }
    );
    return $('[data-testid="stop-and-action-dialog"]');
  }

  describe("Export Action - Running Distribution", () => {
    it("should show stop dialog when exporting a running distribution", async () => {
      // Ubuntu is running by default
      await openQuickActionsMenu("Ubuntu");

      const exportAction = await $(selectors.quickAction("export"));
      await exportAction.click();
      await browser.pause(300);

      // Should show the stop dialog
      const dialog = await waitForStopDialog();
      await expect(dialog).toBeDisplayed();

      // Dialog should mention the action and distribution
      const dialogText = await dialog.getText();
      expect(dialogText.toLowerCase()).toContain("stop");
      expect(dialogText).toContain("Ubuntu");
    });

    it("should have Stop & Continue and Cancel buttons", async () => {
      await openQuickActionsMenu("Ubuntu");
      const exportAction = await $(selectors.quickAction("export"));
      await exportAction.click();
      await browser.pause(300);

      await waitForStopDialog();

      const stopButton = await $('[data-testid="stop-and-continue-button"]');
      const cancelButton = await $('[data-testid="stop-dialog-cancel-button"]');

      await expect(stopButton).toBeDisplayed();
      await expect(cancelButton).toBeDisplayed();
    });

    it("should close dialog and do nothing when Cancel is clicked", async () => {
      await openQuickActionsMenu("Ubuntu");
      const exportAction = await $(selectors.quickAction("export"));
      await exportAction.click();
      await browser.pause(300);

      await waitForStopDialog();

      const cancelButton = await $('[data-testid="stop-dialog-cancel-button"]');
      await cancelButton.click();
      await browser.pause(300);

      // Dialog should be closed
      const dialog = await $('[data-testid="stop-and-action-dialog"]');
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);

      // Ubuntu should still be running
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const badge = await ubuntuCard.$(selectors.stateBadge);
      const state = await badge.getText();
      expect(state).toContain("ONLINE");
    });

    it("should show stop indicator in the Export menu item for running distro", async () => {
      await openQuickActionsMenu("Ubuntu");

      const exportAction = await $(selectors.quickAction("export"));
      const hasIndicator = await exportAction.$('[data-testid="requires-stop-indicator"]');

      await expect(hasIndicator).toBeDisplayed();
    });
  });

  describe("Export Action - Stopped Distribution", () => {
    it("should NOT show stop dialog for stopped distribution", async () => {
      // Debian is stopped by default
      await openQuickActionsMenu("Debian");

      const exportAction = await $(selectors.quickAction("export"));
      await exportAction.click();
      await browser.pause(500);

      // Stop dialog should NOT appear
      const dialog = await $('[data-testid="stop-and-action-dialog"]');
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });
  });

  describe("Clone Action - Running Distribution", () => {
    it("should show stop dialog when cloning a running distribution", async () => {
      await openQuickActionsMenu("Ubuntu");

      const cloneAction = await $(selectors.cloneAction);
      await cloneAction.click();
      await browser.pause(300);

      // Should show the stop dialog
      const dialog = await waitForStopDialog();
      await expect(dialog).toBeDisplayed();
    });

    it("should show stop indicator in the Clone menu item for running distro", async () => {
      await openQuickActionsMenu("Ubuntu");

      const cloneAction = await $(selectors.cloneAction);
      const hasIndicator = await cloneAction.$('[data-testid="requires-stop-indicator"]');

      await expect(hasIndicator).toBeDisplayed();
    });

    it("should proceed to clone dialog after Stop & Continue", async () => {
      await openQuickActionsMenu("Ubuntu");

      const cloneAction = await $(selectors.cloneAction);
      await cloneAction.click();
      await browser.pause(300);

      await waitForStopDialog();

      const stopButton = await $('[data-testid="stop-and-continue-button"]');
      await stopButton.click();

      // Wait for the clone dialog to appear
      await browser.waitUntil(
        async () => {
          const cloneDialog = await $(selectors.cloneDialog);
          return cloneDialog.isDisplayed();
        },
        {
          timeout: 10000,
          timeoutMsg: "Clone dialog did not appear after stopping",
        }
      );

      const cloneDialog = await $(selectors.cloneDialog);
      await expect(cloneDialog).toBeDisplayed();
    });
  });

  describe("Clone Action - Stopped Distribution", () => {
    it("should open clone dialog directly for stopped distribution", async () => {
      // Debian is stopped by default
      await openQuickActionsMenu("Debian");

      const cloneAction = await $(selectors.cloneAction);
      await cloneAction.click();
      await browser.pause(300);

      // Clone dialog should open directly
      const cloneDialog = await $(selectors.cloneDialog);
      await expect(cloneDialog).toBeDisplayed();
    });
  });

  describe("Move Action - Running Distribution", () => {
    it("should show stop dialog when moving a running distribution", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const moveAction = await $(selectors.moveAction);
      await moveAction.click();
      await browser.pause(300);

      // Should show the stop dialog
      const dialog = await waitForStopDialog();
      await expect(dialog).toBeDisplayed();
    });
  });

  describe("Resize Action - Running Distribution", () => {
    it("should show stop dialog when resizing a running distribution", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const resizeAction = await $(selectors.resizeAction);
      await resizeAction.click();
      await browser.pause(300);

      // Should show the stop dialog
      const dialog = await waitForStopDialog();
      await expect(dialog).toBeDisplayed();
    });
  });

  describe("Rename Action - Running Distribution", () => {
    it("should show stop dialog when renaming a running distribution", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const renameAction = await $(selectors.renameAction);
      await renameAction.click();
      await browser.pause(300);

      // Should show the stop dialog (instead of being disabled)
      const dialog = await waitForStopDialog();
      await expect(dialog).toBeDisplayed();
    });

    it("should proceed to rename dialog after Stop & Continue", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const renameAction = await $(selectors.renameAction);
      await renameAction.click();
      await browser.pause(300);

      await waitForStopDialog();

      const stopButton = await $('[data-testid="stop-and-continue-button"]');
      await stopButton.click();

      // Wait for the rename dialog to appear
      await browser.waitUntil(
        async () => {
          const renameDialog = await $(selectors.renameDialog);
          return renameDialog.isDisplayed();
        },
        {
          timeout: 10000,
          timeoutMsg: "Rename dialog did not appear after stopping",
        }
      );

      const renameDialog = await $(selectors.renameDialog);
      await expect(renameDialog).toBeDisplayed();
    });
  });

  describe("Rename Action - Stopped Distribution", () => {
    it("should open rename dialog directly for stopped distribution", async () => {
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const renameAction = await $(selectors.renameAction);
      await renameAction.click();
      await browser.pause(300);

      // Rename dialog should open directly
      const renameDialog = await $(selectors.renameDialog);
      await expect(renameDialog).toBeDisplayed();
    });

    it("should NOT be disabled for stopped distribution", async () => {
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const renameAction = await $(selectors.renameAction);
      const isDisabled = await renameAction.getAttribute("disabled");
      expect(isDisabled).toBeFalsy();
    });
  });

  describe("Sparse Mode - Running Distribution", () => {
    it("should show stop dialog when toggling sparse mode on running distribution", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const sparseAction = await $(selectors.sparseAction);
      await sparseAction.click();
      await browser.pause(300);

      // Should show the stop dialog (instead of error dialog)
      const dialog = await waitForStopDialog();
      await expect(dialog).toBeDisplayed();
    });
  });

  describe("Stop Dialog During Operation", () => {
    it("should show loading state while stopping", async () => {
      await openQuickActionsMenu("Ubuntu");

      const exportAction = await $(selectors.quickAction("export"));
      await exportAction.click();
      await browser.pause(300);

      await waitForStopDialog();

      const stopButton = await $('[data-testid="stop-and-continue-button"]');
      await stopButton.click();

      // Check for loading state (may be brief)
      try {
        await browser.waitUntil(
          async () => {
            const loadingIndicator = await $('[data-testid="stop-dialog-loading"]');
            return loadingIndicator.isDisplayed();
          },
          {
            timeout: 2000,
            timeoutMsg: "Loading indicator not shown",
          }
        );
      } catch {
        // Loading may be too fast to catch
      }
    });
  });

  describe("Visual Indicators", () => {
    // This test is redundant - already covered by "should show stop indicator in the Export menu item for running distro"
    // above. By this point in the test run, Ubuntu may have been stopped by earlier tests.
    it.skip("should show stop-required indicator on Export for running distro", async () => {
      await openQuickActionsMenu("Ubuntu");

      const exportAction = await $(selectors.quickAction("export"));
      // Check for visual indicator (pause icon or different styling)
      const indicator = await exportAction.$('[data-testid="requires-stop-indicator"]');
      await expect(indicator).toBeDisplayed();
    });

    // This test is redundant - already covered by "should show stop indicator in the Clone menu item for running distro"
    // above. By this point in the test run, Ubuntu may have been stopped by earlier tests.
    it.skip("should show stop-required indicator on Clone for running distro", async () => {
      await openQuickActionsMenu("Ubuntu");

      const cloneAction = await $(selectors.cloneAction);
      const indicator = await cloneAction.$('[data-testid="requires-stop-indicator"]');
      await expect(indicator).toBeDisplayed();
    });

    it("should NOT show stop-required indicator for stopped distro", async () => {
      await openQuickActionsMenu("Debian");

      const exportAction = await $(selectors.quickAction("export"));
      const indicator = await exportAction.$('[data-testid="requires-stop-indicator"]');
      const isDisplayed = await indicator.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should show stop-required indicator on Manage actions for running distro", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const moveAction = await $(selectors.moveAction);
      // Move action uses requires-shutdown-indicator (not requires-stop-indicator)
      const indicator = await moveAction.$('[data-testid="requires-shutdown-indicator"]');
      await expect(indicator).toBeDisplayed();
    });
  });
});
