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
  selectors,
  confirmDialog,
  safeRefresh,
  waitForDialog,
  waitForDialogToDisappear,
  waitForButtonDisabled,
  waitForDistroState,
  clearConfigPendingState,
  waitForButtonEnabled,
  resetMockState,
  waitForAppReady,
} from "../utils";
import { setupHooks } from "../base";

/**
 * Find open dialog using role attribute
 */
async function findDialog(): Promise<WebdriverIO.Element> {
  return await $('[role="dialog"]') as unknown as WebdriverIO.Element;
}

/**
 * Handle "Shutdown WSL?" dialog if it appears
 * Some operations (resize, move, sparse) require ALL distros to be stopped.
 * This clicks "Shutdown & Continue" to proceed past the dialog.
 */
async function handleShutdownDialogIfPresent(): Promise<void> {
  // Wait for potential dialog to appear
  try {
    await browser.waitUntil(
      async () => {
        const dialog = await findDialog();
        return await dialog.isDisplayed();
      },
      { timeout: 1000 }
    );
  } catch {
    // No dialog appeared, that's okay
    return;
  }

  const dialog = await findDialog();
  const isDisplayed = await dialog.isDisplayed();
  if (!isDisplayed) return;

  const dialogText = await dialog.getText();
  if (!dialogText.toLowerCase().includes("shutdown wsl")) return;

  const shutdownButton = await dialog.$("button*=Shutdown & Continue");
  const buttonDisplayed = await shutdownButton.isDisplayed();
  if (!buttonDisplayed) return;

  await shutdownButton.click();

  // Wait for the shutdown dialog to transition - the next dialog will appear quickly
  // We don't wait for all dialogs to disappear because the actual action dialog opens next
  await browser.waitUntil(
    async () => {
      const currentDialog = await findDialog();
      const text = await currentDialog.getText().catch(() => "");
      // Dialog transitioned when it no longer shows "shutdown wsl"
      return !text.toLowerCase().includes("shutdown wsl");
    },
    { timeout: 5000, timeoutMsg: "Shutdown dialog did not transition" }
  );
}

describe("Error Handling and Failure Scenarios", () => {
  setupHooks.withCleanNotifications();

  describe("Confirmation Dialogs", () => {
    describe("Delete Distribution", () => {
      it("should show confirmation dialog when deleting a distribution", async () => {
        const alpineCard = await $(selectors.distroCardByName("Alpine"));
        const deleteButton = await alpineCard.$('[data-testid="delete-button"]');
        await deleteButton.click();

        const dialog = await waitForDialog('[role="dialog"]');
        await expect(dialog).toBeDisplayed();

        const dialogText = await dialog.getText();
        expect(dialogText.toLowerCase()).toContain("delete");
      });

      it("should cancel delete when Cancel is clicked", async () => {
        const alpineCard = await $(selectors.distroCardByName("Alpine"));
        const deleteButton = await alpineCard.$('[data-testid="delete-button"]');
        await deleteButton.click();

        await waitForDialog('[role="dialog"]');

        // Click cancel
        await confirmDialog(false);
        await waitForDialogToDisappear('[role="dialog"]');

        // Alpine should still exist
        const alpineCardAfter = await $(selectors.distroCardByName("Alpine"));
        await expect(alpineCardAfter).toBeDisplayed();
      });

      it("should proceed with delete when confirmed", async () => {
        const alpineCard = await $(selectors.distroCardByName("Alpine"));
        const deleteButton = await alpineCard.$('[data-testid="delete-button"]');
        await deleteButton.click();

        await waitForDialog('[role="dialog"]');

        // Click delete to confirm
        await confirmDialog(true);

        // Alpine should be removed - wait for it to disappear
        await browser.waitUntil(
          async () => {
            const card = await $(selectors.distroCardByName("Alpine"));
            return !(await card.isDisplayed());
          },
          { timeout: 5000, timeoutMsg: "Alpine card was not removed after delete" }
        );
      });
    });

    describe("Shutdown All", () => {
      it("should show confirmation when clicking Shutdown All", async () => {
        const shutdownAllButton = await $(selectors.shutdownAllButton);

        await shutdownAllButton.waitForClickable({ timeout: 5000 });
        await shutdownAllButton.click();

        const dialog = await waitForDialog('[role="dialog"]');

        const dialogText = await dialog.getText();
        expect(dialogText.toLowerCase()).toContain("shutdown");
      });

      it("should cancel shutdown when Cancel is clicked", async () => {
        const shutdownAllButton = await $(selectors.shutdownAllButton);

        await shutdownAllButton.waitForClickable({ timeout: 5000 });
        await shutdownAllButton.click();

        const dialog = await waitForDialog('[role="dialog"]');

        const cancelButton = await dialog.$('button*=Cancel');
        await cancelButton.click();
        await waitForDialogToDisappear('[role="dialog"]');

        // Ubuntu should still be running
        const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
        const badge = await ubuntuCard.$('[data-testid="state-badge"]');
        const state = await badge.getText();
        expect(state).toBe("ONLINE");
      });
    });
  });

  describe("Validation Errors", () => {
    describe("Set Default User Dialog", () => {
      async function openSetUserDialog(): Promise<WebdriverIO.Element> {
        const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
        const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
        await quickActionsButton.click();

        const manageButton = await $('[data-testid="quick-action-manage"]');
        await manageButton.waitForDisplayed({ timeout: 3000 });
        await manageButton.click();

        const userAction = await $('[data-testid="manage-action-user"]');
        await userAction.waitForDisplayed({ timeout: 3000 });
        await userAction.click();

        return waitForDialog('[role="dialog"]');
      }

      it("should not allow empty username", async () => {
        const dialog = await openSetUserDialog();
        const setUserButton = await dialog.$('button*=Set User');

        // Button should be disabled with empty username
        const isDisabled = await setUserButton.getAttribute("disabled");
        expect(isDisabled).not.toBeNull();
      });

      it("should sanitize username input to lowercase", async () => {
        const dialog = await openSetUserDialog();
        const usernameInput = await dialog.$('input[type="text"]');

        // Try to enter uppercase letters
        await usernameInput.setValue("TestUser");

        // Wait for input to be processed and sanitized
        await browser.waitUntil(
          async () => (await usernameInput.getValue()) === "testuser",
          { timeout: 2000, timeoutMsg: "Username was not converted to lowercase" }
        );
      });

      it("should remove invalid characters from username", async () => {
        const dialog = await openSetUserDialog();
        const usernameInput = await dialog.$('input[type="text"]');

        // Try to enter special characters
        await usernameInput.setValue("test@user!");

        // Wait for input to be processed and sanitized
        await browser.waitUntil(
          async () => {
            const value = await usernameInput.getValue();
            return !value.includes("@") && !value.includes("!");
          },
          { timeout: 2000, timeoutMsg: "Invalid characters were not removed from username" }
        );
      });
    });

    describe("Resize Dialog Validation", () => {
      async function openResizeDialog(): Promise<WebdriverIO.Element> {
        const debianCard = await $(selectors.distroCardByName("Debian"));
        const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');
        await quickActionsButton.click();

        const manageButton = await $('[data-testid="quick-action-manage"]');
        await manageButton.waitForDisplayed({ timeout: 3000 });
        await manageButton.click();

        const resizeAction = await $('[data-testid="manage-action-resize"]');
        await resizeAction.waitForDisplayed({ timeout: 3000 });
        await resizeAction.click();

        // Resize requires ALL distros stopped - handle shutdown dialog
        await handleShutdownDialogIfPresent();

        return waitForDialog('[role="dialog"]');
      }

      it("should show invalid when size is too small", async () => {
        const dialog = await openResizeDialog();
        const sizeInput = await dialog.$('input[type="number"]');

        // Clear and enter very small value
        await sizeInput.setValue("0");

        // Wait for validation message to appear
        await browser.waitUntil(
          async () => {
            const text = await dialog.getText();
            return text.includes("Invalid");
          },
          { timeout: 3000, timeoutMsg: "Invalid validation message did not appear" }
        );
      });

      it("should show current size in resize dialog", async () => {
        const dialog = await openResizeDialog();

        // Wait for current size info to load
        await browser.waitUntil(
          async () => {
            const text = await dialog.getText();
            return text.includes("VIRTUAL SIZE");
          },
          { timeout: 5000, timeoutMsg: "Virtual size info did not load" }
        );
      });
    });

    describe("Move Dialog Validation", () => {
      it("should disable Move button when no path entered", async () => {
        const debianCard = await $(selectors.distroCardByName("Debian"));
        const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');
        await quickActionsButton.click();

        const manageButton = await $('[data-testid="quick-action-manage"]');
        await manageButton.waitForDisplayed({ timeout: 3000 });
        await manageButton.click();

        const moveAction = await $('[data-testid="manage-action-move"]');
        await moveAction.waitForDisplayed({ timeout: 3000 });
        await moveAction.click();

        // Move requires ALL distros stopped - handle shutdown dialog
        await handleShutdownDialogIfPresent();

        const dialog = await waitForDialog('[role="dialog"]');
        const moveButton = await dialog.$('button*=Move');

        const isDisabled = await moveButton.getAttribute("disabled");
        expect(isDisabled).not.toBeNull();
      });
    });
  });

  describe("Running Distribution Dialogs", () => {
    it("should open move dialog for running distribution (handles shutdown internally)", async () => {
      // Ubuntu is running - Move dialog now opens directly and handles shutdown internally
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();

      const manageButton = await $('[data-testid="quick-action-manage"]');
      await manageButton.waitForDisplayed({ timeout: 3000 });
      await manageButton.click();

      const moveAction = await $('[data-testid="manage-action-move"]');
      await moveAction.waitForDisplayed({ timeout: 3000 });
      await moveAction.click();

      // Handle shutdown dialog if shown (for ALL distros shutdown)
      await handleShutdownDialogIfPresent();

      const dialog = await waitForDialog('[role="dialog"]');
      const dialogText = await dialog.getText();

      // Move dialog should be displayed (handles shutdown internally)
      expect(dialogText.toLowerCase()).toContain("move");
    });

    it("should show shutdown dialog when trying to resize running distribution", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();

      const manageButton = await $('[data-testid="quick-action-manage"]');
      await manageButton.waitForDisplayed({ timeout: 3000 });
      await manageButton.click();

      const resizeAction = await $('[data-testid="manage-action-resize"]');
      await resizeAction.waitForDisplayed({ timeout: 3000 });
      await resizeAction.click();

      const dialog = await waitForDialog('[role="dialog"]');
      const dialogText = await dialog.getText();

      // Dialog should show shutdown confirmation for running distro
      expect(dialogText.toLowerCase()).toContain("shutdown");
    });

    it("should show shutdown dialog when trying to toggle sparse mode on running distribution", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();

      const manageButton = await $('[data-testid="quick-action-manage"]');
      await manageButton.waitForDisplayed({ timeout: 3000 });
      await manageButton.click();

      const sparseAction = await $('[data-testid="manage-action-sparse"]');
      await sparseAction.waitForDisplayed({ timeout: 3000 });
      await sparseAction.click();

      // Should show shutdown dialog
      const dialog = await waitForDialog('[role="dialog"]');
      const dialogText = await dialog.getText();
      expect(dialogText.toLowerCase()).toContain("shutdown");
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

      // Sparse mode requires ALL distros stopped - handle shutdown dialog
      await handleShutdownDialogIfPresent();

      return waitForDialog('[role="dialog"]', 5000);
    }

    it("should show data corruption warning when enabling sparse mode", async () => {
      const dialog = await openSparseDialog();
      const dialogText = await dialog.getText();
      const lowerText = dialogText.toLowerCase();

      // Must show sparse mode in dialog
      expect(lowerText).toContain("sparse");

      // Must warn about data loss risk - this is the canonical warning text
      expect(lowerText).toContain("data loss");

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
    });

    it("should require stopping running distribution before sparse mode", async () => {
      // Fully reset to ensure Ubuntu is running
      await safeRefresh();
      await resetMockState();
      await clearConfigPendingState();
      await waitForAppReady();

      // Wait for Ubuntu to be online
      await waitForDistroState("Ubuntu", "ONLINE", 10000);

      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();

      const manageButton = await $('[data-testid="quick-action-manage"]');
      await manageButton.waitForDisplayed({ timeout: 3000 });
      await manageButton.click();

      const sparseAction = await $('[data-testid="manage-action-sparse"]');
      await sparseAction.waitForDisplayed({ timeout: 3000 });
      await sparseAction.click();

      // Should show stop confirmation dialog (requires ALL distros stopped)
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

      const manageButton = await $('[data-testid="quick-action-manage"]');
      await manageButton.waitForDisplayed({ timeout: 3000 });
      await manageButton.click();

      const moveAction = await $('[data-testid="manage-action-move"]');
      await moveAction.waitForDisplayed({ timeout: 3000 });
      await moveAction.click();

      // Move requires ALL distros stopped - handle shutdown dialog
      await handleShutdownDialogIfPresent();

      const dialog = await waitForDialog('[role="dialog"]');

      // Dialog should have Cancel and action buttons
      const cancelButton = await dialog.$("button*=Cancel");
      const moveButton = await dialog.$("button*=Move");

      await expect(cancelButton).toBeDisplayed();
      await expect(moveButton).toBeDisplayed();
    });
  });

  describe("Dialog Interaction During Operations", () => {
    async function openSetUserDialogForDebian(): Promise<WebdriverIO.Element> {
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
      const dialog = await openSetUserDialogForDebian();
      const usernameInput = await dialog.$('input[type="text"]');
      await usernameInput.setValue("testuser");

      const setUserButton = await dialog.$('button*=Set User');
      await setUserButton.click();

      // During operation, button should be disabled
      await waitForButtonDisabled(setUserButton, 2000);
    });

    it("should prevent closing dialog during operation", async () => {
      const dialog = await openSetUserDialogForDebian();
      const usernameInput = await dialog.$('input[type="text"]');
      await usernameInput.setValue("testuser");

      const setUserButton = await dialog.$('button*=Set User');
      await setUserButton.click();

      // Check cancel button is disabled during operation
      const cancelButton = await dialog.$('button*=Cancel');
      await waitForButtonDisabled(cancelButton, 2000);
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
      }

      // Now find the start button
      const startButton = await debianCard.$('[data-testid="start-button"]');
      const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');

      // Start the operation
      await startButton.click();

      // Wait for operation to complete
      await waitForDistroState("Debian", "ONLINE", 10000);

      // Quick actions button should be re-enabled
      await waitForButtonEnabled(quickActionsButton, 5000);

      // Verify it's clickable
      const isClickable = await quickActionsButton.isClickable();
      expect(isClickable).toBe(true);
    });
  });
});
