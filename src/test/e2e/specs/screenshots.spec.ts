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
  waitForDialogToDisappear,
} from "../utils";
import { actions, isElementDisplayed } from "../base";

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
 * Helper to switch to a settings tab
 */
async function switchToTab(tabId: string): Promise<void> {
  const tab = await $(`[data-testid="settings-tab-${tabId}"]`);
  await tab.click();
  // Wait for tab content to be visible
  await browser.waitUntil(
    async () => {
      const selectedTab = await $(`[data-testid="settings-tab-${tabId}"][data-state="active"]`);
      try {
        return await selectedTab.isExisting();
      } catch {
        return false;
      }
    },
    { timeout: 5000, timeoutMsg: `Settings tab ${tabId} did not become active` }
  );
}

/**
 * Helper to close any open menu by clicking outside
 */
async function closeMenu(): Promise<void> {
  const main = await $("main");
  await main.click();
  // Wait for menu to disappear
  await browser.waitUntil(
    async () => !(await isElementDisplayed(selectors.manageSubmenu)),
    { timeout: 3000, timeoutMsg: "Menu did not close" }
  );
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
    await resetMockState();
    await safeRefresh();
    await waitForAppReady();
  });

  describe("Main Views", () => {
    it("captures distribution list with running/stopped states", async () => {
      // Wait for resource stats to load for running distros
      await waitForResourceStats();
      await saveScreenshot("main-distro-list");
    });

    it("captures distribution list with filters visible", async () => {
      // The filters should be visible by default
      await waitForResourceStats();
      await saveScreenshot("main-distro-filters");
    });
  });

  describe("Quick Actions Menu", () => {
    it("captures quick actions menu open", async () => {
      await actions.openQuickActionsMenu("Ubuntu");
      await saveScreenshot("menu-quick-actions");
      await closeMenu();
    });

    it("captures manage submenu open", async () => {
      await actions.openManageSubmenu("Debian");
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
      await saveScreenshot("dialog-new-distro");

      // Close dialog
      const cancelButton = await $(selectors.newDistroCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.newDistroDialog);
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
      await saveScreenshot("dialog-new-distro-download");

      const cancelButton = await $(selectors.newDistroCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.newDistroDialog);
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
      await saveScreenshot("dialog-new-distro-container");

      const cancelButton = await $(selectors.newDistroCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.newDistroDialog);
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
      await saveScreenshot("dialog-new-distro-lxc");

      const cancelButton = await $(selectors.newDistroCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.newDistroDialog);
    });

    it("captures Clone dialog", async () => {
      // Use stopped distro to avoid stop confirmation
      await actions.openQuickActionsMenu("Debian");
      const cloneAction = await $(selectors.cloneAction);
      await cloneAction.click();
      await waitForDialog(selectors.cloneDialog);
      await saveScreenshot("dialog-clone");

      const cancelButton = await $(selectors.cloneCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.cloneDialog);
    });

    it("captures Import dialog", async () => {
      const importButton = await $(selectors.importButton);
      await importButton.click();
      await waitForDialog('[role="dialog"]');
      await saveScreenshot("dialog-import");

      // Close by pressing Escape
      await browser.keys("Escape");
      await waitForDialogToDisappear('[role="dialog"]');
    });

    it("captures Rename dialog", async () => {
      await actions.openManageSubmenu("Debian");

      const renameAction = await $(selectors.renameAction);
      await renameAction.click();
      await waitForDialog(selectors.renameDialog);
      await saveScreenshot("dialog-rename");

      const cancelButton = await $(selectors.renameCancelButton);
      await cancelButton.click();
      await waitForDialogToDisappear(selectors.renameDialog);
    });

    it("captures Move dialog", async () => {
      await actions.openManageSubmenu("Debian");

      const moveAction = await $(selectors.moveAction);
      await moveAction.click();
      await waitForDialog('[role="dialog"]');

      // If shutdown dialog appeared (distro was running), click through it
      await actions.handleStopDialogIfPresent();

      await saveScreenshot("dialog-move");

      await browser.keys("Escape");
      await waitForDialogToDisappear('[role="dialog"]');
    });

    it("captures Resize dialog", async () => {
      await actions.openManageSubmenu("Debian");

      const resizeAction = await $(selectors.resizeAction);
      await resizeAction.click();
      await waitForDialog('[role="dialog"]');

      // If shutdown dialog appeared (distro was running), click through it
      await actions.handleStopDialogIfPresent();

      await saveScreenshot("dialog-resize");

      await browser.keys("Escape");
      await waitForDialogToDisappear('[role="dialog"]');
    });

    it("captures Compact Disk dialog", async () => {
      await actions.openManageSubmenu("Debian");

      const compactAction = await $(selectors.compactAction);
      await compactAction.click();
      await waitForDialog('[role="dialog"]');
      // Wait for size info to load by checking for dialog content
      await browser.waitUntil(
        async () => {
          const dialog = await $('[role="dialog"]');
          const text = await dialog.getText();
          return text.toLowerCase().includes("size") || text.toLowerCase().includes("compact");
        },
        { timeout: 5000, timeoutMsg: "Compact dialog content did not load" }
      );
      await saveScreenshot("dialog-compact-disk");

      await browser.keys("Escape");
      await waitForDialogToDisappear('[role="dialog"]');
    });

    it("captures Set Default User dialog", async () => {
      await actions.openManageSubmenu("Debian");

      const setUserAction = await $(selectors.setUserAction);
      await setUserAction.click();
      await waitForDialog('[role="dialog"]');
      await saveScreenshot("dialog-default-user");

      await browser.keys("Escape");
      await waitForDialogToDisappear('[role="dialog"]');
    });

    it("captures Distribution Info dialog", async () => {
      await actions.openQuickActionsMenu("Ubuntu");
      const infoAction = await $(selectors.infoAction);
      await infoAction.click();
      await waitForDialog(selectors.distroInfoDialog);
      await saveScreenshot("dialog-distro-info");

      const closeButton = await $(selectors.infoCloseButton);
      await closeButton.click();
      await waitForDialogToDisappear(selectors.distroInfoDialog);
    });

    it("captures Set WSL Version dialog", async () => {
      await actions.openManageSubmenu("Debian");

      // Look for Set Version action
      const setVersionSelector = '[data-testid="manage-action-set-version"]';
      if (await isElementDisplayed(setVersionSelector)) {
        const setVersionAction = await $(setVersionSelector);
        await setVersionAction.click();
        await waitForDialog('[role="dialog"]');
        await saveScreenshot("dialog-set-version");
        await browser.keys("Escape");
        await waitForDialogToDisappear('[role="dialog"]');
      }
    });

    it("captures Stop and Continue dialog", async () => {
      // Try to clone running distro to trigger stop dialog
      await actions.openQuickActionsMenu("Ubuntu");
      const cloneAction = await $(selectors.cloneAction);
      await cloneAction.click();

      const stopDialog = await waitForDialog(selectors.stopAndActionDialog, 5000);
      if (await isElementDisplayed(selectors.stopAndActionDialog)) {
        await saveScreenshot("dialog-stop-and-continue");

        const cancelButton = await $(selectors.stopDialogCancelButton);
        await cancelButton.click();
        await waitForDialogToDisappear(selectors.stopAndActionDialog);
      }
    });

    it("captures Confirm Delete dialog", async () => {
      const debianCard = await $(selectors.distroCardByName("Debian"));
      const deleteButton = await debianCard.$(selectors.deleteButton);
      await deleteButton.click();

      await waitForDialog('[role="dialog"]');
      await saveScreenshot("dialog-confirm-delete");

      // Cancel
      await browser.keys("Escape");
      await waitForDialogToDisappear('[role="dialog"]');
    });
  });

  describe("Disk Mount Panel", () => {
    it("captures disk mount button and panel", async () => {
      // Click on disk mount button in header
      if (await isElementDisplayed(selectors.diskMountButton)) {
        const diskButton = await $(selectors.diskMountButton);
        await diskButton.click();
        // Wait for panel to appear
        await browser.waitUntil(
          async () => isElementDisplayed('[data-testid="disk-mount-panel"]'),
          { timeout: 5000 }
        );
        await saveScreenshot("panel-disk-mount");

        // Close by clicking elsewhere
        await closeMenu();
      }
    });
  });

  describe("Settings Pages", () => {
    it("captures Application settings", async () => {
      await actions.goToSettings();
      await saveScreenshot("settings-app");
    });

    it("captures Appearance settings with themes", async () => {
      await actions.goToSettings();
      await switchToTab("appearance");
      await saveScreenshot("settings-appearance");
    });

    it("captures Auto-Refresh (Polling) settings", async () => {
      await actions.goToSettings();
      await switchToTab("polling");
      await saveScreenshot("settings-polling");
    });

    it("captures Timeouts settings", async () => {
      await actions.goToSettings();
      await switchToTab("timeouts");
      await saveScreenshot("settings-timeouts");
    });

    it("captures Executable Paths settings", async () => {
      await actions.goToSettings();
      await switchToTab("executables");
      await saveScreenshot("settings-executables");
    });

    it("captures WSL Global settings", async () => {
      await actions.goToSettings();
      await switchToTab("wsl-global");
      await saveScreenshot("settings-wsl-global");
    });

    it("captures WSL Per-Distribution settings", async () => {
      await actions.goToSettings();
      await switchToTab("wsl-distro");
      await saveScreenshot("settings-wsl-distro");
    });

    it("captures Custom Actions settings", async () => {
      await actions.goToSettings();
      await switchToTab("actions");
      await saveScreenshot("settings-custom-actions");
    });

    it("captures Distro Catalog settings", async () => {
      await actions.goToSettings();
      await switchToTab("distros");
      await saveScreenshot("settings-distro-catalog");
    });

    it("captures Remote Sources settings", async () => {
      await actions.goToSettings();
      await switchToTab("sources");
      await saveScreenshot("settings-sources");
    });

    it("captures About page", async () => {
      await actions.goToSettings();
      await switchToTab("about");
      // Wait for version info to load
      await browser.waitUntil(
        async () => isElementDisplayed('*=Version'),
        { timeout: 5000, timeoutMsg: "Version info did not load" }
      );
      await saveScreenshot("settings-about");
    });
  });

  describe("Theme Variations", () => {
    it("captures main view with Dracula theme", async () => {
      await actions.goToSettings();
      await switchToTab("appearance");

      const draculaTheme = await $(selectors.themeButton("dracula"));
      await draculaTheme.click();
      // Wait for theme to be applied
      await browser.waitUntil(
        async () => {
          const html = await $("html");
          const className = await html.getAttribute("class");
          return className.includes("dracula");
        },
        { timeout: 5000, timeoutMsg: "Dracula theme was not applied" }
      );

      await actions.goBackFromSettings();
      await waitForResourceStats();
      await saveScreenshot("theme-dracula");
    });

    it("captures main view with Nord theme", async () => {
      await actions.goToSettings();
      await switchToTab("appearance");

      const nordSelector = selectors.themeButton("nord");
      if (await isElementDisplayed(nordSelector)) {
        const nordTheme = await $(nordSelector);
        await nordTheme.click();
        // Wait for theme to be applied
        await browser.waitUntil(
          async () => {
            const html = await $("html");
            const className = await html.getAttribute("class");
            return className.includes("nord");
          },
          { timeout: 5000, timeoutMsg: "Nord theme was not applied" }
        );

        await actions.goBackFromSettings();
        await waitForResourceStats();
        await saveScreenshot("theme-nord");
      }
    });

    it("captures main view with Cobalt theme", async () => {
      await actions.goToSettings();
      await switchToTab("appearance");

      const cobaltSelector = selectors.themeButton("cobalt");
      if (await isElementDisplayed(cobaltSelector)) {
        const cobaltTheme = await $(cobaltSelector);
        await cobaltTheme.click();
        // Wait for theme to be applied
        await browser.waitUntil(
          async () => {
            const html = await $("html");
            const className = await html.getAttribute("class");
            return className.includes("cobalt");
          },
          { timeout: 5000, timeoutMsg: "Cobalt theme was not applied" }
        );

        await actions.goBackFromSettings();
        await waitForResourceStats();
        await saveScreenshot("theme-cobalt");
      }
    });

    it("captures main view with Light theme", async () => {
      await actions.goToSettings();
      await switchToTab("appearance");

      const lightSelector = selectors.themeButton("light");
      if (await isElementDisplayed(lightSelector)) {
        const lightTheme = await $(lightSelector);
        await lightTheme.click();
        // Wait for theme to be applied
        await browser.waitUntil(
          async () => {
            const html = await $("html");
            const className = await html.getAttribute("class");
            return className.includes("light");
          },
          { timeout: 5000, timeoutMsg: "Light theme was not applied" }
        );

        await actions.goBackFromSettings();
        await waitForResourceStats();
        await saveScreenshot("theme-light");
      }
    });

    // Reset to default theme at the end
    after(async () => {
      try {
        // First refresh to ensure we're on the main page
        await safeRefresh();
        await waitForAppReady();

        await actions.goToSettings();
        await switchToTab("appearance");

        const defaultTheme = await $(selectors.themeButton("mission-control"));
        await defaultTheme.click();
        // Wait for theme to be applied
        await browser.waitUntil(
          async () => {
            const html = await $("html");
            const className = await html.getAttribute("class");
            return className.includes("mission-control");
          },
          { timeout: 5000 }
        );
      } catch {
        // Ignore errors in cleanup - theme reset is optional
      }
    });
  });

  describe("Status Bar", () => {
    it("captures status bar with WSL info", async () => {
      await waitForResourceStats();

      // Focus on status bar area - this is at the bottom of the main view
      // The full-page screenshot will include it
      await saveScreenshot("status-bar");
    });
  });
});
