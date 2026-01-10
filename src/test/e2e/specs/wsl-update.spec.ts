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

import {
  waitForAppReady,
  resetMockState,
  selectors,
  safeRefresh,
  setMockError,
  clearMockErrors,
  setMockUpdateResult,
} from "../utils";

/**
 * Helper to navigate to settings page
 */
async function goToSettings(): Promise<void> {
  const settingsButton = await $(selectors.settingsButton);
  await settingsButton.click();
  await browser.pause(500);
}

/**
 * Helper to go back from settings
 */
async function goBack(): Promise<void> {
  const backButton = await $('[data-testid="back-button"]');
  await backButton.click();
  await browser.pause(500);
}

/**
 * Helper to switch to a settings tab
 */
async function switchToTab(tabId: string): Promise<void> {
  const tab = await $(`[data-testid="settings-tab-${tabId}"]`);
  await tab.click();
  await browser.pause(300);
}

describe("WSL Update", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(300);
    await resetMockState();
    await clearMockErrors();
    await safeRefresh();
    await waitForAppReady();
    await browser.pause(500);
  });

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
        async () => {
          const spinnerVisible = await spinner.isDisplayed().catch(() => false);
          return !spinnerVisible;
        },
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
          return notification.isDisplayed().catch(() => false);
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
          return notification.isDisplayed().catch(() => false);
        },
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      // Wait for auto-dismiss (5 seconds + animation time)
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return !(await notification.isDisplayed().catch(() => false));
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

    it("should show success notification with version change", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return notification.isDisplayed().catch(() => false);
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

    it("should show warning notification when update is cancelled", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return notification.isDisplayed().catch(() => false);
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
          return notification.isDisplayed().catch(() => false);
        },
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      // Wait for auto-dismiss (3 seconds + animation time for warnings)
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return !(await notification.isDisplayed().catch(() => false));
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

    it("should show error notification on failure", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return notification.isDisplayed().catch(() => false);
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

    it("should NOT auto-dismiss error notification", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => {
          const notification = await $(selectors.notificationBanner);
          return notification.isDisplayed().catch(() => false);
        },
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      // Wait 6 seconds - error should still be visible (no auto-dismiss)
      await browser.pause(6000);

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
          return notification.isDisplayed().catch(() => false);
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
          return !(await notification.isDisplayed().catch(() => false));
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
      await goToSettings();
      await switchToTab("wsl-global");

      // Find and click the pre-release toggle (button with -toggle suffix)
      const toggle = await $('[data-testid="wsl-prerelease-updates-toggle"]');

      // Click the toggle to enable pre-release updates
      await toggle.click();
      await browser.pause(200);

      // Save settings
      const saveButton = await $('button*=Save');
      if (await saveButton.isDisplayed().catch(() => false)) {
        await saveButton.click();
        await browser.pause(500);
      }

      await goBack();
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
          return notification.isDisplayed().catch(() => false);
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
          return notification.isDisplayed().catch(() => false);
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
