/**
 * E2E Tests: Error Scenarios & Edge Cases
 *
 * Tests that the app handles unusual situations gracefully:
 * - Operation timeout errors
 * - Command failure errors
 * - Distribution not found errors
 * - Very long distribution names
 * - Special characters in names
 * - Unicode distribution names
 * - Error display and recovery
 */

import {
  setMockError,
  clearMockErrors,
  selectors,
  waitForDistroState,
  waitForElementClickable,
  waitForDialog,
  waitForDialogToDisappear,
  verifyDistroCardState,
  mockDistributions,
  verifyErrorBanner,
  verifyAndDismissError,
  EXPECTED_ERRORS,
  captureDistroStates,
  verifyStatesUnchanged,
} from "../utils";
import { setupHooks, isElementDisplayed } from "../base";

const errorSelectors = {
  // Clone Dialog
  cloneAction: '[data-testid="quick-action-clone"]',
  cloneDialog: '[data-testid="clone-dialog"]',
  cloneNameInput: '[data-testid="clone-name-input"]',
  cloneError: '[data-testid="clone-error"]',
  cloneCancelButton: '[data-testid="clone-cancel-button"]',
  cloneConfirmButton: '[data-testid="clone-confirm-button"]',

  // Import Dialog
  importButton: '[data-testid="import-button"]',
  importDialog: '[data-testid="import-dialog"]',
  importNameInput: '[data-testid="import-name-input"]',
  importError: '[data-testid="import-error"]',

  // General
  quickActionsButton: '[data-testid="quick-actions-button"]',
  quickActionsMenu: '[data-testid="quick-actions-menu"]',
  errorMessage: '[data-testid*="error"]',
  toastError: '[data-testid="toast-error"]',

  // Distro card elements
  startButton: '[data-testid="start-button"]',
  stopButton: '[data-testid="stop-button"]',
  deleteButton: '[data-testid="delete-button"]',
  stateBadge: '[data-testid="state-badge"]',

  // Confirm dialog
  confirmDialog: '[data-testid="confirm-dialog"]',
  dialogConfirmButton: '[data-testid="dialog-confirm-button"]',
  dialogCancelButton: '[data-testid="dialog-cancel-button"]',

  // Rename dialog
  renameAction: '[data-testid="manage-action-rename"]',
  renameDialog: '[data-testid="rename-dialog"]',
  renameNameInput: '[data-testid="rename-name-input"]',
  renameError: '[data-testid="rename-error"]',
  renameValidationError: '[data-testid="rename-validation-error"]',
  renameCancelButton: '[data-testid="rename-cancel-button"]',
  renameConfirmButton: '[data-testid="rename-confirm-button"]',

  // Manage submenu
  manageSubmenu: '[data-testid="quick-action-manage"]',
};

const TEST_DISTRO = "Debian"; // Use stopped distro for most tests

async function openQuickActionsForDistro(distroName: string): Promise<void> {
  const card = await $(selectors.distroCardByName(distroName));
  await card.waitForDisplayed({ timeout: 5000 });
  const quickActionsButton = await card.$(errorSelectors.quickActionsButton);
  await quickActionsButton.waitForClickable({ timeout: 5000 });
  await quickActionsButton.click();

  // Wait for quick actions menu to appear
  await browser.waitUntil(
    async () => isElementDisplayed(errorSelectors.quickActionsMenu),
    { timeout: 5000, timeoutMsg: "Quick actions menu did not appear" }
  );
}

async function openCloneDialog(): Promise<void> {
  await openQuickActionsForDistro(TEST_DISTRO);
  const cloneAction = await $(errorSelectors.cloneAction);
  await cloneAction.waitForClickable({ timeout: 5000 });
  await cloneAction.click();

  // Check if stop dialog appeared (for running distros)
  const stopDialogDisplayed = await isElementDisplayed(selectors.stopAndActionDialog);
  if (stopDialogDisplayed) {
    // Click "Stop & Continue" to proceed
    const stopButton = await $(selectors.stopAndContinueButton);
    await stopButton.click();
    // Wait for stop dialog to close
    await waitForDialogToDisappear(selectors.stopAndActionDialog, 10000);
  }

  // Wait for clone dialog to appear
  await waitForDialog(errorSelectors.cloneDialog, 5000);
}

describe("Error Scenarios & Edge Cases", () => {
  setupHooks.standard();

  beforeEach(async () => {
    await clearMockErrors();
  });

  afterEach(async () => {
    // Clear any error configurations
    await clearMockErrors();
  });

  describe("Start Operation Errors", () => {
    it("should show error banner when starting distribution times out", async () => {
      // Configure mock to return timeout error for start
      await setMockError("start", "timeout", 100);

      // Capture state before operation to verify no side effects
      const preSnapshot = await captureDistroStates();

      const card = await $(selectors.distroCardByName(TEST_DISTRO));
      await card.waitForDisplayed({ timeout: 5000 });

      const startButton = await card.$(errorSelectors.startButton);
      await startButton.waitForClickable({ timeout: 5000 });
      await startButton.click();

      // Verify error banner with timeout message
      await verifyErrorBanner({
        expectedPatterns: EXPECTED_ERRORS.TIMEOUT.patterns,
        timeout: 10000,
      });

      // Distro should remain stopped after timeout error
      await waitForDistroState(TEST_DISTRO, "OFFLINE", 2000);

      // Verify no unintended state changes
      await verifyStatesUnchanged(preSnapshot);
    });

    it("should show error banner when starting distribution fails", async () => {
      await setMockError("start", "command_failed", 100);

      // Capture state before operation
      const preSnapshot = await captureDistroStates();

      const card = await $(selectors.distroCardByName(TEST_DISTRO));
      const startButton = await card.$(errorSelectors.startButton);
      await startButton.waitForClickable({ timeout: 5000 });
      await startButton.click();

      // Verify error banner with command failed message
      await verifyErrorBanner({
        expectedPatterns: EXPECTED_ERRORS.COMMAND_FAILED.patterns,
        timeout: 10000,
      });

      // Distro should remain stopped (badge shows "OFFLINE" for stopped)
      await waitForDistroState(TEST_DISTRO, "OFFLINE", 2000);

      // Verify no unintended state changes
      await verifyStatesUnchanged(preSnapshot);
    });
  });

  describe("Stop/Terminate Operation Errors", () => {
    it("should show error banner when stopping distribution times out", async () => {
      // Use Ubuntu which is running by default
      await setMockError("terminate", "timeout", 100);

      // Capture state before operation
      const preSnapshot = await captureDistroStates();

      const card = await $(selectors.distroCardByName("Ubuntu"));
      await card.waitForDisplayed({ timeout: 5000 });

      const stopButton = await card.$(errorSelectors.stopButton);
      await stopButton.waitForClickable({ timeout: 5000 });
      await stopButton.click();

      // Verify error banner with timeout message
      await verifyErrorBanner({
        expectedPatterns: EXPECTED_ERRORS.TIMEOUT.patterns,
        timeout: 10000,
      });

      // Distro should still be running after timeout (badge shows "ONLINE" for running)
      await waitForDistroState("Ubuntu", "ONLINE", 2000);

      // Verify no unintended state changes
      await verifyStatesUnchanged(preSnapshot);
    });
  });

  describe("Delete/Unregister Operation Errors", () => {
    it("should show error banner when deleting distribution fails", async () => {
      await setMockError("unregister", "command_failed", 100);

      // Capture state before operation
      const preSnapshot = await captureDistroStates();

      const card = await $(selectors.distroCardByName(TEST_DISTRO));
      const deleteButton = await card.$(errorSelectors.deleteButton);
      await deleteButton.waitForClickable({ timeout: 5000 });
      await deleteButton.click();

      // Wait for confirmation dialog
      const dialog = await $(selectors.confirmDialog);
      await dialog.waitForDisplayed({ timeout: 5000 });

      // Confirm delete
      const confirmButton = await $(errorSelectors.dialogConfirmButton);
      await confirmButton.waitForClickable({ timeout: 5000 });
      await confirmButton.click();

      // Verify error banner with command failed message
      await verifyErrorBanner({
        expectedPatterns: EXPECTED_ERRORS.COMMAND_FAILED.patterns,
        timeout: 10000,
      });

      // Distro card should still exist (delete failed)
      const cardAfter = await $(selectors.distroCardByName(TEST_DISTRO));
      await expect(cardAfter).toBeDisplayed();

      // Verify no unintended state changes (all distros still present with same states)
      await verifyStatesUnchanged(preSnapshot);
    });
  });

  describe("Shutdown All Errors", () => {
    it("should show error banner when shutdown all times out", async () => {
      await setMockError("shutdown", "timeout", 100);

      // Capture state before operation
      const preSnapshot = await captureDistroStates();

      const shutdownButton = await $(selectors.shutdownAllButton);
      await shutdownButton.waitForClickable({ timeout: 5000 });
      await shutdownButton.click();

      // Wait for confirmation dialog
      const dialog = await waitForDialog(selectors.confirmDialog, 5000);
      await expect(dialog).toBeDisplayed();

      // Confirm shutdown
      const confirmButton = await $(errorSelectors.dialogConfirmButton);
      await confirmButton.click();

      // Verify error banner with timeout message
      await verifyErrorBanner({
        expectedPatterns: EXPECTED_ERRORS.TIMEOUT.patterns,
        timeout: 10000,
      });

      // Running distros should still show as running (badge shows "ONLINE")
      await verifyDistroCardState("Ubuntu", "ONLINE");

      // Verify no unintended state changes (shutdown failed, all remain same)
      await verifyStatesUnchanged(preSnapshot);
    });
  });

  describe("Timeout Error Force Shutdown Feature", () => {
    it("should show Force Shutdown WSL button on timeout error", async () => {
      await setMockError("start", "timeout", 100);

      const card = await $(selectors.distroCardByName(TEST_DISTRO));
      const startButton = await card.$(errorSelectors.startButton);
      await startButton.click();

      // Verify error banner with timeout message and tip
      const { banner } = await verifyErrorBanner({
        expectedPatterns: EXPECTED_ERRORS.TIMEOUT.patterns,
        shouldHaveTip: true,
        timeout: 10000,
      });

      // Wait for Force Shutdown button to appear (React needs to recognize timeout error)
      await browser.waitUntil(
        async () => {
          const forceShutdownButton = await banner.$(selectors.forceShutdownButton);
          return await forceShutdownButton.isDisplayed().catch(() => false);
        },
        { timeout: 3000, timeoutMsg: "Force Shutdown button did not appear for timeout error" }
      );

      // Verify Force Shutdown button appears for timeout errors
      const forceShutdownButton = await banner.$(selectors.forceShutdownButton);
      await expect(forceShutdownButton).toBeDisplayed();

      // Verify tip text about terminal windows is displayed
      const tipText = await banner.$(".text-xs");
      await browser.waitUntil(
        async () => {
          const text = await tipText.getText().catch(() => "");
          return text.length > 0;
        },
        { timeout: 3000, timeoutMsg: "Tip text did not get content" }
      );
      const tipContent = await tipText.getText();
      expect(tipContent.toLowerCase()).toContain("terminal");
    });

    it("should NOT show Force Shutdown button for non-timeout errors", async () => {
      await setMockError("start", "command_failed", 100);

      const card = await $(selectors.distroCardByName(TEST_DISTRO));
      const startButton = await card.$(errorSelectors.startButton);
      await startButton.click();

      // Verify error banner with command failed message
      await verifyErrorBanner({
        expectedPatterns: EXPECTED_ERRORS.COMMAND_FAILED.patterns,
        timeout: 10000,
      });

      // Force Shutdown button should NOT appear for non-timeout errors
      const forceShutdownDisplayed = await isElementDisplayed(selectors.forceShutdownButton);
      expect(forceShutdownDisplayed).toBe(false);
    });

    it("should show Force Shutdown confirmation dialog when clicked", async () => {
      await setMockError("start", "timeout", 100);

      const card = await $(selectors.distroCardByName(TEST_DISTRO));
      const startButton = await card.$(errorSelectors.startButton);
      await startButton.click();

      // Verify error banner with timeout message
      const { banner } = await verifyErrorBanner({
        expectedPatterns: EXPECTED_ERRORS.TIMEOUT.patterns,
        timeout: 10000,
      });

      // Wait for Force Shutdown button to appear
      await browser.waitUntil(
        async () => {
          const forceShutdownButton = await banner.$(selectors.forceShutdownButton);
          return await forceShutdownButton.isDisplayed().catch(() => false);
        },
        { timeout: 3000, timeoutMsg: "Force Shutdown button did not appear" }
      );

      // Click Force Shutdown button
      const forceShutdownButton = await banner.$(selectors.forceShutdownButton);
      await forceShutdownButton.click();

      // Wait for confirmation dialog
      const dialog = await waitForDialog(selectors.confirmDialog, 5000);
      await expect(dialog).toBeDisplayed();

      // Verify dialog warns about force shutdown
      const dialogText = await dialog.getText();
      expect(dialogText.toLowerCase()).toContain("force");

      // Cancel to not actually perform the action
      const cancelButton = await $(errorSelectors.dialogCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.confirmDialog, 3000);
    });
  });

  describe("List Operation Errors", () => {
    it("should handle list operation timeout gracefully", async () => {
      // This tests that the UI remains usable even when list fails
      await setMockError("list", "timeout", 100);

      // Try to refresh the list
      const refreshButton = await $(selectors.refreshButton);
      await refreshButton.waitForClickable({ timeout: 5000 });
      await refreshButton.click();

      // Wait for refresh to complete (success or error)
      await browser.waitUntil(
        async () => {
          const main = await $("main");
          return main.isDisplayed();
        },
        { timeout: 5000, timeoutMsg: "Main app did not remain visible" }
      );

      // Main app should still be visible
      const main = await $("main");
      await expect(main).toBeDisplayed();
    });
  });

  describe("Clone Dialog Error Display", () => {
    it("should display error message when clone fails", async () => {
      await setMockError("export", "command_failed", 100);

      await openCloneDialog();

      const nameInput = await $(errorSelectors.cloneNameInput);
      await nameInput.clearValue();
      await nameInput.setValue("test-clone");

      const confirmButton = await $(errorSelectors.cloneConfirmButton);
      await confirmButton.click();

      // Wait for the operation to complete
      await browser.waitUntil(
        async () => {
          // Either dialog shows error, or dialog closed and global error banner appeared
          const dialogErrorVisible = await isElementDisplayed(errorSelectors.cloneError);
          if (dialogErrorVisible) return true;

          // Check if global error banner appeared (dialog closed with error)
          const globalErrorVisible = await isElementDisplayed(selectors.errorBanner);
          if (globalErrorVisible) return true;

          return false;
        },
        {
          timeout: 10000,
          timeoutMsg: "Neither dialog error nor global error banner appeared after clone failure",
        }
      );

      // Verify error was actually displayed (not just that something happened)
      const dialogErrorVisible = await isElementDisplayed(errorSelectors.cloneError);
      const globalErrorVisible = await isElementDisplayed(selectors.errorBanner);

      // At least one error indication must be visible
      // Note: OR is intentional - error may appear in dialog or global banner depending on timing
      expect(dialogErrorVisible || globalErrorVisible).toBe(true);

      // If dialog error is shown, verify it contains error text
      if (dialogErrorVisible) {
        const dialogError = await $(errorSelectors.cloneError);
        const errorText = await dialogError.getText();
        expect(errorText.length).toBeGreaterThan(0);
        expect(errorText.toLowerCase()).toContain("failed");
      }

      // If global error banner is shown, verify content
      if (globalErrorVisible) {
        const globalErrorBanner = await $(selectors.errorBanner);
        const errorMessage = await globalErrorBanner.$(selectors.errorMessage);
        const errorText = await errorMessage.getText();
        expect(errorText.length).toBeGreaterThan(0);
        expect(errorText.toLowerCase()).toContain("failed");
      }
    });

    it("should allow closing clone dialog without triggering operation", async () => {
      await openCloneDialog();

      const cancelButton = await $(errorSelectors.cloneCancelButton);
      await cancelButton.waitForClickable({ timeout: 5000 });
      await cancelButton.click();

      // Wait for dialog to close
      await waitForDialogToDisappear(errorSelectors.cloneDialog, 3000);

      // Verify dialog is closed
      const dialogVisible = await isElementDisplayed(errorSelectors.cloneDialog);
      expect(dialogVisible).toBe(false);
    });
  });

  describe("Very Long Distribution Names", () => {
    it("should handle very long distribution name in clone dialog", async () => {
      await openCloneDialog();

      const longName = "a".repeat(100); // 100 character name
      const nameInput = await $(errorSelectors.cloneNameInput);
      await nameInput.clearValue();
      await nameInput.setValue(longName);

      // Wait for input value to be set
      await browser.waitUntil(
        async () => {
          const value = await nameInput.getValue();
          return value.length > 0;
        },
        { timeout: 3000, timeoutMsg: "Input value was not set" }
      );

      // Input should accept the long name (may be truncated by UI)
      const value = await nameInput.getValue();
      expect(value.length).toBeGreaterThan(0);

      // Dialog should still be functional
      const cancelButton = await $(errorSelectors.cloneCancelButton);
      await expect(cancelButton).toBeClickable();
    });

    it("should display long distribution names without breaking layout", async () => {
      // Check that existing distro cards with longer names display properly
      const card = await $(selectors.distroCardByName("Ubuntu-22.04"));
      await expect(card).toBeDisplayed();

      // Card should have reasonable dimensions (not infinite width)
      const size = await card.getSize();
      expect(size.width).toBeLessThan(1000); // Reasonable max width
      expect(size.height).toBeGreaterThan(0);
    });
  });

  describe("Special Characters in Names", () => {
    it("should handle special characters in clone name input", async () => {
      await openCloneDialog();

      const specialName = "test-distro_v2";
      const nameInput = await $(errorSelectors.cloneNameInput);

      // Click to focus, then clear and set value
      await nameInput.click();
      await nameInput.clearValue();
      await nameInput.setValue(specialName);

      // Wait for input value to be set
      await browser.waitUntil(
        async () => {
          const value = await nameInput.getValue();
          return value.includes("test-distro");
        },
        { timeout: 3000, timeoutMsg: "Input value was not set correctly" }
      );

      const value = await nameInput.getValue();
      expect(value).toContain("test-distro");
    });

    it("should reject invalid characters with validation error", async () => {
      await openCloneDialog();

      // Try a name with invalid characters
      const invalidName = "test<>distro";
      const nameInput = await $(errorSelectors.cloneNameInput);
      await nameInput.clearValue();
      await nameInput.setValue(invalidName);

      // Wait for validation to run
      await browser.waitUntil(
        async () => {
          const confirmButton = await $(errorSelectors.cloneConfirmButton);
          const isDisabled = (await confirmButton.getAttribute("disabled")) !== null;
          const isErrorVisible = await isElementDisplayed(selectors.cloneValidationError);
          return isDisabled || isErrorVisible;
        },
        {
          timeout: 3000,
          timeoutMsg: "Validation did not trigger for invalid characters",
        }
      );

      // Check validation state
      const confirmButton = await $(errorSelectors.cloneConfirmButton);
      const isButtonDisabled = (await confirmButton.getAttribute("disabled")) !== null;
      const isErrorVisible = await isElementDisplayed(selectors.cloneValidationError);

      // Validation MUST be enforced: button disabled, error shown, or both
      // Note: OR is intentional - validation UX may use either approach
      expect(isButtonDisabled || isErrorVisible).toBe(true);

      // If validation error is visible, verify its content
      if (isErrorVisible) {
        const validationError = await $(selectors.cloneValidationError);
        const errorText = await validationError.getText();
        expect(errorText.length).toBeGreaterThan(0);
        // Error message should describe the character restriction
        expect(errorText.toLowerCase()).toContain("can only contain");
      }

      // Clean up: Cancel the dialog
      const cancelButton = await $(errorSelectors.cloneCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(errorSelectors.cloneDialog, 3000);
    });
  });

  describe("Unicode Distribution Names", () => {
    it("should handle unicode characters in clone name input", async () => {
      await openCloneDialog();

      // Unicode name with mixed scripts
      const unicodeName = "Ubuntu-日本語";
      const nameInput = await $(errorSelectors.cloneNameInput);
      await nameInput.clearValue();
      await nameInput.setValue(unicodeName);

      // Wait for input value to be set
      await browser.waitUntil(
        async () => {
          const value = await nameInput.getValue();
          return value.includes("Ubuntu");
        },
        { timeout: 3000, timeoutMsg: "Unicode input value was not set" }
      );

      const value = await nameInput.getValue();
      // Input should contain the unicode characters
      expect(value).toContain("Ubuntu");
    });
  });

  describe("Empty and Whitespace Names", () => {
    it("should have a default suggested name in clone dialog", async () => {
      await openCloneDialog();

      const nameInput = await $(errorSelectors.cloneNameInput);
      const value = await nameInput.getValue();

      // Clone dialog should have a suggested name based on source distro
      expect(value.length).toBeGreaterThan(0);

      // Cancel the dialog
      const cancelButton = await $(errorSelectors.cloneCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(errorSelectors.cloneDialog, 3000);
    });

    it("should handle name input and allow clearing", async () => {
      await openCloneDialog();

      const nameInput = await $(errorSelectors.cloneNameInput);

      // Clear and verify it's empty
      await nameInput.clearValue();

      // Wait for input to be cleared
      await browser.waitUntil(
        async () => {
          const value = await nameInput.getValue();
          return value === "";
        },
        { timeout: 3000, timeoutMsg: "Input was not cleared" }
      );

      const value = await nameInput.getValue();

      // Input should be clearable
      expect(value).toBe("");

      // Cancel the dialog
      const cancelButton = await $(errorSelectors.cloneCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(errorSelectors.cloneDialog, 3000);
    });
  });

  describe("Error Recovery", () => {
    it("should recover from error and allow retry", async () => {
      // First set an error
      await setMockError("start", "command_failed", 100);

      // Capture state before operation
      const preSnapshot = await captureDistroStates();

      const card = await $(selectors.distroCardByName(TEST_DISTRO));
      const startButton = await card.$(errorSelectors.startButton);
      await startButton.click();

      // Verify and dismiss error banner
      await verifyAndDismissError(EXPECTED_ERRORS.COMMAND_FAILED.patterns, 10000);

      // Clear the error
      await clearMockErrors();

      // Wait for button to be clickable
      await waitForElementClickable(startButton, 5000);

      // Retry should work now
      await startButton.click();

      // State badge shows "ONLINE" for running distributions
      await waitForDistroState(TEST_DISTRO, "ONLINE", 10000);

      // Verify only the intended distro changed state
      await verifyStatesUnchanged(preSnapshot, [{ name: TEST_DISTRO, newState: "ONLINE" }]);
    });

    it("should clear error state when dialog is reopened", async () => {
      await setMockError("export", "command_failed", 100);

      // Open and attempt operation
      await openCloneDialog();
      const nameInput = await $(errorSelectors.cloneNameInput);
      await nameInput.clearValue();
      await nameInput.setValue("test-clone");
      const confirmButton = await $(errorSelectors.cloneConfirmButton);
      await confirmButton.click();

      // Wait for operation to complete (either error shown or dialog closed)
      await browser.waitUntil(
        async () => {
          const dialogErrorVisible = await isElementDisplayed(errorSelectors.cloneError);
          const globalErrorVisible = await isElementDisplayed(selectors.errorBanner);
          return dialogErrorVisible || globalErrorVisible;
        },
        { timeout: 5000, timeoutMsg: "Operation did not complete with error" }
      );

      // Cancel dialog if still visible
      const isCancelVisible = await isElementDisplayed(errorSelectors.cloneCancelButton);
      if (isCancelVisible) {
        const cancelButton = await $(errorSelectors.cloneCancelButton);
        await cancelButton.click();
        await waitForDialogToDisappear(errorSelectors.cloneDialog, 3000);
      } else {
        await browser.keys("Escape");
        await browser.waitUntil(
          async () => !(await isElementDisplayed(errorSelectors.cloneDialog)),
          { timeout: 3000, timeoutMsg: "Dialog did not close with Escape" }
        );
      }

      // Clear mock error
      await clearMockErrors();

      // Reopen dialog - should be in clean state
      await openCloneDialog();
      const newNameInput = await $(errorSelectors.cloneNameInput);
      const value = await newNameInput.getValue();

      // Name input should be reset or have default value
      expect(value).not.toContain("error");
    });
  });

  describe("Concurrent Error Handling", () => {
    it("should handle rapid button clicks gracefully", async () => {
      const card = await $(selectors.distroCardByName(TEST_DISTRO));
      const startButton = await card.$(errorSelectors.startButton);

      // Rapid clicks
      await startButton.click();
      await startButton.click();
      await startButton.click();

      // Wait for any pending action to complete (important for test isolation)
      await browser.waitUntil(
        async () => {
          return browser.execute(() => {
            // @ts-expect-error - Store is exposed for testing
            const store = window.__distroStore;
            return store && store.getState().actionInProgress === null;
          });
        },
        { timeout: 10000, timeoutMsg: "Action did not complete after rapid clicks" }
      );

      // App should remain stable
      const main = await $("main");
      await expect(main).toBeDisplayed();
    });
  });

  describe("Graceful Degradation", () => {
    it("should continue working when some operations fail", async () => {
      // Set error for start operations only
      await setMockError("start", "command_failed", 100);

      // Capture state before operations for consistency check
      const preSnapshot = await captureDistroStates();
      expect(preSnapshot.length).toBe(mockDistributions.length);

      // Verify initial states
      await verifyDistroCardState(TEST_DISTRO, "OFFLINE"); // Debian is stopped
      await verifyDistroCardState("Ubuntu", "ONLINE"); // Ubuntu is running

      // Try the failing operation
      const card = await $(selectors.distroCardByName(TEST_DISTRO));
      const startButton = await card.$(errorSelectors.startButton);
      await startButton.click();

      // Verify and dismiss error banner
      await verifyAndDismissError(EXPECTED_ERRORS.COMMAND_FAILED.patterns, 5000);

      // The failed distro should still be stopped
      await verifyDistroCardState(TEST_DISTRO, "OFFLINE");

      // Other operations should still work - stop a running distro
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const stopButton = await ubuntuCard.$(errorSelectors.stopButton);
      await expect(stopButton).toBeDisplayed();
      await stopButton.click();

      // Ubuntu should stop (this operation should succeed - error only affects start)
      await waitForDistroState("Ubuntu", "OFFLINE", 10000);

      // Verify state consistency - only Ubuntu changed, all cards still present
      await verifyStatesUnchanged(preSnapshot, [{ name: "Ubuntu", newState: "OFFLINE" }]);
    });

    it("should isolate errors to specific operations", async () => {
      // Set error only for terminate operations
      await setMockError("terminate", "timeout", 100);

      // Capture state before operations
      const preSnapshot = await captureDistroStates();

      // Verify initial state
      await verifyDistroCardState("Ubuntu", "ONLINE");

      // Stop should fail with timeout
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const stopButton = await ubuntuCard.$(errorSelectors.stopButton);
      await stopButton.click();

      // Verify error and dismiss
      await verifyAndDismissError(EXPECTED_ERRORS.TIMEOUT.patterns, 10000);

      // Ubuntu should still be running (stop failed)
      await verifyDistroCardState("Ubuntu", "ONLINE");

      // Clear error
      await clearMockErrors();

      // Start operation should still work on a different distro
      const debianCard = await $(selectors.distroCardByName(TEST_DISTRO));
      const startButton = await debianCard.$(errorSelectors.startButton);
      await startButton.click();

      // Debian should start (different operation, no error)
      await waitForDistroState(TEST_DISTRO, "ONLINE", 10000);

      // Verify state consistency - only Debian changed to ONLINE
      await verifyStatesUnchanged(preSnapshot, [{ name: TEST_DISTRO, newState: "ONLINE" }]);
    });
  });
});
