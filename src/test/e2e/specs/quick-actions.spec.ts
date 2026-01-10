/**
 * E2E Tests for Quick Actions Menu
 *
 * Tests the quick actions menu functionality:
 * - Opening the menu
 * - Available actions (terminal, IDE, explorer, etc.)
 * - Action execution and verification
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  safeRefresh,
  waitForDistroState,
  waitForDialog,
  waitForDialogToDisappear,
  verifyDistroCardState,
  mockDistributions,
} from "../utils";

describe("Quick Actions Menu", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(300);
    await resetMockState();
    // Refresh again to load the clean mock data
    await safeRefresh();
    await waitForAppReady();
    await browser.pause(500);
  });

  describe("Menu Toggle", () => {
    it("should have quick actions button on distro cards", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await expect(quickActionsButton).toBeDisplayed();
    });

    it("should open quick actions menu when clicked", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const menu = await $('[data-testid="quick-actions-menu"]');
      await expect(menu).toBeDisplayed();
    });

    it("should close menu when clicking outside", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const menu = await $('[data-testid="quick-actions-menu"]');
      await expect(menu).toBeDisplayed();

      // Click outside to close
      const main = await $("main");
      await main.click();
      await browser.pause(300);

      const menuAfter = await $('[data-testid="quick-actions-menu"]');
      const isDisplayed = await menuAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });
  });

  describe("Available Actions", () => {
    beforeEach(async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);
    });

    it("should have Open File Explorer action", async () => {
      const action = await $('[data-testid="quick-action-explorer"]');
      await expect(action).toBeDisplayed();
    });

    it("should have Open in IDE action", async () => {
      const action = await $('[data-testid="quick-action-ide"]');
      await expect(action).toBeDisplayed();
    });

    it("should have Restart action", async () => {
      const action = await $('[data-testid="quick-action-restart"]');
      await expect(action).toBeDisplayed();
    });

    it("should have Export action", async () => {
      const action = await $('[data-testid="quick-action-export"]');
      await expect(action).toBeDisplayed();
    });

    it("should have Clone action", async () => {
      const action = await $('[data-testid="quick-action-clone"]');
      await expect(action).toBeDisplayed();
    });

    it("should have Set as Default action", async () => {
      const action = await $('[data-testid="quick-action-default"]');
      await expect(action).toBeDisplayed();
    });
  });

  describe("Clone Dialog", () => {
    it("should open clone dialog when Clone action is clicked", async () => {
      // Use stopped distro to avoid stop confirmation
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const cloneAction = await $('[data-testid="quick-action-clone"]');
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

      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const cloneAction = await $('[data-testid="quick-action-clone"]');
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
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const defaultAction = await $('[data-testid="quick-action-default"]');
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
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const defaultAction = await $('[data-testid="quick-action-default"]');
      await defaultAction.click();

      // Wait for the action to complete (menu should close)
      await browser.pause(1000);

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

      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const restartAction = await $('[data-testid="quick-action-restart"]');
      await restartAction.click();

      // Should show confirmation or start restart
      // Wait for operation - may briefly go offline then back online
      await browser.pause(2000);

      // After restart, should be running again
      await waitForDistroState("Ubuntu", "ONLINE", 15000);
    });
  });

  describe("Action Execution Verification", () => {
    it("should close menu after action is executed", async () => {
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();

      // Menu should be open
      const menu = await $('[data-testid="quick-actions-menu"]');
      await expect(menu).toBeDisplayed();

      // Click an action that doesn't open a dialog (Set Default)
      const defaultAction = await $('[data-testid="quick-action-default"]');
      await defaultAction.click();
      await browser.pause(500);

      // Menu should close after action
      const menuAfter = await $('[data-testid="quick-actions-menu"]');
      const isMenuVisible = await menuAfter.isDisplayed().catch(() => false);
      expect(isMenuVisible).toBe(false);
    });

    it("should disable actions during operation", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');

      // Start an operation (stop)
      const stopButton = await ubuntuCard.$(selectors.stopButton);
      await stopButton.click();

      // Immediately try to open quick actions
      await browser.pause(50);

      // Quick actions button should be disabled during operation
      const isDisabled = await quickActionsButton.getAttribute("disabled");
      expect(isDisabled).not.toBeNull();

      // Wait for operation to complete
      await waitForDistroState("Ubuntu", "OFFLINE", 10000);
    });
  });

  describe("Distribution Info Dialog", () => {
    it("should have Distribution Info action in quick actions menu", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const infoAction = await $('[data-testid="quick-action-info"]');
      await expect(infoAction).toBeDisplayed();

      const text = await infoAction.getText();
      expect(text).toContain("Distribution Info");
    });

    it("should open info dialog when Distribution Info action is clicked", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const infoAction = await $('[data-testid="quick-action-info"]');
      await infoAction.click();
      await browser.pause(300);

      const infoDialog = await $(selectors.distroInfoDialog);
      await expect(infoDialog).toBeDisplayed();
    });

    it("should display distribution name in info dialog", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const infoAction = await $('[data-testid="quick-action-info"]');
      await infoAction.click();
      await browser.pause(300);

      const infoDialog = await $(selectors.distroInfoDialog);
      await expect(infoDialog).toBeDisplayed();

      // Check name is displayed
      const nameRow = await $(selectors.infoName);
      const nameText = await nameRow.getText();
      expect(nameText).toContain("Ubuntu");
    });

    it("should display distribution ID (GUID) in info dialog", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const infoAction = await $('[data-testid="quick-action-info"]');
      await infoAction.click();
      await browser.pause(300);

      // Check ID is displayed (mock returns GUIDs like {mock-guid-XXXX-...})
      const idRow = await $(selectors.infoId);
      const idText = await idRow.getText();
      expect(idText).toMatch(/\{.*\}/); // Contains a GUID-like format
    });

    it("should display WSL version in info dialog", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const infoAction = await $('[data-testid="quick-action-info"]');
      await infoAction.click();
      await browser.pause(300);

      const versionRow = await $(selectors.infoVersion);
      const versionText = await versionRow.getText();
      expect(versionText).toMatch(/WSL [12]/);
    });

    it("should display install location in info dialog", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const infoAction = await $('[data-testid="quick-action-info"]');
      await infoAction.click();
      await browser.pause(300);

      // Mock location is like C:\Users\MockUser\AppData\Local\Packages\Ubuntu
      const locationRow = await $(selectors.infoLocation);
      const locationText = await locationRow.getText();
      expect(locationText).toContain("Ubuntu");
    });

    it("should display disk size in info dialog", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const infoAction = await $('[data-testid="quick-action-info"]');
      await infoAction.click();
      await browser.pause(300);

      // Mock disk size for Ubuntu is 8GB
      const diskRow = await $(selectors.infoDiskSize);
      const diskText = await diskRow.getText();
      expect(diskText).toMatch(/GB|MB/); // Contains a size unit
    });

    it("should display install source in info dialog", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const infoAction = await $('[data-testid="quick-action-info"]');
      await infoAction.click();
      await browser.pause(300);

      // Ubuntu's mock source is "store" which displays as "Microsoft Store"
      const sourceRow = await $(selectors.infoSource);
      const sourceText = await sourceRow.getText();
      expect(sourceText.length).toBeGreaterThan(0);
    });

    it("should close info dialog when close button is clicked", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const infoAction = await $('[data-testid="quick-action-info"]');
      await infoAction.click();
      await browser.pause(300);

      const infoDialog = await $(selectors.distroInfoDialog);
      await expect(infoDialog).toBeDisplayed();

      // Click close button
      const closeButton = await $(selectors.infoCloseButton);
      await closeButton.click();
      await browser.pause(300);

      // Dialog should be closed
      const dialogAfter = await $(selectors.distroInfoDialog);
      const isDisplayed = await dialogAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should close info dialog when Escape key is pressed", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const quickActionsButton = await ubuntuCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.click();
      await browser.pause(300);

      const infoAction = await $('[data-testid="quick-action-info"]');
      await infoAction.click();
      await browser.pause(300);

      const infoDialog = await $(selectors.distroInfoDialog);
      await expect(infoDialog).toBeDisplayed();

      // Press Escape
      await browser.keys("Escape");
      await browser.pause(300);

      // Dialog should be closed
      const dialogAfter = await $(selectors.distroInfoDialog);
      const isDisplayed = await dialogAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });
  });
});




