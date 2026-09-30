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
  waitForSettingsSaved,
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
      const classes = (await tab.getAttribute("class")) ?? "";
      return classes.includes("accent-primary") || classes.includes("border-r-2");
    },
    { timeout: 3000, timeoutMsg: "Tab did not become active" }
  );
}

describe("WSL Update", () => {
  setupHooks.withCleanNotifications();

  beforeEach(async () => {
    await waitForSettingsSaved();
    // Start every case on the stable channel; pre-release tests enable it via UI.
    await browser.execute(async () => {
      // @ts-expect-error - Store is exposed for e2e testing
      await window.__settingsStore.getState().updateSetting("usePreReleaseUpdates", false);
    });
    await waitForSettingsSaved();
  });

  afterEach(async () => {
    // Clear any error configurations and update results
    await clearMockErrors();
    await setMockUpdateResult("already_up_to_date");
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

    it("should show success notification with version change", async () => {
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

    it("should show warning notification when update is cancelled", async () => {
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

    it("should show error notification on failure", async () => {
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

    it("should NOT auto-dismiss error notification", async () => {
      const updateButton = await $(selectors.wslUpdateButton);
      await updateButton.click();

      // Wait for notification to appear
      await browser.waitUntil(
        async () => isElementDisplayed(selectors.notificationBanner),
        { timeout: 10000, timeoutMsg: "Notification did not appear" }
      );

      await expect($(selectors.notificationTitle)).toHaveText(/WSL Update Failed/i);
      // Deliberately pass the success banner's 5-second dismissal deadline.
      // This is the behavior under test, not a delay used to synchronize setup.
      await browser.pause(6000);
      await expect($(selectors.notificationBanner)).toBeDisplayed();
      await expect($(selectors.notificationTitle)).toHaveText(/WSL Update Failed/i);
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

      if (!((await toggle.getAttribute("class")) ?? "").includes("bg-theme-accent-primary")) {
        await toggle.click();
      }
      await browser.waitUntil(
        async () => ((await toggle.getAttribute("class")) ?? "").includes("bg-theme-accent-primary"),
        { timeout: 5000, timeoutMsg: "Pre-release setting did not become enabled" }
      );
      // This app setting saves immediately; the WSL config Save button is unrelated.
      await waitForSettingsSaved();
      await actions.goBackFromSettings();
    }

    it("should show pre-release in tooltip when setting is enabled", async () => {
      await enablePreReleaseUpdates();

      const updateButton = await $(selectors.wslUpdateButton);
      await browser.waitUntil(
        async () => (await updateButton.getAttribute("title"))?.toLowerCase().includes("pre-release"),
        { timeout: 5000, timeoutMsg: "Update tooltip did not reflect the saved pre-release setting" }
      );
    });

    it("should include pre-release channel in success message when enabled", async () => {
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
      await expect(message).toHaveText(/pre-release/i);
    });

    it("should include pre-release channel in update message when enabled", async () => {
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
      await expect(message).toHaveText(/2\.4\.0\.0-pre/);
      await expect(message).toHaveText(/pre-release/i);
    });
  });
});
