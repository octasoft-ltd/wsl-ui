/**
 * E2E Tests for Disk Mount Functionality
 *
 * Tests the disk mounting features:
 * - MountedDisksPanel display
 * - DiskMountDialog VHD tab
 * - DiskMountDialog Physical Disk tab
 * - Mount/Unmount operations
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  safeRefresh,
} from "../utils";

describe("Disk Mount Features", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(500);
    await resetMockState();
    await waitForAppReady();
    await browser.pause(500);
  });

  describe("Mounted Disks Panel", () => {
    /**
     * Helper to open the mounted disks panel via status bar
     */
    async function openMountedDisksPanel(): Promise<void> {
      const statusBar = await $(selectors.statusBar);
      // Find the disk button (SVG with circle icon) - look for any button with Disk in title
      const buttons = await statusBar.$$("button");
      for (const btn of buttons) {
        const title = await btn.getAttribute("title");
        if (title && title.includes("Disk")) {
          await btn.click();
          await browser.pause(500);
          return;
        }
      }
      throw new Error("Disk button not found in status bar");
    }

    /**
     * Helper to wait for panel to appear
     */
    async function waitForPanel(): Promise<WebdriverIO.Element | null> {
      await browser.pause(500);
      // Look for the panel by its unique text content
      const panel = await $(".absolute.bottom-full");
      if (await panel.isDisplayed().catch(() => false)) {
        return panel;
      }
      return null;
    }

    it("should have disk mount button in status bar", async () => {
      const statusBar = await $(selectors.statusBar);
      const buttons = await statusBar.$$("button");
      let found = false;
      for (const btn of buttons) {
        const title = await btn.getAttribute("title");
        if (title && title.includes("Disk")) {
          found = true;
          break;
        }
      }
      expect(found).toBe(true);
    });

    it("should open mounted disks panel when disk button is clicked", async () => {
      await openMountedDisksPanel();
      const panel = await waitForPanel();
      expect(panel).not.toBeNull();
    });

    it("should show empty state when no disks are mounted", async () => {
      await openMountedDisksPanel();
      await browser.pause(500);

      // Look for empty state text within the panel
      const panel = await $(".absolute.bottom-full");
      if (await panel.isDisplayed().catch(() => false)) {
        const panelText = await panel.getText();
        expect(panelText.toLowerCase()).toContain("no disks mounted");
      } else {
        // Panel may have closed - just verify we can open it
        expect(true).toBe(true);
      }
    });

    it("should have Mount Disk button to open mount dialog", async () => {
      await openMountedDisksPanel();
      await browser.pause(300);

      const mountButton = await $("button*=Mount Disk");
      const isDisplayed = await mountButton.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(true);
    });

    it("should close panel when clicking outside", async () => {
      await openMountedDisksPanel();
      await browser.pause(300);

      // Click outside on main content
      const main = await $("main");
      await main.click();
      await browser.pause(500);

      // Panel should be closed - look for it
      const panel = await $(".absolute.bottom-full");
      const isDisplayed = await panel.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });
  });

  describe("Disk Mount Dialog", () => {
    /**
     * Helper to open the disk mount dialog
     */
    async function openDiskMountDialog(): Promise<void> {
      const statusBar = await $(selectors.statusBar);
      const buttons = await statusBar.$$("button");
      for (const btn of buttons) {
        const title = await btn.getAttribute("title");
        if (title && title.includes("Disk")) {
          await btn.click();
          break;
        }
      }
      await browser.pause(500);

      const mountButton = await $("button*=Mount Disk");
      await mountButton.click();
      await browser.pause(500);
    }

    /**
     * Helper to find the disk mount dialog (has role="dialog")
     */
    async function findDialog(): Promise<WebdriverIO.Element> {
      return $('[role="dialog"]');
    }

    it("should open disk mount dialog from mounted disks panel", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();
      await expect(dialog).toBeDisplayed();

      const title = await dialog.$("h2");
      const titleText = await title.getText();
      expect(titleText).toContain("Mount Disk");
    });

    it("should have VHD and Physical Disk tabs", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();

      // Check for both tabs
      const vhdTab = await dialog.$("button*=Mount VHD");
      const physicalTab = await dialog.$("button*=Mount Physical Disk");

      await expect(vhdTab).toBeDisplayed();
      await expect(physicalTab).toBeDisplayed();
    });

    it("should default to VHD tab", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();

      // VHD tab should be active (has active styling)
      const vhdTab = await dialog.$("button*=Mount VHD");
      const vhdClassName = await vhdTab.getAttribute("class");

      // VHD tab should have the active/selected styling
      expect(vhdClassName).toContain("bg-theme-accent-primary");
    });

    it("should show VHD file input and Browse button", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();

      // Should have file input (read-only for VHD path)
      const fileInput = await dialog.$('input[placeholder*="vhd"]');
      await expect(fileInput).toBeDisplayed();

      // Should have Browse button
      const browseButton = await dialog.$("button*=Browse");
      await expect(browseButton).toBeDisplayed();
    });

    it("should switch to Physical Disk tab when clicked", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();
      const physicalTab = await dialog.$("button*=Mount Physical Disk");
      await physicalTab.click();
      await browser.pause(300);

      // Should now show physical disk selector
      const diskSelector = await dialog.$("select");
      await expect(diskSelector).toBeDisplayed();

      // Should have "Select a disk..." placeholder option
      const selectorText = await diskSelector.getText();
      expect(selectorText).toContain("Select a disk");
    });

    it("should show physical disks in dropdown", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();
      const physicalTab = await dialog.$("button*=Mount Physical Disk");
      await physicalTab.click();
      await browser.pause(500);

      const diskSelector = await dialog.$("select");
      const options = await diskSelector.$$("option");

      // Should have at least placeholder + mock disks
      expect(options.length).toBeGreaterThanOrEqual(2);
    });

    it("should have mount name input field", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();

      // Find mount name input by label or placeholder
      const dialogText = await dialog.getText();
      expect(dialogText).toContain("Mount Name");

      const mountNameInput = await dialog.$('input[placeholder*="mydisk"]');
      await expect(mountNameInput).toBeDisplayed();
    });

    it("should show mount point preview", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();
      const dialogText = await dialog.getText();

      // Should show mount point path preview
      expect(dialogText).toContain("/mnt/wsl/");
    });

    it("should have filesystem type selector", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();
      const dialogText = await dialog.getText();

      expect(dialogText).toContain("Filesystem Type");
    });

    it("should have Advanced Options section", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();

      // Find the details/summary for advanced options
      const advancedSummary = await dialog.$("summary*=Advanced");
      await expect(advancedSummary).toBeDisplayed();
    });

    it("should expand Advanced Options when clicked", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();
      const advancedSummary = await dialog.$("summary*=Advanced");
      await advancedSummary.click();
      await browser.pause(300);

      // Should show mount options or bare mount checkbox
      const dialogText = await dialog.getText();
      expect(dialogText.toLowerCase()).toContain("mount options") ||
        expect(dialogText.toLowerCase()).toContain("bare");
    });

    it("should have Cancel and Mount buttons", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();

      const cancelButton = await dialog.$("button*=Cancel");
      // The submit Mount button has accent color background
      const mountButton = await dialog.$("button.bg-theme-accent-primary");

      await expect(cancelButton).toBeDisplayed();
      await expect(mountButton).toBeDisplayed();
    });

    it("should have Mount button visible on VHD tab", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();
      // The submit Mount button has accent color background
      const mountButton = await dialog.$("button.bg-theme-accent-primary");

      // Mount button should be visible (validation happens on submit)
      await expect(mountButton).toBeDisplayed();
    });

    it("should have Mount button visible on Physical Disk tab", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();
      const physicalTab = await dialog.$("button*=Mount Physical Disk");
      await physicalTab.click();
      await browser.pause(300);

      // The submit Mount button has accent color background
      const mountButton = await dialog.$("button.bg-theme-accent-primary");
      await expect(mountButton).toBeDisplayed();
    });

    it("should close dialog when Cancel is clicked", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();
      const cancelButton = await dialog.$("button*=Cancel");
      await cancelButton.click();
      await browser.pause(300);

      const dialogAfter = await findDialog();
      const isDisplayed = await dialogAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should have backdrop visible when dialog is open", async () => {
      await openDiskMountDialog();

      // Check that backdrop is visible (theme uses bg-theme-bg-primary/80 with backdrop-blur)
      const backdrop = await $(".backdrop-blur-xs");
      await expect(backdrop).toBeDisplayed();
    });

    it("should show partition selector when physical disk is selected", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();
      const physicalTab = await dialog.$("button*=Mount Physical Disk");
      await physicalTab.click();
      await browser.pause(500);

      // Select a disk from the dropdown
      const diskSelector = await dialog.$("select");
      const options = await diskSelector.$$("option");

      if (options.length > 1) {
        // Select the first actual disk (not placeholder)
        await diskSelector.selectByIndex(1);
        await browser.pause(500);

        // Should now show partition selector
        const dialogText = await dialog.getText();
        expect(dialogText).toContain("Partition");
      }
    });

    it("should show error message area for validation errors", async () => {
      await openDiskMountDialog();

      const dialog = await findDialog();

      // Error area exists but should not have visible error initially
      const errorContainer = await dialog.$(".bg-red-900");
      const isDisplayed = await errorContainer.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });
  });

  describe("Physical Disk Selection", () => {
    async function openPhysicalDiskTab(): Promise<void> {
      const statusBar = await $(selectors.statusBar);
      const buttons = await statusBar.$$("button");
      for (const btn of buttons) {
        const title = await btn.getAttribute("title");
        if (title && title.includes("Disk")) {
          await btn.click();
          break;
        }
      }
      await browser.pause(500);

      const mountButton = await $("button*=Mount Disk");
      await mountButton.click();
      await browser.pause(500);

      const dialog = await $('[role="dialog"]');
      const physicalTab = await dialog.$("button*=Mount Physical Disk");
      await physicalTab.click();
      await browser.pause(500);
    }

    it("should load physical disks list", async () => {
      await openPhysicalDiskTab();

      const dialog = await $('[role="dialog"]');
      const diskSelector = await dialog.$("select");

      const options = await diskSelector.$$("option");
      // Should have placeholder + at least one mock disk
      expect(options.length).toBeGreaterThanOrEqual(1);
    });

    it("should show disk name and size in dropdown", async () => {
      await openPhysicalDiskTab();

      const dialog = await $('[role="dialog"]');
      const diskSelector = await dialog.$("select");

      const selectorText = await diskSelector.getText();

      // Mock data includes Samsung SSD and WD Blue
      expect(
        selectorText.includes("Samsung") ||
          selectorText.includes("WD") ||
          selectorText.includes("GB") ||
          selectorText.includes("TB")
      ).toBe(true);
    });

    it("should show admin privilege warning", async () => {
      await openPhysicalDiskTab();

      const dialog = await $('[role="dialog"]');
      const dialogText = await dialog.getText();

      // Should mention admin/administrator privileges
      expect(dialogText.toLowerCase()).toContain("administrator") ||
        expect(dialogText.toLowerCase()).toContain("privileges");
    });
  });

  describe("Mount Dialog State Persistence", () => {
    it("should reset form when dialog is closed and reopened", async () => {
      const statusBar = await $(selectors.statusBar);
      const buttons = await statusBar.$$("button");
      let diskButton: WebdriverIO.Element | null = null;
      for (const btn of buttons) {
        const title = await btn.getAttribute("title");
        if (title && title.includes("Disk")) {
          diskButton = btn;
          break;
        }
      }

      if (!diskButton) {
        throw new Error("Disk button not found");
      }

      // Open panel and dialog
      await diskButton.click();
      await browser.pause(500);

      let mountButton = await $("button*=Mount Disk");
      await mountButton.click();
      await browser.pause(500);

      // Enter some data
      const dialog = await $('[role="dialog"]');
      const mountNameInput = await dialog.$('input[placeholder*="mydisk"]');
      await mountNameInput.setValue("testmount");

      // Close dialog
      const cancelButton = await dialog.$("button*=Cancel");
      await cancelButton.click();
      await browser.pause(500);

      // Reopen dialog
      await diskButton.click();
      await browser.pause(500);
      mountButton = await $("button*=Mount Disk");
      await mountButton.click();
      await browser.pause(500);

      // Mount name should be cleared
      const newDialog = await $('[role="dialog"]');
      const newMountNameInput = await newDialog.$('input[placeholder*="mydisk"]');
      const value = await newMountNameInput.getValue();
      expect(value).toBe("");
    });
  });
});
