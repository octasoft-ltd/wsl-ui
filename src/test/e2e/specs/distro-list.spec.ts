/**
 * E2E Tests for Distribution List
 *
 * Tests the main distribution listing functionality including:
 * - Loading and displaying distributions
 * - State indicators (running/stopped)
 * - Data accuracy (verifies UI matches mock data)
 */

import { setupHooks, isElementDisplayed } from "../base";
import {
  mockDistributions,
  selectors,
  getDistroCardCount,
  verifyDistroCardState,
} from "../utils";

describe("Distribution List", () => {
  setupHooks.standard();

  describe("Initial Load", () => {
    it("should display all mock distributions", async () => {
      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDistributions.length);
    });

    it("should display distribution names correctly", async () => {
      for (const distro of mockDistributions) {
        const card = await $(selectors.distroCardByName(distro.name));
        await expect(card).toBeDisplayed();
      }
    });

    it("should show Ubuntu with Online state", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      await expect(ubuntuCard).toBeDisplayed();

      const badge = await ubuntuCard.$(selectors.stateBadge);
      await badge.waitForDisplayed({ timeout: 3000 });
      const badgeText = await badge.getText();
      expect(badgeText).toBe("ONLINE");
    });

    it("should show Debian with Offline state", async () => {
      const debianCard = await $(selectors.distroCardByName("Debian"));
      await expect(debianCard).toBeDisplayed();

      const badge = await debianCard.$(selectors.stateBadge);
      await badge.waitForDisplayed({ timeout: 3000 });
      const badgeText = await badge.getText();
      expect(badgeText).toBe("OFFLINE");
    });
  });

  describe("Data Accuracy - Mock Data Verification", () => {
    it("should display all distributions with correct states matching mock data", async () => {
      // Verify each distribution's state matches the mock data
      for (const distro of mockDistributions) {
        const expectedState = distro.state === "Running" ? "ONLINE" : "OFFLINE";
        await verifyDistroCardState(distro.name, expectedState);
      }
    });

    it("should show correct WSL version badges", async () => {
      // All mock distributions are WSL 2
      for (const distro of mockDistributions) {
        const card = await $(selectors.distroCardByName(distro.name));
        const versionBadge = await card.$(selectors.wslVersionBadge);
        await expect(versionBadge).toBeDisplayed();

        const versionText = await versionBadge.getText();
        expect(versionText).toContain(String(distro.version));
      }
    });

    it("should show default indicator only on default distribution", async () => {
      // Ubuntu is the default distribution in mock data
      const defaultDistro = mockDistributions.find(d => d.isDefault);
      expect(defaultDistro).toBeDefined();

      if (defaultDistro) {
        const card = await $(selectors.distroCardByName(defaultDistro.name));
        // Default distribution should have a visual indicator (shown as "Primary" badge)
        const cardText = await card.getText();
        expect(cardText.toLowerCase()).toContain("primary");
      }

      // Verify non-default distros don't have primary indicator
      const nonDefaultDistros = mockDistributions.filter(d => !d.isDefault);
      for (const distro of nonDefaultDistros) {
        const card = await $(selectors.distroCardByName(distro.name));
        const cardText = await card.getText();
        // The word "primary" should not appear as a badge
        const hasPrimaryLabel = cardText.toLowerCase().includes("primary");
        expect(hasPrimaryLabel).toBe(false);
      }
    });

    it("should display correct running count in status bar", async () => {
      const runningDistros = mockDistributions.filter(d => d.state === "Running");

      if (await isElementDisplayed(selectors.statusBar)) {
        const statusBar = await $(selectors.statusBar);
        const statusText = await statusBar.getText();
        // Status bar should show running count
        expect(statusText).toContain(String(runningDistros.length));
      }
    });
  });

  describe("State Indicators", () => {
    it("should show stop button for running distributions", async () => {
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const stopButton = await ubuntuCard.$(selectors.stopButton);
      await expect(stopButton).toBeDisplayed();
    });

    it("should show start button for stopped distributions", async () => {
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);
      await expect(startButton).toBeDisplayed();
    });
  });

  describe("Header Controls", () => {
    it("should have a refresh button", async () => {
      const refreshButton = await $(selectors.refreshButton);
      await expect(refreshButton).toBeDisplayed();
    });

    it("should have a new distro button", async () => {
      const newButton = await $(selectors.newDistroButton);
      await expect(newButton).toBeDisplayed();
    });

    it("should have a settings button", async () => {
      const settingsButton = await $(selectors.settingsButton);
      await expect(settingsButton).toBeDisplayed();
    });

    it("should refresh the list when clicking refresh", async () => {
      const refreshButton = await $(selectors.refreshButton);
      await refreshButton.click();

      // Wait for distributions to be displayed after refresh
      await browser.waitUntil(
        async () => {
          const count = await getDistroCardCount();
          return count > 0;
        },
        { timeout: 5000, timeoutMsg: "Distributions did not appear after refresh" }
      );

      // Verify distributions are still displayed
      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDistributions.length);
    });
  });
});




