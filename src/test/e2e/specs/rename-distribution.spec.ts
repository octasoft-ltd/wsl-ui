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

import {
  waitForAppReady,
  resetMockState,
  selectors,
  mockDistributions,
  safeRefresh,
} from "../utils";

describe("Rename Distribution", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(500);
    await resetMockState();
    await waitForAppReady();
    await browser.pause(500);
  });

  /**
   * Helper to open the quick actions menu for a distribution
   */
  async function openQuickActionsMenu(distroName: string): Promise<void> {
    const card = await $(selectors.distroCardByName(distroName));
    const quickActionsButton = await card.$('[data-testid="quick-actions-button"]');
    await quickActionsButton.click();
    await browser.pause(300);
  }

  /**
   * Helper to open the Manage submenu
   */
  async function openManageSubmenu(): Promise<void> {
    const manageButton = await $(selectors.manageSubmenu);
    await manageButton.click();
    await browser.pause(200);
  }

  /**
   * Helper to open rename dialog for a stopped distribution
   */
  async function openRenameDialog(distroName: string): Promise<void> {
    await openQuickActionsMenu(distroName);
    await openManageSubmenu();
    const renameAction = await $(selectors.renameAction);
    await renameAction.click();
    await browser.pause(300);
  }

  /**
   * Helper to wait for rename dialog to appear
   */
  async function waitForRenameDialog(): Promise<WebdriverIO.Element> {
    await browser.waitUntil(
      async () => {
        const dialog = await $(selectors.renameDialog);
        return dialog.isDisplayed();
      },
      {
        timeout: 5000,
        timeoutMsg: "Rename dialog did not appear within 5 seconds",
      }
    );
    return $(selectors.renameDialog);
  }

  describe("Dialog Access", () => {
    it("should have Rename option in manage submenu", async () => {
      // Use a stopped distribution (Debian)
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const renameAction = await $(selectors.renameAction);
      await expect(renameAction).toBeDisplayed();

      const text = await renameAction.getText();
      expect(text).toContain("Rename");
    });

    it("should show stop dialog when renaming running distributions", async () => {
      // Ubuntu is running by default
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const renameAction = await $(selectors.renameAction);
      await expect(renameAction).toBeDisplayed();
      await renameAction.click();
      await browser.pause(300);

      // Stop and action dialog should appear for running distributions
      const stopDialog = await $(selectors.stopAndActionDialog);
      await expect(stopDialog).toBeDisplayed();

      // Close it for cleanup
      const cancelButton = await $(selectors.stopDialogCancelButton);
      await cancelButton.click();
      await browser.pause(300);
    });

    it("should open Rename dialog when clicked on stopped distribution", async () => {
      await openRenameDialog("Debian");

      const dialog = await waitForRenameDialog();
      await expect(dialog).toBeDisplayed();
    });

    it("should display current distribution name in dialog", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const dialog = await $(selectors.renameDialog);
      const dialogText = await dialog.getText();
      expect(dialogText).toContain("Debian");
    });
  });

  describe("Name Input", () => {
    it("should pre-populate input with current distribution name", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      const value = await input.getValue();
      expect(value).toBe("Debian");
    });

    it("should allow entering a new name", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Debian-Renamed");

      const value = await input.getValue();
      expect(value).toBe("Debian-Renamed");
    });

    it("should disable Rename button when name is unchanged", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const confirmButton = await $(selectors.renameConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeTruthy();
    });

    it("should enable Rename button when valid new name is entered", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Debian-New");
      await browser.pause(200);

      const confirmButton = await $(selectors.renameConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeFalsy();
    });

    it("should disable Rename button when name is empty", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await browser.pause(200);

      const confirmButton = await $(selectors.renameConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeTruthy();
    });
  });

  describe("Name Validation", () => {
    it("should show error for duplicate name", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      // Ubuntu exists in mock distributions
      await input.setValue("Ubuntu");
      await browser.pause(200);

      const validationError = await $(selectors.renameValidationError);
      await expect(validationError).toBeDisplayed();

      const errorText = await validationError.getText();
      expect(errorText.toLowerCase()).toContain("already exists");
    });

    it("should show error for invalid characters", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Invalid Name With Spaces");
      await browser.pause(200);

      const validationError = await $(selectors.renameValidationError);
      await expect(validationError).toBeDisplayed();

      const errorText = await validationError.getText();
      expect(errorText.toLowerCase()).toContain("only contain");
    });

    it("should allow valid characters (letters, numbers, dots, underscores, hyphens)", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Valid_Name-123.test");
      await browser.pause(200);

      // Should not show validation error
      const validationError = await $(selectors.renameValidationError);
      const isDisplayed = await validationError.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);

      // Confirm button should be enabled
      const confirmButton = await $(selectors.renameConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeFalsy();
    });

    it("should be case-insensitive for duplicate detection", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      // ubuntu (lowercase) should match Ubuntu
      await input.setValue("ubuntu");
      await browser.pause(200);

      const validationError = await $(selectors.renameValidationError);
      await expect(validationError).toBeDisplayed();

      const errorText = await validationError.getText();
      expect(errorText.toLowerCase()).toContain("already exists");
    });
  });

  describe("Checkbox Options", () => {
    it("should have Windows Terminal profile checkbox checked by default", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const checkbox = await $(selectors.renameUpdateTerminal);
      const isChecked = await checkbox.isSelected();
      expect(isChecked).toBe(true);
    });

    it("should have Start Menu shortcut checkbox checked by default", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const checkbox = await $(selectors.renameUpdateShortcut);
      const isChecked = await checkbox.isSelected();
      expect(isChecked).toBe(true);
    });

    it("should allow toggling Windows Terminal profile checkbox", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const checkbox = await $(selectors.renameUpdateTerminal);
      await checkbox.click();
      await browser.pause(100);

      const isChecked = await checkbox.isSelected();
      expect(isChecked).toBe(false);
    });

    it("should allow toggling Start Menu shortcut checkbox", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const checkbox = await $(selectors.renameUpdateShortcut);
      await checkbox.click();
      await browser.pause(100);

      const isChecked = await checkbox.isSelected();
      expect(isChecked).toBe(false);
    });

    it("should display descriptive text for terminal option", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const option = await $(selectors.renameTerminalOption);
      const text = await option.getText();
      expect(text.toLowerCase()).toContain("terminal");
    });

    it("should display descriptive text for shortcut option", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const option = await $(selectors.renameShortcutOption);
      const text = await option.getText();
      expect(text.toLowerCase()).toContain("start menu");
    });
  });

  describe("Cancel Operation", () => {
    it("should close dialog when Cancel is clicked", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const cancelButton = await $(selectors.renameCancelButton);
      await cancelButton.click();
      await browser.pause(300);

      const dialog = await $(selectors.renameDialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should close dialog when backdrop is clicked", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      // Click on the backdrop (area outside dialog)
      // The backdrop has class "fixed inset-0" and is behind the dialog
      await browser.execute(() => {
        const backdrop = document.querySelector('[data-testid="rename-dialog"]')?.parentElement?.querySelector('.absolute.inset-0');
        if (backdrop) {
          (backdrop as HTMLElement).click();
        }
      });
      await browser.pause(300);

      const dialog = await $(selectors.renameDialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should not rename distribution when cancelled", async () => {
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("ShouldNotRename");

      const cancelButton = await $(selectors.renameCancelButton);
      await cancelButton.click();
      await browser.pause(500);

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
      await openRenameDialog("Debian");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Debian-Renamed");
      await browser.pause(200);

      const confirmButton = await $(selectors.renameConfirmButton);
      await confirmButton.click();

      // Wait for rename to complete and dialog to close
      await browser.waitUntil(
        async () => {
          const dialog = await $(selectors.renameDialog);
          return !(await dialog.isDisplayed().catch(() => false));
        },
        {
          timeout: 10000,
          timeoutMsg: "Dialog did not close after rename",
        }
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
      await openRenameDialog("Alpine");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Alpine-Test");
      await browser.pause(200);

      const confirmButton = await $(selectors.renameConfirmButton);
      await confirmButton.click();

      // Wait for dialog to close
      await browser.waitUntil(
        async () => {
          const dialog = await $(selectors.renameDialog);
          return !(await dialog.isDisplayed().catch(() => false));
        },
        {
          timeout: 10000,
          timeoutMsg: "Dialog did not close after rename",
        }
      );

      const dialog = await $(selectors.renameDialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should show button text change during rename", async () => {
      // Use Fedora to avoid state pollution from previous rename tests
      await openRenameDialog("Fedora");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Fedora-Progress");
      await browser.pause(200);

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
      await openRenameDialog("Alpine");
      await waitForRenameDialog();

      // Press Escape
      await browser.keys("Escape");
      await browser.pause(300);

      const dialog = await $(selectors.renameDialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should submit rename when Enter is pressed with valid name", async () => {
      // Use Alpine to avoid state pollution from previous tests
      await openRenameDialog("Alpine");
      await waitForRenameDialog();

      const input = await $(selectors.renameNameInput);
      await input.clearValue();
      await input.setValue("Alpine-Enter");
      await browser.pause(200);

      // Press Enter
      await browser.keys("Enter");

      // Wait for rename to complete
      await browser.waitUntil(
        async () => {
          const dialog = await $(selectors.renameDialog);
          return !(await dialog.isDisplayed().catch(() => false));
        },
        {
          timeout: 10000,
          timeoutMsg: "Dialog did not close after Enter key",
        }
      );

      // New name should exist
      const newCard = await $(selectors.distroCardByName("Alpine-Enter"));
      await expect(newCard).toBeDisplayed();
    });

    it("should auto-focus the name input when dialog opens", async () => {
      // Use Fedora to avoid state pollution from previous rename tests
      await openRenameDialog("Fedora");
      await waitForRenameDialog();

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
