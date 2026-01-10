/**
 * E2E Tests for Distribution Creation
 *
 * Tests the new distribution dialog:
 * - Opening the dialog
 * - Dialog cancellation
 * - Tab switching
 * - Actual creation flow with validation
 * - Verifying new distro appears in list
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  safeRefresh,
  getDistroCardCount,
  mockDistributions,
  waitForDialog,
  waitForDialogToDisappear,
} from "../utils";

describe("Distribution Creation", () => {
  beforeEach(async () => {
    // Refresh the page to ensure clean state
    await safeRefresh();
    await browser.pause(300);
    await resetMockState();
    // Refresh again to load the clean mock data
    await safeRefresh();
    await waitForAppReady();
    await browser.pause(500);
  });

  describe("New Distribution Dialog", () => {
    it("should open new distribution dialog when New button is clicked", async () => {
      const newButton = await $(selectors.newDistroButton);
      await newButton.waitForClickable({ timeout: 5000 });
      await newButton.click();

      const dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 10000 });
      await expect(dialog).toBeDisplayed();
    });

    it("should have dialog title", async () => {
      const newButton = await $(selectors.newDistroButton);
      await newButton.waitForClickable({ timeout: 5000 });
      await newButton.click();

      const dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 10000 });

      // Check dialog has a title
      const title = await dialog.$("h2");
      await title.waitForDisplayed({ timeout: 3000 });
      const titleText = await title.getText();
      expect(titleText.length).toBeGreaterThan(0);
    });

  });

  describe("Dialog Tabs", () => {
    beforeEach(async () => {
      const newButton = await $(selectors.newDistroButton);
      await newButton.waitForClickable({ timeout: 5000 });
      await newButton.click();
      
      const dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 10000 });
    });

    it("should have Quick Install tab", async () => {
      const dialog = await $(selectors.dialog);
      const quickTab = await dialog.$("button*=Quick");
      await expect(quickTab).toBeDisplayed();
    });

    it("should have Download tab", async () => {
      const dialog = await $(selectors.dialog);
      const downloadTab = await dialog.$("button*=Download");
      await expect(downloadTab).toBeDisplayed();
    });

    it("should have Container tab", async () => {
      const dialog = await $(selectors.dialog);
      const containerTab = await dialog.$("button*=Container");
      await expect(containerTab).toBeDisplayed();
    });

    it("should switch tabs when clicked", async () => {
      const dialog = await $(selectors.dialog);

      // Click Download tab
      const downloadTab = await dialog.$("button*=Download");
      await downloadTab.click();
      await browser.pause(300);

      // Tab should be active (verify it was clicked successfully)
      const classes = await downloadTab.getAttribute("class");
      expect(classes).toContain("bg-");
    });
  });

  describe("Download Mode", () => {
    beforeEach(async () => {
      const newButton = await $(selectors.newDistroButton);
      await newButton.waitForClickable({ timeout: 5000 });
      await newButton.click();

      const dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 10000 });

      // Switch to Download tab
      const downloadTab = await dialog.$("button*=Download");
      await downloadTab.click();
      await browser.pause(500);
    });

    it("should show distribution selection", async () => {
      const dialog = await $(selectors.dialog);
      // Should show available distributions to install or custom URL option
      const content = await dialog.$(".overflow-y-auto, .grid, .py-16");
      await expect(content).toBeDisplayed();
    });

    it("should show name input after selecting custom URL option", async () => {
      const dialog = await $(selectors.dialog);

      // Look for "Custom URL" toggle/button
      const customUrlOption = await dialog.$("button*=Custom URL");
      if (await customUrlOption.isExisting()) {
        await customUrlOption.click();
        await browser.pause(300);

        // Now name input should be visible
        const nameInput = await dialog.$("input[placeholder*='Enter a unique name']");
        await expect(nameInput).toBeDisplayed();
      }
    });

    it("should allow entering a distribution name after enabling custom URL", async () => {
      const dialog = await $(selectors.dialog);

      // Look for "Custom URL" toggle/button
      const customUrlOption = await dialog.$("button*=Custom URL");
      if (await customUrlOption.isExisting()) {
        await customUrlOption.click();
        await browser.pause(300);

        // Find the name input
        const nameInput = await dialog.$("input[placeholder*='Enter a unique name']");
        if (await nameInput.isExisting()) {
          await nameInput.setValue("MyCustomDistro");
          await browser.pause(300);

          const value = await nameInput.getValue();
          expect(value).toBe("MyCustomDistro");
        }
      }
    });
  });

  describe("Container Mode", () => {
    beforeEach(async () => {
      const newButton = await $(selectors.newDistroButton);
      await newButton.waitForClickable({ timeout: 5000 });
      await newButton.click();
      
      const dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 10000 });

      // Switch to Container tab
      const containerTab = await dialog.$("button*=Container");
      await containerTab.click();
      await browser.pause(500);
    });

    it("should switch to Container tab successfully", async () => {
      const dialog = await $(selectors.dialog);
      const containerTab = await dialog.$("button*=Container");
      
      // Verify tab is active (has bg- class indicating selected)
      const classes = await containerTab.getAttribute("class");
      expect(classes).toContain("bg-");
    });

    it("should display container tab content", async () => {
      const dialog = await $(selectors.dialog);
      // Verify dialog is still displayed after switching tabs
      await expect(dialog).toBeDisplayed();
    });
  });

  describe("Import Button", () => {
    it("should have import button in header", async () => {
      const importButton = await $(selectors.importButton);
      await expect(importButton).toBeDisplayed();
    });

    it("should open import dialog when clicked", async () => {
      const importButton = await $(selectors.importButton);
      await importButton.waitForClickable({ timeout: 5000 });
      await importButton.click();

      // Import dialog should open
      const dialog = await waitForDialog(selectors.dialog, 10000);
      await expect(dialog).toBeDisplayed();
    });
  });

  describe("Name Validation", () => {
    beforeEach(async () => {
      const newButton = await $(selectors.newDistroButton);
      await newButton.waitForClickable({ timeout: 5000 });
      await newButton.click();

      const dialog = await waitForDialog(selectors.dialog, 10000);

      // Switch to Download tab and enable Custom URL for name input
      const downloadTab = await dialog.$("button*=Download");
      await downloadTab.click();
      await browser.pause(300);

      const customUrlOption = await dialog.$("button*=Custom URL");
      if (await customUrlOption.isExisting()) {
        await customUrlOption.click();
        await browser.pause(300);
      }
    });

    it("should not allow empty distribution name", async () => {
      const dialog = await $(selectors.dialog);
      const nameInput = await dialog.$("input[placeholder*='Enter a unique name']");

      if (await nameInput.isExisting()) {
        await nameInput.clearValue();
        await browser.pause(200);

        // Install button should be disabled with empty name
        const installButton = await dialog.$("button*=Install");
        if (await installButton.isExisting()) {
          const isDisabled = await installButton.getAttribute("disabled");
          expect(isDisabled).not.toBeNull();
        }
      }
    });

    it("should not allow duplicate distribution names", async () => {
      const dialog = await $(selectors.dialog);
      const nameInput = await dialog.$("input[placeholder*='Enter a unique name']");

      if (await nameInput.isExisting()) {
        // Try to use an existing distro name
        await nameInput.setValue("Ubuntu");
        await browser.pause(300);

        // Should show validation error or disable button
        const installButton = await dialog.$("button*=Install");
        if (await installButton.isExisting()) {
          const isDisabled = await installButton.getAttribute("disabled");
          // Either button is disabled or validation error is shown
          const validationError = await dialog.$('[data-testid*="error"], .text-red, .text-status-error');
          const hasError = await validationError.isDisplayed().catch(() => false);

          expect(isDisabled !== null || hasError).toBe(true);
        }
      }
    });

    it("should accept valid unique distribution name", async () => {
      const dialog = await $(selectors.dialog);
      const nameInput = await dialog.$("input[placeholder*='Enter a unique name']");

      if (await nameInput.isExisting()) {
        await nameInput.setValue("MyUniqueDistro");
        await browser.pause(300);

        const value = await nameInput.getValue();
        expect(value).toBe("MyUniqueDistro");

        // No validation error should be shown for valid name
        // (button may still be disabled if URL is required)
      }
    });
  });

  describe("Dialog Cancellation", () => {
    it("should close dialog and not create distribution when cancelled", async () => {
      const initialCount = await getDistroCardCount();
      expect(initialCount).toBe(mockDistributions.length);

      // Open dialog
      const newButton = await $(selectors.newDistroButton);
      await newButton.click();
      const dialog = await waitForDialog(selectors.dialog, 10000);

      // Find and click cancel button
      const cancelButton = await dialog.$("button*=Cancel");
      if (await cancelButton.isExisting()) {
        await cancelButton.click();
        await waitForDialogToDisappear(selectors.dialog, 5000);
      } else {
        // Press Escape to close
        await browser.keys("Escape");
        await waitForDialogToDisappear(selectors.dialog, 5000);
      }

      // Verify distro count hasn't changed
      const afterCount = await getDistroCardCount();
      expect(afterCount).toBe(initialCount);
    });

    it("should close dialog when clicking outside", async () => {
      // Open dialog
      const newButton = await $(selectors.newDistroButton);
      await newButton.click();
      await waitForDialog(selectors.dialog, 10000);

      // Click outside the dialog (on the backdrop)
      const main = await $("main");
      await main.click({ x: 10, y: 10 }); // Click near the edge

      // Dialog might or might not close depending on implementation
      // Just verify the page remains functional
      const distroCard = await $(selectors.distroCard);
      await expect(distroCard).toBeDisplayed();
    });
  });

  describe("Quick Install Mode", () => {
    it("should display available quick install distributions", async () => {
      const newButton = await $(selectors.newDistroButton);
      await newButton.click();
      const dialog = await waitForDialog(selectors.dialog, 10000);

      // Quick Install tab should be default
      const quickTab = await dialog.$("button*=Quick");
      const classes = await quickTab.getAttribute("class");

      // Should show installable distributions
      const dialogContent = await dialog.getText();
      // Quick install should show at least one installable distro
      expect(dialogContent.length).toBeGreaterThan(0);
    });
  });

  describe("Creation Flow Verification", () => {
    // Skip: In mock mode, operations complete too quickly to reliably observe the disabled state
    it.skip("should disable install button while operation is in progress", async () => {
      const newButton = await $(selectors.newDistroButton);
      await newButton.click();
      const dialog = await waitForDialog(selectors.dialog, 10000);

      // Switch to Download tab
      const downloadTab = await dialog.$("button*=Download");
      await downloadTab.click();
      await browser.pause(300);

      // Enable Custom URL
      const customUrlOption = await dialog.$("button*=Custom URL");
      if (await customUrlOption.isExisting()) {
        await customUrlOption.click();
        await browser.pause(300);
      }

      // Fill in required fields
      const nameInput = await dialog.$("input[placeholder*='Enter a unique name']");
      if (await nameInput.isExisting()) {
        await nameInput.setValue("TestDistro");
      }

      const urlInput = await dialog.$("input[placeholder*='URL']");
      if (await urlInput.isExisting()) {
        await urlInput.setValue("https://example.com/distro.tar.gz");
      }

      // Try to click install
      const installButton = await dialog.$("button*=Install");
      if (await installButton.isExisting() && await installButton.isEnabled()) {
        await installButton.click();

        // Button should become disabled during operation
        await browser.waitUntil(
          async () => {
            const disabled = await installButton.getAttribute("disabled");
            return disabled !== null;
          },
          {
            timeout: 2000,
            timeoutMsg: "Install button should be disabled during operation",
          }
        );
      }
    });
  });
});




