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

import { setupHooks, isElementDisplayed } from "../base";
import {
  selectors,
  getDistroCardCount,
  mockDistributions,
  mockDataHelpers,
} from "../utils";

/**
 * Helper to wait for filter to be applied by checking card count
 */
async function waitForFilterApplied(expectedCount: number): Promise<void> {
  await browser.waitUntil(
    async () => {
      const count = await getDistroCardCount();
      return count === expectedCount;
    },
    { timeout: 5000, timeoutMsg: `Expected ${expectedCount} cards after filter` }
  );
}

/**
 * Helper to wait for empty filter state to appear
 */
async function waitForEmptyFilterState(): Promise<void> {
  await browser.waitUntil(
    async () => {
      const emptyState = await $('[data-testid="empty-filter-state"]');
      try {
        return await emptyState.isDisplayed();
      } catch {
        return false;
      }
    },
    { timeout: 5000, timeoutMsg: "Empty filter state did not appear" }
  );
}

describe("Distribution Filters", () => {
  setupHooks.standard();

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
      const expectedCount = mockDataHelpers.getRunningCount();
      const onlineButton = await $('[data-testid="status-filter-online"]');
      await onlineButton.click();
      await waitForFilterApplied(expectedCount);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(expectedCount);

      // Verify all visible cards are online
      const cards = await $$(selectors.distroCard);
      for (const card of cards) {
        const badge = await card.$(selectors.stateBadge);
        const state = await badge.getText();
        expect(state).toBe("ONLINE");
      }
    });

    it("should filter to only offline distributions", async () => {
      const expectedCount = mockDataHelpers.getStoppedCount();
      const offlineButton = await $('[data-testid="status-filter-offline"]');
      await offlineButton.click();
      await waitForFilterApplied(expectedCount);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(expectedCount);

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
      await waitForFilterApplied(mockDataHelpers.getRunningCount());

      // Then click All
      const allButton = await $('[data-testid="status-filter-all"]');
      await allButton.click();
      await waitForFilterApplied(mockDistributions.length);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDistributions.length);
    });
  });

  describe("WSL Version Filters", () => {
    it("should hide WSL 1 distributions when v1 toggle is clicked", async () => {
      const expectedCount = mockDataHelpers.getWsl2Count();
      const wsl1Button = await $('[data-testid="version-filter-wsl1"]');
      await wsl1Button.click();
      await waitForFilterApplied(expectedCount);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(expectedCount);

      // Verify no WSL 1 distros are visible
      for (const distro of mockDistributions.filter(d => d.version === 1)) {
        const isDisplayed = await isElementDisplayed(selectors.distroCardByName(distro.name));
        expect(isDisplayed).toBe(false);
      }
    });

    it("should hide WSL 2 distributions when v2 toggle is clicked", async () => {
      const expectedCount = mockDataHelpers.getWsl1Count();
      const wsl2Button = await $('[data-testid="version-filter-wsl2"]');
      await wsl2Button.click();
      await waitForFilterApplied(expectedCount);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(expectedCount);

      // Verify no WSL 2 distros are visible
      for (const distro of mockDistributions.filter(d => d.version === 2)) {
        const isDisplayed = await isElementDisplayed(selectors.distroCardByName(distro.name));
        expect(isDisplayed).toBe(false);
      }
    });

    it("should show empty state when both version filters are disabled", async () => {
      const wsl1Button = await $('[data-testid="version-filter-wsl1"]');
      const wsl2Button = await $('[data-testid="version-filter-wsl2"]');

      await wsl1Button.click();
      // Wait for first filter to apply
      await waitForFilterApplied(mockDataHelpers.getWsl2Count());

      await wsl2Button.click();
      // Wait for empty state
      await waitForEmptyFilterState();

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
      const isStoreButtonDisplayed = await isElementDisplayed('[data-testid="source-filter-store"]');
      if (isStoreButtonDisplayed) {
        const storeButton = await $('[data-testid="source-filter-store"]');
        await storeButton.click();

        const expectedCount = mockDataHelpers.getBySource("store").length;
        await waitForFilterApplied(expectedCount);

        const cardCount = await getDistroCardCount();
        expect(cardCount).toBe(expectedCount);
      }
    });

    it("should filter by lxc source", async () => {
      const isLxcButtonDisplayed = await isElementDisplayed('[data-testid="source-filter-lxc"]');
      if (isLxcButtonDisplayed) {
        const lxcButton = await $('[data-testid="source-filter-lxc"]');
        await lxcButton.click();

        const expectedCount = mockDataHelpers.getBySource("lxc").length;
        await waitForFilterApplied(expectedCount);

        const cardCount = await getDistroCardCount();
        expect(cardCount).toBe(expectedCount);
      }
    });

    it("should filter by container source", async () => {
      const isContainerButtonDisplayed = await isElementDisplayed('[data-testid="source-filter-container"]');
      if (isContainerButtonDisplayed) {
        const containerButton = await $('[data-testid="source-filter-container"]');
        await containerButton.click();

        const expectedCount = mockDataHelpers.getBySource("container").length;
        await waitForFilterApplied(expectedCount);

        const cardCount = await getDistroCardCount();
        expect(cardCount).toBe(expectedCount);
      }
    });

    it("should return to all sources when All Sources is clicked", async () => {
      // Filter by a specific source first
      const isStoreButtonDisplayed = await isElementDisplayed('[data-testid="source-filter-store"]');
      if (isStoreButtonDisplayed) {
        const storeButton = await $('[data-testid="source-filter-store"]');
        await storeButton.click();
        const expectedCount = mockDataHelpers.getBySource("store").length;
        await waitForFilterApplied(expectedCount);
      }

      // Click All Sources
      const allButton = await $('[data-testid="source-filter-all"]');
      await allButton.click();
      await waitForFilterApplied(mockDistributions.length);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(mockDistributions.length);
    });
  });

  describe("Combined Filters", () => {
    it("should combine status and version filters", async () => {
      // Filter to online only
      const onlineButton = await $('[data-testid="status-filter-online"]');
      await onlineButton.click();
      await waitForFilterApplied(mockDataHelpers.getRunningCount());

      // Disable WSL 1
      const wsl1Button = await $('[data-testid="version-filter-wsl1"]');
      await wsl1Button.click();

      // Should show only online WSL 2 distros
      const expectedDistros = mockDistributions.filter(
        d => d.state === "Running" && d.version === 2
      );
      await waitForFilterApplied(expectedDistros.length);

      const cardCount = await getDistroCardCount();
      expect(cardCount).toBe(expectedDistros.length);
    });

    it("should combine source and status filters", async () => {
      // Filter to offline only
      const offlineButton = await $('[data-testid="status-filter-offline"]');
      await offlineButton.click();
      await waitForFilterApplied(mockDataHelpers.getStoppedCount());

      // Filter by import source
      const isImportButtonDisplayed = await isElementDisplayed('[data-testid="source-filter-import"]');
      if (isImportButtonDisplayed) {
        const importButton = await $('[data-testid="source-filter-import"]');
        await importButton.click();

        // Should show only offline import distros
        const expectedDistros = mockDistributions.filter(
          d => d.state !== "Running" && d.source === "import"
        );
        await waitForFilterApplied(expectedDistros.length);

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
      await waitForFilterApplied(mockDataHelpers.getWsl2Count());

      await wsl2Button.click();
      await waitForEmptyFilterState();

      // Clear filters button should appear
      const clearButton = await $('[data-testid="clear-filters-button"]');
      await expect(clearButton).toBeDisplayed();
    });

    it("should reset all filters when clear button is clicked", async () => {
      // Apply filters to get empty state
      const wsl1Button = await $('[data-testid="version-filter-wsl1"]');
      const wsl2Button = await $('[data-testid="version-filter-wsl2"]');

      await wsl1Button.click();
      await waitForFilterApplied(mockDataHelpers.getWsl2Count());

      await wsl2Button.click();
      await waitForEmptyFilterState();

      // Click clear filters
      const clearButton = await $('[data-testid="clear-filters-button"]');
      await clearButton.click();
      await waitForFilterApplied(mockDistributions.length);

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

      // Wait for "Copied!" indicator to appear
      await browser.waitUntil(
        async () => {
          const copiedIndicator = await $('[data-testid="ip-copied-indicator"]');
          try {
            return await copiedIndicator.isDisplayed();
          } catch {
            return false;
          }
        },
        { timeout: 3000, timeoutMsg: "Copied indicator did not appear" }
      );

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
      await waitForFilterApplied(initialOnlineCount);

      const initialCardCount = await getDistroCardCount();
      expect(initialCardCount).toBe(initialOnlineCount);

      // Clear filter to start a stopped distribution
      const allButton = await $('[data-testid="status-filter-all"]');
      await allButton.click();
      await waitForFilterApplied(mockDistributions.length);

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
      await waitForFilterApplied(initialCardCount + 1);

      // Count should now be +1
      const newCardCount = await getDistroCardCount();
      expect(newCardCount).toBe(initialCardCount + 1);

      // Verify Debian is visible in the online filter
      const debianInFilter = await $(selectors.distroCardByName("Debian"));
      await expect(debianInFilter).toBeDisplayed();
    });
  });
});
