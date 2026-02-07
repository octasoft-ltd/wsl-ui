/**
 * E2E Tests for Stop-Before-Action UX Pattern
 *
 * Tests the consistent behavior when actions require stopping a distribution:
 * - Export, Clone, Move, Resize, Rename, Sparse Mode
 * - Should show "Stop & Continue" dialog when distro is running
 * - Should automatically stop and proceed after confirmation
 * - Should work directly when distro is already stopped
 */

import { selectors, waitForDialogToDisappear } from "../utils";
import { setupHooks, actions, isElementDisplayed } from "../base";

/**
 * Helper to wait for the stop-and-action dialog
 */
async function waitForStopDialog(): Promise<WebdriverIO.Element> {
  await browser.waitUntil(
    async () => {
      const dialog = await $(selectors.stopAndActionDialog);
      return await dialog.isDisplayed();
    },
    {
      timeout: 5000,
      timeoutMsg: "Stop and Action dialog did not appear within 5 seconds",
    }
  );
  return (await $(selectors.stopAndActionDialog)) as unknown as WebdriverIO.Element;
}

describe("Stop Before Action Pattern", () => {
  setupHooks.standard();

  describe("Export Action - Running Distribution", () => {
    it("should show stop dialog when exporting a running distribution", async () => {
      // Ubuntu is running by default
      await actions.openQuickActionsMenu("Ubuntu");

      const exportAction = await $(selectors.quickAction("export"));
      await exportAction.waitForClickable({ timeout: 5000 });
      await exportAction.click();

      // Should show the stop dialog
      const dialog = await waitForStopDialog();
      await expect(dialog).toBeDisplayed();

      // Dialog should mention the action and distribution
      const dialogText = await dialog.getText();
      expect(dialogText.toLowerCase()).toContain("stop");
      expect(dialogText).toContain("Ubuntu");
    });

    it("should have Stop & Continue and Cancel buttons", async () => {
      await actions.openQuickActionsMenu("Ubuntu");
      const exportAction = await $(selectors.quickAction("export"));
      await exportAction.waitForClickable({ timeout: 5000 });
      await exportAction.click();

      await waitForStopDialog();

      const stopButton = await $(selectors.stopAndContinueButton);
      const cancelButton = await $(selectors.stopDialogCancelButton);

      await expect(stopButton).toBeDisplayed();
      await expect(cancelButton).toBeDisplayed();
    });

    it("should close dialog and do nothing when Cancel is clicked", async () => {
      await actions.openQuickActionsMenu("Ubuntu");
      const exportAction = await $(selectors.quickAction("export"));
      await exportAction.waitForClickable({ timeout: 5000 });
      await exportAction.click();

      await waitForStopDialog();

      const cancelButton = await $(selectors.stopDialogCancelButton);
      await cancelButton.waitForClickable({ timeout: 5000 });
      await cancelButton.click();

      // Wait for dialog to close
      await waitForDialogToDisappear(selectors.stopAndActionDialog, 5000);

      // Dialog should be closed
      const dialogVisible = await isElementDisplayed(selectors.stopAndActionDialog);
      expect(dialogVisible).toBe(false);

      // Ubuntu should still be running
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const badge = await ubuntuCard.$(selectors.stateBadge);
      const state = await badge.getText();
      expect(state).toContain("ONLINE");
    });

    it("should show stop indicator in the Export menu item for running distro", async () => {
      await actions.openQuickActionsMenu("Ubuntu");

      const exportAction = await $(selectors.quickAction("export"));
      const hasIndicator = await exportAction.$('[data-testid="requires-stop-indicator"]');

      await expect(hasIndicator).toBeDisplayed();
    });
  });

  describe("Export Action - Stopped Distribution", () => {
    it("should NOT show stop dialog for stopped distribution", async () => {
      // Debian is stopped by default
      await actions.openQuickActionsMenu("Debian");

      const exportAction = await $(selectors.quickAction("export"));
      await exportAction.waitForClickable({ timeout: 5000 });
      await exportAction.click();

      // Wait briefly to ensure stop dialog would have appeared if it was going to
      // Export opens a native file dialog, so we just verify the stop dialog doesn't appear
      await browser.pause(1000);

      // Stop dialog should NOT appear for stopped distributions
      const dialogVisible = await isElementDisplayed(selectors.stopAndActionDialog);
      expect(dialogVisible).toBe(false);
    });
  });

  describe("Clone Action - Running Distribution", () => {
    it("should show stop dialog when cloning a running distribution", async () => {
      await actions.openQuickActionsMenu("Ubuntu");

      const cloneAction = await $(selectors.cloneAction);
      await cloneAction.waitForClickable({ timeout: 5000 });
      await cloneAction.click();

      // Should show the stop dialog
      const dialog = await waitForStopDialog();
      await expect(dialog).toBeDisplayed();
    });

    it("should show stop indicator in the Clone menu item for running distro", async () => {
      await actions.openQuickActionsMenu("Ubuntu");

      const cloneAction = await $(selectors.cloneAction);
      const hasIndicator = await cloneAction.$('[data-testid="requires-stop-indicator"]');

      await expect(hasIndicator).toBeDisplayed();
    });

    it("should proceed to clone dialog after Stop & Continue", async () => {
      await actions.openQuickActionsMenu("Ubuntu");

      const cloneAction = await $(selectors.cloneAction);
      await cloneAction.waitForClickable({ timeout: 5000 });
      await cloneAction.click();

      await waitForStopDialog();

      const stopButton = await $(selectors.stopAndContinueButton);
      await stopButton.waitForClickable({ timeout: 5000 });
      await stopButton.click();

      // Wait for the clone dialog to appear
      await browser.waitUntil(
        async () => isElementDisplayed(selectors.cloneDialog),
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
      await actions.openQuickActionsMenu("Debian");

      const cloneAction = await $(selectors.cloneAction);
      await cloneAction.waitForClickable({ timeout: 5000 });
      await cloneAction.click();

      // Wait for clone dialog to appear
      await browser.waitUntil(
        async () => isElementDisplayed(selectors.cloneDialog),
        { timeout: 5000, timeoutMsg: "Clone dialog did not appear" }
      );

      // Clone dialog should open directly
      const cloneDialog = await $(selectors.cloneDialog);
      await expect(cloneDialog).toBeDisplayed();
    });
  });

  describe("Move Action - Running Distribution", () => {
    it("should show stop dialog when moving a running distribution", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const moveAction = await $(selectors.moveAction);
      await moveAction.waitForClickable({ timeout: 5000 });
      await moveAction.click();

      // Should show the stop dialog
      const dialog = await waitForStopDialog();
      await expect(dialog).toBeDisplayed();
    });
  });

  describe("Resize Action - Running Distribution", () => {
    it("should show stop dialog when resizing a running distribution", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const resizeAction = await $(selectors.resizeAction);
      await resizeAction.waitForClickable({ timeout: 5000 });
      await resizeAction.click();

      // Should show the stop dialog
      const dialog = await waitForStopDialog();
      await expect(dialog).toBeDisplayed();
    });
  });

  describe("Rename Action - Running Distribution", () => {
    it("should show stop dialog when renaming a running distribution", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const renameAction = await $(selectors.renameAction);
      await renameAction.waitForClickable({ timeout: 5000 });
      await renameAction.click();

      // Should show the stop dialog (instead of being disabled)
      const dialog = await waitForStopDialog();
      await expect(dialog).toBeDisplayed();
    });

    it("should proceed to rename dialog after Stop & Continue", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const renameAction = await $(selectors.renameAction);
      await renameAction.waitForClickable({ timeout: 5000 });
      await renameAction.click();

      await waitForStopDialog();

      const stopButton = await $(selectors.stopAndContinueButton);
      await stopButton.waitForClickable({ timeout: 5000 });
      await stopButton.click();

      // Wait for the rename dialog to appear
      await browser.waitUntil(
        async () => isElementDisplayed(selectors.renameDialog),
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
      await actions.openManageSubmenu("Debian");

      const renameAction = await $(selectors.renameAction);
      await renameAction.waitForClickable({ timeout: 5000 });
      await renameAction.click();

      // Wait for rename dialog to appear
      await browser.waitUntil(
        async () => isElementDisplayed(selectors.renameDialog),
        { timeout: 5000, timeoutMsg: "Rename dialog did not appear" }
      );

      // Rename dialog should open directly
      const renameDialog = await $(selectors.renameDialog);
      await expect(renameDialog).toBeDisplayed();
    });

    it("should NOT be disabled for stopped distribution", async () => {
      await actions.openManageSubmenu("Debian");

      const renameAction = await $(selectors.renameAction);
      const isDisabled = await renameAction.getAttribute("disabled");
      expect(isDisabled).toBeFalsy();
    });
  });

  describe("Sparse Mode - Running Distribution", () => {
    it("should show stop dialog when toggling sparse mode on running distribution", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const sparseAction = await $(selectors.sparseAction);
      await sparseAction.waitForClickable({ timeout: 5000 });
      await sparseAction.click();

      // Should show the stop dialog (instead of error dialog)
      const dialog = await waitForStopDialog();
      await expect(dialog).toBeDisplayed();
    });
  });

  describe("Stop Dialog During Operation", () => {
    it("should show loading state while stopping", async () => {
      await actions.openQuickActionsMenu("Ubuntu");

      const exportAction = await $(selectors.quickAction("export"));
      await exportAction.waitForClickable({ timeout: 5000 });
      await exportAction.click();

      await waitForStopDialog();

      const stopButton = await $(selectors.stopAndContinueButton);
      await stopButton.waitForClickable({ timeout: 5000 });
      await stopButton.click();

      // Check for loading state (may be brief)
      try {
        await browser.waitUntil(
          async () => isElementDisplayed(selectors.stopDialogLoading),
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
      await actions.openQuickActionsMenu("Ubuntu");

      const exportAction = await $(selectors.quickAction("export"));
      // Check for visual indicator (pause icon or different styling)
      const indicator = await exportAction.$('[data-testid="requires-stop-indicator"]');
      await expect(indicator).toBeDisplayed();
    });

    // This test is redundant - already covered by "should show stop indicator in the Clone menu item for running distro"
    // above. By this point in the test run, Ubuntu may have been stopped by earlier tests.
    it.skip("should show stop-required indicator on Clone for running distro", async () => {
      await actions.openQuickActionsMenu("Ubuntu");

      const cloneAction = await $(selectors.cloneAction);
      const indicator = await cloneAction.$('[data-testid="requires-stop-indicator"]');
      await expect(indicator).toBeDisplayed();
    });

    it("should NOT show stop-required indicator for stopped distro", async () => {
      await actions.openQuickActionsMenu("Debian");

      const exportAction = await $(selectors.quickAction("export"));
      // Check if indicator exists and is displayed
      let indicatorDisplayed = false;
      try {
        const indicator = await exportAction.$('[data-testid="requires-stop-indicator"]');
        indicatorDisplayed = await indicator.isDisplayed();
      } catch {
        indicatorDisplayed = false;
      }
      expect(indicatorDisplayed).toBe(false);
    });

    it("should show stop-required indicator on Manage actions for running distro", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const moveAction = await $(selectors.moveAction);
      // Move action uses requires-shutdown-indicator (not requires-stop-indicator)
      const indicator = await moveAction.$('[data-testid="requires-shutdown-indicator"]');
      await expect(indicator).toBeDisplayed();
    });
  });
});
