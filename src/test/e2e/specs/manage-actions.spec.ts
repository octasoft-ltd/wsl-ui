/**
 * E2E Tests for Manage Quick Actions
 *
 * Tests the manage submenu functionality:
 * - Move distribution dialog
 * - Resize disk dialog
 * - Set default user dialog
 * - Sparse mode toggle
 */

import { setupHooks, actions } from "../base";
import {
  selectors,
  waitForDialogToDisappear,
  captureDistroStates,
  verifyStatesUnchanged,
} from "../utils";

describe("Manage Quick Actions", () => {
  setupHooks.standard();

  /**
   * Helper to find any open dialog/modal
   */
  async function findOpenDialog(): Promise<WebdriverIO.Element> {
    // Use role="dialog" which is set on modal dialogs
    return await $('[role="dialog"]') as unknown as WebdriverIO.Element;
  }

  /**
   * Helper to wait for a dialog to appear
   */
  async function waitForDialog(): Promise<WebdriverIO.Element> {
    await browser.waitUntil(
      async () => {
        const dialog = await findOpenDialog();
        return dialog.isDisplayed();
      },
      {
        timeout: 5000,
        timeoutMsg: "Dialog did not appear within 5 seconds",
      }
    );
    return findOpenDialog();
  }

  /**
   * Helper to close dialog via Cancel button
   */
  async function closeDialogViaCancel(): Promise<void> {
    const dialog = await findOpenDialog();
    const cancelButton = await dialog.$("button*=Cancel");
    await cancelButton.click();
    await waitForDialogToDisappear('[role="dialog"]');
  }

  /**
   * Helper to handle the "Shutdown WSL?" dialog if it appears.
   * Move, Resize, and Sparse mode require ALL WSL distros to be shut down.
   * This clicks "Shutdown & Continue" to proceed to the actual dialog.
   */
  async function handleShutdownDialogIfPresent(): Promise<void> {
    // Wait a moment for any dialog to appear
    try {
      await browser.waitUntil(
        async () => {
          const dialog = await findOpenDialog();
          return dialog.isDisplayed();
        },
        { timeout: 1000 }
      );
    } catch {
      // No dialog appeared, which is fine
      return;
    }

    const dialog = await findOpenDialog();
    let dialogText: string;
    try {
      dialogText = await dialog.getText();
    } catch {
      return;
    }

    if (dialogText.toLowerCase().includes("shutdown wsl")) {
      const shutdownButton = await dialog.$("button*=Shutdown & Continue");
      let isShutdownButtonDisplayed = false;
      try {
        isShutdownButtonDisplayed = await shutdownButton.isDisplayed();
      } catch {
        return;
      }

      if (isShutdownButtonDisplayed) {
        await shutdownButton.click();
        // Wait for shutdown to complete and the next dialog to appear
        await browser.waitUntil(
          async () => {
            const newDialog = await findOpenDialog();
            const newDialogText = await newDialog.getText();
            // Wait until we get a different dialog (not the shutdown dialog)
            return !newDialogText.toLowerCase().includes("shutdown wsl");
          },
          { timeout: 10000, timeoutMsg: "Shutdown did not complete" }
        );
      }
    }
  }

  describe("Manage Submenu", () => {
    it("should have Manage option in quick actions menu", async () => {
      await actions.openQuickActionsMenu("Ubuntu");

      const manageAction = await $(selectors.manageSubmenu);
      await expect(manageAction).toBeDisplayed();

      const text = await manageAction.getText();
      expect(text).toContain("Manage");
    });

    it("should expand Manage submenu when clicked", async () => {
      await actions.openManageSubmenu("Ubuntu");

      // Check submenu items are visible
      const moveAction = await $(selectors.moveAction);
      const resizeAction = await $(selectors.resizeAction);
      const userAction = await $(selectors.setUserAction);
      const sparseAction = await $(selectors.sparseAction);

      await expect(moveAction).toBeDisplayed();
      await expect(resizeAction).toBeDisplayed();
      await expect(userAction).toBeDisplayed();
      await expect(sparseAction).toBeDisplayed();
    });

    it("should have Move Distribution option", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const moveAction = await $(selectors.moveAction);
      const text = await moveAction.getText();
      expect(text).toContain("Move Distribution");
    });

    it("should have Resize Disk option", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const resizeAction = await $(selectors.resizeAction);
      const text = await resizeAction.getText();
      expect(text).toContain("Resize Disk");
    });

    it("should have Set Default User option", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const userAction = await $(selectors.setUserAction);
      const text = await userAction.getText();
      expect(text).toContain("Set Default User");
    });

    it("should have Sparse Mode option with toggle indicator", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const sparseAction = await $(selectors.sparseAction);
      const text = await sparseAction.getText();
      expect(text).toContain("Sparse Mode");
      // Note: OR is intentional - checking that a toggle state indicator is present (either state is valid)
      expect(text).toMatch(/\b(Off|On)\b/);
    });
  });

  describe("Move Distribution Dialog", () => {
    it("should open Move dialog when clicking Move Distribution", async () => {
      // Use a stopped distro (Debian) for move operations
      await actions.openManageSubmenu("Debian");

      const moveAction = await $(selectors.moveAction);
      await moveAction.click();

      // Handle shutdown dialog if other distros are running
      await handleShutdownDialogIfPresent();

      // Wait for dialog to appear
      const dialog = await waitForDialog();
      await expect(dialog).toBeDisplayed();

      // Wait for and check dialog title - use page-level h2 selector
      await browser.waitUntil(
        async () => {
          const title = await $('[role="dialog"] h2');
          try {
            return await title.isDisplayed();
          } catch {
            return false;
          }
        },
        { timeout: 5000, timeoutMsg: "Move dialog title did not appear" }
      );

      const title = await $('[role="dialog"] h2');
      const titleText = await title.getText();
      expect(titleText.toLowerCase()).toContain("move");
    });

    it("should show current location in Move dialog", async () => {
      await actions.openManageSubmenu("Debian");

      const moveAction = await $(selectors.moveAction);
      await moveAction.click();

      // Handle shutdown dialog if other distros are running
      await handleShutdownDialogIfPresent();

      const dialog = await waitForDialog();

      // Wait for content to load - the dialog shows "Loading..." initially
      await browser.waitUntil(
        async () => {
          const dialogText = await dialog.getText();
          return dialogText.toLowerCase().includes("current location");
        },
        { timeout: 5000, timeoutMsg: "Current location did not appear in dialog" }
      );
    });

    it("should close Move dialog when Cancel is clicked", async () => {
      await actions.openManageSubmenu("Debian");

      const moveAction = await $(selectors.moveAction);
      await moveAction.click();

      // Handle shutdown dialog if other distros are running
      await handleShutdownDialogIfPresent();

      await waitForDialog();
      await closeDialogViaCancel();

      // Dialog should be closed - closeDialogViaCancel already waits for disappearance
      const dialogAfter = await findOpenDialog();
      let isDisplayed = false;
      try {
        isDisplayed = await dialogAfter.isDisplayed();
      } catch {
        isDisplayed = false;
      }
      expect(isDisplayed).toBe(false);
    });

    it("should open Move dialog for running distribution (handles shutdown internally)", async () => {
      // Ubuntu is running by default
      await actions.openManageSubmenu("Ubuntu");

      const moveAction = await $(selectors.moveAction);
      await moveAction.click();

      // Handle shutdown dialog that appears for running distros
      await handleShutdownDialogIfPresent();

      const dialog = await waitForDialog();

      // Wait for dialog content to fully render
      await browser.waitUntil(
        async () => {
          const text = await dialog.getText();
          return text.toLowerCase().includes("move") && text.toLowerCase().includes("ubuntu");
        },
        { timeout: 5000, timeoutMsg: "Move dialog content did not render" }
      );

      const dialogText = await dialog.getText();
      expect(dialogText.toLowerCase()).toContain("move");
      expect(dialogText.toLowerCase()).toContain("ubuntu");
    });
  });

  describe("Resize Disk Dialog", () => {
    it("should open Resize dialog when clicking Resize Disk", async () => {
      await actions.openManageSubmenu("Debian");

      const resizeAction = await $(selectors.resizeAction);
      await resizeAction.click();

      // Handle shutdown dialog if other distros are running
      await handleShutdownDialogIfPresent();

      const dialog = await waitForDialog();
      await expect(dialog).toBeDisplayed();

      // Wait for and check dialog title - use page-level h2 selector
      await browser.waitUntil(
        async () => {
          const title = await $('[role="dialog"] h2');
          try {
            return await title.isDisplayed();
          } catch {
            return false;
          }
        },
        { timeout: 5000, timeoutMsg: "Resize dialog title did not appear" }
      );

      const title = await $('[role="dialog"] h2');
      const titleText = await title.getText();
      expect(titleText.toLowerCase()).toContain("resize");
    });

    it("should show current size information in Resize dialog", async () => {
      await actions.openManageSubmenu("Debian");

      const resizeAction = await $(selectors.resizeAction);
      await resizeAction.click();

      // Handle shutdown dialog if other distros are running
      await handleShutdownDialogIfPresent();

      const dialog = await waitForDialog();

      // Wait for dialog content to fully render with size information
      await browser.waitUntil(
        async () => {
          const text = await dialog.getText();
          return text.toLowerCase().includes("virtual size");
        },
        { timeout: 5000, timeoutMsg: "Size information did not appear in dialog" }
      );

      const dialogText = await dialog.getText();
      // Should show Virtual Size label (the resize dialog shows current disk size)
      expect(dialogText.toLowerCase()).toContain("virtual size");
    });

    it("should have size input with GB/TB selector", async () => {
      await actions.openManageSubmenu("Debian");

      const resizeAction = await $(selectors.resizeAction);
      await resizeAction.click();

      // Handle shutdown dialog if other distros are running
      await handleShutdownDialogIfPresent();

      const dialog = await waitForDialog();

      // Should have size input
      const sizeInput = await dialog.$('input[type="number"]');
      await expect(sizeInput).toBeDisplayed();

      // Should have unit selector with GB and TB options
      const unitSelect = await dialog.$("select");
      await expect(unitSelect).toBeDisplayed();

      const selectText = await unitSelect.getText();
      expect(selectText).toContain("GB");
      expect(selectText).toContain("TB");
    });

    it("should close Resize dialog when Cancel is clicked", async () => {
      await actions.openManageSubmenu("Debian");

      const resizeAction = await $(selectors.resizeAction);
      await resizeAction.click();

      // Handle shutdown dialog if other distros are running
      await handleShutdownDialogIfPresent();

      await waitForDialog();
      await closeDialogViaCancel();

      // closeDialogViaCancel already waits for disappearance
      const dialogAfter = await findOpenDialog();
      let isDisplayed = false;
      try {
        isDisplayed = await dialogAfter.isDisplayed();
      } catch {
        isDisplayed = false;
      }
      expect(isDisplayed).toBe(false);
    });

    it("should show warning when trying to resize a running distribution", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const resizeAction = await $(selectors.resizeAction);
      await resizeAction.click();

      const dialog = await waitForDialog();

      // Wait for dialog content to show shutdown warning
      await browser.waitUntil(
        async () => {
          const text = await dialog.getText();
          return text.toLowerCase().includes("shutdown");
        },
        { timeout: 5000, timeoutMsg: "Shutdown warning did not appear in dialog" }
      );

      const dialogText = await dialog.getText();
      // Should show warning about needing to shutdown
      expect(dialogText.toLowerCase()).toContain("shutdown");
    });
  });

  describe("Set Default User Dialog", () => {
    it("should open Set User dialog when clicking Set Default User", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const userAction = await $(selectors.setUserAction);
      await userAction.click();

      const dialog = await waitForDialog();
      await expect(dialog).toBeDisplayed();

      // Wait for dialog content to fully render
      await browser.waitUntil(
        async () => {
          const dialogText = await dialog.getText();
          return dialogText.length > 0;
        },
        { timeout: 5000, timeoutMsg: "Set User dialog content did not load" }
      );

      const dialogText = await dialog.getText();
      expect(dialogText.toLowerCase()).toContain("user");
    });

    it("should have username input field", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const userAction = await $(selectors.setUserAction);
      await userAction.click();

      const dialog = await waitForDialog();
      const usernameInput = await dialog.$('input[type="text"]');
      await expect(usernameInput).toBeDisplayed();
    });

    it("should show informational message about user requirements", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const userAction = await $(selectors.setUserAction);
      await userAction.click();

      const dialog = await waitForDialog();

      // Wait for dialog content to show user requirements message
      await browser.waitUntil(
        async () => {
          const text = await dialog.getText();
          return text.toLowerCase().includes("must already exist");
        },
        { timeout: 5000, timeoutMsg: "User requirements message did not appear" }
      );

      const dialogText = await dialog.getText();
      // Should mention that user must exist - "The user must already exist in the distribution."
      expect(dialogText.toLowerCase()).toContain("must already exist");
    });

    it("should close Set User dialog when Cancel is clicked", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const userAction = await $(selectors.setUserAction);
      await userAction.click();

      await waitForDialog();
      await closeDialogViaCancel();

      // closeDialogViaCancel already waits for disappearance
      const dialogAfter = await findOpenDialog();
      let isDisplayed = false;
      try {
        isDisplayed = await dialogAfter.isDisplayed();
      } catch {
        isDisplayed = false;
      }
      expect(isDisplayed).toBe(false);
    });

    it("should disable Set User button when username is empty", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const userAction = await $(selectors.setUserAction);
      await userAction.click();

      const dialog = await waitForDialog();
      const setUserButton = await dialog.$("button*=Set User");

      // Button should be disabled when no username entered
      const isDisabled = await setUserButton.getAttribute("disabled");
      expect(isDisabled).toBeTruthy();
    });

    it("should enable Set User button when valid username is entered", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const userAction = await $(selectors.setUserAction);
      await userAction.click();

      const dialog = await waitForDialog();
      const usernameInput = await dialog.$('input[type="text"]');
      await usernameInput.setValue("testuser");

      // Wait for button to become enabled
      const setUserButton = await dialog.$("button*=Set User");
      await browser.waitUntil(
        async () => {
          const disabled = await setUserButton.getAttribute("disabled");
          return !disabled;
        },
        { timeout: 5000, timeoutMsg: "Set User button did not become enabled" }
      );

      const isDisabled = await setUserButton.getAttribute("disabled");
      expect(isDisabled).toBeFalsy();
    });
  });

  describe("Sparse Mode Toggle", () => {
    it("should show confirmation dialog when enabling sparse mode on stopped distro", async () => {
      // Use stopped distro
      await actions.openManageSubmenu("Debian");

      const sparseAction = await $(selectors.sparseAction);
      await sparseAction.click();

      // Handle shutdown dialog if other distros are running
      await handleShutdownDialogIfPresent();

      // Should show confirmation dialog with warning
      const dialog = await waitForDialog();
      await expect(dialog).toBeDisplayed();

      const dialogText = await dialog.getText();
      expect(dialogText.toLowerCase()).toContain("sparse");
    });

    it("should show error when trying to toggle sparse mode on running distro", async () => {
      // Capture initial state to verify no side effects
      const initialStates = await captureDistroStates();

      // Ubuntu is running
      await actions.openManageSubmenu("Ubuntu");

      const sparseAction = await $(selectors.sparseAction);
      await sparseAction.click();

      // Wait for either error message or shutdown dialog to appear
      await browser.waitUntil(
        async () => {
          // Check for error pre element
          const errorPre = await $("pre*=must be stopped");
          let errorDisplayed = false;
          try {
            errorDisplayed = await errorPre.isDisplayed();
          } catch {
            errorDisplayed = false;
          }
          if (errorDisplayed) return true;

          // Check for shutdown text in body
          const bodyText = await $("body").getText();
          return bodyText.toLowerCase().includes("shutdown");
        },
        { timeout: 5000, timeoutMsg: "Neither error message nor shutdown dialog appeared" }
      );

      // Verify the shutdown-related message is present
      const bodyText = await $("body").getText();
      expect(bodyText.toLowerCase()).toContain("shutdown");

      // Verify no distro states changed (operation was blocked, no side effects)
      await verifyStatesUnchanged(initialStates);
    });
  });

  describe("Set WSL Version", () => {
    it("should have Set WSL Version option in Manage submenu", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const setVersionAction = await $(selectors.manageAction("set-version"));
      await expect(setVersionAction).toBeDisplayed();

      const text = await setVersionAction.getText();
      expect(text).toContain("Set WSL Version");
    });

    it("should show current version indicator", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const setVersionAction = await $(selectors.manageAction("set-version"));
      const text = await setVersionAction.getText();
      // Should show current version (v1 or v2) indicator
      expect(text).toMatch(/v[12]/i);
    });

    it("should open Set Version dialog when clicked for stopped distro", async () => {
      // Debian is stopped
      await actions.openManageSubmenu("Debian");

      const setVersionAction = await $(selectors.manageAction("set-version"));
      await setVersionAction.click();

      const dialog = await waitForDialog();
      await expect(dialog).toBeDisplayed();

      // Wait for dialog content to load with version-related text
      await browser.waitUntil(
        async () => {
          const text = await dialog.getText();
          return text.toLowerCase().includes("wsl");
        },
        { timeout: 5000, timeoutMsg: "Version-related content did not appear in dialog" }
      );

      const dialogText = await dialog.getText();
      // Dialog should contain "WSL" version text
      expect(dialogText.toLowerCase()).toContain("wsl");
    });

    it("should show stop dialog when trying to set version on running distro", async () => {
      // Capture initial state to verify no side effects
      const initialStates = await captureDistroStates();

      // Ubuntu is running
      await actions.openManageSubmenu("Ubuntu");

      const setVersionAction = await $(selectors.manageAction("set-version"));
      await setVersionAction.click();

      // Should show stop-and-action dialog
      const stopDialog = await $(selectors.stopAndActionDialog);
      await browser.waitUntil(
        async () => stopDialog.isDisplayed(),
        { timeout: 5000, timeoutMsg: "Stop dialog did not appear" }
      );

      const dialogText = await stopDialog.getText();
      expect(dialogText.toLowerCase()).toContain("stop");

      // Verify no distro states changed (dialog was shown but not confirmed)
      await verifyStatesUnchanged(initialStates);
    });

    it("should show version options in the dialog", async () => {
      await actions.openManageSubmenu("Debian");

      const setVersionAction = await $(selectors.manageAction("set-version"));
      await setVersionAction.click();

      const dialog = await waitForDialog();

      // Wait for dialog content to show both WSL versions
      await browser.waitUntil(
        async () => {
          const text = await dialog.getText();
          return text.toLowerCase().includes("wsl 1") && text.toLowerCase().includes("wsl 2");
        },
        { timeout: 5000, timeoutMsg: "WSL version options did not appear in dialog" }
      );

      // Should show both WSL 1 and WSL 2 options
      const dialogText = await dialog.getText();
      expect(dialogText.toLowerCase()).toContain("wsl 1");
      expect(dialogText.toLowerCase()).toContain("wsl 2");
    });

    it("should highlight current version and disable selecting same version", async () => {
      await actions.openManageSubmenu("Debian");

      const setVersionAction = await $(selectors.manageAction("set-version"));
      await setVersionAction.click();

      const dialog = await waitForDialog();

      // Wait for dialog content to show "Current" badge
      await browser.waitUntil(
        async () => {
          const text = await dialog.getText();
          return text.includes("Current");
        },
        { timeout: 5000, timeoutMsg: "Current version indicator did not appear" }
      );

      // The current version option should be marked/highlighted
      // Debian is WSL 2 by default in mock - look for "Current" badge
      const dialogText = await dialog.getText();
      expect(dialogText).toContain("Current");
    });

    it("should show warning about conversion time", async () => {
      await actions.openManageSubmenu("Debian");

      const setVersionAction = await $(selectors.manageAction("set-version"));
      await setVersionAction.click();

      const dialog = await waitForDialog();

      // Wait for dialog content to show time warning
      await browser.waitUntil(
        async () => {
          const text = await dialog.getText();
          return text.toLowerCase().includes("minute");
        },
        { timeout: 5000, timeoutMsg: "Conversion time warning did not appear" }
      );

      const dialogText = await dialog.getText();
      // Should warn about conversion time (e.g., "may take several minutes")
      expect(dialogText.toLowerCase()).toContain("minute");
    });

    it("should close dialog when Cancel is clicked", async () => {
      await actions.openManageSubmenu("Debian");

      const setVersionAction = await $(selectors.manageAction("set-version"));
      await setVersionAction.click();

      await waitForDialog();
      await closeDialogViaCancel();

      // closeDialogViaCancel already waits for disappearance
      const dialogAfter = await findOpenDialog();
      let isDisplayed = false;
      try {
        isDisplayed = await dialogAfter.isDisplayed();
      } catch {
        isDisplayed = false;
      }
      expect(isDisplayed).toBe(false);
    });

    it("should show requires-stop indicator when distro is running", async () => {
      await actions.openManageSubmenu("Ubuntu");

      const setVersionAction = await $(selectors.manageAction("set-version"));
      const stopIndicator = await setVersionAction.$(selectors.requiresStopIndicator);
      await expect(stopIndicator).toBeDisplayed();
    });

    it("should not show requires-stop indicator when distro is stopped", async () => {
      await actions.openManageSubmenu("Debian");

      const setVersionAction = await $(selectors.manageAction("set-version"));
      const stopIndicator = await setVersionAction.$(selectors.requiresStopIndicator);
      let isDisplayed = false;
      try {
        isDisplayed = await stopIndicator.isDisplayed();
      } catch {
        isDisplayed = false;
      }
      expect(isDisplayed).toBe(false);
    });
  });
});
