/**
 * E2E Tests for WSL Update Feature
 *
 * Tests the WSL update functionality in the status bar:
 * - Update button visibility and click behavior
 * - Success notification when already up to date
 * - Success notification when updated
 * - Warning notification when cancelled (UAC)
 * - Spinner visibility during update
 * - Pre-release update setting
 */

import { setupHooks, actions, isElementDisplayed } from "../base";
import {
  selectors,
  setMockError,
  clearMockErrors,
  setMockUpdateResult,
} from "../utils";

/**
 * Helper to switch to a settings tab
 */
async function switchToTab(tabId: string): Promise<void> {
  const tab = await $(`[data-testid="settings-tab-${tabId}"]`);
  await tab.waitForClickable({ timeout: 5000 });
  await tab.click();

  // Wait for tab content to load
  await browser.waitUntil(
    async () => {
      const classes = await tab.getAttribute("class");
      return classes.includes("accent") || classes.includes("bg-");
    },
    { timeout: 3000, timeoutMsg: "Tab did not become active" }
  );
}

describe("WSL Update", () => {
  setupHooks.withCleanNotifications();

  afterEach(async () => {
    // Clear any error configurations and update results
    await clearMockErrors();
  });

  describe("Update Button", () => {
    it("should display the update button in status bar", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await expect(updateButton).toBeDisplayed();
    });

    it("should show spinner when update is in progress", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Spinner should appear
      const spinner = await $(selectors.wslUpdateSpinner);
      await expect(spinner).toBeDisplayed();

      // Wait for update to complete
      await browser.waitUntil(
        async () => !(await isElementDisplayed(selectors.wslUpdateSpinner)),
        { timeout: 10000, timeoutMsg: "Update did not complete within 10 seconds" }
      );
    });

    it("should disable button during update", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Button should be disabled
      const disabled = await updateButton.getAttribute("disabled");
      expect(disabled).not.toBeNull();

      // Wait for update to complete
      await browser.waitUntil(
        async () => {
          const isDisabled = await updateButton.getAttribute("disabled");
          return isDisabled === null;
        },
        { timeout: 10000, timeoutMsg: "Button did not become enabled after update" }
      );
    });
  });

  describe("Update Success - Already Up To Date", () => {
    beforeEach(async () => {
      // Configure mock to return "already up to date"
      await setMockUpdateResult("already_up_to_date");
    });

    it("should show success notification when already up to date", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return isElementDisplayed(selectors.notificationBanner);
        },
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      const notification = await $(selectors.notificationBanner);
      await expect(notification).toBeDisplayed();

      // Wait for message text to populate
      await browser.waitUntil(
        async () => {
          const message = await $(selectors.notificationMessage);
          const text = await message.getText();
          return text.length > 0;
        },
        { timeout: 3000, timeoutMsg: "Notification message did not appear" }
      );

      // Check notification content
      const title = await $(selectors.notificationTitle);
      const titleText = await title.getText();
      expect(titleText.toLowerCase()).toContain("wsl update");

      const message = await $(selectors.notificationMessage);
      const messageText = await message.getText();
      expect(messageText.toLowerCase()).toContain("up to date");
    });

    it("should auto-dismiss success notification", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return isElementDisplayed(selectors.notificationBanner);
        },
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      // Wait for auto-dismiss (5 seconds + animation time)
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return !(await isElementDisplayed(selectors.notificationBanner));
        },
        { timeout: 10000, timeoutMsg: "Notification did not auto-dismiss" }
      );
    });
  });

  describe("Update Success - Updated", () => {
    beforeEach(async () => {
      // Configure mock to simulate an actual update
      await setMockUpdateResult("updated", "2.3.24.0", "2.3.26.0");
    });

    // TODO: This test is flaky - mock update result configuration doesn't reliably apply
    // before the test runs due to race conditions with Tauri IPC. The mock sometimes
    // returns the default "AlreadyUpToDate" instead of the configured "Updated" result.
    it.skip("should show success notification with version change", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return isElementDisplayed(selectors.notificationBanner);
        },
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      const notification = await $(selectors.notificationBanner);
      await expect(notification).toBeDisplayed();

      // Wait for message text to populate
      await browser.waitUntil(
        async () => {
          const message = await $(selectors.notificationMessage);
          const text = await message.getText();
          return text.length > 0;
        },
        { timeout: 3000, timeoutMsg: "Notification message did not appear" }
      );

      // Check notification shows version change
      const message = await $(selectors.notificationMessage);
      const messageText = await message.getText();
      expect(messageText).toContain("2.3.24.0");
      expect(messageText).toContain("2.3.26.0");
    });
  });

  describe("Update Cancelled (UAC)", () => {
    beforeEach(async () => {
      // Configure mock to simulate UAC cancellation
      await setMockError("update", "cancelled", 100);
    });

    // TODO: This test is flaky - mock error configuration doesn't reliably apply
    // before the test runs. The mock sometimes returns success instead of cancelled.
    it.skip("should show warning notification when update is cancelled", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return isElementDisplayed(selectors.notificationBanner);
        },
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      const notification = await $(selectors.notificationBanner);
      await expect(notification).toBeDisplayed();

      // Wait for message text to populate
      await browser.waitUntil(
        async () => {
          const message = await $(selectors.notificationMessage);
          const text = await message.getText();
          return text.length > 0;
        },
        { timeout: 3000, timeoutMsg: "Notification message did not appear" }
      );

      // Check it's a warning (contains cancelled message)
      const message = await $(selectors.notificationMessage);
      const messageText = await message.getText();
      expect(messageText.toLowerCase()).toContain("cancelled");
    });

    it("should auto-dismiss cancelled notification", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return isElementDisplayed(selectors.notificationBanner);
        },
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      // Wait for auto-dismiss (3 seconds + animation time for warnings)
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return !(await isElementDisplayed(selectors.notificationBanner));
        },
        { timeout: 8000, timeoutMsg: "Warning notification did not auto-dismiss" }
      );
    });
  });

  describe("Update Error", () => {
    beforeEach(async () => {
      // Configure mock to simulate a command failure
      await setMockError("update", "command_failed", 100);
    });

    // TODO: This test is flaky - mock error configuration doesn't reliably apply
    // before the test runs. The mock sometimes returns success instead of error.
    it.skip("should show error notification on failure", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return isElementDisplayed(selectors.notificationBanner);
        },
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      const notification = await $(selectors.notificationBanner);
      await expect(notification).toBeDisplayed();

      // Wait for title to have text (animation may delay text rendering)
      const title = await $(selectors.notificationTitle);
      await browser.waitUntil(
        async () => {
          const text = await title.getText().catch(() => "");
          return text.length > 0;
        },
        { timeout: 3000, timeoutMsg: "Notification title did not get text" }
      );

      // Check it's an error notification
      const titleText = await title.getText();
      expect(titleText.toLowerCase()).toContain("failed");
    });

    // TODO: Skipped - depends on error configuration which is flaky
    it.skip("should NOT auto-dismiss error notification", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => isElementDisplayed(selectors.notificationBanner),
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      // Wait 6 seconds and verify notification is still visible (no auto-dismiss)
      // Use a waitUntil with inverse condition and expect it to timeout
      let stillVisible = true;
      try {
        await browser.waitUntil(
          async () => !(await isElementDisplayed(selectors.notificationBanner)),
          { timeout: 6000, timeoutMsg: "Notification should not auto-dismiss" }
        );
        stillVisible = false; // If we get here, notification was dismissed (bad)
      } catch {
        stillVisible = true; // Timeout means notification stayed visible (good)
      }

      expect(stillVisible).toBe(true);
      const notification = await $(selectors.notificationBanner);
      await expect(notification).toBeDisplayed();
    });

    it("should allow manual dismissal of error notification", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return isElementDisplayed(selectors.notificationBanner);
        },
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      // Click dismiss button
      const dismissButton = await $(selectors.notificationDismissButton);
      await dismissButton.click();

      // Wait for notification to disappear (with animation)
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return !(await isElementDisplayed(selectors.notificationBanner));
        },
        { timeout: 3000, timeoutMsg: "Notification did not dismiss" }
      );
    });
  });

  describe("Pre-Release Updates", () => {
    /**
     * Helper to enable pre-release updates setting
     */
    async function enablePreReleaseUpdates(): Promise<void> {
      await actions.goToSettings();
      await switchToTab("wsl-global");

      // Find and click the pre-release toggle (button with -toggle suffix)
      const toggle = await $('[data-testid="wsl-prerelease-updates-toggle"]');
      await toggle.waitForClickable({ timeout: 5000 });

      // Click the toggle to enable pre-release updates
      await toggle.click();

      // Wait for save button to appear
      await browser.waitUntil(
        async () => isElementDisplayed('button*=Save'),
        { timeout: 3000 }
      ).catch(() => {}); // Ignore if save button doesn't appear

      // Save settings if button is visible
      const saveButtonVisible = await isElementDisplayed('button*=Save');
      if (saveButtonVisible) {
        const saveButton = await $('button*=Save');
        await saveButton.click();

        // Wait for save to complete (button disappears)
        await browser.waitUntil(
          async () => !(await isElementDisplayed('button*=Save')),
          { timeout: 5000, timeoutMsg: "Save did not complete" }
        ).catch(() => {});
      }

      await actions.goBackFromSettings();
    }

    // Skip: Mock doesn't persist pre-release setting for tooltip
    it.skip("should show pre-release in tooltip when setting is enabled", async () => {
      await enablePreReleaseUpdates();

      const updateButton = await $(selectors.wslUpdateButton);
      const title = await updateButton.getAttribute("title");
      expect(title?.toLowerCase()).toContain("pre-release");
    });

    // Skip: Mock doesn't persist pre-release setting for notification message
    it.skip("should include pre-release channel in success message when enabled", async () => {
      await enablePreReleaseUpdates();
      await setMockUpdateResult("already_up_to_date");

      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return isElementDisplayed(selectors.notificationBanner);
        },
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      // Check notification mentions pre-release
      const message = await $(selectors.notificationMessage);
      const messageText = await message.getText();
      expect(messageText.toLowerCase()).toContain("pre-release");
    });

    // Skip: Mock doesn't persist pre-release setting for notification message
    it.skip("should include pre-release channel in update message when enabled", async () => {
      await enablePreReleaseUpdates();
      await setMockUpdateResult("updated", "2.3.24.0", "2.4.0.0-pre");

      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return isElementDisplayed(selectors.notificationBanner);
        },
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      // Check notification mentions pre-release channel
      const message = await $(selectors.notificationMessage);
      const messageText = await message.getText();
      expect(messageText).toContain("2.4.0.0-pre");
      expect(messageText.toLowerCase()).toContain("pre-release");
    });
  });
});
