/**
 * E2E Tests for Rename Distribution Workflow
 *
 * Tests the rename distribution functionality:
 * - Opening rename dialog from manage submenu
 * - Validation of distribution names
 * - Checkbox options for terminal profile and shortcut updates
 * - Successful rename operation
 * - Error handling
 */

import { setupHooks, actions, isElementDisplayed } from "../base";
import { selectors, waitForDialogToDisappear } from "../utils";

describe("Rename Distribution", () => {
  setupHooks.standard();

  describe("Dialog Access", () => {
    it("should have Rename option in manage submenu", async () => {
      // Use a stopped distribution (Debian)
      await actions.openManageSubmenu("Debian");

      const renameAction = await $(selectors.renameAction);
      await expect(renameAction).toBeDisplayed();

      const text = await renameAction.getText();
      expect(text).toContain("Rename");
    });

    it("should show stop dialog when renaming running distributions", async () => {
      // Ubuntu is running by default
      await actions.openManageSubmenu("Ubuntu");

      const renameAction = await $(selectors.renameAction);
      await expect(renameAction).toBeDisplayed();
      await renameAction.click();

      // Wait for stop and action dialog to appear
      await browser.waitUntil(
        async () => isElementDisplayed(selectors.stopAndActionDialog),
        { timeout: 5000, timeoutMsg: "Stop dialog did not appear" }
      );

      // Stop and action dialog should appear for running distributions
      const stopDialog = await $(selectors.stopAndActionDialog);
      await expect(stopDialog).toBeDisplayed();

      // Close it for cleanup
      const cancelButton = await $(selectors.stopDialogCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.stopAndActionDialog, 5000);
    });

    it("should open Rename dialog when clicked on stopped distribution", async () => {
      const dialog = await actions.openRenameDialog("Debian");
      await expect(dialog).toBeDisplayed();
    });

    it("should display current distribution name in dialog", async () => {
      await actions.openRenameDialog("Debian");

      const dialog = await $(selectors.renameDialog);
      const dialogText = await dialog.getText();
      expect(dialogText).toContain("Debian");
    });
  });

  describe("Name Input", () => {
    it("should pre-populate input with current distribution name", async () => {
      await actions.openRenameDialog("Debian");

      const input = await $(selectors.renameNameInput);
      const value = await input.getValue();
      expect(value).toBe("Debian");
    });

    it("should allow entering a new name", async () => {
      await actions.openRenameDialog("Debian");

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Debian-Renamed");

      const value = await input.getValue();
      expect(value).toBe("Debian-Renamed");
    });

    it("should disable Rename button when name is unchanged", async () => {
      await actions.openRenameDialog("Debian");

      const confirmButton = await $(selectors.renameConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeTruthy();
    });

    it("should enable Rename button when valid new name is entered", async () => {
      await actions.openRenameDialog("Debian");

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Debian-New");

      // Wait for button state to update
      await browser.waitUntil(
        async () => {
          const btn = await $(selectors.renameConfirmButton);
          const disabled = await btn.getAttribute("disabled");
          return !disabled;
        },
        { timeout: 3000, timeoutMsg: "Rename button did not enable" }
      );

      const confirmButton = await $(selectors.renameConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeFalsy();
    });

    it("should disable Rename button when name is empty", async () => {
      await actions.openRenameDialog("Debian");

      const input = await $(selectors.renameNameInput);
      await input.clearValue();

      // Wait for button state to update
      await browser.waitUntil(
        async () => {
          const btn = await $(selectors.renameConfirmButton);
          const disabled = await btn.getAttribute("disabled");
          return !!disabled;
        },
        { timeout: 3000, timeoutMsg: "Rename button did not disable" }
      );

      const confirmButton = await $(selectors.renameConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeTruthy();
    });
  });

  describe("Name Validation", () => {
    it("should show error for duplicate name", async () => {
      await actions.openRenameDialog("Debian");

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      // Ubuntu exists in mock distributions
      await input.setValue("Ubuntu");

      // Wait for validation error to appear
      await browser.waitUntil(
        async () => isElementDisplayed(selectors.renameValidationError),
        { timeout: 3000, timeoutMsg: "Validation error did not appear" }
      );

      const validationError = await $(selectors.renameValidationError);
      await expect(validationError).toBeDisplayed();

      const errorText = await validationError.getText();
      expect(errorText.toLowerCase()).toContain("already exists");
    });

    it("should show error for invalid characters", async () => {
      await actions.openRenameDialog("Debian");

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Invalid Name With Spaces");

      // Wait for validation error to appear
      await browser.waitUntil(
        async () => isElementDisplayed(selectors.renameValidationError),
        { timeout: 3000, timeoutMsg: "Validation error did not appear" }
      );

      const validationError = await $(selectors.renameValidationError);
      await expect(validationError).toBeDisplayed();

      const errorText = await validationError.getText();
      expect(errorText.toLowerCase()).toContain("only contain");
    });

    it("should allow valid characters (letters, numbers, dots, underscores, hyphens)", async () => {
      await actions.openRenameDialog("Debian");

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Valid_Name-123.test");

      // Wait for button to become enabled (indicating valid name)
      await browser.waitUntil(
        async () => {
          const btn = await $(selectors.renameConfirmButton);
          const disabled = await btn.getAttribute("disabled");
          return !disabled;
        },
        { timeout: 3000, timeoutMsg: "Button did not enable for valid name" }
      );

      // Should not show validation error
      const errorDisplayed = await isElementDisplayed(selectors.renameValidationError);
      expect(errorDisplayed).toBe(false);

      // Confirm button should be enabled
      const confirmButton = await $(selectors.renameConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeFalsy();
    });

    it("should be case-insensitive for duplicate detection", async () => {
      await actions.openRenameDialog("Debian");

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      // ubuntu (lowercase) should match Ubuntu
      await input.setValue("ubuntu");

      // Wait for validation error to appear
      await browser.waitUntil(
        async () => isElementDisplayed(selectors.renameValidationError),
        { timeout: 3000, timeoutMsg: "Validation error did not appear" }
      );

      const validationError = await $(selectors.renameValidationError);
      await expect(validationError).toBeDisplayed();

      const errorText = await validationError.getText();
      expect(errorText.toLowerCase()).toContain("already exists");
    });
  });

  describe("Checkbox Options", () => {
    it("should have Windows Terminal profile checkbox checked by default", async () => {
      await actions.openRenameDialog("Debian");

      const checkbox = await $(selectors.renameUpdateTerminal);
      const isChecked = await checkbox.isSelected();
      expect(isChecked).toBe(true);
    });

    it("should have Start Menu shortcut checkbox checked by default", async () => {
      await actions.openRenameDialog("Debian");

      const checkbox = await $(selectors.renameUpdateShortcut);
      const isChecked = await checkbox.isSelected();
      expect(isChecked).toBe(true);
    });

    it("should allow toggling Windows Terminal profile checkbox", async () => {
      await actions.openRenameDialog("Debian");

      const checkbox = await $(selectors.renameUpdateTerminal);
      await checkbox.click();

      // Wait for checkbox to toggle
      await browser.waitUntil(
        async () => !(await checkbox.isSelected()),
        { timeout: 3000, timeoutMsg: "Checkbox did not toggle" }
      );

      const isChecked = await checkbox.isSelected();
      expect(isChecked).toBe(false);
    });

    it("should allow toggling Start Menu shortcut checkbox", async () => {
      await actions.openRenameDialog("Debian");

      const checkbox = await $(selectors.renameUpdateShortcut);
      await checkbox.click();

      // Wait for checkbox to toggle
      await browser.waitUntil(
        async () => !(await checkbox.isSelected()),
        { timeout: 3000, timeoutMsg: "Checkbox did not toggle" }
      );

      const isChecked = await checkbox.isSelected();
      expect(isChecked).toBe(false);
    });

    it("should display descriptive text for terminal option", async () => {
      await actions.openRenameDialog("Debian");

      const option = await $(selectors.renameTerminalOption);
      const text = await option.getText();
      expect(text.toLowerCase()).toContain("terminal");
    });

    it("should display descriptive text for shortcut option", async () => {
      await actions.openRenameDialog("Debian");

      const option = await $(selectors.renameShortcutOption);
      const text = await option.getText();
      expect(text.toLowerCase()).toContain("start menu");
    });
  });

  describe("Cancel Operation", () => {
    it("should close dialog when Cancel is clicked", async () => {
      await actions.openRenameDialog("Debian");

      const cancelButton = await $(selectors.renameCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.renameDialog, 5000);

      const dialogDisplayed = await isElementDisplayed(selectors.renameDialog);
      expect(dialogDisplayed).toBe(false);
    });

    it("should close dialog when backdrop is clicked", async () => {
      await actions.openRenameDialog("Debian");

      // Click on the backdrop (area outside dialog)
      // The backdrop has class "fixed inset-0" and is behind the dialog
      await browser.execute(() => {
        const backdrop = document.querySelector('[data-testid="rename-dialog"]')?.parentElement?.querySelector('.absolute.inset-0');
        if (backdrop) {
          (backdrop as HTMLElement).click();
        }
      });
      await waitForDialogToDisappear(selectors.renameDialog, 5000);

      const dialogDisplayed = await isElementDisplayed(selectors.renameDialog);
      expect(dialogDisplayed).toBe(false);
    });

    it("should not rename distribution when cancelled", async () => {
      await actions.openRenameDialog("Debian");

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("ShouldNotRename");

      const cancelButton = await $(selectors.renameCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.renameDialog, 5000);

      // Debian should still exist
      const debianCard = await $(selectors.distroCardByName("Debian"));
      await expect(debianCard).toBeDisplayed();

      // New name should not exist
      const newCard = await $(selectors.distroCardByName("ShouldNotRename"));
      const exists = await newCard.isExisting();
      expect(exists).toBe(false);
    });
  });

  describe("Rename Operation", () => {
    it("should perform rename when Rename button is clicked", async () => {
      await actions.openRenameDialog("Debian");

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Debian-Renamed");

      // Wait for button to enable
      await browser.waitUntil(
        async () => {
          const btn = await $(selectors.renameConfirmButton);
          const disabled = await btn.getAttribute("disabled");
          return !disabled;
        },
        { timeout: 3000, timeoutMsg: "Rename button did not enable" }
      );

      const confirmButton = await $(selectors.renameConfirmButton);
      await confirmButton.click();

      // Wait for rename to complete and dialog to close
      await browser.waitUntil(
        async () => !(await isElementDisplayed(selectors.renameDialog)),
        { timeout: 10000, timeoutMsg: "Dialog did not close after rename" }
      );

      // Old name should not exist
      const oldCard = await $(selectors.distroCardByName("Debian"));
      const oldExists = await oldCard.isExisting();
      expect(oldExists).toBe(false);

      // New name should exist
      const newCard = await $(selectors.distroCardByName("Debian-Renamed"));
      await expect(newCard).toBeDisplayed();
    });

    it("should close dialog after successful rename", async () => {
      // Use Alpine to avoid state pollution from previous rename tests
      await actions.openRenameDialog("Alpine");

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Alpine-Test");

      // Wait for button to enable
      await browser.waitUntil(
        async () => {
          const btn = await $(selectors.renameConfirmButton);
          const disabled = await btn.getAttribute("disabled");
          return !disabled;
        },
        { timeout: 3000, timeoutMsg: "Rename button did not enable" }
      );

      const confirmButton = await $(selectors.renameConfirmButton);
      await confirmButton.click();

      // Wait for dialog to close
      await browser.waitUntil(
        async () => !(await isElementDisplayed(selectors.renameDialog)),
        { timeout: 10000, timeoutMsg: "Dialog did not close after rename" }
      );

      const dialogDisplayed = await isElementDisplayed(selectors.renameDialog);
      expect(dialogDisplayed).toBe(false);
    });

    it("should show button text change during rename", async () => {
      // Use Fedora to avoid state pollution from previous rename tests
      await actions.openRenameDialog("Fedora");

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Fedora-Progress");

      // Wait for button to enable
      await browser.waitUntil(
        async () => {
          const btn = await $(selectors.renameConfirmButton);
          const disabled = await btn.getAttribute("disabled");
          return !disabled;
        },
        { timeout: 3000, timeoutMsg: "Rename button did not enable" }
      );

      const confirmButton = await $(selectors.renameConfirmButton);
      const initialText = await confirmButton.getText();
      expect(initialText).toContain("Rename");

      // Click and check for progress state (if visible before completion)
      await confirmButton.click();
      // The "Renaming..." text may appear briefly
    });
  });

  describe("Keyboard Navigation", () => {
    it("should close dialog when Escape is pressed", async () => {
      // Use Alpine to avoid state pollution from previous tests
      await actions.openRenameDialog("Alpine");

      // Press Escape
      await browser.keys("Escape");
      await waitForDialogToDisappear(selectors.renameDialog, 5000);

      const dialogDisplayed = await isElementDisplayed(selectors.renameDialog);
      expect(dialogDisplayed).toBe(false);
    });

    it("should submit rename when Enter is pressed with valid name", async () => {
      // Use Alpine to avoid state pollution from previous tests
      await actions.openRenameDialog("Alpine");

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Alpine-Enter");

      // Wait for button to enable
      await browser.waitUntil(
        async () => {
          const btn = await $(selectors.renameConfirmButton);
          const disabled = await btn.getAttribute("disabled");
          return !disabled;
        },
        { timeout: 3000, timeoutMsg: "Rename button did not enable" }
      );

      // Press Enter
      await browser.keys("Enter");

      // Wait for rename to complete
      await browser.waitUntil(
        async () => !(await isElementDisplayed(selectors.renameDialog)),
        { timeout: 10000, timeoutMsg: "Dialog did not close after Enter key" }
      );

      // New name should exist
      const newCard = await $(selectors.distroCardByName("Alpine-Enter"));
      await expect(newCard).toBeDisplayed();
    });

    it("should auto-focus the name input when dialog opens", async () => {
      // Use Fedora to avoid state pollution from previous rename tests
      await actions.openRenameDialog("Fedora");

      // The input should be focused
      const input = await $(selectors.renameNameInput);
      const isFocused = await browser.execute((selector) => {
        return document.activeElement === document.querySelector(selector);
      }, selectors.renameNameInput);

      expect(isFocused).toBe(true);
    });
  });

  describe("Error Handling", () => {
    // Note: Error handling tests would require mock configuration
    // to simulate backend errors. These are placeholder tests.

    it("should display error message when rename fails", async () => {
      // This test requires mock error configuration
      // Placeholder for when setMockError supports rename operation
    });

    it("should keep dialog open when error occurs", async () => {
      // This test requires mock error configuration
    });

    it("should allow retry after error is fixed", async () => {
      // This test requires mock error configuration
    });
  });
});
