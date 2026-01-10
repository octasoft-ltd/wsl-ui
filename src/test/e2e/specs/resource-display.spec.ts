/**
 * E2E Tests for Resource Display
 *
 * Tests that memory and CPU usage are displayed correctly for running distributions.
 * Resource data is mocked in src-tauri/src/wsl/mock.rs
 */

import {
  waitForAppReady,
  resetMockState,
  mockDistributions,
  mockResourceData,
  waitForResourceStats,
  selectors,
} from "../utils";

describe("Resource Display", () => {
  beforeEach(async () => {
    await resetMockState();
    await waitForAppReady();
    // Wait extra time for resource stats to be fetched (polled every 5s)
    await browser.pause(1000);
  });

  describe("Running Distribution Resources", () => {
    it("should display memory usage for running distributions", async () => {
      // Wait for resource stats to load
      await waitForResourceStats();

      // Check Ubuntu (running) has memory displayed
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      await expect(ubuntuCard).toBeDisplayed();

      const memoryLabel = await ubuntuCard.$(selectors.memoryLabel);
      await expect(memoryLabel).toBeDisplayed();

      // Wait for actual memory value to appear (not placeholder)
      await browser.waitUntil(
        async () => {
          const text = await memoryLabel.getText();
          return text !== "—" && /\d+(\.\d+)?\s*(MB|GB|KB|B)/.test(text);
        },
        {
          timeout: 10000,
          interval: 500,
          timeoutMsg: "Memory usage value did not load within 10 seconds",
        }
      );

      const memoryText = await memoryLabel.getText();
      expect(memoryText).toMatch(/\d+(\.\d+)?\s*(MB|GB|KB|B)/);
    });

    it("should display CPU usage for running distributions", async () => {
      await waitForResourceStats();

      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      const cpuLabel = await ubuntuCard.$(selectors.cpuLabel);
      await expect(cpuLabel).toBeDisplayed();

      // CPU value should contain %
      const cpuText = await cpuLabel.getText();
      expect(cpuText).toContain("%");
    });

    it("should display resources for all running distributions", async () => {
      await waitForResourceStats();

      // Get running distros from mock data
      const runningDistros = mockDistributions.filter(d => d.state === "Running");

      for (const distro of runningDistros) {
        const card = await $(selectors.distroCardByName(distro.name));
        await expect(card).toBeDisplayed();

        // Each running distro should have memory and CPU displayed
        const memoryLabel = await card.$(selectors.memoryLabel);
        const cpuLabel = await card.$(selectors.cpuLabel);

        await expect(memoryLabel).toBeDisplayed();
        await expect(cpuLabel).toBeDisplayed();
      }
    });

    it("should show expected memory values from mock data", async () => {
      await waitForResourceStats();

      // Ubuntu should show ~512MB
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));

      // Check the card contains memory info - card text includes the label
      const cardText = await ubuntuCard.getText();
      // Mock returns 512MB for Ubuntu (formatted as "488.3 MB" or similar)
      expect(cardText).toMatch(/\d+(\.\d+)?\s*MB/);
    });
  });

  describe("Stopped Distribution Resources", () => {
    it("should show placeholder for memory on stopped distributions", async () => {
      await browser.pause(2000); // Give time for any resources to load

      // Debian is stopped - should show placeholder (—) instead of actual value
      const debianCard = await $(selectors.distroCardByName("Debian"));
      await expect(debianCard).toBeDisplayed();

      const memoryLabel = await debianCard.$(selectors.memoryLabel);
      const memoryText = await memoryLabel.getText();
      // Stopped distributions show "—" placeholder
      expect(memoryText).toBe("—");
    });

    it("should show placeholder for CPU on stopped distributions", async () => {
      await browser.pause(2000);

      const debianCard = await $(selectors.distroCardByName("Debian"));
      const cpuLabel = await debianCard.$(selectors.cpuLabel);
      const cpuText = await cpuLabel.getText();
      // Stopped distributions show "—" placeholder
      expect(cpuText).toBe("—");
    });
  });

  describe("Status Bar Resources", () => {
    it("should display global memory usage in status bar", async () => {
      await waitForResourceStats();

      // Status bar should show memory usage when running distros exist
      const statusBar = await $(selectors.statusBar);
      if (await statusBar.isExisting()) {
        // Wait for MEM to appear (may take a few seconds for resource polling)
        await browser.waitUntil(
          async () => {
            const text = await statusBar.getText();
            return text.includes("MEM") || text.includes("Mem");
          },
          {
            timeout: 12000,
            interval: 500,
            timeoutMsg: "Memory usage did not appear in status bar",
          }
        );

        const statusText = await statusBar.getText();
        expect(statusText).toMatch(/Mem/i);
      }
    });
  });

  describe("Resource Updates After State Change", () => {
    it("should show resources after starting a stopped distribution", async () => {
      // Start Debian (which is stopped)
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const startButton = await debianCard.$(selectors.startButton);
      await startButton.click();

      // Wait for state change and resource fetch
      await browser.pause(2000);

      // Now Debian should show resources
      const memoryLabel = await debianCard.$(selectors.memoryLabel);
      await memoryLabel.waitForDisplayed({ timeout: 10000 });
      await expect(memoryLabel).toBeDisplayed();
    });

    it("should show placeholder after stopping a running distribution", async () => {
      // First verify Ubuntu shows resources
      await waitForResourceStats();
      const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
      let memoryLabel = await ubuntuCard.$(selectors.memoryLabel);
      let memoryText = await memoryLabel.getText();
      // Should have actual value (not placeholder)
      expect(memoryText).toMatch(/\d+(\.\d+)?\s*(MB|GB|KB|B)/);

      // Stop Ubuntu
      const stopButton = await ubuntuCard.$(selectors.stopButton);
      await stopButton.click();

      // Wait for state change
      await browser.pause(2000);

      // Now Ubuntu should show placeholder
      memoryLabel = await ubuntuCard.$(selectors.memoryLabel);
      memoryText = await memoryLabel.getText();
      expect(memoryText).toBe("—");
    });
  });
});
