/**
 * E2E Tests for Import Distribution Workflow
 *
 * Tests the import distribution dialog:
 * - Opening the dialog from header Import button
 * - Form validation (name, duplicate name, empty fields)
 * - Button states based on form validation
 * - Error message display
 * - Dialog close behavior
 *
 * Note: Native file picker dialogs cannot be automated via WebDriver.
 * These tests focus on validatable UI behavior.
 */

import { setupHooks, isElementDisplayed } from "../base";
import {
  selectors,
  waitForDialogToDisappear,
} from "../utils";

describe("Import Distribution", () => {
  setupHooks.standard();

  describe("Import Dialog Opening", () => {
    it("should have import button in header", async () => {
      const importButton = await $(selectors.importButton);
      await expect(importButton).toBeDisplayed();
    });

    it("should open import dialog when import button is clicked", async () => {
      const importButton = await $(selectors.importButton);
      await importButton.waitForClickable({ timeout: 5000 });
      await importButton.click();

      const dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 5000 });
      await expect(dialog).toBeDisplayed();
    });

    it("should display Import Distribution title", async () => {
      const importButton = await $(selectors.importButton);
      await importButton.click();

      const dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 5000 });

      const title = await dialog.$("h2");
      const titleText = await title.getText();
      expect(titleText).toBe("Import Distribution");
    });

    it("should close dialog when clicking Cancel", async () => {
      const importButton = await $(selectors.importButton);
      await importButton.click();

      const dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 5000 });

      const cancelButton = await dialog.$("button*=Cancel");
      await cancelButton.click();

      // Wait for dialog to close
      await waitForDialogToDisappear(selectors.dialog, 5000);

      const dialogVisible = await isElementDisplayed(selectors.dialog);
      expect(dialogVisible).toBe(false);
    });

  });

  describe("Import Form Fields", () => {
    beforeEach(async () => {
      const importButton = await $(selectors.importButton);
      await importButton.waitForClickable({ timeout: 5000 });
      await importButton.click();

      const dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 5000 });
    });

    it("should have Distribution Name input field", async () => {
      const dialog = await $(selectors.dialog);
      const nameInput = await dialog.$("input[placeholder*='Ubuntu-Dev'], input[placeholder*='name']");
      await expect(nameInput).toBeDisplayed();
    });

    it("should have TAR Archive path input", async () => {
      const dialog = await $(selectors.dialog);
      // Look for the TAR archive input by its placeholder
      const tarInput = await dialog.$("input[placeholder*='tar'], input[placeholder*='.tar']");
      await expect(tarInput).toBeDisplayed();
    });

    it("should have Installation Location path input", async () => {
      const dialog = await $(selectors.dialog);
      // Look for the installation location input
      const locationInput = await dialog.$("input[placeholder*='installation'], input[placeholder*='folder']");
      await expect(locationInput).toBeDisplayed();
    });

    it("should have Browse buttons for file paths", async () => {
      const dialog = await $(selectors.dialog);
      // Find Browse buttons (they have title="Browse" attribute with folder icon)
      const browseButtons = await dialog.$$('button[title="Browse"]');
      expect(browseButtons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("Import Button State", () => {
    beforeEach(async () => {
      const importButton = await $(selectors.importButton);
      await importButton.waitForClickable({ timeout: 5000 });
      await importButton.click();

      const dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 5000 });
    });

    it("should have Import button disabled initially", async () => {
      const dialog = await $(selectors.dialog);
      const importBtn = await dialog.$("button*=Import");
      await expect(importBtn).toBeDisplayed();

      // Check if disabled
      const isDisabled = await importBtn.getAttribute("disabled");
      expect(isDisabled).not.toBeNull();
    });

    it("should keep Import button disabled with only name entered", async () => {
      const dialog = await $(selectors.dialog);

      // Find and fill name input
      const nameInput = await dialog.$("input[placeholder*='Ubuntu-Dev'], input[placeholder*='e.g.']");
      await nameInput.setValue("TestDistro");

      // Wait for input value to be set
      await browser.waitUntil(
        async () => {
          const value = await nameInput.getValue();
          return value === "TestDistro";
        },
        { timeout: 3000, timeoutMsg: "Input value was not set" }
      );

      // Import button should still be disabled (missing TAR and location)
      const importBtn = await dialog.$("button*=Import");
      const isDisabled = await importBtn.getAttribute("disabled");
      expect(isDisabled).not.toBeNull();
    });
  });

  describe("Name Validation", () => {
    beforeEach(async () => {
      const importButton = await $(selectors.importButton);
      await importButton.waitForClickable({ timeout: 5000 });
      await importButton.click();

      const dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 5000 });
    });

    it("should show error for duplicate distribution name", async () => {
      const dialog = await $(selectors.dialog);

      // Enter a name that already exists in mock data
      const nameInput = await dialog.$("input[placeholder*='Ubuntu-Dev'], input[placeholder*='e.g.']");
      await nameInput.setValue("Ubuntu"); // Ubuntu exists in mock data

      // Wait for validation to run and error to appear
      await browser.waitUntil(
        async () => {
          const text = await dialog.getText();
          return text.includes("already exists");
        },
        { timeout: 5000, timeoutMsg: "Duplicate name error did not appear" }
      );

      // Should show error message about duplicate name (inline error below input)
      const dialogText = await dialog.getText();
      expect(dialogText).toContain("already exists");
    });

    it("should clear duplicate error when name is changed", async () => {
      const dialog = await $(selectors.dialog);

      // First enter a duplicate name
      const nameInput = await dialog.$("input[placeholder*='Ubuntu-Dev'], input[placeholder*='e.g.']");
      await nameInput.setValue("Ubuntu");

      // Wait for error to appear
      await browser.waitUntil(
        async () => {
          const text = await dialog.getText();
          return text.includes("already exists");
        },
        { timeout: 5000, timeoutMsg: "Duplicate name error did not appear" }
      );

      // Verify error is shown
      let dialogText = await dialog.getText();
      expect(dialogText).toContain("already exists");

      // Change to a unique name
      await nameInput.setValue("UniqueNewDistro");

      // Wait for error to clear
      await browser.waitUntil(
        async () => {
          const text = await dialog.getText();
          return !text.includes("already exists");
        },
        { timeout: 5000, timeoutMsg: "Duplicate name error did not clear" }
      );

      // Error should no longer be in dialog text
      dialogText = await dialog.getText();
      expect(dialogText).not.toContain("already exists");
    });

    it("should be case-insensitive for duplicate detection", async () => {
      const dialog = await $(selectors.dialog);

      // Enter same name with different case
      const nameInput = await dialog.$("input[placeholder*='Ubuntu-Dev'], input[placeholder*='e.g.']");
      await nameInput.setValue("ubuntu"); // lowercase of existing "Ubuntu"

      // Wait for validation to run and error to appear
      await browser.waitUntil(
        async () => {
          const text = await dialog.getText();
          return text.includes("already exists");
        },
        { timeout: 5000, timeoutMsg: "Case-insensitive duplicate error did not appear" }
      );

      // Should still show error (case-insensitive check)
      const dialogText = await dialog.getText();
      expect(dialogText).toContain("already exists");
    });
  });

  describe("Dialog State Reset", () => {
    it("should reset form when dialog is reopened", async () => {
      // Open dialog and enter a name
      const importButton = await $(selectors.importButton);
      await importButton.click();

      let dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 5000 });

      const nameInput = await dialog.$("input[placeholder*='Ubuntu-Dev'], input[placeholder*='e.g.']");
      await nameInput.setValue("TestDistro");

      // Wait for input value to be set
      await browser.waitUntil(
        async () => {
          const value = await nameInput.getValue();
          return value === "TestDistro";
        },
        { timeout: 3000, timeoutMsg: "Input value was not set" }
      );

      // Close dialog
      const cancelButton = await dialog.$("button*=Cancel");
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.dialog, 5000);

      // Reopen dialog
      await importButton.click();
      dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 5000 });

      // Name input should be empty
      const newNameInput = await dialog.$("input[placeholder*='Ubuntu-Dev'], input[placeholder*='e.g.']");
      const value = await newNameInput.getValue();
      expect(value).toBe("");
    });
  });

  describe("Labels and Helper Text", () => {
    beforeEach(async () => {
      const importButton = await $(selectors.importButton);
      await importButton.waitForClickable({ timeout: 5000 });
      await importButton.click();

      const dialog = await $(selectors.dialog);
      await dialog.waitForDisplayed({ timeout: 5000 });
    });

    it("should display Distribution Name label", async () => {
      const dialog = await $(selectors.dialog);
      // Labels are rendered as <label> elements
      const label = await dialog.$("label=Distribution Name");
      await expect(label).toBeDisplayed();
    });

    it("should display TAR Archive label", async () => {
      const dialog = await $(selectors.dialog);
      const label = await dialog.$("label=TAR Archive");
      await expect(label).toBeDisplayed();
    });

    it("should display Installation Location label", async () => {
      const dialog = await $(selectors.dialog);
      const label = await dialog.$("label=Installation Location");
      await expect(label).toBeDisplayed();
    });

    it("should display helper text for installation location", async () => {
      const dialog = await $(selectors.dialog);
      // Helper text is in a p.text-xs element below the input
      const dialogText = await dialog.getText();
      expect(dialogText).toContain("virtual disk");
    });
  });
});
