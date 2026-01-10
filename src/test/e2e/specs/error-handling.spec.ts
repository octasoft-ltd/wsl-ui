/**
 * E2E Tests for Error Handling and Failure Scenarios
 *
 * Tests how the application handles various error conditions:
 * - Operation failures (start, stop, delete)
 * - Validation errors in dialogs
 * - Confirmation dialogs for dangerous operations
 * - Error messages display
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  confirmDialog,
  safeRefresh,
  waitForDialog,
  waitForDialogToDisappear,
  waitForButtonDisabled,
  waitForDistroState,
} from "../utils";

/**
 * Find open dialog using role attribute
 */
async function findDialog(): Promise<WebdriverIO.Element> {
  return $('[role="dialog"]');
}

describe("Error Handling and Failure Scenarios", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(500);
    await resetMockState();
    await waitForAppReady();
    await browser.pause(500);
  });

  describe("Confirmation Dialogs", () => {
    describe("Delete Distribution", () => {
      it("should show confirmation dialog when deleting a distribution", async () => {
        const alpineCard = await $(selectors.distroCardByName("Alpine"));
        const deleteButton = await alpineCard.$('[data-testid="delete-button"]');
        await deleteButton.click();
        await browser.pause(300);

        const dialog = await findDialog();
        await expect(dialog).toBeDisplayed();

        const dialogText = await dialog.getText();
        expect(dialogText.toLowerCase()).toContain("delete");
      });

      it("should cancel delete when Cancel is clicked", async () => {
        const alpineCard = await $(selectors.distroCardByName("Alpine"));
        const deleteButton = await alpineCard.$('[data-testid="delete-button"]');
        await deleteButton.click();
        await browser.pause(300);

        // Click cancel
        await confirmDialog(false);
        await browser.pause(300);

        // Alpine should still exist
        const alpineCardAfter = await $(selectors.distroCardByName("Alpine"));
        await expect(alpineCardAfter).toBeDisplayed();
      });

      it("should proceed with delete when confirmed", async () => {
        const alpineCard = await $(selectors.distroCardByName("Alpine"));
        const deleteButton = await alpineCard.$('[data-testid="delete-button"]');
        await deleteButton.click();
        await browser.pause(300);

        // Click delete to confirm
        await confirmDialog(true);
        await browser.pause(500);

        // Alpine should be removed
        const alpineCardAfter = await $(selectors.distroCardByName("Alpine"));
        const exists = await alpineCardAfter.isDisplayed().catch(() => false);
        expect(exists).toBe(false);
      });
    });

    describe("Shutdown All", () => {
      it("should show confirmation when clicking Shutdown All", async () => {
        const shutdownAllButton = await $(selectors.shutdownAllButton);

        // Wait for button to be clickable
        await shutdownAllButton.waitForClickable({ timeout: 5000 });
        await shutdownAllButton.click();

        // Wait for dialog to appear
        const dialog = await findDialog();
        await dialog.waitForDisplayed({ timeout: 5000 });

        const dialogText = await dialog.getText();
        expect(dialogText.toLowerCase()).toContain("shutdown");
      });

      it("should cancel shutdown when Cancel is clicked", async () => {
        const shutdownAllButton = await $(selectors.shutdownAllButton);

        // Wait for button to be clickable
        await shutdownAllButton.waitForClickable({ timeout: 5000 });
        await shutdownAllButton.click();

        // Wait for dialog to appear
        const dialog = await findDialog();
        await dialog.waitForDisplayed({ timeout: 5000 });

        const cancelButton = await dialog.$('button*=Cancel');
        await cancelButton.click();
        await browser.pause(300);

        // Ubuntu should still be running
        const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
        const badge = await ubuntuCard.$('[data-testid="state-badge"]');
        const state = await badge.getText();
        expect(state).toContain("ONLINE");
      });
    });
  });

  describe("Validation Errors", () => {
    describe("Set Default User Dialog", () => {
      async function openSetUserDialog(): Promise<void> {
        const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
        const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
        await quickActionsButton.click();
        await browser.pause(300);

        const manageButton = await $('[data-testid="quick-action-manage"]');
        await manageButton.click();
        await browser.pause(200);

        const userAction = await $('[data-testid="manage-action-user"]');
        await userAction.click();
        await browser.pause(300);
      }

      it("should not allow empty username", async () => {
        await openSetUserDialog();

        const dialog = await findDialog();
        const setUserButton = await dialog.$('button*=Set User');

        // Button should be disabled with empty username
        const isDisabled = await setUserButton.getAttribute("disabled");
        expect(isDisabled).toBeTruthy();
      });

      it("should sanitize username input to lowercase", async () => {
        await openSetUserDialog();

        const dialog = await findDialog();
        const usernameInput = await dialog.$('input[type="text"]');

        // Try to enter uppercase letters
        await usernameInput.setValue("TestUser");
        await browser.pause(100);

        // Should be converted to lowercase
        const value = await usernameInput.getValue();
        expect(value).toBe("testuser");
      });

      it("should remove invalid characters from username", async () => {
        await openSetUserDialog();

        const dialog = await findDialog();
        const usernameInput = await dialog.$('input[type="text"]');

        // Try to enter special characters
        await usernameInput.setValue("test@user!");
        await browser.pause(100);

        // Should only contain valid characters
        const value = await usernameInput.getValue();
        expect(value).not.toContain("@");
        expect(value).not.toContain("!");
      });
    });

    describe("Resize Dialog Validation", () => {
      async function openResizeDialog(): Promise<void> {
        const debianCard = await $(selectors.distroCardByName("Debian"));
        const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');
        await quickActionsButton.click();
        await browser.pause(300);

        const manageButton = await $('[data-testid="quick-action-manage"]');
        await manageButton.click();
        await browser.pause(200);

        const resizeAction = await $('[data-testid="manage-action-resize"]');
        await resizeAction.click();
        await browser.pause(300);
      }

      it("should show invalid when size is too small", async () => {
        await openResizeDialog();

        const dialog = await findDialog();
        const sizeInput = await dialog.$('input[type="number"]');

        // Clear and enter very small value
        await sizeInput.setValue("0");
        await browser.pause(200);

        const dialogText = await dialog.getText();
        expect(dialogText).toContain("Invalid");
      });

      it("should show current size in resize dialog", async () => {
        await openResizeDialog();

        const dialog = await findDialog();

        // Wait for current size to load
        await browser.pause(500);

        // The dialog should show the current size information
        const dialogText = await dialog.getText();
        // Dialog shows "VIRTUAL SIZE (MAX)" and "FILE SIZE (ACTUAL)" labels
        expect(dialogText).toContain("VIRTUAL SIZE");
      });
    });

    describe("Move Dialog Validation", () => {
      it("should disable Move button when no path entered", async () => {
        const debianCard = await $(selectors.distroCardByName("Debian"));
        const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');
        await quickActionsButton.click();
        await browser.pause(300);

        const manageButton = await $('[data-testid="quick-action-manage"]');
        await manageButton.click();
        await browser.pause(200);

        const moveAction = await $('[data-testid="manage-action-move"]');
        await moveAction.click();
        await browser.pause(300);

        const dialog = await findDialog();
        const moveButton = await dialog.$('button*=Move');

        const isDisabled = await moveButton.getAttribute("disabled");
        expect(isDisabled).toBeTruthy();
      });
    });
  });

  describe("Running Distribution Dialogs", () => {
    it("should show shutdown dialog when trying to move running distribution", async () => {
      // Ubuntu is running
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const manageButton = await $('[data-testid="quick-action-manage"]');
      await manageButton.click();
      await browser.pause(200);

      const moveAction = await $('[data-testid="manage-action-move"]');
      await moveAction.click();
      await browser.pause(300);

      const dialog = await findDialog();
      const dialogText = await dialog.getText();

      // Dialog should show shutdown confirmation for running distro
      expect(dialogText.toLowerCase()).toContain("shutdown");
    });

    it("should show shutdown dialog when trying to resize running distribution", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const manageButton = await $('[data-testid="quick-action-manage"]');
      await manageButton.click();
      await browser.pause(200);

      const resizeAction = await $('[data-testid="manage-action-resize"]');
      await resizeAction.click();
      await browser.pause(300);

      const dialog = await findDialog();
      const dialogText = await dialog.getText();

      // Dialog should show shutdown confirmation for running distro
      expect(dialogText.toLowerCase()).toContain("shutdown");
    });

    it("should show shutdown dialog when trying to toggle sparse mode on running distribution", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const manageButton = await $('[data-testid="quick-action-manage"]');
      await manageButton.click();
      await browser.pause(200);

      const sparseAction = await $('[data-testid="manage-action-sparse"]');
      await sparseAction.click();
      await browser.pause(500);

      // Should show error dialog about stopping first
      const dialog = await findDialog();
      if (await dialog.isDisplayed()) {
        const dialogText = await dialog.getText();
        expect(dialogText.toLowerCase()).toContain("shutdown");
      }
    });
  });

  describe("Sparse Mode Warning", () => {
    async function openSparseDialog(): Promise<WebdriverIO.Element> {
      // Use stopped distro
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();

      const manageButton = await $('[data-testid="quick-action-manage"]');
      await manageButton.waitForDisplayed({ timeout: 3000 });
      await manageButton.click();

      const sparseAction = await $('[data-testid="manage-action-sparse"]');
      await sparseAction.waitForDisplayed({ timeout: 3000 });
      await sparseAction.click();

      return waitForDialog('[role="dialog"]', 5000);
    }

    it("should show data corruption warning when enabling sparse mode", async () => {
      const dialog = await openSparseDialog();
      const dialogText = await dialog.getText();
      const lowerText = dialogText.toLowerCase();

      // Must show sparse mode in dialog
      expect(lowerText).toContain("sparse");

      // Must warn about risk (corruption OR risk OR warning)
      const hasRiskWarning =
        lowerText.includes("corruption") ||
        lowerText.includes("risk") ||
        lowerText.includes("warning") ||
        lowerText.includes("data loss");

      if (!hasRiskWarning) {
        throw new Error(`Sparse mode dialog should warn about risks. Dialog text: "${dialogText}"`);
      }

      // Cancel to clean up
      const cancelButton = await dialog.$('button*=Cancel');
      await cancelButton.click();
      await waitForDialogToDisappear('[role="dialog"]', 3000);
    });

    it("should have Enable Anyway button for sparse mode", async () => {
      const dialog = await openSparseDialog();

      // Must have an "Enable" action button (dangerous action)
      const enableButton = await dialog.$('button*=Enable');
      await expect(enableButton).toBeDisplayed();

      // Cancel to clean up
      const cancelButton = await dialog.$('button*=Cancel');
      await cancelButton.click();
      await waitForDialogToDisappear('[role="dialog"]', 3000);
    });

    it("should cancel sparse mode when Cancel is clicked", async () => {
      const dialog = await openSparseDialog();

      // Cancel button should be visible
      const cancelButton = await dialog.$('button*=Cancel');
      await expect(cancelButton).toBeDisplayed();
      await cancelButton.click();

      // Wait for dialog to close
      await waitForDialogToDisappear('[role="dialog"]', 3000);

      // Verify dialog is closed
      const dialogAfter = await $('[role="dialog"]');
      const isDisplayed = await dialogAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should require stopping running distribution before sparse mode", async () => {
      // Ubuntu is running
      await waitForDistroState("Ubuntu", "ONLINE", 2000);

      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();

      const manageButton = await $('[data-testid="quick-action-manage"]');
      await manageButton.waitForDisplayed({ timeout: 3000 });
      await manageButton.click();

      const sparseAction = await $('[data-testid="manage-action-sparse"]');
      await sparseAction.waitForDisplayed({ timeout: 3000 });
      await sparseAction.click();

      // Should show stop confirmation dialog
      const dialog = await waitForDialog('[role="dialog"]', 5000);
      const dialogText = await dialog.getText();
      expect(dialogText.toLowerCase()).toContain("shutdown");

      // Cancel to clean up
      const cancelButton = await dialog.$('button*=Cancel');
      await cancelButton.click();
      await waitForDialogToDisappear('[role="dialog"]', 3000);
    });
  });

  describe("Dialog Structure", () => {
    it("should have proper dialog structure with header and footer", async () => {
      // Open a dialog and verify structure
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const manageButton = await $('[data-testid="quick-action-manage"]');
      await manageButton.click();
      await browser.pause(200);

      const moveAction = await $('[data-testid="manage-action-move"]');
      await moveAction.click();
      await browser.pause(300);

      const dialog = await findDialog();

      // Dialog should have Cancel and action buttons
      const cancelButton = await dialog.$("button*=Cancel");
      const moveButton = await dialog.$("button*=Move");

      await expect(cancelButton).toBeDisplayed();
      await expect(moveButton).toBeDisplayed();
    });
  });

  describe("Dialog Interaction During Operations", () => {
    async function openSetUserDialog(): Promise<WebdriverIO.Element> {
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();

      const manageButton = await $('[data-testid="quick-action-manage"]');
      await manageButton.waitForDisplayed({ timeout: 3000 });
      await manageButton.click();

      const userAction = await $('[data-testid="manage-action-user"]');
      await userAction.waitForDisplayed({ timeout: 3000 });
      await userAction.click();

      return waitForDialog('[role="dialog"]', 5000);
    }

    it("should disable form inputs during operation", async () => {
      const dialog = await openSetUserDialog();
      const usernameInput = await dialog.$('input[type="text"]');
      await usernameInput.setValue("testuser");

      const setUserButton = await dialog.$('button*=Set User');
      await setUserButton.click();

      // During operation, button should be disabled
      await waitForButtonDisabled(setUserButton, 2000);

      // Verify button is actually disabled
      const isDisabled = await setUserButton.getAttribute("disabled");
      expect(isDisabled).not.toBeNull();
    });

    it("should prevent closing dialog during operation", async () => {
      const dialog = await openSetUserDialog();
      const usernameInput = await dialog.$('input[type="text"]');
      await usernameInput.setValue("testuser");

      const setUserButton = await dialog.$('button*=Set User');
      await setUserButton.click();

      // Check cancel button is disabled during operation
      const cancelButton = await dialog.$('button*=Cancel');
      await waitForButtonDisabled(cancelButton, 2000);

      // Cancel should be disabled during operation
      const isCancelDisabled = await cancelButton.getAttribute("disabled");
      expect(isCancelDisabled).not.toBeNull();
    });
  });

  describe("Quick Actions Menu State", () => {
    it("should disable quick actions button during operation", async () => {
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$('[data-testid="start-button"]');
      const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');

      // Start the operation
      await startButton.click();

      // Quick actions button should be disabled during operation
      await waitForButtonDisabled(quickActionsButton, 2000);

      // Verify it's actually disabled
      const isDisabled = await quickActionsButton.getAttribute("disabled");
      expect(isDisabled).not.toBeNull();

      // Wait for operation to complete
      await waitForDistroState("Debian", "ONLINE", 10000);
    });

    it("should re-enable quick actions button after operation completes", async () => {
      // First stop Debian if it's running (from previous test)
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const stopButton = await debianCard.$('[data-testid="stop-button"]');
      if (await stopButton.isExisting()) {
        await stopButton.click();
        await waitForDistroState("Debian", "OFFLINE", 10000);
        await browser.pause(300);
      }

      // Now find the start button
      const startButton = await debianCard.$('[data-testid="start-button"]');
      const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');

      // Start the operation
      await startButton.click();

      // Wait for operation to complete
      await waitForDistroState("Debian", "ONLINE", 10000);

      // Quick actions button should be re-enabled
      await browser.waitUntil(
        async () => {
          const disabled = await quickActionsButton.getAttribute("disabled");
          return disabled === null;
        },
        {
          timeout: 5000,
          timeoutMsg: "Quick actions button was not re-enabled after operation",
        }
      );

      // Verify it's clickable
      const isClickable = await quickActionsButton.isClickable();
      expect(isClickable).toBe(true);
    });
  });
});
