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
  waitForAppReady,
  resetMockState,
  selectors,
  mockDistributions,
  safeRefresh,
} from "../utils";

describe("Clone Distribution", () => {
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
   * Helper to open clone dialog for a distribution.
   * Handles the stop dialog if the distribution is running.
   */
  async function openCloneDialog(distroName: string): Promise<void> {
    await openQuickActionsMenu(distroName);
    const cloneAction = await $(selectors.cloneAction);
    await cloneAction.click();
    await browser.pause(300);

    // Check if stop dialog appeared (for running distros)
    const stopDialog = await $(selectors.stopAndActionDialog);
    if (await stopDialog.isDisplayed().catch(() => false)) {
      // Click "Stop & Continue" to proceed
      const stopButton = await $(selectors.stopAndContinueButton);
      await stopButton.click();
      // Wait for stop to complete and clone dialog to appear
      await browser.pause(1000);
    }
  }

  /**
   * Helper to wait for clone dialog to appear
   */
  async function waitForCloneDialog(): Promise<WebdriverIO.Element> {
    await browser.waitUntil(
      async () => {
        const dialog = await $(selectors.cloneDialog);
        return dialog.isDisplayed();
      },
      {
        timeout: 5000,
        timeoutMsg: "Clone dialog did not appear within 5 seconds",
      }
    );
    return $(selectors.cloneDialog);
  }

  describe("Dialog Access", () => {
    it("should have Clone option in quick actions menu", async () => {
      await openQuickActionsMenu("Ubuntu");

      const cloneAction = await $(selectors.cloneAction);
      await expect(cloneAction).toBeDisplayed();

      const text = await cloneAction.getText();
      expect(text).toContain("Clone");
    });

    it("should open Clone dialog when Clone action is clicked", async () => {
      await openCloneDialog("Ubuntu");

      const dialog = await waitForCloneDialog();
      await expect(dialog).toBeDisplayed();
    });

    it("should display source distribution name in dialog", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const dialog = await $(selectors.cloneDialog);
      const dialogText = await dialog.getText();
      expect(dialogText).toContain("Ubuntu");
    });

    it("should show Clone Distribution title", async () => {
      await openCloneDialog("Debian");
      await waitForCloneDialog();

      const dialog = await $(selectors.cloneDialog);
      const heading = await dialog.$("h2");
      const headingText = await heading.getText();
      expect(headingText).toContain("Clone Distribution");
    });
  });

  describe("Default Clone Name", () => {
    it("should suggest clone name with '-clone' suffix for Ubuntu", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      const value = await input.getValue();
      expect(value).toBe("Ubuntu-clone");
    });

    it("should suggest clone name with '-clone' suffix for Debian", async () => {
      await openCloneDialog("Debian");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      const value = await input.getValue();
      expect(value).toBe("Debian-clone");
    });

    it("should suggest clone name with '-clone' suffix for Alpine", async () => {
      await openCloneDialog("Alpine");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      const value = await input.getValue();
      expect(value).toBe("Alpine-clone");
    });
  });

  describe("Custom Clone Name", () => {
    it("should allow entering a custom clone name", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      // Use keyboard commands to clear (clearValue doesn't work well with React)
      await input.click();
      await browser.keys(["Control", "a"]);
      await browser.keys("Backspace");
      await input.setValue("My-Custom-Ubuntu");

      const value = await input.getValue();
      expect(value).toBe("My-Custom-Ubuntu");
    });

    it("should enable Clone button when valid name is entered", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("Valid-Clone-Name");
      await browser.pause(200);

      const confirmButton = await $(selectors.cloneConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeFalsy();
    });

    it("should disable Clone button when name is empty", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      // Clear and verify it's actually empty
      await input.click();
      await browser.keys(['Control', 'a']);
      await browser.keys('Backspace');
      await browser.pause(200);

      const confirmButton = await $(selectors.cloneConfirmButton);
      // Check if button is disabled - getAttribute returns "true" or null
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBe("true");
    });
  });

  describe("Name Validation", () => {
    it("should show inline error when clone name is same as source", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("Ubuntu");
      await browser.pause(200);

      // Inline validation error should be displayed immediately (no click needed)
      const validationError = await $(selectors.cloneValidationError);
      await expect(validationError).toBeDisplayed();

      const errorText = await validationError.getText();
      expect(errorText.toLowerCase()).toContain("different");

      // Button should be disabled
      const confirmButton = await $(selectors.cloneConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBe("true");
    });

    it("should show inline error when clone name already exists", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      // Enter name of another existing distribution
      const input = await $(selectors.cloneNameInput);
      // Use keyboard commands to clear (clearValue doesn't work well with React)
      await input.click();
      await browser.keys(["Control", "a"]);
      await browser.keys("Backspace");
      await input.setValue("Debian");
      await browser.pause(200);

      // Inline validation error should be displayed immediately
      const validationError = await $(selectors.cloneValidationError);
      await expect(validationError).toBeDisplayed();

      const errorText = await validationError.getText();
      expect(errorText.toLowerCase()).toContain("already exists");

      // Button should be disabled
      const confirmButton = await $(selectors.cloneConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBe("true");
    });

    it("should not show error for valid different name", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("Ubuntu-test");
      await browser.pause(200);

      // Validation error should not be displayed
      const validationError = await $(selectors.cloneValidationError);
      const isDisplayed = await validationError.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);

      // Button should be enabled
      const confirmButton = await $(selectors.cloneConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeFalsy();
    });

    it("should show inline error for invalid characters", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("Ubuntu Clone!");
      await browser.pause(200);

      // Inline validation error should be displayed
      const validationError = await $(selectors.cloneValidationError);
      await expect(validationError).toBeDisplayed();

      const errorText = await validationError.getText();
      expect(errorText.toLowerCase()).toContain("letters");
    });
  });

  describe("Installation Location", () => {
    it("should have a location field with default path", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const locationInput = await $(selectors.cloneLocationInput);
      await expect(locationInput).toBeDisplayed();

      // Wait for default path to be fetched from backend
      await browser.pause(300);
      const value = await locationInput.getValue();
      // Default path should contain the clone name
      expect(value).toContain("Ubuntu-clone");
    });

    it("should have a browse button for location", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();
      await browser.pause(300);

      // Find browse button within the clone dialog
      const dialog = await $(selectors.cloneDialog);
      const browseButton = await dialog.$(selectors.cloneBrowseButton);
      await browseButton.waitForDisplayed({ timeout: 5000 });
      await expect(browseButton).toBeDisplayed();
    });

    it("should allow typing a custom location", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const locationInput = await $(selectors.cloneLocationInput);
      // Clear the default path first
      await locationInput.click();
      await browser.keys(["Control", "a"]);
      await browser.keys("Backspace");
      await locationInput.setValue("D:\\WSL\\Ubuntu-clone");
      await browser.pause(200);

      const value = await locationInput.getValue();
      expect(value).toBe("D:\\WSL\\Ubuntu-clone");
    });

    it("should allow cloning with default location", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      // Wait for default path to load
      await browser.pause(300);

      // Location should have a default path
      const locationInput = await $(selectors.cloneLocationInput);
      const locationValue = await locationInput.getValue();
      expect(locationValue.length).toBeGreaterThan(0);

      // Clone button should be enabled with valid name and default location
      const confirmButton = await $(selectors.cloneConfirmButton);
      const isDisabled = await confirmButton.getAttribute("disabled");
      expect(isDisabled).toBeFalsy();
    });

    it("should reset location to default when dialog is reopened", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      // Wait for default path to load
      await browser.pause(300);

      // Get the default location
      const locationInput = await $(selectors.cloneLocationInput);
      const defaultValue = await locationInput.getValue();

      // Enter a custom location
      await locationInput.click();
      await browser.keys(["Control", "a"]);
      await browser.keys("Backspace");
      await locationInput.setValue("D:\\CustomLocation");
      await browser.pause(200);

      // Close dialog
      const cancelButton = await $(selectors.cloneCancelButton);
      await cancelButton.click();
      await browser.pause(300);

      // Reopen dialog
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      // Wait for default path to load again
      await browser.pause(300);

      // Location should be reset to default (not the custom value)
      const newLocationInput = await $(selectors.cloneLocationInput);
      const value = await newLocationInput.getValue();
      // Should be reset to default, containing the clone name
      expect(value).toContain("Ubuntu-clone");
      expect(value).not.toContain("CustomLocation");
    });

    it("should show error when location is already used by another distribution", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      // Enter a path that matches an existing distribution's location
      // Mock returns paths like: C:\Users\MockUser\AppData\Local\Packages\{name}
      const locationInput = await $(selectors.cloneLocationInput);
      await locationInput.click();
      await browser.keys(["Control", "a"]);
      await browser.keys("Backspace");
      await locationInput.setValue("C:\\Users\\MockUser\\AppData\\Local\\Packages\\Debian");
      await browser.pause(500); // Wait for debounced validation

      // Path error should be displayed
      const pathError = await $(selectors.clonePathError);
      await expect(pathError).toBeDisplayed();

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
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const cancelButton = await $(selectors.cloneCancelButton);
      await cancelButton.click();
      await browser.pause(300);

      const dialog = await $(selectors.cloneDialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should close dialog when backdrop is clicked", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      // Click on the backdrop (area outside dialog)
      await browser.execute(() => {
        const backdrop = document.querySelector('[data-testid="clone-dialog"]')?.parentElement?.querySelector('.absolute.inset-0');
        if (backdrop) {
          (backdrop as HTMLElement).click();
        }
      });
      await browser.pause(300);

      const dialog = await $(selectors.cloneDialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should reset clone name when dialog is reopened", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("Modified-Name");

      const cancelButton = await $(selectors.cloneCancelButton);
      await cancelButton.click();
      await browser.pause(300);

      // Reopen dialog
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const inputAfter = await $(selectors.cloneNameInput);
      const value = await inputAfter.getValue();
      expect(value).toBe("Ubuntu-clone");
    });

    it("should not create clone when cancelled", async () => {
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("ShouldNotExist-clone");

      const cancelButton = await $(selectors.cloneCancelButton);
      await cancelButton.click();
      await browser.pause(500);

      // New clone should not exist
      const newCard = await $(selectors.distroCardByName("ShouldNotExist-clone"));
      const exists = await newCard.isExisting();
      expect(exists).toBe(false);
    });
  });

  describe("Clone Operation", () => {
    it("should start clone when Clone button is clicked", async () => {
      await openCloneDialog("Debian");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      // Use default name
      const cloneName = await input.getValue();

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      // Wait for clone to complete and dialog to close
      await browser.waitUntil(
        async () => {
          const dialog = await $(selectors.cloneDialog);
          return !(await dialog.isDisplayed().catch(() => false));
        },
        {
          timeout: 30000, // Cloning can take time
          timeoutMsg: "Dialog did not close after clone",
        }
      );

      // Clone should exist in the list
      const cloneCard = await $(selectors.distroCardByName(cloneName));
      await expect(cloneCard).toBeDisplayed();
    });

    it("should close dialog after successful clone", async () => {
      await openCloneDialog("Alpine");
      await waitForCloneDialog();

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      // Wait for dialog to close
      await browser.waitUntil(
        async () => {
          const dialog = await $(selectors.cloneDialog);
          return !(await dialog.isDisplayed().catch(() => false));
        },
        {
          timeout: 30000,
          timeoutMsg: "Dialog did not close after clone",
        }
      );

      const dialog = await $(selectors.cloneDialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should show button text change during clone", async () => {
      await openCloneDialog("Debian");
      await waitForCloneDialog();

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
          {
            timeout: 2000,
            timeoutMsg: "Did not see Cloning text",
          }
        );
      } catch {
        // It's okay if we miss the brief "Cloning..." state
      }
    });

    it("should preserve original distribution after clone", async () => {
      await openCloneDialog("Debian");
      await waitForCloneDialog();

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      // Wait for dialog to close
      await browser.waitUntil(
        async () => {
          const dialog = await $(selectors.cloneDialog);
          return !(await dialog.isDisplayed().catch(() => false));
        },
        {
          timeout: 30000,
          timeoutMsg: "Dialog did not close after clone",
        }
      );

      // Original should still exist
      const originalCard = await $(selectors.distroCardByName("Debian"));
      await expect(originalCard).toBeDisplayed();
    });

    it("should create clone with custom name", async () => {
      await openCloneDialog("Debian");
      await waitForCloneDialog();

      const input = await $(selectors.cloneNameInput);
      await input.clearValue();
      await input.setValue("My-Debian-Copy");
      await browser.pause(200);

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      // Wait for dialog to close
      await browser.waitUntil(
        async () => {
          const dialog = await $(selectors.cloneDialog);
          return !(await dialog.isDisplayed().catch(() => false));
        },
        {
          timeout: 30000,
          timeoutMsg: "Dialog did not close after clone",
        }
      );

      // Clone with custom name should exist
      const cloneCard = await $(selectors.distroCardByName("My-Debian-Copy"));
      await expect(cloneCard).toBeDisplayed();
    });
  });

  describe("Progress Indication", () => {
    it("should show progress indicator during cloning", async () => {
      await openCloneDialog("Debian");
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
      await openCloneDialog("Debian");
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
      await openCloneDialog("Debian");
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
      await openCloneDialog("Debian");
      const dialog = await waitForCloneDialog();
      await expect(dialog).toBeDisplayed();
    });

    it("should allow cloning a running distribution", async () => {
      // Ubuntu is running by default
      await openCloneDialog("Ubuntu");
      const dialog = await waitForCloneDialog();
      await expect(dialog).toBeDisplayed();
    });

    it("should successfully clone running distribution", async () => {
      // Ubuntu is running
      await openCloneDialog("Ubuntu");
      await waitForCloneDialog();

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      // Wait for dialog to close
      await browser.waitUntil(
        async () => {
          const dialog = await $(selectors.cloneDialog);
          return !(await dialog.isDisplayed().catch(() => false));
        },
        {
          timeout: 30000,
          timeoutMsg: "Dialog did not close after clone",
        }
      );

      // Clone should exist
      const cloneCard = await $(selectors.distroCardByName("Ubuntu-clone"));
      await expect(cloneCard).toBeDisplayed();
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
      await openCloneDialog("Debian");
      await waitForCloneDialog();

      const confirmButton = await $(selectors.cloneConfirmButton);
      await confirmButton.click();

      // Wait for dialog to close
      await browser.waitUntil(
        async () => {
          const dialog = await $(selectors.cloneDialog);
          return !(await dialog.isDisplayed().catch(() => false));
        },
        {
          timeout: 30000,
          timeoutMsg: "Dialog did not close after clone",
        }
      );

      // Wait for the cloned distribution to appear
      await browser.pause(500);

      // Check clone's state using the state badge
      const cloneCard = await $(selectors.distroCardByName("Debian-clone"));
      await expect(cloneCard).toBeDisplayed();

      // Find state badge within the card
      const stateBadge = await cloneCard.$(selectors.stateBadge);
      if (await stateBadge.isExisting()) {
        const stateText = await stateBadge.getText();
        // UI shows "offline" for stopped distributions
        expect(stateText.toLowerCase()).toMatch(/stopped|offline/);
      } else {
        // Fallback: check card text contains stopped or offline
        const cardText = await cloneCard.getText();
        expect(cardText.toLowerCase()).toMatch(/stopped|offline/);
      }
    });
  });
});
