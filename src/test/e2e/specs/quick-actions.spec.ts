/**
 * E2E Tests for Quick Actions Menu
 *
 * Tests the quick actions menu functionality:
 * - Opening the menu
 * - Available actions (terminal, IDE, explorer, etc.)
 * - Action execution and verification
 */

import {
  selectors,
  waitForDistroState,
  waitForDialog,
  waitForDialogToDisappear,
  verifyDistroCardState,
  mockDistributions,
} from "../utils";
import { setupHooks, actions } from "../base";

describe("Quick Actions Menu", () => {
  setupHooks.standard();

  /**
   * Helper to close menu by clicking outside.
   * This is specific to this test file for verifying click-outside behavior.
   * Note: actions.closeQuickActionsMenu uses Escape key instead.
   */
  async function closeMenuByClickingOutside(): Promise<void> {
    const main = await $("main");
    await main.click();
    // Wait for menu to disappear
    await browser.waitUntil(
      async () => {
        const menu = await $(selectors.quickActionsMenu);
        try {
          return !(await menu.isDisplayed());
        } catch {
          return true;
        }
      },
      { timeout: 3000, timeoutMsg: "Menu did not close" }
    );
  }

  describe("Menu Toggle", () => {
    it("should have quick actions button on distro cards", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$(selectors.quickActionsButton);
      await expect(quickActionsButton).toBeDisplayed();
    });

    it("should open quick actions menu when clicked", async () => {
      await actions.openQuickActionsMenu("Ubuntu");
      const menu = await $(selectors.quickActionsMenu);
      await expect(menu).toBeDisplayed();
    });

    it("should close menu when clicking outside", async () => {
      await actions.openQuickActionsMenu("Ubuntu");
      const menu = await $(selectors.quickActionsMenu);
      await expect(menu).toBeDisplayed();

      // Click outside to close (testing specific click-outside behavior)
      await closeMenuByClickingOutside();

      const menuAfter = await $(selectors.quickActionsMenu);
      let isDisplayed = false;
      try {
        isDisplayed = await menuAfter.isDisplayed();
      } catch {
        isDisplayed = false;
      }
      expect(isDisplayed).toBe(false);
    });
  });

  describe("Available Actions", () => {
    beforeEach(async () => {
      await actions.openQuickActionsMenu("Ubuntu");
    });

    it("should have Open File Explorer action", async () => {
      const action = await $(selectors.explorerAction);
      await expect(action).toBeDisplayed();
    });

    it("should have Open in IDE action", async () => {
      const action = await $(selectors.ideAction);
      await expect(action).toBeDisplayed();
    });

    it("should have Restart action", async () => {
      const action = await $(selectors.restartAction);
      await expect(action).toBeDisplayed();
    });

    it("should have Export action", async () => {
      const action = await $(selectors.exportAction);
      await expect(action).toBeDisplayed();
    });

    it("should have Clone action", async () => {
      const action = await $(selectors.cloneAction);
      await expect(action).toBeDisplayed();
    });

    it("should have Set as Default action", async () => {
      const action = await $(selectors.setDefaultAction);
      await expect(action).toBeDisplayed();
    });
  });

  describe("Clone Dialog", () => {
    it("should open clone dialog when Clone action is clicked", async () => {
      // Use stopped distro to avoid stop confirmation
      await actions.openQuickActionsMenu("Debian");

      const cloneAction = await $(selectors.cloneAction);
      await expect(cloneAction).toBeDisplayed();
      await cloneAction.click();

      // Clone dialog should open
      const dialog = await waitForDialog(selectors.cloneDialog, 5000);
      await expect(dialog).toBeDisplayed();

      // Verify clone dialog has expected elements
      const nameInput = await $(selectors.cloneNameInput);
      await expect(nameInput).toBeDisplayed();

      // Verify it has a suggested name based on source
      const suggestedName = await nameInput.getValue();
      expect(suggestedName).toContain("Debian");

      // Cancel to clean up
      const cancelButton = await $(selectors.cloneCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.cloneDialog, 3000);
    });

    it("should show stop dialog when cloning running distribution", async () => {
      // Ubuntu is running
      await verifyDistroCardState("Ubuntu", "ONLINE");

      await actions.openQuickActionsMenu("Ubuntu");

      const cloneAction = await $(selectors.cloneAction);
      await cloneAction.click();

      // Should show stop confirmation dialog first
      const stopDialog = await waitForDialog(selectors.stopAndActionDialog, 5000);
      const dialogText = await stopDialog.getText();
      expect(dialogText.toLowerCase()).toContain("stop");

      // Cancel
      const cancelButton = await $(selectors.stopDialogCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.stopAndActionDialog, 3000);
    });
  });

  describe("Set Default", () => {
    it("should have Set Default action available", async () => {
      // Debian is not default initially
      await actions.openQuickActionsMenu("Debian");

      const defaultAction = await $(selectors.setDefaultAction);
      await expect(defaultAction).toBeDisplayed();

      // Verify text says "Set as Default" (not disabled)
      const text = await defaultAction.getText();
      expect(text).toContain("Set as Default");
    });

    it("should change default distribution when Set Default is clicked", async () => {
      // Ubuntu is default initially
      const defaultDistro = mockDistributions.find(d => d.isDefault);
      expect(defaultDistro?.name).toBe("Ubuntu");

      // Set Debian as default
      await actions.openQuickActionsMenu("Debian");

      const defaultAction = await $(selectors.setDefaultAction);
      await defaultAction.click();

      // Wait for Debian to show as primary
      await browser.waitUntil(
        async () => {
          const debianCard = await $(selectors.distroCardByName("Debian"));
          const text = await debianCard.getText();
          return text.toLowerCase().includes("primary");
        },
        { timeout: 5000, timeoutMsg: "Debian did not become primary" }
      );

      // Verify Debian now shows as primary (default)
      const debianCardAfter = await $(selectors.distroCardByName("Debian"));
      const debianText = await debianCardAfter.getText();
      expect(debianText.toLowerCase()).toContain("primary");

      // Verify Ubuntu no longer shows as primary
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const ubuntuText = await ubuntuCard.getText();
      expect(ubuntuText.toLowerCase()).not.toContain("primary");
    });
  });

  describe("Restart Action", () => {
    it("should restart a running distribution", async () => {
      // Ubuntu is running
      await verifyDistroCardState("Ubuntu", "ONLINE");

      await actions.openQuickActionsMenu("Ubuntu");

      const restartAction = await $(selectors.restartAction);
      await restartAction.click();

      // After restart, should be running again
      await waitForDistroState("Ubuntu", "ONLINE", 15000);
    });
  });

  describe("Action Execution Verification", () => {
    it("should close menu after action is executed", async () => {
      await actions.openQuickActionsMenu("Debian");

      // Menu should be open
      const menu = await $(selectors.quickActionsMenu);
      await expect(menu).toBeDisplayed();

      // Click an action that doesn't open a dialog (Set Default)
      const defaultAction = await $(selectors.setDefaultAction);
      await defaultAction.click();

      // Wait for menu to close after action
      await browser.waitUntil(
        async () => {
          const menuAfter = await $(selectors.quickActionsMenu);
          try {
            return !(await menuAfter.isDisplayed());
          } catch {
            return true;
          }
        },
        { timeout: 5000, timeoutMsg: "Menu did not close after action" }
      );

      // Menu should close after action
      const menuAfter = await $(selectors.quickActionsMenu);
      let isMenuVisible = false;
      try {
        isMenuVisible = await menuAfter.isDisplayed();
      } catch {
        isMenuVisible = false;
      }
      expect(isMenuVisible).toBe(false);
    });

    it("should disable actions during operation", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$(selectors.quickActionsButton);

      // Start an operation (stop)
      const stopButton = await ubuntuCard.$(selectors.stopButton);
      await stopButton.click();

      // Quick actions button should be disabled during operation
      const isDisabled = await quickActionsButton.getAttribute("disabled");
      expect(isDisabled).not.toBeNull();

      // Wait for operation to complete
      await waitForDistroState("Ubuntu", "OFFLINE", 10000);
    });
  });

  describe("Distribution Info Dialog", () => {
    /**
     * Helper to open info dialog for a distro.
     * This is specific to this test file for info dialog tests.
     */
    async function openInfoDialog(distroName: string): Promise<void> {
      await actions.openQuickActionsMenu(distroName);

      const infoAction = await $(selectors.infoAction);
      await infoAction.click();

      await waitForDialog(selectors.distroInfoDialog, 5000);
    }

    it("should have Distribution Info action in quick actions menu", async () => {
      await actions.openQuickActionsMenu("Ubuntu");

      const infoAction = await $(selectors.infoAction);
      await expect(infoAction).toBeDisplayed();

      const text = await infoAction.getText();
      expect(text).toContain("Distribution Info");
    });

    it("should open info dialog when Distribution Info action is clicked", async () => {
      await openInfoDialog("Ubuntu");

      const infoDialog = await $(selectors.distroInfoDialog);
      await expect(infoDialog).toBeDisplayed();
    });

    it("should display distribution name in info dialog", async () => {
      await openInfoDialog("Ubuntu");

      const infoDialog = await $(selectors.distroInfoDialog);
      await expect(infoDialog).toBeDisplayed();

      // Check name is displayed
      const nameRow = await $(selectors.infoName);
      const nameText = await nameRow.getText();
      expect(nameText).toContain("Ubuntu");
    });

    it("should display distribution ID (GUID) in info dialog", async () => {
      await openInfoDialog("Ubuntu");

      // Check ID is displayed (mock returns GUIDs like {mock-guid-XXXX-...})
      const idRow = await $(selectors.infoId);
      const idText = await idRow.getText();
      expect(idText).toMatch(/\{.*\}/); // Contains a GUID-like format
    });

    it("should display WSL version in info dialog", async () => {
      await openInfoDialog("Ubuntu");

      const versionRow = await $(selectors.infoVersion);
      const versionText = await versionRow.getText();
      expect(versionText).toMatch(/WSL [12]/);
    });

    it("should display install location in info dialog", async () => {
      await openInfoDialog("Ubuntu");

      // Mock location is like C:\Users\MockUser\AppData\Local\Packages\Ubuntu
      const locationRow = await $(selectors.infoLocation);
      const locationText = await locationRow.getText();
      expect(locationText).toContain("Ubuntu");
    });

    it("should display disk size in info dialog", async () => {
      await openInfoDialog("Ubuntu");

      // Mock disk size for Ubuntu is 8GB
      const diskRow = await $(selectors.infoDiskSize);
      const diskText = await diskRow.getText();
      expect(diskText).toMatch(/GB|MB/); // Contains a size unit
    });

    it("should display install source in info dialog", async () => {
      await openInfoDialog("Ubuntu");

      // Ubuntu's mock source is "store" which displays as "Microsoft Store"
      const sourceRow = await $(selectors.infoSource);
      const sourceText = await sourceRow.getText();
      expect(sourceText.length).toBeGreaterThan(0);
    });

    it("should close info dialog when close button is clicked", async () => {
      await openInfoDialog("Ubuntu");

      const infoDialog = await $(selectors.distroInfoDialog);
      await expect(infoDialog).toBeDisplayed();

      // Click close button
      const closeButton = await $(selectors.infoCloseButton);
      await closeButton.click();
      await waitForDialogToDisappear(selectors.distroInfoDialog, 3000);

      // Dialog should be closed
      const dialogAfter = await $(selectors.distroInfoDialog);
      let isDisplayed = false;
      try {
        isDisplayed = await dialogAfter.isDisplayed();
      } catch {
        isDisplayed = false;
      }
      expect(isDisplayed).toBe(false);
    });

    it("should close info dialog when Escape key is pressed", async () => {
      await openInfoDialog("Ubuntu");

      const infoDialog = await $(selectors.distroInfoDialog);
      await expect(infoDialog).toBeDisplayed();

      // Press Escape
      await browser.keys("Escape");
      await waitForDialogToDisappear(selectors.distroInfoDialog, 3000);

      // Dialog should be closed
      const dialogAfter = await $(selectors.distroInfoDialog);
      let isDisplayed = false;
      try {
        isDisplayed = await dialogAfter.isDisplayed();
      } catch {
        isDisplayed = false;
      }
      expect(isDisplayed).toBe(false);
    });
  });
});




