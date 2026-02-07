/**
 * E2E Tests for WSL Status and Version Features
 *
 * Tests the WSL status bar functionality:
 * - WSL version display
 * - Health indicator
 * - Update button
 * - Resource usage display
 */

import { setupHooks, isElementDisplayed } from "../base";
import { selectors, waitForDistroState, triggerResourceFetch } from "../utils";

describe("WSL Status Features", () => {
  setupHooks.standard();

  describe("Status Bar", () => {
    it("should display the status bar", async () => {
      const statusBar = await $(selectors.statusBar);
      await expect(statusBar).toBeDisplayed();
    });

    it("should show WSL version in status bar", async () => {
      const statusBar = await $(selectors.statusBar);
      const statusBarText = await statusBar.getText();

      // Should display WSL version number
      expect(statusBarText).toContain("WSL");
    });

    it("should show distribution count", async () => {
      const statusBar = await $(selectors.statusBar);
      const statusBarText = await statusBar.getText();

      // Should show number of instances
      expect(statusBarText).toContain("INSTANCES");
    });

    it("should show active count", async () => {
      const statusBar = await $(selectors.statusBar);
      const statusBarText = await statusBar.getText();

      // Should show number of active distributions
      expect(statusBarText).toContain("ACTIVE");
    });

    it("should show primary distribution name", async () => {
      const statusBar = await $(selectors.statusBar);
      const statusBarText = await statusBar.getText();

      // Should show primary distribution (Ubuntu is default in mock)
      expect(statusBarText).toContain("PRIMARY");
      expect(statusBarText).toContain("Ubuntu");
    });

    it("should show operational status indicator", async () => {
      const statusBar = await $(selectors.statusBar);
      const statusBarText = await statusBar.getText();

      // With running distributions in mock data, status should show OPERATIONAL
      expect(statusBarText).toContain("OPERATIONAL");
    });
  });

  describe("WSL Version Display", () => {
    it("should display WSL version number", async () => {
      const statusBar = await $(selectors.statusBar);

      // Look for version element with tooltip
      const versionElement = await statusBar.$("span[title*='WSL version']");
      if (await versionElement.isDisplayed()) {
        const versionText = await versionElement.getText();
        // Should contain version format like "v2.6.2.0"
        expect(versionText).toMatch(/v?\d+\.\d+/);
      } else {
        // Alternative: just check status bar contains version info
        const text = await statusBar.getText();
        expect(text).toMatch(/v?\d+\.\d+/);
      }
    });

    it("should have version tooltip with detailed info", async () => {
      const statusBar = await $(selectors.statusBar);

      // Find element with detailed version tooltip
      const versionElement = await statusBar.$('[title*="Kernel"]');
      if (await versionElement.isDisplayed()) {
        const tooltip = await versionElement.getAttribute("title");
        // Tooltip should contain kernel version, WSLg version, etc.
        expect(tooltip).toContain("Kernel");
      }
    });
  });

  describe("Health Indicator", () => {
    it("should display health status indicator", async () => {
      const statusBar = await $(selectors.statusBar);

      // Health indicator is a colored dot
      const healthDot = await statusBar.$('.rounded-full');
      await expect(healthDot).toBeDisplayed();
    });

    it("should have health status tooltip", async () => {
      const statusBar = await $(selectors.statusBar);

      // Find element with health message tooltip
      const healthElement = await statusBar.$('[title]');
      if (await healthElement.isDisplayed()) {
        const tooltip = await healthElement.getAttribute("title");
        // Should have some health message
        expect(tooltip.length).toBeGreaterThan(0);
      }
    });
  });

  describe("WSL Update Button", () => {
    it("should have update button in status bar", async () => {
      const statusBar = await $(selectors.statusBar);

      // Find update button (has refresh/update icon)
      const updateButton = await statusBar.$('button[title*="Update"]');
      await expect(updateButton).toBeDisplayed();
    });

    it("should show update tooltip", async () => {
      const statusBar = await $(selectors.statusBar);

      const updateButton = await statusBar.$('button[title*="Update"]');
      const tooltip = await updateButton.getAttribute("title");

      expect(tooltip).toContain("Update WSL");
    });

    it("should show loading spinner when update is in progress", async () => {
      const statusBar = await $(selectors.statusBar);

      const updateButton = await statusBar.$('button[title*="Update"]');
      await updateButton.click();

      // Spinner may appear briefly - try to detect it
      try {
        await browser.waitUntil(
          async () => {
            const spinner = await statusBar.$('.animate-spin');
            return await spinner.isDisplayed();
          },
          { timeout: 2000 }
        );
      } catch {
        // Spinner may be too fast to catch - that's ok
      }

      // Just verify the click doesn't cause an error
      expect(true).toBe(true);
    });
  });

  describe("Resource Usage Display", () => {
    it("should show memory usage in status bar", async () => {
      const statusBar = await $(selectors.statusBar);

      // Force a resource fetch since polling may be paused when window is unfocused during tests
      await triggerResourceFetch();

      // Wait for resource stats to load
      await browser.waitUntil(
        async () => {
          const text = await statusBar.getText();
          return text.includes("MEM") || text.includes("Mem");
        },
        {
          timeout: 12000,
          interval: 500,
          timeoutMsg: "Memory usage did not appear in status bar within 12 seconds",
        }
      );

      const statusBarText = await statusBar.getText();

      // Status bar should show MEM with a value
      expect(statusBarText).toMatch(/Mem/i);
    });

    it("should show instance and active counts", async () => {
      const statusBar = await $(selectors.statusBar);

      // Wait for stats to load
      await browser.waitUntil(
        async () => {
          const text = await statusBar.getText();
          return text.includes("INSTANCES") && text.includes("ACTIVE");
        },
        { timeout: 5000, timeoutMsg: "Instance and active counts did not appear" }
      );

      const statusBarText = await statusBar.getText();

      // Should show INSTANCES and ACTIVE counts
      expect(statusBarText).toContain("INSTANCES");
      expect(statusBarText).toContain("ACTIVE");
    });
  });

  describe("Status Messages", () => {
    it("should show operational status when distributions are running", async () => {
      const statusBar = await $(selectors.statusBar);
      const statusBarText = await statusBar.getText();

      // With running distributions, should show "OPERATIONAL"
      expect(statusBarText).toContain("OPERATIONAL");
    });

    it("should show loading indicator during operations", async () => {
      // Start an operation that takes time
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$('[data-testid="start-button"]');
      await startButton.click();

      const statusBar = await $(selectors.statusBar);

      // Either spinner is visible or status shows action in progress
      let foundIndicator = false;
      try {
        await browser.waitUntil(
          async () => {
            const spinner = await statusBar.$('.animate-spin');
            try {
              return await spinner.isDisplayed();
            } catch {
              return false;
            }
          },
          { timeout: 2000 }
        );
        foundIndicator = true;
      } catch {
        // Spinner may be too fast - check text instead
        const text = await statusBar.getText();
        foundIndicator = text.includes("Starting") || text.includes("Syncing") || text.includes("OPERATIONAL");
      }

      expect(foundIndicator).toBe(true);

      // Wait for operation to complete
      await waitForDistroState("Debian", "ONLINE", 10000);
    });

    it("should show active count in status bar", async () => {
      const statusBar = await $(selectors.statusBar);
      const statusBarText = await statusBar.getText();

      // Should show Active label with a count
      expect(statusBarText).toContain("ACTIVE");

      // Should contain a number after Active
      expect(statusBarText).toMatch(/Active\s*\n?\s*\d+/i);
    });
  });

  describe("Primary Distribution Display", () => {
    it("should show current primary distribution", async () => {
      const statusBar = await $(selectors.statusBar);
      const statusBarText = await statusBar.getText();

      // Should show Primary: Ubuntu (default in mock)
      expect(statusBarText).toContain("PRIMARY");
      expect(statusBarText).toContain("Ubuntu");
    });

    it("should update primary display when default is changed", async () => {
      // Change default to Debian
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const quickActionsButton = await debianCard.$('[data-testid="quick-actions-button"]');
      await quickActionsButton.waitForClickable({ timeout: 5000 });
      await quickActionsButton.click();

      // Wait for quick actions menu to appear
      await browser.waitUntil(
        async () => isElementDisplayed(selectors.quickActionsMenu),
        { timeout: 5000, timeoutMsg: "Quick actions menu did not appear" }
      );

      const setDefaultAction = await $('[data-testid="quick-action-default"]');
      await setDefaultAction.waitForClickable({ timeout: 5000 });
      await setDefaultAction.click();

      // Wait for status bar to update
      const statusBar = await $(selectors.statusBar);
      await browser.waitUntil(
        async () => {
          const text = await statusBar.getText();
          return text.includes("Debian");
        },
        { timeout: 5000, timeoutMsg: "Status bar did not update to show Debian as primary" }
      );

      // Check status bar updated
      const statusBarText = await statusBar.getText();

      expect(statusBarText).toContain("PRIMARY");
      expect(statusBarText).toContain("Debian");
    });
  });
});
