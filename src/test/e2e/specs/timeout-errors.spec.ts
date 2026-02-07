/**
 * E2E Tests for Timeout and Error Scenarios
 *
 * Tests how the application handles various error conditions from WSL operations:
 * - Timeout errors (operations that take too long)
 * - Command failures
 * - Network/service errors
 *
 * These tests use the mock error simulation feature to trigger specific error conditions.
 */

import {
  setMockError,
  clearMockErrors,
  selectors,
  waitForErrorBanner,
  waitForErrorBannerToDisappear,
  waitForDistroState,
  waitForElementClickable,
  verifyErrorBanner,
  verifyAndDismissError,
  EXPECTED_ERRORS,
  captureDistroStates,
  verifyStatesUnchanged,
} from "../utils";
import { setupHooks, isElementDisplayed } from "../base";

describe("Timeout and Error Scenarios", () => {
  setupHooks.standard();

  beforeEach(async () => {
    await clearMockErrors();
  });

  afterEach(async () => {
    // Always clear mock errors after each test
    await clearMockErrors();
  });

  describe("Start Distribution Timeout", () => {
    it("should show timeout error in error banner when start operation times out", async () => {
      // Capture state before operation
      const snapshot = await captureDistroStates();

      // Configure mock to return timeout error for start operation
      await setMockError("start", "timeout", 200);

      // Try to start a stopped distribution (Debian is stopped by default)
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);
      await startButton.click();

      // Verify error banner with comprehensive checks
      await verifyErrorBanner({
        expectedPatterns: EXPECTED_ERRORS.TIMEOUT.patterns,
        shouldHaveTip: true,
        timeout: 10000,
      });

      // Verify distro states haven't changed (operation failed, no side effects)
      await verifyStatesUnchanged(snapshot);
    });

    it("should allow retry after timeout error", async () => {
      // Configure mock to return timeout error
      await setMockError("start", "timeout", 100);

      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);
      await startButton.click();

      // Verify error and dismiss using convenience helper
      await verifyAndDismissError(EXPECTED_ERRORS.TIMEOUT.patterns, 5000);

      // Clear the error configuration
      await clearMockErrors();

      // Wait for button to be clickable again
      await waitForElementClickable(startButton, 5000);

      // Try again - should work now
      await startButton.click();

      // Distribution should now be running
      await waitForDistroState("Debian", "ONLINE", 10000);
    });
  });

  describe("Stop Distribution Errors", () => {
    it("should show error banner when stop operation fails", async () => {
      // Configure mock to return command failed error for stop operation
      await setMockError("stop", "command_failed", 100);

      // Try to stop a running distribution (Ubuntu is running by default)
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const stopButton = await ubuntuCard.$(selectors.stopButton);
      await stopButton.click();

      // Wait for error banner to appear (allow more time for React to re-render)
      const errorBanner = await waitForErrorBanner(10000);
      await expect(errorBanner).toBeDisplayed();

      // Wait for error message text to populate
      await browser.waitUntil(
        async () => {
          const errorMessage = await errorBanner.$(selectors.errorMessage);
          const text = await errorMessage.getText();
          return text.length > 0;
        },
        { timeout: 3000, timeoutMsg: "Error message text did not appear" }
      );

      // Verify error message content - should indicate command failure
      const errorMessage = await errorBanner.$(selectors.errorMessage);
      const errorText = await errorMessage.getText();
      expect(errorText.toLowerCase()).toContain("failed");

      // Distribution should still be running (operation failed)
      await waitForDistroState("Ubuntu", "ONLINE", 2000);
    });
  });

  describe("Delete Distribution Errors", () => {
    it("should show error banner when delete operation times out", async () => {
      // Configure mock to return timeout error for delete operation
      await setMockError("delete", "timeout", 100);

      // Try to delete a distribution
      const alpineCard = await $(selectors.distroCardByName("Alpine"));
      const deleteButton = await alpineCard.$(selectors.deleteButton);
      await deleteButton.click();

      // Wait for confirmation dialog
      const dialog = await $(selectors.confirmDialog);
      await dialog.waitForDisplayed({ timeout: 5000 });

      // Find and click the confirm delete button
      const confirmButton = await dialog.$(selectors.dialogConfirmButton);
      await confirmButton.click();

      // Wait for error banner to appear (allow more time for React to re-render)
      const errorBanner = await waitForErrorBanner(10000);
      await expect(errorBanner).toBeDisplayed();

      // Wait for error message text to populate
      await browser.waitUntil(
        async () => {
          const errorMessage = await errorBanner.$(selectors.errorMessage);
          const text = await errorMessage.getText();
          return text.length > 0;
        },
        { timeout: 3000, timeoutMsg: "Error message text did not appear" }
      );

      // Verify error message contains timeout indication
      const errorMessage = await errorBanner.$(selectors.errorMessage);
      const errorText = await errorMessage.getText();
      const lowerText = errorText.toLowerCase();
      expect(lowerText).toContain("timed out");

      // Distribution should still exist (delete failed)
      const alpineCardAfter = await $(selectors.distroCardByName("Alpine"));
      await expect(alpineCardAfter).toBeDisplayed();
    });
  });

  describe("Shutdown All Errors", () => {
    it("should show error banner when shutdown all times out", async () => {
      // Configure mock to return timeout error for shutdown operation
      await setMockError("shutdown", "timeout", 100);

      // Click shutdown all button
      const shutdownAllButton = await $(selectors.shutdownAllButton);
      await shutdownAllButton.waitForClickable({ timeout: 5000 });
      await shutdownAllButton.click();

      // Wait for confirmation dialog
      const dialog = await $(selectors.confirmDialog);
      await dialog.waitForDisplayed({ timeout: 5000 });

      // Confirm shutdown
      const confirmButton = await dialog.$(selectors.dialogConfirmButton);
      await confirmButton.click();

      // Wait for error banner to appear (allow more time for React to re-render)
      const errorBanner = await waitForErrorBanner(10000);
      await expect(errorBanner).toBeDisplayed();

      // Wait for error message text to populate
      await browser.waitUntil(
        async () => {
          const errorMessage = await errorBanner.$(selectors.errorMessage);
          const text = await errorMessage.getText();
          return text.length > 0;
        },
        { timeout: 3000, timeoutMsg: "Error message text did not appear" }
      );

      // Verify error message contains timeout indication (check for either "timeout" or "timed out")
      const errorMessage = await errorBanner.$(selectors.errorMessage);
      const errorText = await errorMessage.getText();
      const lowerText = errorText.toLowerCase();
      expect(lowerText).toContain("timed out");

      // Running distributions should still be running (shutdown failed)
      await waitForDistroState("Ubuntu", "ONLINE", 2000);
    });
  });

  describe("Error Message Display", () => {
    it("should display error message prominently in error banner", async () => {
      // Configure mock to return error
      await setMockError("start", "command_failed", 100);

      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);
      await startButton.click();

      // Wait for error banner to appear
      const errorBanner = await waitForErrorBanner(5000);
      await expect(errorBanner).toBeDisplayed();

      // Wait for error message text to populate
      await browser.waitUntil(
        async () => {
          const errorMessage = await errorBanner.$(selectors.errorMessage);
          const text = await errorMessage.getText();
          return text.length > 0;
        },
        { timeout: 3000, timeoutMsg: "Error message text did not appear" }
      );

      // Verify error message indicates failure
      const errorMessage = await errorBanner.$(selectors.errorMessage);
      const errorText = await errorMessage.getText();
      expect(errorText.toLowerCase()).toContain("failed");
    });

    it("should allow dismissing error messages", async () => {
      // Configure mock to return error
      await setMockError("start", "timeout", 100);

      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);
      await startButton.click();

      // Wait for error banner to appear
      const errorBanner = await waitForErrorBanner(5000);
      await expect(errorBanner).toBeDisplayed();

      // Find and click dismiss button
      const dismissButton = await errorBanner.$(selectors.errorDismissButton);
      await expect(dismissButton).toBeDisplayed();
      await dismissButton.click();

      // Wait for error banner to disappear
      await waitForErrorBannerToDisappear(3000);

      // Verify error banner is no longer displayed
      const errorBannerGone = !(await isElementDisplayed(selectors.errorBanner));
      expect(errorBannerGone).toBe(true);
    });
  });

  describe("UI State During Errors", () => {
    it("should re-enable buttons after error", async () => {
      // Configure mock to return error quickly
      await setMockError("start", "command_failed", 50);

      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);

      // Click and wait for error
      await startButton.click();
      await waitForErrorBanner(5000);

      // Wait for button to be re-enabled after error
      await waitForElementClickable(startButton, 5000);

      // Verify button is not disabled
      const isDisabled = await startButton.getAttribute("disabled");
      expect(isDisabled).toBeNull();
    });

    it("should show loading state during operation", async () => {
      // Configure mock with longer delay to see loading state
      await setMockError("start", "timeout", 2000);

      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);

      await startButton.click();

      // Immediately check for loading state (button should be disabled)
      await browser.waitUntil(
        async () => {
          const disabled = await startButton.getAttribute("disabled");
          return disabled !== null;
        },
        {
          timeout: 1000,
          timeoutMsg: "Button should be disabled during operation",
        }
      );

      // Wait for error to complete and banner to appear
      await waitForErrorBanner(3000);
    });
  });

  describe("Multiple Sequential Errors", () => {
    it("should handle multiple consecutive errors gracefully", async () => {
      // Configure mock to return errors
      await setMockError("start", "timeout", 100);

      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);

      // First attempt
      await startButton.click();
      await waitForErrorBanner(5000);

      // Dismiss first error
      const errorBanner1 = await $(selectors.errorBanner);
      const dismissButton1 = await errorBanner1.$(selectors.errorDismissButton);
      await dismissButton1.click();
      await waitForErrorBannerToDisappear(3000);

      // Wait for button to be clickable
      await waitForElementClickable(startButton, 5000);

      // Second attempt (should also fail)
      await startButton.click();
      await waitForErrorBanner(5000);

      // UI should still be functional
      const main = await $("main");
      await expect(main).toBeDisplayed();

      // Buttons should still be interactive
      const refreshButton = await $(selectors.refreshButton);
      const isClickable = await refreshButton.isClickable();
      expect(isClickable).toBe(true);
    });
  });

  describe("Error Recovery", () => {
    it("should recover after clearing error state", async () => {
      // Configure mock to return error
      await setMockError("start", "timeout", 100);

      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);

      // Trigger error
      await startButton.click();
      await waitForErrorBanner(5000);

      // Dismiss error
      const errorBanner = await $(selectors.errorBanner);
      const dismissButton = await errorBanner.$(selectors.errorDismissButton);
      await dismissButton.click();
      await waitForErrorBannerToDisappear(3000);

      // Clear error configuration
      await clearMockErrors();

      // Wait for button to be clickable
      await waitForElementClickable(startButton, 5000);

      // Try operation again - should succeed
      await startButton.click();

      // Should be running now
      await waitForDistroState("Debian", "ONLINE", 10000);
    });
  });
});
