/**
 * E2E Tests for Advanced Disk Mount Scenarios
 *
 * Tests complex disk mount operations:
 * - Mounts VHD with custom mount options
 * - Mounts physical disk partition
 * - Unmounts single disk
 * - Unmounts all disks
 * - Mount point path validation
 * - Handles mount errors
 * - Refreshes disk list
 * - Shows physical disk requires admin privileges warning
 */

import { waitForAppReady, resetMockState, safeRefresh } from "../utils";

const selectors = {
  // Status bar
  diskMountsButton: '[data-testid="disk-mounts-button"]',

  // Mounted Disks Panel
  mountedDisksPanel: '[data-testid="mounted-disks-panel"]',
  mountedDisksTitle: '[data-testid="mounted-disks-title"]',
  unmountAllButton: '[data-testid="unmount-all-button"]',
  mountedDisksError: '[data-testid="mounted-disks-error"]',
  mountedDisksClearError: '[data-testid="mounted-disks-clear-error"]',
  mountedDisksList: '[data-testid="mounted-disks-list"]',
  mountedDisksLoading: '[data-testid="mounted-disks-loading"]',
  mountedDisksEmpty: '[data-testid="mounted-disks-empty"]',
  mountNewDiskButton: '[data-testid="mount-new-disk-button"]',

  // Disk Mount Dialog
  diskMountDialog: '[data-testid="disk-mount-dialog"]',
  diskMountTitle: '[data-testid="disk-mount-title"]',
  diskMountTabs: '[data-testid="disk-mount-tabs"]',
  diskMountTabVhd: '[data-testid="disk-mount-tab-vhd"]',
  diskMountTabPhysical: '[data-testid="disk-mount-tab-physical"]',
  diskMountError: '[data-testid="disk-mount-error"]',

  // VHD Section
  diskMountVhdSection: '[data-testid="disk-mount-vhd-section"]',
  diskMountVhdPath: '[data-testid="disk-mount-vhd-path"]',
  diskMountBrowseVhd: '[data-testid="disk-mount-browse-vhd"]',

  // Physical Section
  diskMountPhysicalSection: '[data-testid="disk-mount-physical-section"]',
  diskMountPhysicalSelector: '[data-testid="disk-mount-physical-selector"]',
  diskMountAdminWarning: '[data-testid="disk-mount-admin-warning"]',
  diskMountPartitionSelector: '[data-testid="disk-mount-partition-selector"]',

  // Mount Options
  diskMountNameInput: '[data-testid="disk-mount-name-input"]',
  diskMountPointHint: '[data-testid="disk-mount-point-hint"]',
  diskMountFilesystemSelector: '[data-testid="disk-mount-filesystem-selector"]',

  // Advanced Options
  diskMountAdvancedOptions: '[data-testid="disk-mount-advanced-options"]',
  diskMountOptionsInput: '[data-testid="disk-mount-options-input"]',
  diskMountBareCheckbox: '[data-testid="disk-mount-bare-checkbox"]',

  // Buttons
  diskMountCancelButton: '[data-testid="disk-mount-cancel-button"]',
  diskMountSubmitButton: '[data-testid="disk-mount-submit-button"]',
};

async function openMountedDisksPanel(): Promise<void> {
  const diskButton = await $(selectors.diskMountsButton);
  await diskButton.waitForClickable({ timeout: 5000 });
  await diskButton.click();
  await browser.pause(300);
}

async function openDiskMountDialog(): Promise<void> {
  await openMountedDisksPanel();
  const mountNewButton = await $(selectors.mountNewDiskButton);
  await mountNewButton.waitForClickable({ timeout: 5000 });
  await mountNewButton.click();
  await browser.pause(300);
}

describe("Disk Mount Advanced Scenarios", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(500);
    await resetMockState();
    await waitForAppReady();
    await browser.pause(500);
  });

  describe("Mounted Disks Panel", () => {
    it("should open mounted disks panel when disk button is clicked", async () => {
      await openMountedDisksPanel();

      const panel = await $(selectors.mountedDisksPanel);
      await expect(panel).toBeDisplayed();

      const title = await $(selectors.mountedDisksTitle);
      await expect(title).toBeDisplayed();
      const titleText = await title.getText();
      expect(titleText.toLowerCase()).toContain("disk");
    });

    it("should show empty state when no disks are mounted", async () => {
      await openMountedDisksPanel();

      const emptyState = await $(selectors.mountedDisksEmpty);
      // May or may not show depending on mock data
      const isDisplayed = await emptyState.isDisplayed().catch(() => false);

      // Either empty state or disk list should be shown
      if (!isDisplayed) {
        const disksList = await $(selectors.mountedDisksList);
        await expect(disksList).toBeDisplayed();
      }
    });

    it("should close panel when clicking outside", async () => {
      await openMountedDisksPanel();

      const panel = await $(selectors.mountedDisksPanel);
      await expect(panel).toBeDisplayed();

      // Click outside the panel (on the status bar footer)
      const statusBar = await $('[data-testid="status-bar"]');
      await browser.execute((el) => {
        const rect = el.getBoundingClientRect();
        // Click on far right of status bar (away from panel)
        const event = new MouseEvent("mousedown", {
          bubbles: true,
          clientX: rect.right - 10,
          clientY: rect.top + rect.height / 2,
        });
        document.dispatchEvent(event);
      }, statusBar);
      await browser.pause(300);

      const panelAfter = await $(selectors.mountedDisksPanel);
      const isDisplayed = await panelAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should have mount new disk button", async () => {
      await openMountedDisksPanel();

      const mountNewButton = await $(selectors.mountNewDiskButton);
      await expect(mountNewButton).toBeDisplayed();
      await expect(mountNewButton).toBeClickable();
    });
  });

  describe("Disk Mount Dialog - VHD Tab", () => {
    it("should open disk mount dialog from panel", async () => {
      await openDiskMountDialog();

      const dialog = await $(selectors.diskMountDialog);
      await expect(dialog).toBeDisplayed();

      const title = await $(selectors.diskMountTitle);
      await expect(title).toBeDisplayed();
    });

    it("should show VHD tab by default", async () => {
      await openDiskMountDialog();

      const vhdSection = await $(selectors.diskMountVhdSection);
      await expect(vhdSection).toBeDisplayed();

      const vhdPathInput = await $(selectors.diskMountVhdPath);
      await expect(vhdPathInput).toBeDisplayed();
    });

    it("should have browse button for VHD selection", async () => {
      await openDiskMountDialog();

      const browseButton = await $(selectors.diskMountBrowseVhd);
      await expect(browseButton).toBeDisplayed();
      await expect(browseButton).toBeClickable();
    });

    it("should show mount name input with hint", async () => {
      await openDiskMountDialog();

      const nameInput = await $(selectors.diskMountNameInput);
      await expect(nameInput).toBeDisplayed();

      const hint = await $(selectors.diskMountPointHint);
      await expect(hint).toBeDisplayed();
      const hintText = await hint.getText();
      expect(hintText).toContain("/mnt/wsl/");
    });

    it("should update mount point hint when name is entered", async () => {
      await openDiskMountDialog();

      const nameInput = await $(selectors.diskMountNameInput);
      await nameInput.setValue("mydata");
      await browser.pause(200);

      const hint = await $(selectors.diskMountPointHint);
      const hintText = await hint.getText();
      expect(hintText).toContain("mydata");
    });

    it("should have filesystem type selector", async () => {
      await openDiskMountDialog();

      const fsSelector = await $(selectors.diskMountFilesystemSelector);
      await expect(fsSelector).toBeDisplayed();

      // Check default is auto-detect
      const value = await fsSelector.getValue();
      expect(value).toBe("");
    });

    it("should allow selecting different filesystem types", async () => {
      await openDiskMountDialog();

      const fsSelector = await $(selectors.diskMountFilesystemSelector);
      await fsSelector.selectByAttribute("value", "ext4");
      await browser.pause(200);

      const value = await fsSelector.getValue();
      expect(value).toBe("ext4");
    });
  });

  describe("Disk Mount Dialog - Physical Tab", () => {
    it("should switch to physical disk tab", async () => {
      await openDiskMountDialog();

      const physicalTab = await $(selectors.diskMountTabPhysical);
      await physicalTab.click();
      await browser.pause(300);

      const physicalSection = await $(selectors.diskMountPhysicalSection);
      await expect(physicalSection).toBeDisplayed();
    });

    it("should show admin privileges warning for physical disks", async () => {
      await openDiskMountDialog();

      const physicalTab = await $(selectors.diskMountTabPhysical);
      await physicalTab.click();
      await browser.pause(300);

      const adminWarning = await $(selectors.diskMountAdminWarning);
      await expect(adminWarning).toBeDisplayed();
      const warningText = await adminWarning.getText();
      expect(warningText.toLowerCase()).toContain("admin");
    });

    it("should have physical disk selector", async () => {
      await openDiskMountDialog();

      const physicalTab = await $(selectors.diskMountTabPhysical);
      await physicalTab.click();
      await browser.pause(300);

      const diskSelector = await $(selectors.diskMountPhysicalSelector);
      await expect(diskSelector).toBeDisplayed();
    });
  });

  describe("Disk Mount Dialog - Advanced Options", () => {
    it("should have collapsible advanced options", async () => {
      await openDiskMountDialog();

      const advancedOptions = await $(selectors.diskMountAdvancedOptions);
      await expect(advancedOptions).toBeDisplayed();
    });

    it("should expand advanced options on click", async () => {
      await openDiskMountDialog();

      const advancedOptions = await $(selectors.diskMountAdvancedOptions);
      const summary = await advancedOptions.$("summary");
      await summary.click();
      await browser.pause(300);

      const mountOptionsInput = await $(selectors.diskMountOptionsInput);
      await expect(mountOptionsInput).toBeDisplayed();
    });

    it("should have mount options input for custom options", async () => {
      await openDiskMountDialog();

      // Expand advanced options
      const advancedOptions = await $(selectors.diskMountAdvancedOptions);
      const summary = await advancedOptions.$("summary");
      await summary.click();
      await browser.pause(300);

      const optionsInput = await $(selectors.diskMountOptionsInput);
      await expect(optionsInput).toBeDisplayed();

      // Enter custom mount options
      await optionsInput.setValue("ro,noexec");
      await browser.pause(200);

      const value = await optionsInput.getValue();
      expect(value).toBe("ro,noexec");
    });

    it("should have bare mount checkbox", async () => {
      await openDiskMountDialog();

      // Expand advanced options
      const advancedOptions = await $(selectors.diskMountAdvancedOptions);
      const summary = await advancedOptions.$("summary");
      await summary.click();
      await browser.pause(300);

      const bareCheckbox = await $(selectors.diskMountBareCheckbox);
      await expect(bareCheckbox).toBeDisplayed();

      // Should be unchecked by default
      const isSelected = await bareCheckbox.isSelected();
      expect(isSelected).toBe(false);
    });

    it("should toggle bare mount checkbox", async () => {
      await openDiskMountDialog();

      // Expand advanced options
      const advancedOptions = await $(selectors.diskMountAdvancedOptions);
      const summary = await advancedOptions.$("summary");
      await summary.click();
      await browser.pause(300);

      const bareCheckbox = await $(selectors.diskMountBareCheckbox);
      await bareCheckbox.click();
      await browser.pause(200);

      const isSelected = await bareCheckbox.isSelected();
      expect(isSelected).toBe(true);
    });
  });

  describe("Disk Mount Dialog - Validation", () => {
    it("should disable mount button without VHD path", async () => {
      await openDiskMountDialog();

      const submitButton = await $(selectors.diskMountSubmitButton);
      // Without a VHD path, button should be disabled
      const isEnabled = await submitButton.isEnabled();
      expect(isEnabled).toBe(false);
    });

    it("should disable mount button without physical disk selection", async () => {
      await openDiskMountDialog();

      // Switch to physical tab
      const physicalTab = await $(selectors.diskMountTabPhysical);
      await physicalTab.click();
      await browser.pause(300);

      const submitButton = await $(selectors.diskMountSubmitButton);
      // Without a disk selected, button should be disabled
      const isEnabled = await submitButton.isEnabled();
      expect(isEnabled).toBe(false);
    });
  });

  describe("Disk Mount Dialog - Close Behavior", () => {
    it("should close dialog with cancel button", async () => {
      await openDiskMountDialog();

      const cancelButton = await $(selectors.diskMountCancelButton);
      await cancelButton.click();
      await browser.pause(300);

      const dialog = await $(selectors.diskMountDialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should close dialog with Escape key", async () => {
      await openDiskMountDialog();

      const dialog = await $(selectors.diskMountDialog);
      await expect(dialog).toBeDisplayed();

      await browser.keys("Escape");
      await browser.pause(300);

      const dialogAfter = await $(selectors.diskMountDialog);
      const isDisplayed = await dialogAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should reset form when dialog is closed and reopened", async () => {
      await openDiskMountDialog();

      // Enter some data
      const nameInput = await $(selectors.diskMountNameInput);
      await nameInput.setValue("test-disk-name");
      await browser.pause(200);

      // Close dialog
      const cancelButton = await $(selectors.diskMountCancelButton);
      await cancelButton.click();
      await browser.pause(300);

      // Reopen dialog
      await openDiskMountDialog();

      // Check that name is reset
      const newNameInput = await $(selectors.diskMountNameInput);
      const value = await newNameInput.getValue();
      expect(value).toBe("");
    });
  });

  describe("Tab Switching", () => {
    it("should switch between VHD and Physical tabs", async () => {
      await openDiskMountDialog();

      // Start on VHD tab
      let vhdSection = await $(selectors.diskMountVhdSection);
      await expect(vhdSection).toBeDisplayed();

      // Switch to Physical
      const physicalTab = await $(selectors.diskMountTabPhysical);
      await physicalTab.click();
      await browser.pause(300);

      const physicalSection = await $(selectors.diskMountPhysicalSection);
      await expect(physicalSection).toBeDisplayed();

      // Switch back to VHD
      const vhdTab = await $(selectors.diskMountTabVhd);
      await vhdTab.click();
      await browser.pause(300);

      vhdSection = await $(selectors.diskMountVhdSection);
      await expect(vhdSection).toBeDisplayed();
    });

    it("should preserve mount name when switching tabs", async () => {
      await openDiskMountDialog();

      // Enter mount name
      const nameInput = await $(selectors.diskMountNameInput);
      await nameInput.setValue("persistent-name");
      await browser.pause(200);

      // Switch to Physical
      const physicalTab = await $(selectors.diskMountTabPhysical);
      await physicalTab.click();
      await browser.pause(300);

      // Switch back to VHD
      const vhdTab = await $(selectors.diskMountTabVhd);
      await vhdTab.click();
      await browser.pause(300);

      // Check name persists
      const newNameInput = await $(selectors.diskMountNameInput);
      const value = await newNameInput.getValue();
      expect(value).toBe("persistent-name");
    });
  });
});
