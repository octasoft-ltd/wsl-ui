/**
 * Screenshot Capture System
 *
 * This spec file captures screenshots for documentation and store listings.
 * It uses mock mode for consistent, reproducible screenshots.
 *
 * Run with: npm run screenshots
 */

import * as path from "path";
import * as fs from "fs";
import {
  waitForAppReady,
  resetMockState,
  selectors,
  safeRefresh,
  waitForDialog,
  waitForResourceStats,
} from "../utils";

// Output directory for screenshots
const SCREENSHOT_DIR = path.join(process.cwd(), "docs", "screenshots");

// Ensure output directory exists
function ensureScreenshotDir(): void {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }
}

/**
 * Save a screenshot with the given name
 */
async function saveScreenshot(name: string): Promise<void> {
  ensureScreenshotDir();
  const filepath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await browser.saveScreenshot(filepath);
  console.log(`  Saved: ${name}.png`);
}

/**
 * Helper to navigate to settings page
 */
async function goToSettings(): Promise<void> {
  const settingsButton = await $(selectors.settingsButton);
  await settingsButton.click();
  await browser.pause(500);
}

/**
 * Helper to go back from settings
 */
async function goBack(): Promise<void> {
  const backButton = await $('[data-testid="back-button"]');
  await backButton.click();
  await browser.pause(500);
}

/**
 * Helper to switch to a settings tab
 */
async function switchToTab(tabId: string): Promise<void> {
  const tab = await $(`[data-testid="settings-tab-${tabId}"]`);
  await tab.click();
  await browser.pause(300);
}

/**
 * Helper to open quick actions menu for a distro
 */
async function openQuickActions(distroName: string): Promise<void> {
  const card = await $(selectors.distroCardByName(distroName));
  const quickActionsButton = await card.$('[data-testid="quick-actions-button"]');
  await quickActionsButton.click();
  await browser.pause(300);
}

/**
 * Helper to close any open menu by clicking outside
 */
async function closeMenu(): Promise<void> {
  const main = await $("main");
  await main.click();
  await browser.pause(200);
}

describe("Screenshot Capture", () => {
  before(async () => {
    // Set viewport size for consistent screenshots
    // Using 1280x800 for documentation, 1920x1080 for store
    const width = process.env.SCREENSHOT_WIDTH ? parseInt(process.env.SCREENSHOT_WIDTH) : 1280;
    const height = process.env.SCREENSHOT_HEIGHT ? parseInt(process.env.SCREENSHOT_HEIGHT) : 800;
    await browser.setWindowSize(width, height);
    console.log(`Screenshot viewport: ${width}x${height}`);
  });

  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(300);
    await resetMockState();
    await safeRefresh();
    await waitForAppReady();
    await browser.pause(500);
  });

  describe("Main Views", () => {
    it("captures distribution list with running/stopped states", async () => {
      // Wait for resource stats to load for running distros
      await waitForResourceStats();
      await browser.pause(500);
      await saveScreenshot("main-distro-list");
    });

    it("captures distribution list with filters visible", async () => {
      // The filters should be visible by default
      await waitForResourceStats();
      await browser.pause(300);
      await saveScreenshot("main-distro-filters");
    });
  });

  describe("Quick Actions Menu", () => {
    it("captures quick actions menu open", async () => {
      await openQuickActions("Ubuntu");
      await browser.pause(200);
      await saveScreenshot("menu-quick-actions");
      await closeMenu();
    });

    it("captures manage submenu open", async () => {
      await openQuickActions("Debian");
      await browser.pause(200);

      // Click Manage to open submenu (it's a click, not hover)
      const manageAction = await $(selectors.manageSubmenu);
      await manageAction.click();
      await browser.pause(300);
      await saveScreenshot("menu-manage-submenu");
      await closeMenu();
    });
  });

  describe("Dialogs", () => {
    it("captures New Distribution dialog", async () => {
      const newButton = await $(selectors.newDistroButton);
      await newButton.click();
      await waitForDialog(selectors.newDistroDialog);
      // Wait for distro list to load
      await $('[data-testid="quick-install-content"]').waitForDisplayed({ timeout: 5000 });
      await browser.pause(500);
      await saveScreenshot("dialog-new-distro");

      // Close dialog
      const cancelButton = await $(selectors.newDistroCancelButton);
      await cancelButton.click();
      await browser.pause(300);
    });

    it("captures New Distribution - Download tab", async () => {
      const newButton = await $(selectors.newDistroButton);
      await newButton.click();
      await waitForDialog(selectors.newDistroDialog);

      // Click download tab
      const downloadTab = await $(selectors.newDistroTabDownload);
      await downloadTab.click();
      // Wait for download content to load
      await $('[data-testid="download-content"]').waitForDisplayed({ timeout: 5000 });
      await browser.pause(500);
      await saveScreenshot("dialog-new-distro-download");

      const cancelButton = await $(selectors.newDistroCancelButton);
      await cancelButton.click();
      await browser.pause(300);
    });

    it("captures New Distribution - Container tab", async () => {
      const newButton = await $(selectors.newDistroButton);
      await newButton.click();
      await waitForDialog(selectors.newDistroDialog);

      // Click container tab
      const containerTab = await $(selectors.newDistroTabContainer);
      await containerTab.click();
      // Wait for container content to load
      await $('[data-testid="container-content"]').waitForDisplayed({ timeout: 5000 });
      await browser.pause(500);
      await saveScreenshot("dialog-new-distro-container");

      const cancelButton = await $(selectors.newDistroCancelButton);
      await cancelButton.click();
      await browser.pause(300);
    });

    it("captures New Distribution - LXC tab", async () => {
      const newButton = await $(selectors.newDistroButton);
      await newButton.click();
      await waitForDialog(selectors.newDistroDialog);

      // Click LXC tab
      const lxcTab = await $(selectors.newDistroTabLxc);
      await lxcTab.click();
      // Wait for LXC content to load
      await $('[data-testid="lxc-content"]').waitForDisplayed({ timeout: 5000 });
      await browser.pause(500);
      await saveScreenshot("dialog-new-distro-lxc");

      const cancelButton = await $(selectors.newDistroCancelButton);
      await cancelButton.click();
      await browser.pause(300);
    });

    it("captures Clone dialog", async () => {
      // Use stopped distro to avoid stop confirmation
      await openQuickActions("Debian");
      const cloneAction = await $('[data-testid="quick-action-clone"]');
      await cloneAction.click();
      await waitForDialog(selectors.cloneDialog);
      await browser.pause(300);
      await saveScreenshot("dialog-clone");

      const cancelButton = await $(selectors.cloneCancelButton);
      await cancelButton.click();
      await browser.pause(300);
    });

    it("captures Import dialog", async () => {
      const importButton = await $(selectors.importButton);
      await importButton.click();
      await waitForDialog('[role="dialog"]');
      await browser.pause(300);
      await saveScreenshot("dialog-import");

      // Close by pressing Escape
      await browser.keys("Escape");
      await browser.pause(300);
    });

    it("captures Rename dialog", async () => {
      await openQuickActions("Debian");

      // Click Manage to open submenu
      const manageAction = await $(selectors.manageSubmenu);
      await manageAction.click();
      await browser.pause(200);

      const renameAction = await $(selectors.renameAction);
      await renameAction.click();
      await waitForDialog(selectors.renameDialog);
      await browser.pause(300);
      await saveScreenshot("dialog-rename");

      const cancelButton = await $(selectors.renameCancelButton);
      await cancelButton.click();
      await browser.pause(300);
    });

    it("captures Move dialog", async () => {
      await openQuickActions("Debian");

      const manageAction = await $(selectors.manageSubmenu);
      await manageAction.click();
      await browser.pause(200);

      const moveAction = await $(selectors.moveAction);
      await moveAction.click();
      await waitForDialog('[role="dialog"]');
      await browser.pause(300);

      // If shutdown dialog appeared (distro was running), click through it
      const stopDialog = await $(selectors.stopAndActionDialog);
      if (await stopDialog.isExisting()) {
        const stopAndContinueButton = await $(selectors.stopAndContinueButton);
        await stopAndContinueButton.click();
        // Wait for shutdown to complete and move dialog to appear
        await browser.waitUntil(
          async () => {
            const dialog = await $(selectors.stopAndActionDialog);
            return !(await dialog.isExisting());
          },
          { timeout: 30000, timeoutMsg: "Stop dialog did not close" }
        );
        await waitForDialog('[role="dialog"]');
        await browser.pause(300);
      }

      await saveScreenshot("dialog-move");

      await browser.keys("Escape");
      await browser.pause(300);
    });

    it("captures Resize dialog", async () => {
      await openQuickActions("Debian");

      const manageAction = await $(selectors.manageSubmenu);
      await manageAction.click();
      await browser.pause(200);

      const resizeAction = await $(selectors.resizeAction);
      await resizeAction.click();
      await waitForDialog('[role="dialog"]');
      await browser.pause(300);

      // If shutdown dialog appeared (distro was running), click through it
      const stopDialog = await $(selectors.stopAndActionDialog);
      if (await stopDialog.isExisting()) {
        const stopAndContinueButton = await $(selectors.stopAndContinueButton);
        await stopAndContinueButton.click();
        // Wait for shutdown to complete and resize dialog to appear
        await browser.waitUntil(
          async () => {
            const dialog = await $(selectors.stopAndActionDialog);
            return !(await dialog.isExisting());
          },
          { timeout: 30000, timeoutMsg: "Stop dialog did not close" }
        );
        await waitForDialog('[role="dialog"]');
        await browser.pause(300);
      }

      await saveScreenshot("dialog-resize");

      await browser.keys("Escape");
      await browser.pause(300);
    });

    it("captures Compact Disk dialog", async () => {
      await openQuickActions("Debian");

      const manageAction = await $(selectors.manageSubmenu);
      await manageAction.click();
      await browser.pause(200);

      const compactAction = await $(selectors.compactAction);
      await compactAction.click();
      await waitForDialog('[role="dialog"]');
      // Wait for size info to load
      await browser.pause(500);
      await saveScreenshot("dialog-compact-disk");

      await browser.keys("Escape");
      await browser.pause(300);
    });

    it("captures Set Default User dialog", async () => {
      await openQuickActions("Debian");

      const manageAction = await $(selectors.manageSubmenu);
      await manageAction.click();
      await browser.pause(200);

      const setUserAction = await $(selectors.setUserAction);
      await setUserAction.click();
      await waitForDialog('[role="dialog"]');
      await browser.pause(300);
      await saveScreenshot("dialog-default-user");

      await browser.keys("Escape");
      await browser.pause(300);
    });

    it("captures Distribution Info dialog", async () => {
      await openQuickActions("Ubuntu");
      const infoAction = await $('[data-testid="quick-action-info"]');
      await infoAction.click();
      await waitForDialog(selectors.distroInfoDialog);
      await browser.pause(300);
      await saveScreenshot("dialog-distro-info");

      const closeButton = await $(selectors.infoCloseButton);
      await closeButton.click();
      await browser.pause(300);
    });

    it("captures Set WSL Version dialog", async () => {
      await openQuickActions("Debian");

      const manageAction = await $(selectors.manageSubmenu);
      await manageAction.click();
      await browser.pause(200);

      // Look for Set Version action
      const setVersionAction = await $('[data-testid="manage-action-set-version"]');
      if (await setVersionAction.isDisplayed().catch(() => false)) {
        await setVersionAction.click();
        await waitForDialog('[role="dialog"]');
        await browser.pause(300);
        await saveScreenshot("dialog-set-version");
        await browser.keys("Escape");
        await browser.pause(300);
      }
    });

    it("captures Stop and Continue dialog", async () => {
      // Try to clone running distro to trigger stop dialog
      await openQuickActions("Ubuntu");
      const cloneAction = await $('[data-testid="quick-action-clone"]');
      await cloneAction.click();

      const stopDialog = await waitForDialog(selectors.stopAndActionDialog, 5000);
      if (await stopDialog.isDisplayed().catch(() => false)) {
        await browser.pause(300);
        await saveScreenshot("dialog-stop-and-continue");

        const cancelButton = await $(selectors.stopDialogCancelButton);
        await cancelButton.click();
        await browser.pause(300);
      }
    });

    it("captures Confirm Delete dialog", async () => {
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const deleteButton = await debianCard.$(selectors.deleteButton);
      await deleteButton.click();

      await waitForDialog('[role="dialog"]');
      await browser.pause(300);
      await saveScreenshot("dialog-confirm-delete");

      // Cancel
      await browser.keys("Escape");
      await browser.pause(300);
    });
  });

  describe("Disk Mount Panel", () => {
    it("captures disk mount button and panel", async () => {
      // Click on disk mount button in header
      const diskButton = await $(selectors.diskMountButton);
      if (await diskButton.isDisplayed().catch(() => false)) {
        await diskButton.click();
        await browser.pause(300);
        await saveScreenshot("panel-disk-mount");

        // Close by clicking elsewhere
        await closeMenu();
      }
    });
  });

  describe("Settings Pages", () => {
    it("captures Application settings", async () => {
      await goToSettings();
      await browser.pause(300);
      await saveScreenshot("settings-app");
    });

    it("captures Appearance settings with themes", async () => {
      await goToSettings();
      await switchToTab("appearance");
      await browser.pause(300);
      await saveScreenshot("settings-appearance");
    });

    it("captures Auto-Refresh (Polling) settings", async () => {
      await goToSettings();
      await switchToTab("polling");
      await browser.pause(300);
      await saveScreenshot("settings-polling");
    });

    it("captures Timeouts settings", async () => {
      await goToSettings();
      await switchToTab("timeouts");
      await browser.pause(300);
      await saveScreenshot("settings-timeouts");
    });

    it("captures Executable Paths settings", async () => {
      await goToSettings();
      await switchToTab("executables");
      await browser.pause(300);
      await saveScreenshot("settings-executables");
    });

    it("captures WSL Global settings", async () => {
      await goToSettings();
      await switchToTab("wsl-global");
      await browser.pause(300);
      await saveScreenshot("settings-wsl-global");
    });

    it("captures WSL Per-Distribution settings", async () => {
      await goToSettings();
      await switchToTab("wsl-distro");
      await browser.pause(300);
      await saveScreenshot("settings-wsl-distro");
    });

    it("captures Custom Actions settings", async () => {
      await goToSettings();
      await switchToTab("actions");
      await browser.pause(300);
      await saveScreenshot("settings-custom-actions");
    });

    it("captures Distro Catalog settings", async () => {
      await goToSettings();
      await switchToTab("distros");
      await browser.pause(300);
      await saveScreenshot("settings-distro-catalog");
    });

    it("captures Remote Sources settings", async () => {
      await goToSettings();
      await switchToTab("sources");
      await browser.pause(300);
      await saveScreenshot("settings-sources");
    });

    it("captures About page", async () => {
      await goToSettings();
      await switchToTab("about");
      // Wait for version info to load
      await browser.pause(1000);
      await saveScreenshot("settings-about");
    });
  });

  describe("Theme Variations", () => {
    it("captures main view with Dracula theme", async () => {
      await goToSettings();
      await switchToTab("appearance");

      const draculaTheme = await $('[data-testid="theme-dracula"]');
      await draculaTheme.click();
      await browser.pause(500);

      await goBack();
      await waitForResourceStats();
      await browser.pause(300);
      await saveScreenshot("theme-dracula");
    });

    it("captures main view with Nord theme", async () => {
      await goToSettings();
      await switchToTab("appearance");

      const nordTheme = await $('[data-testid="theme-nord"]');
      if (await nordTheme.isDisplayed().catch(() => false)) {
        await nordTheme.click();
        await browser.pause(500);

        await goBack();
        await waitForResourceStats();
        await browser.pause(300);
        await saveScreenshot("theme-nord");
      }
    });

    it("captures main view with Cobalt theme", async () => {
      await goToSettings();
      await switchToTab("appearance");

      const cobaltTheme = await $('[data-testid="theme-cobalt"]');
      if (await cobaltTheme.isDisplayed().catch(() => false)) {
        await cobaltTheme.click();
        await browser.pause(500);

        await goBack();
        await waitForResourceStats();
        await browser.pause(300);
        await saveScreenshot("theme-cobalt");
      }
    });

    it("captures main view with Light theme", async () => {
      await goToSettings();
      await switchToTab("appearance");

      const lightTheme = await $('[data-testid="theme-light"]');
      if (await lightTheme.isDisplayed().catch(() => false)) {
        await lightTheme.click();
        await browser.pause(500);

        await goBack();
        await waitForResourceStats();
        await browser.pause(300);
        await saveScreenshot("theme-light");
      }
    });

    // Reset to default theme at the end
    after(async () => {
      try {
        // First refresh to ensure we're on the main page
        await safeRefresh();
        await waitForAppReady();
        await browser.pause(300);

        await goToSettings();
        await switchToTab("appearance");

        const defaultTheme = await $('[data-testid="theme-mission-control"]');
        await defaultTheme.click();
        await browser.pause(300);
      } catch {
        // Ignore errors in cleanup - theme reset is optional
      }
    });
  });

  describe("Status Bar", () => {
    it("captures status bar with WSL info", async () => {
      await waitForResourceStats();
      await browser.pause(300);

      // Focus on status bar area - this is at the bottom of the main view
      // The full-page screenshot will include it
      await saveScreenshot("status-bar");
    });
  });
});
