/**
 * E2E Tests for Distribution Filters
 *
 * Tests the main page filter functionality:
 * - Status filters (All / Online / Offline)
 * - Source filters (Store / LXC / Container / Download / Import / Clone / Unknown)
 * - WSL version toggles (v1 / v2)
 * - Clear filters
 * - Filter counts accuracy
 * - IP address display
 * - Distribution sorting
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  safeRefresh,
  getDistroCardCount,
  mockDistributions,
  mockDataHelpers,
} from "../utils";

describe("Distribution Filters", () => {
  beforeEach(async () => {
    // First refresh to ensure app is loaded (required for Tauri commands)
    await safeRefresh();
    await browser.pause(300);
    // Reset mock state to defaults (all 7 distributions)
    await resetMockState();
    // Refresh again to load the clean mock data
    await safeRefresh();
    await waitForAppReady();
    await browser.pause(500);
  });

  describe("Initial State", () => {
    it("should display all distributions by default", async () => {
      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDistributions.length);
    });

    it("should show correct online count in filter button", async () => {
      const onlineCount = await $('[data-testid="online-count"]');
      const count = await onlineCount.getText();
      expect(parseInt(count)).toBe(mockDataHelpers.getRunningCount());
    });

    it("should show correct offline count in filter button", async () => {
      const offlineCount = await $('[data-testid="offline-count"]');
      const count = await offlineCount.getText();
      expect(parseInt(count)).toBe(mockDataHelpers.getStoppedCount());
    });

    it("should show WSL version toggle buttons", async () => {
      const wsl1Button = await $('[data-testid="version-filter-wsl1"]');
      const wsl2Button = await $('[data-testid="version-filter-wsl2"]');

      // Both should be displayed since we have both versions
      await expect(wsl1Button).toBeDisplayed();
      await expect(wsl2Button).toBeDisplayed();
    });

    it("should show correct WSL version counts", async () => {
      const wsl1Count = await $('[data-testid="wsl1-count"]');
      const wsl2Count = await $('[data-testid="wsl2-count"]');

      expect(parseInt(await wsl1Count.getText())).toBe(mockDataHelpers.getWsl1Count());
      expect(parseInt(await wsl2Count.getText())).toBe(mockDataHelpers.getWsl2Count());
    });
  });

  describe("Status Filters", () => {
    it("should filter to only online distributions", async () => {
      const onlineButton = await $('[data-testid="status-filter-online"]');
      await onlineButton.click();
      await browser.pause(300);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDataHelpers.getRunningCount());

      // Verify all visible cards are online
      const cards = await $$(selectors.distroCard);
      for (const card of cards) {
        const badge = await card.$(selectors.stateBadge);
        const state = await badge.getText();
        expect(state).toBe("ONLINE");
      }
    });

    it("should filter to only offline distributions", async () => {
      const offlineButton = await $('[data-testid="status-filter-offline"]');
      await offlineButton.click();
      await browser.pause(300);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDataHelpers.getStoppedCount());

      // Verify all visible cards are offline
      const cards = await $$(selectors.distroCard);
      for (const card of cards) {
        const badge = await card.$(selectors.stateBadge);
        const state = await badge.getText();
        expect(state).toBe("OFFLINE");
      }
    });

    it("should show all distributions when All is clicked", async () => {
      // First filter to online
      const onlineButton = await $('[data-testid="status-filter-online"]');
      await onlineButton.click();
      await browser.pause(300);

      // Then click All
      const allButton = await $('[data-testid="status-filter-all"]');
      await allButton.click();
      await browser.pause(300);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDistributions.length);
    });
  });

  describe("WSL Version Filters", () => {
    it("should hide WSL 1 distributions when v1 toggle is clicked", async () => {
      const wsl1Button = await $('[data-testid="version-filter-wsl1"]');
      await wsl1Button.click();
      await browser.pause(300);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDataHelpers.getWsl2Count());

      // Verify no WSL 1 distros are visible
      for (const distro of mockDistributions.filter(d => d.version === 1)) {
        const card = await $(selectors.distroCardByName(distro.name));
        const isDisplayed = await card.isDisplayed().catch(() => false);
        expect(isDisplayed).toBe(false);
      }
    });

    it("should hide WSL 2 distributions when v2 toggle is clicked", async () => {
      const wsl2Button = await $('[data-testid="version-filter-wsl2"]');
      await wsl2Button.click();
      await browser.pause(300);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDataHelpers.getWsl1Count());

      // Verify no WSL 2 distros are visible
      for (const distro of mockDistributions.filter(d => d.version === 2)) {
        const card = await $(selectors.distroCardByName(distro.name));
        const isDisplayed = await card.isDisplayed().catch(() => false);
        expect(isDisplayed).toBe(false);
      }
    });

    it("should show empty state when both version filters are disabled", async () => {
      const wsl1Button = await $('[data-testid="version-filter-wsl1"]');
      const wsl2Button = await $('[data-testid="version-filter-wsl2"]');

      await wsl1Button.click();
      await browser.pause(200);
      await wsl2Button.click();
      await browser.pause(300);

      // Should show empty filter state
      const emptyState = await $('[data-testid="empty-filter-state"]');
      await expect(emptyState).toBeDisplayed();

      const message = await $('[data-testid="empty-filter-message"]');
      const text = await message.getText();
      expect(text).toContain("No distributions match");
    });
  });

  describe("Source Filters", () => {
    it("should have source filter buttons for each source type", async () => {
      const sourceGroup = await $('[data-testid="source-filter-group"]');
      await expect(sourceGroup).toBeDisplayed();

      // All Sources button should exist
      const allSourcesButton = await $('[data-testid="source-filter-all"]');
      await expect(allSourcesButton).toBeDisplayed();
    });

    it("should filter by store source", async () => {
      const storeButton = await $('[data-testid="source-filter-store"]');
      if (await storeButton.isDisplayed().catch(() => false)) {
        await storeButton.click();
        await browser.pause(300);

        const expectedCount = mockDataHelpers.getBySource("store").length;
        const cardCount = await getDistroCardCount();
        expect(cardCount).toBe(expectedCount);
      }
    });

    it("should filter by lxc source", async () => {
      const lxcButton = await $('[data-testid="source-filter-lxc"]');
      if (await lxcButton.isDisplayed().catch(() => false)) {
        await lxcButton.click();
        await browser.pause(300);

        const expectedCount = mockDataHelpers.getBySource("lxc").length;
        const cardCount = await getDistroCardCount();
        expect(cardCount).toBe(expectedCount);
      }
    });

    it("should filter by container source", async () => {
      const containerButton = await $('[data-testid="source-filter-container"]');
      if (await containerButton.isDisplayed().catch(() => false)) {
        await containerButton.click();
        await browser.pause(300);

        const expectedCount = mockDataHelpers.getBySource("container").length;
        const cardCount = await getDistroCardCount();
        expect(cardCount).toBe(expectedCount);
      }
    });

    it("should return to all sources when All Sources is clicked", async () => {
      // Filter by a specific source first
      const storeButton = await $('[data-testid="source-filter-store"]');
      if (await storeButton.isDisplayed().catch(() => false)) {
        await storeButton.click();
        await browser.pause(300);
      }

      // Click All Sources
      const allButton = await $('[data-testid="source-filter-all"]');
      await allButton.click();
      await browser.pause(300);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDistributions.length);
    });
  });

  describe("Combined Filters", () => {
    it("should combine status and version filters", async () => {
      // Filter to online only
      const onlineButton = await $('[data-testid="status-filter-online"]');
      await onlineButton.click();
      await browser.pause(200);

      // Disable WSL 1
      const wsl1Button = await $('[data-testid="version-filter-wsl1"]');
      await wsl1Button.click();
      await browser.pause(300);

      // Should show only online WSL 2 distros
      const expectedDistros = mockDistributions.filter(
        d => d.state === "Running" && d.version === 2
      );
      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(expectedDistros.length);
    });

    it("should combine source and status filters", async () => {
      // Filter to offline only
      const offlineButton = await $('[data-testid="status-filter-offline"]');
      await offlineButton.click();
      await browser.pause(200);

      // Filter by import source
      const importButton = await $('[data-testid="source-filter-import"]');
      if (await importButton.isDisplayed().catch(() => false)) {
        await importButton.click();
        await browser.pause(300);

        // Should show only offline import distros
        const expectedDistros = mockDistributions.filter(
          d => d.state !== "Running" && d.source === "import"
        );
        const cardCount = await getDistroCardCount();
        expect(cardCount).toBe(expectedDistros.length);
      }
    });
  });

  describe("Clear Filters", () => {
    it("should show clear filters button when filters are active", async () => {
      // Apply a filter that results in empty state
      const wsl1Button = await $('[data-testid="version-filter-wsl1"]');
      const wsl2Button = await $('[data-testid="version-filter-wsl2"]');

      await wsl1Button.click();
      await browser.pause(200);
      await wsl2Button.click();
      await browser.pause(300);

      // Clear filters button should appear
      const clearButton = await $('[data-testid="clear-filters-button"]');
      await expect(clearButton).toBeDisplayed();
    });

    it("should reset all filters when clear button is clicked", async () => {
      // Apply filters to get empty state
      const wsl1Button = await $('[data-testid="version-filter-wsl1"]');
      const wsl2Button = await $('[data-testid="version-filter-wsl2"]');

      await wsl1Button.click();
      await browser.pause(200);
      await wsl2Button.click();
      await browser.pause(300);

      // Click clear filters
      const clearButton = await $('[data-testid="clear-filters-button"]');
      await clearButton.click();
      await browser.pause(300);

      // All distributions should be visible
      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDistributions.length);
    });
  });

  describe("IP Address Display", () => {
    it("should display WSL IP address when running distros exist", async () => {
      // We have running distros, so IP should be displayed
      const ipDisplay = await $('[data-testid="wsl-ip-display"]');
      await expect(ipDisplay).toBeDisplayed();

      const ipValue = await $('[data-testid="wsl-ip-value"]');
      const ip = await ipValue.getText();
      // Should be a valid IP format
      expect(ip).toMatch(/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/);
    });

    it("should copy IP to clipboard when clicked", async () => {
      const ipDisplay = await $('[data-testid="wsl-ip-display"]');
      await ipDisplay.click();
      await browser.pause(500);

      // Should show "Copied!" indicator
      const copiedIndicator = await $('[data-testid="ip-copied-indicator"]');
      await expect(copiedIndicator).toBeDisplayed();
    });
  });

  describe("Distribution Sorting", () => {
    it("should display default distribution first", async () => {
      const cards = await $$(selectors.distroCard);
      expect(cards.length).toBeGreaterThan(0);

      // First card should be the default distribution
      const firstCard = cards[0];
      const cardText = await firstCard.getText();
      const defaultDistro = mockDistributions.find(d => d.isDefault);
      expect(cardText).toContain(defaultDistro?.name);
    });

    it("should sort remaining distributions alphabetically", async () => {
      const cards = await $$(selectors.distroCard);
      const names: string[] = [];

      for (const card of cards) {
        // Get the distribution name from the card
        const nameElement = await card.$("h3, [data-testid='distro-name']");
        if (await nameElement.isExisting()) {
          const name = await nameElement.getText();
          names.push(name.replace(/\s*\(Default\)/i, "").trim());
        }
      }

      // Skip the first one (default), rest should be alphabetical
      if (names.length > 1) {
        const nonDefaultNames = names.slice(1);
        const sortedNames = [...nonDefaultNames].sort((a, b) => a.localeCompare(b));
        expect(nonDefaultNames).toEqual(sortedNames);
      }
    });
  });

  describe("Filter Persistence", () => {
    it("should maintain filter state when distribution state changes", async () => {
      // Get initial online count from filter button
      const onlineCountEl = await $('[data-testid="online-count"]');
      const initialOnlineCount = parseInt(await onlineCountEl.getText());

      // Filter to online only
      const onlineButton = await $('[data-testid="status-filter-online"]');
      await onlineButton.click();
      await browser.pause(300);

      const initialCardCount = await getDistroCardCount();
      expect(initialCardCount).toBe(initialOnlineCount);

      // Clear filter to start a stopped distribution
      const allButton = await $('[data-testid="status-filter-all"]');
      await allButton.click();
      await browser.pause(300);

      // Start Debian (which is stopped)
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);
      await startButton.click();

      // Wait for Debian to start (watching from All view)
      await browser.waitUntil(
        async () => {
          const card = await $(selectors.distroCardByName("Debian"));
          const badge = await card.$(selectors.stateBadge);
          return (await badge.getText()) === "ONLINE";
        },
        { timeout: 10000, timeoutMsg: "Debian did not start" }
      );

      // Now switch back to online filter
      await onlineButton.click();
      await browser.pause(300);

      // Count should now be +1
      const newCardCount = await getDistroCardCount();
      expect(newCardCount).toBe(initialCardCount + 1);

      // Verify Debian is visible in the online filter
      const debianInFilter = await $(selectors.distroCardByName("Debian"));
      await expect(debianInFilter).toBeDisplayed();
    });
  });
});
