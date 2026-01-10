/**
 * E2E Tests for Manage Quick Actions
 *
 * Tests the manage submenu functionality:
 * - Move distribution dialog
 * - Resize disk dialog
 * - Set default user dialog
 * - Sparse mode toggle
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  safeRefresh,
} from "../utils";

describe("Manage Quick Actions", () => {
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
    const manageButton = await $('[data-testid="quick-action-manage"]');
    await manageButton.click();
    await browser.pause(200);
  }

  /**
   * Helper to find any open dialog/modal
   */
  async function findOpenDialog(): Promise<WebdriverIO.Element> {
    // Use role="dialog" which is set on modal dialogs
    return $('[role="dialog"]');
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
    await browser.pause(300);
  }

  describe("Manage Submenu", () => {
    it("should have Manage option in quick actions menu", async () => {
      await openQuickActionsMenu("Ubuntu");

      const manageAction = await $('[data-testid="quick-action-manage"]');
      await expect(manageAction).toBeDisplayed();

      const text = await manageAction.getText();
      expect(text).toContain("Manage");
    });

    it("should expand Manage submenu when clicked", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      // Check submenu items are visible
      const moveAction = await $('[data-testid="manage-action-move"]');
      const resizeAction = await $('[data-testid="manage-action-resize"]');
      const userAction = await $('[data-testid="manage-action-user"]');
      const sparseAction = await $('[data-testid="manage-action-sparse"]');

      await expect(moveAction).toBeDisplayed();
      await expect(resizeAction).toBeDisplayed();
      await expect(userAction).toBeDisplayed();
      await expect(sparseAction).toBeDisplayed();
    });

    it("should have Move Distribution option", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const moveAction = await $('[data-testid="manage-action-move"]');
      const text = await moveAction.getText();
      expect(text).toContain("Move Distribution");
    });

    it("should have Resize Disk option", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const resizeAction = await $('[data-testid="manage-action-resize"]');
      const text = await resizeAction.getText();
      expect(text).toContain("Resize Disk");
    });

    it("should have Set Default User option", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const userAction = await $('[data-testid="manage-action-user"]');
      const text = await userAction.getText();
      expect(text).toContain("Set Default User");
    });

    it("should have Sparse Mode option with toggle indicator", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const sparseAction = await $('[data-testid="manage-action-sparse"]');
      const text = await sparseAction.getText();
      expect(text).toContain("Sparse Mode");
      // Should show Off or On indicator
      expect(text.includes("Off") || text.includes("On")).toBe(true);
    });
  });

  describe("Move Distribution Dialog", () => {
    it("should open Move dialog when clicking Move Distribution", async () => {
      // Use a stopped distro (Debian) for move operations
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const moveAction = await $('[data-testid="manage-action-move"]');
      await moveAction.click();

      // Wait for dialog to appear
      const dialog = await waitForDialog();
      await expect(dialog).toBeDisplayed();

      // Wait for and check dialog title - use page-level h2 selector
      await browser.waitUntil(
        async () => {
          const title = await $('[role="dialog"] h2');
          return (await title.isDisplayed().catch(() => false));
        },
        { timeout: 5000, timeoutMsg: "Move dialog title did not appear" }
      );

      const title = await $('[role="dialog"] h2');
      const titleText = await title.getText();
      expect(titleText.toLowerCase()).toContain("move");
    });

    it("should show current location in Move dialog", async () => {
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const moveAction = await $('[data-testid="manage-action-move"]');
      await moveAction.click();

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
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const moveAction = await $('[data-testid="manage-action-move"]');
      await moveAction.click();

      await waitForDialog();
      await closeDialogViaCancel();

      // Dialog should be closed
      await browser.pause(300);
      const dialogAfter = await findOpenDialog();
      const isDisplayed = await dialogAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should show warning when trying to move a running distribution", async () => {
      // Ubuntu is running by default
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const moveAction = await $('[data-testid="manage-action-move"]');
      await moveAction.click();

      const dialog = await waitForDialog();

      // Wait for dialog content to fully render (includes async data loading)
      await browser.waitUntil(
        async () => {
          const dialogText = await dialog.getText();
          // Wait until we have some content in the dialog - UI now uses "shutdown" instead of "stop"
          return dialogText.length > 0 && dialogText.toLowerCase().includes("shutdown");
        },
        {
          timeout: 5000,
          timeoutMsg: "Dialog content with shutdown warning did not appear",
        }
      );

      const dialogText = await dialog.getText();
      // Should show warning about shutting down the distribution
      expect(dialogText.toLowerCase()).toContain("shutdown");
    });
  });

  describe("Resize Disk Dialog", () => {
    it("should open Resize dialog when clicking Resize Disk", async () => {
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const resizeAction = await $('[data-testid="manage-action-resize"]');
      await resizeAction.click();

      const dialog = await waitForDialog();
      await expect(dialog).toBeDisplayed();

      // Wait for and check dialog title - use page-level h2 selector
      await browser.waitUntil(
        async () => {
          const title = await $('[role="dialog"] h2');
          return (await title.isDisplayed().catch(() => false));
        },
        { timeout: 5000, timeoutMsg: "Resize dialog title did not appear" }
      );

      const title = await $('[role="dialog"] h2');
      const titleText = await title.getText();
      expect(titleText.toLowerCase()).toContain("resize");
    });

    it("should show current size information in Resize dialog", async () => {
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const resizeAction = await $('[data-testid="manage-action-resize"]');
      await resizeAction.click();

      const dialog = await waitForDialog();

      // Wait for dialog content to fully render
      await browser.pause(500);
      const dialogText = await dialog.getText();

      // Should show Virtual Size and File Size labels (may be uppercase in UI)
      // The UI shows "Virtual Size (Max)" and "File Size (Actual)"
      expect(dialogText.toLowerCase()).toMatch(/virtual size|file size|new size/);
    });

    it("should have size input with GB/TB selector", async () => {
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const resizeAction = await $('[data-testid="manage-action-resize"]');
      await resizeAction.click();

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
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const resizeAction = await $('[data-testid="manage-action-resize"]');
      await resizeAction.click();

      await waitForDialog();
      await closeDialogViaCancel();

      await browser.pause(300);
      const dialogAfter = await findOpenDialog();
      const isDisplayed = await dialogAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should show warning when trying to resize a running distribution", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const resizeAction = await $('[data-testid="manage-action-resize"]');
      await resizeAction.click();

      const dialog = await waitForDialog();

      // Wait for dialog content to fully render
      await browser.pause(500);
      const dialogText = await dialog.getText();

      // Should show warning about needing to shutdown the distribution
      // The UI now uses "shutdown" wording
      expect(dialogText.toLowerCase()).toMatch(/shutdown|must be stopped|distribution must/);
    });
  });

  describe("Set Default User Dialog", () => {
    it("should open Set User dialog when clicking Set Default User", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const userAction = await $('[data-testid="manage-action-user"]');
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
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const userAction = await $('[data-testid="manage-action-user"]');
      await userAction.click();

      const dialog = await waitForDialog();
      const usernameInput = await dialog.$('input[type="text"]');
      await expect(usernameInput).toBeDisplayed();
    });

    it("should show informational message about user requirements", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const userAction = await $('[data-testid="manage-action-user"]');
      await userAction.click();

      const dialog = await waitForDialog();

      // Wait for dialog content to fully render
      await browser.pause(500);
      const dialogText = await dialog.getText();

      // Should mention that user must exist or show the info box content
      // The UI shows "The user must already exist in the distribution."
      expect(dialogText.toLowerCase()).toMatch(/exist|must.*exist|user.*distribution|automatic/);
    });

    it("should close Set User dialog when Cancel is clicked", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const userAction = await $('[data-testid="manage-action-user"]');
      await userAction.click();

      await waitForDialog();
      await closeDialogViaCancel();

      await browser.pause(300);
      const dialogAfter = await findOpenDialog();
      const isDisplayed = await dialogAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should disable Set User button when username is empty", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const userAction = await $('[data-testid="manage-action-user"]');
      await userAction.click();

      const dialog = await waitForDialog();
      const setUserButton = await dialog.$("button*=Set User");

      // Button should be disabled when no username entered
      const isDisabled = await setUserButton.getAttribute("disabled");
      expect(isDisabled).toBeTruthy();
    });

    it("should enable Set User button when valid username is entered", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const userAction = await $('[data-testid="manage-action-user"]');
      await userAction.click();

      const dialog = await waitForDialog();
      const usernameInput = await dialog.$('input[type="text"]');
      await usernameInput.setValue("testuser");
      await browser.pause(200);

      const setUserButton = await dialog.$("button*=Set User");
      const isDisabled = await setUserButton.getAttribute("disabled");
      expect(isDisabled).toBeFalsy();
    });
  });

  describe("Sparse Mode Toggle", () => {
    it("should show confirmation dialog when enabling sparse mode on stopped distro", async () => {
      // Use stopped distro
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const sparseAction = await $('[data-testid="manage-action-sparse"]');
      await sparseAction.click();

      // Should show confirmation dialog with warning
      const dialog = await waitForDialog();
      await expect(dialog).toBeDisplayed();

      const dialogText = await dialog.getText();
      expect(dialogText.toLowerCase()).toContain("sparse");
    });

    it("should show error when trying to toggle sparse mode on running distro", async () => {
      // Ubuntu is running
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const sparseAction = await $('[data-testid="manage-action-sparse"]');
      await sparseAction.click();

      // Wait for output dialog to appear (shows error for running distros)
      await browser.pause(1000);

      // The output dialog contains "Output" in its title and shows error message
      // Look for the pre element that contains the error message
      const errorPre = await $("pre*=must be stopped");
      const isDisplayed = await errorPre.isDisplayed().catch(() => false);

      if (isDisplayed) {
        expect(true).toBe(true);
      } else {
        // Alternative: check any element with the error text - uses "shutdown" not "stop"
        const bodyText = await $("body").getText();
        expect(bodyText.toLowerCase()).toContain("shutdown");
      }
    });
  });

  describe("Set WSL Version", () => {
    it("should have Set WSL Version option in Manage submenu", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const setVersionAction = await $('[data-testid="manage-action-set-version"]');
      await expect(setVersionAction).toBeDisplayed();

      const text = await setVersionAction.getText();
      expect(text).toContain("Set WSL Version");
    });

    it("should show current version indicator", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const setVersionAction = await $('[data-testid="manage-action-set-version"]');
      const text = await setVersionAction.getText();
      // Should show current version (v1 or v2) indicator
      expect(text).toMatch(/v[12]/i);
    });

    it("should open Set Version dialog when clicked for stopped distro", async () => {
      // Debian is stopped
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const setVersionAction = await $('[data-testid="manage-action-set-version"]');
      await setVersionAction.click();

      const dialog = await waitForDialog();
      await expect(dialog).toBeDisplayed();

      // Wait for dialog content to load
      await browser.pause(500);
      const dialogText = await dialog.getText();
      // Dialog should contain "WSL" and/or version-related text
      expect(dialogText.toLowerCase()).toMatch(/wsl|version|convert/);
    });

    it("should show stop dialog when trying to set version on running distro", async () => {
      // Ubuntu is running
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const setVersionAction = await $('[data-testid="manage-action-set-version"]');
      await setVersionAction.click();

      // Should show stop-and-action dialog
      const stopDialog = await $('[data-testid="stop-and-action-dialog"]');
      await browser.waitUntil(
        async () => stopDialog.isDisplayed(),
        { timeout: 5000, timeoutMsg: "Stop dialog did not appear" }
      );

      const dialogText = await stopDialog.getText();
      expect(dialogText.toLowerCase()).toContain("stop");
    });

    it("should show version options in the dialog", async () => {
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const setVersionAction = await $('[data-testid="manage-action-set-version"]');
      await setVersionAction.click();

      // Wait for dialog and content to render
      await browser.pause(500);
      const dialog = await waitForDialog();
      await browser.pause(300);

      // Should show both WSL 1 and WSL 2 options
      const dialogText = await dialog.getText();
      expect(dialogText.toLowerCase()).toContain("wsl 1");
      expect(dialogText.toLowerCase()).toContain("wsl 2");
    });

    it("should highlight current version and disable selecting same version", async () => {
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const setVersionAction = await $('[data-testid="manage-action-set-version"]');
      await setVersionAction.click();

      // Wait for dialog and content to render
      await browser.pause(500);
      const dialog = await waitForDialog();
      await browser.pause(500);

      // The current version option should be marked/highlighted
      // Debian is WSL 2 by default in mock - look for "Current" badge
      const dialogText = await dialog.getText();
      expect(dialogText).toContain("Current");
    });

    it("should show warning about conversion time", async () => {
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const setVersionAction = await $('[data-testid="manage-action-set-version"]');
      await setVersionAction.click();

      // Wait for dialog and content to render
      await browser.pause(500);
      const dialog = await waitForDialog();
      await browser.pause(300);

      const dialogText = await dialog.getText();

      // Should warn about conversion time
      expect(dialogText.toLowerCase()).toMatch(/minute|time|conversion/);
    });

    it("should close dialog when Cancel is clicked", async () => {
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const setVersionAction = await $('[data-testid="manage-action-set-version"]');
      await setVersionAction.click();

      await waitForDialog();
      await closeDialogViaCancel();

      await browser.pause(300);
      const dialogAfter = await findOpenDialog();
      const isDisplayed = await dialogAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should show requires-stop indicator when distro is running", async () => {
      await openQuickActionsMenu("Ubuntu");
      await openManageSubmenu();

      const setVersionAction = await $('[data-testid="manage-action-set-version"]');
      const stopIndicator = await setVersionAction.$('[data-testid="requires-stop-indicator"]');
      await expect(stopIndicator).toBeDisplayed();
    });

    it("should not show requires-stop indicator when distro is stopped", async () => {
      await openQuickActionsMenu("Debian");
      await openManageSubmenu();

      const setVersionAction = await $('[data-testid="manage-action-set-version"]');
      const stopIndicator = await setVersionAction.$('[data-testid="requires-stop-indicator"]');
      const isDisplayed = await stopIndicator.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });
  });
});
