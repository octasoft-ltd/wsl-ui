/**
 * E2E Tests for Distribution Actions
 *
 * Tests the core distribution operations:
 * - Start/Stop distributions
 * - Delete distributions
 * - Shutdown all
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  getDistroCardCount,
  waitForDistroState,
  mockDistributions,
  verifyDistroCardState,
  waitForDialog,
  waitForDialogToDisappear,
  safeRefresh,
} from "../utils";

describe("Distribution Actions", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(300);
    await resetMockState();
    // Refresh again to load the clean mock data
    await safeRefresh();
    await waitForAppReady();
    await browser.pause(500);
  });

  describe("Start Distribution", () => {
    it("should start a stopped distribution", async () => {
      // Debian is stopped by default in mock
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);

      // Verify it shows start button (meaning it's stopped)
      await expect(startButton).toBeDisplayed();
      
      // Verify initial state is OFFLINE
      await waitForDistroState("Debian", "OFFLINE", 1000);

      // Click start
      await startButton.click();

      // Wait for state to change to ONLINE
      await waitForDistroState("Debian", "ONLINE", 10000);

      // Verify distribution list is still correct (state consistency check)
      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDistributions.length);
      
      // Verify other distros' states haven't changed
      await waitForDistroState("Ubuntu", "ONLINE", 1000);
    });
  });

  describe("Stop Distribution", () => {
    it("should stop a running distribution", async () => {
      // Ubuntu is running by default in mock
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const stopButton = await ubuntuCard.$(selectors.stopButton);

      // Verify it shows stop button (meaning it's running)
      await expect(stopButton).toBeDisplayed();
      
      // Verify initial state is ONLINE
      await waitForDistroState("Ubuntu", "ONLINE", 1000);

      // Click stop
      await stopButton.click();

      // Wait for state to change to OFFLINE
      await waitForDistroState("Ubuntu", "OFFLINE", 10000);

      // Verify distribution list is still correct (state consistency check)
      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDistributions.length);
      
      // Verify other distros' states haven't changed unexpectedly
      await waitForDistroState("Ubuntu-22.04", "ONLINE", 1000);
    });
  });

  describe("Delete Distribution", () => {
    it("should show confirmation dialog when delete is clicked", async () => {
      const alpineCard = await $(selectors.distroCardByName("Alpine"));
      const deleteButton = await alpineCard.$(selectors.deleteButton);

      await deleteButton.click();

      // Wait for dialog to appear
      const dialog = await $(selectors.confirmDialog);
      await dialog.waitForDisplayed({ timeout: 5000 });
      await expect(dialog).toBeDisplayed();

      // Verify dialog has title containing Delete
      const dialogTitle = await dialog.$("h3");
      const titleText = await dialogTitle.getText();
      expect(titleText.toLowerCase()).toContain("delete");

      // Close dialog
      const cancelButton = await $(selectors.dialogCancelButton);
      await cancelButton.click();
      await browser.pause(300);
    });

    it("should close dialog when cancel is clicked", async () => {
      const alpineCard = await $(selectors.distroCardByName("Alpine"));
      const deleteButton = await alpineCard.$(selectors.deleteButton);

      await deleteButton.click();

      // Wait for dialog
      const dialog = await $(selectors.confirmDialog);
      await dialog.waitForDisplayed({ timeout: 5000 });

      // Click cancel
      const cancelButton = await $(selectors.dialogCancelButton);
      await cancelButton.waitForClickable({ timeout: 3000 });
      await cancelButton.click();

      // Wait for dialog to close
      await browser.pause(500);

      // Verify dialog is closed
      const dialogAfter = await $(selectors.confirmDialog);
      const isDisplayed = await dialogAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);

      // Verify distribution still exists
      await expect(alpineCard).toBeDisplayed();
    });

    it("should delete distribution when confirmed", async () => {
      const initialCount = await getDistroCardCount();
      expect(initialCount).toBeGreaterThan(0);

      const alpineCard = await $(selectors.distroCardByName("Alpine"));
      const deleteButton = await alpineCard.$(selectors.deleteButton);

      await deleteButton.click();

      // Wait for dialog
      const dialog = await $(selectors.confirmDialog);
      await dialog.waitForDisplayed({ timeout: 5000 });

      // Click confirm (Delete button)
      const confirmButton = await $(selectors.dialogConfirmButton);
      await confirmButton.waitForClickable({ timeout: 3000 });
      await confirmButton.click();

      // Wait for deletion to complete - card should disappear
      await browser.waitUntil(
        async () => {
          const cardAfter = await $(selectors.distroCardByName("Alpine"));
          const exists = await cardAfter.isDisplayed().catch(() => false);
          return !exists;
        },
        {
          timeout: 10000,
          timeoutMsg: "Distribution card did not disappear after deletion",
        }
      );

      // Verify count decreased
      const finalCount = await getDistroCardCount();
      expect(finalCount).toBe(initialCount - 1);

      // Verify other distros still exist (state consistency check)
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      await expect(ubuntuCard).toBeDisplayed();
      
      const debianCard = await $(selectors.distroCardByName("Debian"));
      await expect(debianCard).toBeDisplayed();
    });
  });

  describe("Version Badge", () => {
    it("should have clickable version badge on distro card", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const versionBadge = await ubuntuCard.$(selectors.wslVersionBadge);
      await expect(versionBadge).toBeDisplayed();
    });

    it("should open info dialog when version badge is clicked", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const versionBadge = await ubuntuCard.$(selectors.wslVersionBadge);

      await versionBadge.click();
      await browser.pause(300);

      const infoDialog = await $(selectors.distroInfoDialog);
      await expect(infoDialog).toBeDisplayed();

      // Close dialog
      const closeButton = await $(selectors.infoCloseButton);
      await closeButton.click();
      await browser.pause(300);
    });
  });

  describe("Shutdown All", () => {
    it("should have shutdown all button in header", async () => {
      const shutdownButton = await $(selectors.shutdownAllButton);
      await expect(shutdownButton).toBeDisplayed();
    });

    it("should stop all running distributions", async () => {
      // Verify initial states - Ubuntu and Ubuntu-22.04 are running
      await waitForDistroState("Ubuntu", "ONLINE", 1000);
      await waitForDistroState("Ubuntu-22.04", "ONLINE", 1000);

      // Click shutdown all (opens confirmation dialog)
      const shutdownButton = await $(selectors.shutdownAllButton);
      await shutdownButton.click();

      // Wait for confirmation dialog and confirm
      const dialog = await waitForDialog(selectors.confirmDialog, 5000);
      const confirmButton = await $(selectors.dialogConfirmButton);
      await confirmButton.waitForClickable({ timeout: 5000 });
      await confirmButton.click();

      // Wait for both running distributions to stop
      await waitForDistroState("Ubuntu", "OFFLINE", 10000);
      await waitForDistroState("Ubuntu-22.04", "OFFLINE", 10000);

      // Verify distribution list is still correct (state consistency check)
      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDistributions.length);

      // Verify stopped distros remain stopped
      await waitForDistroState("Debian", "OFFLINE", 1000);
      await waitForDistroState("Alpine", "OFFLINE", 1000);
    });
  });

  describe("State Consistency", () => {
    it("should maintain correct card count after start operation", async () => {
      const initialCount = await getDistroCardCount();
      expect(initialCount).toBe(mockDistributions.length);

      // Start a distribution
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);
      await startButton.click();

      // Wait for state change
      await waitForDistroState("Debian", "ONLINE", 10000);

      // Card count should remain the same
      const afterCount = await getDistroCardCount();
      expect(afterCount).toBe(initialCount);

      // All other distros should still be present
      for (const distro of mockDistributions) {
        const card = await $(selectors.distroCardByName(distro.name));
        await expect(card).toBeDisplayed();
      }
    });

    it("should maintain correct card count after stop operation", async () => {
      const initialCount = await getDistroCardCount();

      // Stop a running distribution
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const stopButton = await ubuntuCard.$(selectors.stopButton);
      await stopButton.click();

      // Wait for state change
      await waitForDistroState("Ubuntu", "OFFLINE", 10000);

      // Card count should remain the same
      const afterCount = await getDistroCardCount();
      expect(afterCount).toBe(initialCount);
    });

    it("should correctly update only the target distribution state", async () => {
      // Record initial states
      await verifyDistroCardState("Ubuntu", "ONLINE");
      await verifyDistroCardState("Ubuntu-22.04", "ONLINE");
      await verifyDistroCardState("Debian", "OFFLINE");
      await verifyDistroCardState("Alpine", "OFFLINE");

      // Start Debian
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);
      await startButton.click();

      // Wait for Debian to start
      await waitForDistroState("Debian", "ONLINE", 10000);

      // Verify other states haven't changed
      await verifyDistroCardState("Ubuntu", "ONLINE");
      await verifyDistroCardState("Ubuntu-22.04", "ONLINE");
      await verifyDistroCardState("Alpine", "OFFLINE");
    });

    it("should correctly reduce card count after delete", async () => {
      const initialCount = await getDistroCardCount();
      expect(initialCount).toBe(mockDistributions.length);

      // Delete Alpine
      const alpineCard = await $(selectors.distroCardByName("Alpine"));
      const deleteButton = await alpineCard.$(selectors.deleteButton);
      await deleteButton.click();

      // Confirm deletion
      const dialog = await waitForDialog(selectors.confirmDialog, 5000);
      const confirmButton = await $(selectors.dialogConfirmButton);
      await confirmButton.click();

      // Wait for deletion
      await browser.waitUntil(
        async () => {
          const card = await $(selectors.distroCardByName("Alpine"));
          return !(await card.isDisplayed().catch(() => false));
        },
        { timeout: 10000, timeoutMsg: "Alpine was not deleted" }
      );

      // Card count should be reduced by 1
      const afterCount = await getDistroCardCount();
      expect(afterCount).toBe(initialCount - 1);

      // Other cards should still exist
      await verifyDistroCardState("Ubuntu", "ONLINE");
      await verifyDistroCardState("Debian", "OFFLINE");
    });

    it("should display correct button based on distribution state", async () => {
      // Running distro should have stop button
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const ubuntuStopButton = await ubuntuCard.$(selectors.stopButton);
      await expect(ubuntuStopButton).toBeDisplayed();

      // Stopped distro should have start button
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const debianStartButton = await debianCard.$(selectors.startButton);
      await expect(debianStartButton).toBeDisplayed();

      // Start Debian and verify button changes
      await debianStartButton.click();
      await waitForDistroState("Debian", "ONLINE", 10000);

      // Now Debian should show stop button
      const debianStopButton = await debianCard.$(selectors.stopButton);
      await expect(debianStopButton).toBeDisplayed();
    });
  });
});




