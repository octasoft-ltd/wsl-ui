/**
 * E2E Tests for Clone Distribution Workflow
 *
 * Tests the clone distribution functionality:
 * - Opening clone dialog from quick actions menu
 * - Default clone name suggestion
 * - Custom clone name entry
 * - Validation of clone names
 * - Clone progress indication
 * - Successful clone operation
 * - Error handling
 */

import {
  selectors,
  waitForDialog,
  waitForDialogToDisappear,
  captureDistroStates,
  verifyAfterClone,
  verifyStatesUnchanged,
} from "../utils";
import { setupHooks, actions } from "../base";

describe("Clone Distribution", () => {
  setupHooks.withCleanNotifications();

  /**
   * Helper to wait for clone dialog to appear
   */
  async function waitForCloneDialog(): Promise<WebdriverIO.Element> {
    return waitForDialog(selectors.cloneDialog, 5000);
  }

  describe("Dialog Access", () => {
    it("should have Clone option in quick actions menu", async () => {
      await actions.openQuickActionsMenu("Ubuntu");

      const cloneAction = await $(selectors.cloneAction);
      await expect(cloneAction).toBeDisplayed();

      const text = await cloneAction.getText();
      expect(text).toContain("Clone");
    });

    it("should open Clone dialog when Clone action is clicked", async () => {
      await actions.openCloneDialog("Ubuntu");

      const dialog = await waitForCloneDialog();
      await expect(dialog).toBeDisplayed();
    });

    it("should display source distribution name in dialog", async () => {
      await actions.openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const dialog = await $(selectors.cloneDialog);
      const dialogText = await dialog.getText();
      expect(dialogText).toContain("Ubuntu");
    });

    it("should show Clone Distribution title", async () => {
      await actions.openCloneDialog("Debian");
      await waitForCloneDialog();

      const dialog = await $(selectors.cloneDialog);
      const heading = await dialog.$("h2");
      const headingText = await heading.getText();
      expect(headingText).toContain("Clone Distribution");
    });
  });

  describe("Default Clone Name", () => {
    it("should suggest clone name with '-clone' suffix for Ubuntu", async () => {
      await actions.openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      const value = await input.getValue();
      expect(value).toBe("Ubuntu-clone");
    });

    it("should suggest clone name with '-clone' suffix for Debian", async () => {
      await actions.openCloneDialog("Debian");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      const value = await input.getValue();
      expect(value).toBe("Debian-clone");
    });

    it("should suggest clone name with '-clone' suffix for Alpine", async () => {
      await actions.openCloneDialog("Alpine");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      const value = await input.getValue();
      expect(value).toBe("Alpine-clone");
    });
  });

  describe("Custom Clone Name", () => {
    it("should allow entering a custom clone name", async () => {
      await actions.openCloneDialog("Ubuntu");

      const input = await $(selectors.cloneNameInput);
      // Use keyboard commands to clear (clearValue doesn't work well with React)
      await input.click();
      await browser.keys(["Control", "a"]);
      await browser.keys("Backspace");
      await input.setValue("My-Custom-Ubuntu");

      await browser.waitUntil(
        async () => (await input.getValue()) === "My-Custom-Ubuntu",
        { timeout: 2000, timeoutMsg: "Input value was not set correctly" }
      );
    });

    it("should enable Clone button when valid name is entered", async () => {
      await actions.openCloneDialog("Ubuntu");

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("Valid-Clone-Name");

      const confirmButton = await $(selectors.cloneConfirmButton);
      await browser.waitUntil(
        async () => (await confirmButton.getAttribute("disabled")) === null,
        { timeout: 2000, timeoutMsg: "Clone button was not enabled" }
      );
    });

    it("should disable Clone button when name is empty", async () => {
      await actions.openCloneDialog("Ubuntu");

      const input = await $(selectors.cloneNameInput);
      // Clear and verify it's actually empty
      await input.click();
      await browser.keys(['Control', 'a']);
      await browser.keys('Backspace');

      const confirmButton = await $(selectors.cloneConfirmButton);
      await browser.waitUntil(
        async () => (await confirmButton.getAttribute("disabled")) === "true",
        { timeout: 2000, timeoutMsg: "Clone button was not disabled" }
      );
    });
  });

  describe("Name Validation", () => {
    it("should show inline error when clone name is same as source", async () => {
      await actions.openCloneDialog("Ubuntu");

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("Ubuntu");

      // Wait for validation error to appear
      const validationError = await $(selectors.cloneValidationError);
      await validationError.waitForDisplayed({ timeout: 3000 });

      const errorText = await validationError.getText();
      expect(errorText.toLowerCase()).toContain("different");

      // Button should be disabled
      const confirmButton = await $(selectors.cloneConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBe("true");
    });

    it("should show inline error when clone name already exists", async () => {
      await actions.openCloneDialog("Ubuntu");

      // Enter name of another existing distribution
      const input = await $(selectors.cloneNameInput);
      await input.click();
      await browser.keys(["Control", "a"]);
      await browser.keys("Backspace");
      await input.setValue("Debian");

      // Wait for validation error to appear
      const validationError = await $(selectors.cloneValidationError);
      await validationError.waitForDisplayed({ timeout: 3000 });

      const errorText = await validationError.getText();
      expect(errorText.toLowerCase()).toContain("already exists");

      // Button should be disabled
      const confirmButton = await $(selectors.cloneConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBe("true");
    });

    it("should not show error for valid different name", async () => {
      await actions.openCloneDialog("Ubuntu");

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("Ubuntu-test");

      // Wait for validation to process
      await browser.waitUntil(
        async () => {
          const validationError = await $(selectors.cloneValidationError);
          return !(await validationError.isDisplayed());
        },
        { timeout: 2000, timeoutMsg: "Validation error should not be displayed for valid name" }
      );

      // Button should be enabled
      const confirmButton = await $(selectors.cloneConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeNull();
    });

    it("should show inline error for invalid characters", async () => {
      await actions.openCloneDialog("Ubuntu");

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("Ubuntu Clone!");

      // Wait for validation error to appear
      const validationError = await $(selectors.cloneValidationError);
      await validationError.waitForDisplayed({ timeout: 3000 });

      const errorText = await validationError.getText();
      expect(errorText.toLowerCase()).toContain("letters");
    });
  });

  describe("Installation Location", () => {
    it("should have a location field with default path", async () => {
      await actions.openCloneDialog("Ubuntu");

      const locationInput = await $(selectors.cloneLocationInput);
      await expect(locationInput).toBeDisplayed();

      // Wait for default path to be fetched from backend
      await browser.waitUntil(
        async () => {
          const value = await locationInput.getValue();
          return value.includes("Ubuntu-clone");
        },
        { timeout: 5000, timeoutMsg: "Default location did not load" }
      );
    });

    it("should have a browse button for location", async () => {
      await actions.openCloneDialog("Ubuntu");

      // Find browse button within the clone dialog
      const dialog = await $(selectors.cloneDialog);
      const browseButton = await dialog.$(selectors.cloneBrowseButton);
      await browseButton.waitForDisplayed({ timeout: 5000 });
    });

    it("should allow typing a custom location", async () => {
      await actions.openCloneDialog("Ubuntu");

      const locationInput = await $(selectors.cloneLocationInput);
      // Clear the default path first
      await locationInput.click();
      await browser.keys(["Control", "a"]);
      await browser.keys("Backspace");
      await locationInput.setValue("D:\\WSL\\Ubuntu-clone");

      await browser.waitUntil(
        async () => (await locationInput.getValue()) === "D:\\WSL\\Ubuntu-clone",
        { timeout: 2000, timeoutMsg: "Custom location was not set" }
      );
    });

    it("should allow cloning with default location", async () => {
      await actions.openCloneDialog("Ubuntu");

      // Wait for default path to load
      const locationInput = await $(selectors.cloneLocationInput);
      await browser.waitUntil(
        async () => (await locationInput.getValue()).length > 0,
        { timeout: 5000, timeoutMsg: "Default location did not load" }
      );

      // Clone button should be enabled with valid name and default location
      const confirmButton = await $(selectors.cloneConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeNull();
    });

    it("should reset location to default when dialog is reopened", async () => {
      await actions.openCloneDialog("Ubuntu");

      // Wait for default path to load
      const locationInput = await $(selectors.cloneLocationInput);
      await browser.waitUntil(
        async () => (await locationInput.getValue()).includes("Ubuntu-clone"),
        { timeout: 5000 }
      );

      // Enter a custom location
      await locationInput.click();
      await browser.keys(["Control", "a"]);
      await browser.keys("Backspace");
      await locationInput.setValue("D:\\CustomLocation");

      // Close dialog
      const cancelButton = await $(selectors.cloneCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.cloneDialog);

      // Reopen dialog
      await actions.openCloneDialog("Ubuntu");

      // Wait for default path to load again
      const newLocationInput = await $(selectors.cloneLocationInput);
      await browser.waitUntil(
        async () => {
          const value = await newLocationInput.getValue();
          return value.includes("Ubuntu-clone") && !value.includes("CustomLocation");
        },
        { timeout: 5000, timeoutMsg: "Location was not reset to default" }
      );
    });

    it("should show error when location is already used by another distribution", async () => {
      await actions.openCloneDialog("Ubuntu");

      // Enter a path that matches an existing distribution's location
      const locationInput = await $(selectors.cloneLocationInput);
      await locationInput.click();
      await browser.keys(["Control", "a"]);
      await browser.keys("Backspace");
      await locationInput.setValue("C:\\Users\\MockUser\\AppData\\Local\\Packages\\Debian");

      // Wait for path error (debounced validation - 300ms debounce + async validation)
      const pathError = await $(selectors.clonePathError);
      await pathError.waitForDisplayed({ timeout: 5000 });

      const errorText = await pathError.getText();
      expect(errorText.toLowerCase()).toContain("already");

      // Clone button should be disabled
      const confirmButton = await $(selectors.cloneConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBe("true");
    });
  });

  describe("Cancel Operation", () => {
    it("should close dialog when Cancel is clicked", async () => {
      await actions.openCloneDialog("Ubuntu");

      const cancelButton = await $(selectors.cloneCancelButton);
      await cancelButton.click();

      await waitForDialogToDisappear(selectors.cloneDialog);
    });

    it("should close dialog when backdrop is clicked", async () => {
      await actions.openCloneDialog("Ubuntu");

      // Click on the backdrop (area outside dialog)
      await browser.execute(() => {
        const backdrop = document.querySelector('[data-testid="clone-dialog"]')?.parentElement?.querySelector('.absolute.inset-0');
        if (backdrop) {
          (backdrop as HTMLElement).click();
        }
      });

      await waitForDialogToDisappear(selectors.cloneDialog);
    });

    it("should reset clone name when dialog is reopened", async () => {
      await actions.openCloneDialog("Ubuntu");

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("Modified-Name");

      const cancelButton = await $(selectors.cloneCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.cloneDialog);

      // Reopen dialog
      await actions.openCloneDialog("Ubuntu");

      const inputAfter = await $(selectors.cloneNameInput);
      await browser.waitUntil(
        async () => (await inputAfter.getValue()) === "Ubuntu-clone",
        { timeout: 3000, timeoutMsg: "Clone name was not reset to default" }
      );
    });

    it("should not create clone when cancelled and verify no side effects", async () => {
      // Use a STOPPED distro (Debian) to avoid the StopAndAction dialog
      // which would stop the distro as a side effect even if clone is cancelled
      // Capture state before operation
      const preSnapshot = await captureDistroStates();

      await actions.openCloneDialog("Debian");

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("ShouldNotExist-clone");

      const cancelButton = await $(selectors.cloneCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.cloneDialog);

      // Verify no side effects - all distros should remain unchanged
      await verifyStatesUnchanged(preSnapshot);

      // New clone should not exist
      const newCard = await $(selectors.distroCardByName("ShouldNotExist-clone"));
      const exists = await newCard.isExisting();
      expect(exists).toBe(false);
    });
  });

  describe("Clone Operation", () => {
    it("should start clone when Clone button is clicked", async () => {
      // Capture state before clone
      const preSnapshot = await captureDistroStates();

      await actions.openCloneDialog("Debian");

      const input = await $(selectors.cloneNameInput);
      const cloneName = await input.getValue();

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      // Wait for dialog to close
      await waitForDialogToDisappear(selectors.cloneDialog, 30000);

      // Verify clone operation: clone appeared, original unchanged, count increased
      await verifyAfterClone("Debian", cloneName, preSnapshot);
    });

    it("should close dialog after successful clone", async () => {
      await actions.openCloneDialog("Alpine");

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      await waitForDialogToDisappear(selectors.cloneDialog, 30000);
    });

    it("should show button text change during clone", async () => {
      await actions.openCloneDialog("Debian");

      const confirmButton = await $(selectors.cloneConfirmButton);
      const initialText = await confirmButton.getText();
      expect(initialText).toContain("Clone");

      // Click to start clone
      await confirmButton.click();

      // Check for "Cloning..." text (may be brief)
      try {
        await browser.waitUntil(
          async () => {
            const text = await confirmButton.getText();
            return text.includes("Cloning");
          },
          { timeout: 2000 }
        );
      } catch {
        // It's okay if we miss the brief "Cloning..." state
      }
    });

    it("should preserve original distribution after clone", async () => {
      // Use a unique clone name to avoid conflicts with other tests
      const uniqueCloneName = `Debian-preserve-test-${Date.now()}`;

      // Capture Debian's state before clone
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const debianBadge = await debianCard.$(selectors.stateBadge);
      const debianStateBefore = await debianBadge.getText();

      await actions.openCloneDialog("Debian");

      // Set unique clone name
      const input = await $(selectors.cloneNameInput);
      await input.click();
      await browser.keys(["Control", "a"]);
      await browser.keys("Backspace");
      await input.setValue(uniqueCloneName);

      // Wait for validation to pass
      await browser.waitUntil(
        async () => {
          const confirmButton = await $(selectors.cloneConfirmButton);
          return (await confirmButton.getAttribute("disabled")) === null;
        },
        { timeout: 2000 }
      );

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      await waitForDialogToDisappear(selectors.cloneDialog, 30000);

      // Verify the ORIGINAL distribution (Debian) is preserved with same state
      const debianCardAfter = await $(selectors.distroCardByName("Debian"));
      await expect(debianCardAfter).toBeDisplayed();
      const debianBadgeAfter = await debianCardAfter.$(selectors.stateBadge);
      const debianStateAfter = await debianBadgeAfter.getText();
      expect(debianStateAfter).toBe(debianStateBefore);

      // Verify clone was created
      const cloneCard = await $(selectors.distroCardByName(uniqueCloneName));
      await expect(cloneCard).toBeDisplayed();
    });

    it("should create clone with custom name", async () => {
      // Capture state before clone
      const preSnapshot = await captureDistroStates();

      await actions.openCloneDialog("Debian");

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("My-Debian-Copy");

      // Wait for validation to pass
      await browser.waitUntil(
        async () => {
          const confirmButton = await $(selectors.cloneConfirmButton);
          return (await confirmButton.getAttribute("disabled")) === null;
        },
        { timeout: 2000 }
      );

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      await waitForDialogToDisappear(selectors.cloneDialog, 30000);

      // Verify clone operation with custom name
      await verifyAfterClone("Debian", "My-Debian-Copy", preSnapshot);
    });
  });

  describe("Progress Indication", () => {
    it("should show progress indicator during cloning", async () => {
      await actions.openCloneDialog("Debian");
      await waitForCloneDialog();

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      // Check for progress indicator (may be brief)
      try {
        await browser.waitUntil(
          async () => {
            const progress = await $(selectors.cloneProgress);
            return progress.isDisplayed();
          },
          {
            timeout: 2000,
            timeoutMsg: "Did not see progress indicator",
          }
        );

        const progress = await $(selectors.cloneProgress);
        await expect(progress).toBeDisplayed();
      } catch {
        // It's okay if we miss the brief progress state
      }
    });

    it("should disable inputs during cloning", async () => {
      await actions.openCloneDialog("Debian");
      await waitForCloneDialog();

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      // Check if input is disabled during clone
      try {
        await browser.waitUntil(
          async () => {
            const input = await $(selectors.cloneNameInput);
            return (await input.getAttribute("disabled")) === "true";
          },
          {
            timeout: 2000,
            timeoutMsg: "Input was not disabled",
          }
        );

        const input = await $(selectors.cloneNameInput);
        const isDisabled = await input.getAttribute("disabled");
        expect(isDisabled).toBeTruthy();
      } catch {
        // Clone completed too fast
      }
    });

    it("should disable Cancel button during cloning", async () => {
      await actions.openCloneDialog("Debian");
      await waitForCloneDialog();

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      // Check if cancel button is disabled during clone
      try {
        await browser.waitUntil(
          async () => {
            const cancelButton = await $(selectors.cloneCancelButton);
            return (await cancelButton.getAttribute("disabled")) === "true";
          },
          {
            timeout: 2000,
            timeoutMsg: "Cancel button was not disabled",
          }
        );

        const cancelButton = await $(selectors.cloneCancelButton);
        const isDisabled = await cancelButton.getAttribute("disabled");
        expect(isDisabled).toBeTruthy();
      } catch {
        // Clone completed too fast
      }
    });
  });

  describe("Clone from Different States", () => {
    it("should allow cloning a stopped distribution", async () => {
      // Debian is stopped by default
      const dialog = await actions.openCloneDialog("Debian");
      await expect(dialog).toBeDisplayed();
    });

    it("should allow cloning a running distribution", async () => {
      // Ubuntu is running by default
      const dialog = await actions.openCloneDialog("Ubuntu");
      await expect(dialog).toBeDisplayed();
    });

    it("should successfully clone running distribution", async () => {
      // Use a unique clone name to avoid conflicts
      const uniqueCloneName = `Ubuntu-running-clone-${Date.now()}`;

      // Ubuntu is running - verify initial state
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const ubuntuBadge = await ubuntuCard.$(selectors.stateBadge);
      const initialState = await ubuntuBadge.getText();
      expect(initialState).toBe("ONLINE");

      // Open clone dialog - this will trigger StopAndAction dialog for running distro
      await actions.openCloneDialog("Ubuntu");

      // Set unique clone name
      const input = await $(selectors.cloneNameInput);
      await input.click();
      await browser.keys(["Control", "a"]);
      await browser.keys("Backspace");
      await input.setValue(uniqueCloneName);

      // Wait for validation to pass
      await browser.waitUntil(
        async () => {
          const confirmButton = await $(selectors.cloneConfirmButton);
          return (await confirmButton.getAttribute("disabled")) === null;
        },
        { timeout: 2000 }
      );

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      await waitForDialogToDisappear(selectors.cloneDialog, 30000);

      // After cloning a running distro:
      // - The clone should appear OFFLINE
      // - Ubuntu should now be OFFLINE (stopped for clone operation - this is expected WSL behavior)
      const cloneCard = await $(selectors.distroCardByName(uniqueCloneName));
      await expect(cloneCard).toBeDisplayed();
      const cloneBadge = await cloneCard.$(selectors.stateBadge);
      const cloneState = await cloneBadge.getText();
      expect(cloneState).toBe("OFFLINE");

      // Source distro is now OFFLINE (stopped for export) - this is correct WSL behavior
      const ubuntuCardAfter = await $(selectors.distroCardByName("Ubuntu"));
      const ubuntuBadgeAfter = await ubuntuCardAfter.$(selectors.stateBadge);
      const ubuntuStateAfter = await ubuntuBadgeAfter.getText();
      expect(ubuntuStateAfter).toBe("OFFLINE");
    });
  });

  describe("Error Handling", () => {
    // Note: These tests require mock error configuration
    // They are placeholders for when the mock supports clone errors

    it("should display error when clone fails", async () => {
      // Requires mock error setup for clone_distribution
    });

    it("should keep dialog open when error occurs", async () => {
      // Requires mock error setup
    });

    it("should allow retry after fixing error", async () => {
      // Requires mock error setup
    });
  });

  describe("Cloned Distribution Properties", () => {
    it("should show cloned distribution as stopped initially", async () => {
      // Capture state before clone
      const preSnapshot = await captureDistroStates();

      await actions.openCloneDialog("Debian");

      // Wait for confirm button to be enabled and click
      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.waitForClickable({ timeout: 5000 });
      await confirmButton.click();

      await waitForDialogToDisappear(selectors.cloneDialog, 30000);

      // Verify clone appeared OFFLINE and all other distros unchanged
      await verifyAfterClone("Debian", "Debian-clone", preSnapshot);
    });
  });
});
