/**
 * Demo Video Capture
 *
 * This spec creates a single polished walkthrough video of the app's key features.
 * All scenes are in one test to produce one continuous video file.
 *
 * Run with: npm run demo
 *
 * Environment variables:
 *   DEMO_WIDTH / DEMO_HEIGHT - Video resolution (default: 1280x720)
 *   VIDEO_SPEED - Slowdown multiplier in wdio.conf.ts (default: 1)
 */

import {
  selectors,
  waitForDialog,
  waitForResourceStats,
} from "../utils";
import { standardSetup } from "../base";

// Timing constants for smooth video presentation (in milliseconds)
const PAUSE_SHORT = 800;       // Brief transition
const PAUSE_MEDIUM = 1500;     // Standard pause to view content
const PAUSE_LONG = 2000;       // Longer pause for important features
const PAUSE_SCENE = 2500;      // Scene transition / showcase moment

/**
 * Active pause that keeps capturing video frames.
 * wdio-video-reporter only captures during WebDriver commands,
 * so we need to actively poll an element instead of using browser.pause()
 */
async function videoPause(ms: number): Promise<void> {
  // 250ms interval balances smooth video vs execution speed
  // Lower = smoother video but slower execution due to WebDriver overhead
  const interval = 250;
  const iterations = Math.ceil(ms / interval);

  for (let i = 0; i < iterations; i++) {
    // Perform a WebDriver command to trigger frame capture
    await $("body").isDisplayed();
    await browser.pause(interval);
  }
}

/**
 * Helper to navigate to settings page
 */
async function goToSettings(): Promise<void> {
  const settingsButton = await $(selectors.settingsButton);
  await settingsButton.click();
  await videoPause(PAUSE_MEDIUM);
}

/**
 * Helper to go back from settings
 */
async function goBack(): Promise<void> {
  const backButton = await $('[data-testid="back-button"]');
  await backButton.click();
  await videoPause(PAUSE_MEDIUM);
}

/**
 * Helper to switch to a settings tab
 */
async function switchToTab(tabId: string): Promise<void> {
  const tab = await $(`[data-testid="settings-tab-${tabId}"]`);
  await tab.click();
  await videoPause(PAUSE_SHORT);
}

/**
 * Helper to open quick actions menu for a distro
 */
async function openQuickActions(distroName: string): Promise<void> {
  const card = await $(selectors.distroCardByName(distroName));
  const quickActionsButton = await card.$('[data-testid="quick-actions-button"]');
  await quickActionsButton.click();
  await videoPause(PAUSE_SHORT);
}

/**
 * Helper to close any open menu by clicking outside
 */
async function closeMenu(): Promise<void> {
  const main = await $("main");
  await main.click();
  await videoPause(PAUSE_SHORT);
}

/**
 * Helper to safely check if an element is displayed
 */
async function isElementDisplayedSafe(element: WebdriverIO.Element): Promise<boolean> {
  try {
    return await element.isDisplayed();
  } catch {
    return false;
  }
}

/**
 * Helper to apply a theme
 */
async function applyTheme(themeId: string): Promise<void> {
  const theme = await $(`[data-testid="theme-${themeId}"]`);
  if (await isElementDisplayedSafe(theme)) {
    await theme.click();
    await videoPause(PAUSE_MEDIUM);
  }
}

/**
 * Log scene marker for debugging
 */
function scene(name: string): void {
  console.log(`\n>>> SCENE: ${name}\n`);
}

describe("Demo", () => {
  before(async () => {
    // Set viewport size and position for video recording
    const width = process.env.DEMO_WIDTH ? parseInt(process.env.DEMO_WIDTH) : 1280;
    const height = process.env.DEMO_HEIGHT ? parseInt(process.env.DEMO_HEIGHT) : 720;
    // Set position and size together to prevent jumping
    await browser.setWindowRect(0, 0, width, height);
    console.log(`\nDemo viewport: ${width}x${height}`);
    console.log(`Video will be saved to: docs/videos/\n`);
  });

  it("wsl-ui", async () => {
    // =========================================================================
    // SETUP
    // =========================================================================
    await standardSetup();
    await videoPause(PAUSE_SHORT);

    // =========================================================================
    // SCENE 1: Main Dashboard Overview
    // =========================================================================
    scene("Main Dashboard Overview");

    // Wait for resource stats to load for running distros
    await waitForResourceStats();
    await videoPause(PAUSE_SCENE);

    // Hover over a running distro to highlight it
    const ubuntuCard = await $(selectors.distroCardByName("Ubuntu"));
    await ubuntuCard.moveTo();
    await videoPause(PAUSE_LONG);

    // Show stopped distro
    const debianCard = await $(selectors.distroCardByName("Debian"));
    await debianCard.moveTo();
    await videoPause(PAUSE_LONG);

    // =========================================================================
    // SCENE 2: Distribution Filters
    // =========================================================================
    scene("Distribution Filters");

    // Filter to Online only
    const onlineFilter = await $('[data-testid="status-filter-online"]');
    await onlineFilter.click();
    await videoPause(PAUSE_LONG);

    // Filter to Offline only
    const offlineFilter = await $('[data-testid="status-filter-offline"]');
    await offlineFilter.click();
    await videoPause(PAUSE_LONG);

    // Back to All
    const allFilter = await $('[data-testid="status-filter-all"]');
    await allFilter.click();
    await videoPause(PAUSE_MEDIUM);

    // Toggle WSL version filters
    const wsl1Filter = await $('[data-testid="version-filter-wsl1"]');
    await wsl1Filter.click();
    await videoPause(PAUSE_LONG);

    // Re-enable WSL 1
    await wsl1Filter.click();
    await videoPause(PAUSE_SHORT);

    // Toggle WSL 2
    const wsl2Filter = await $('[data-testid="version-filter-wsl2"]');
    await wsl2Filter.click();
    await videoPause(PAUSE_LONG);

    // Re-enable WSL 2
    await wsl2Filter.click();
    await videoPause(PAUSE_MEDIUM);

    // =========================================================================
    // SCENE 3: Quick Actions Menu
    // =========================================================================
    scene("Quick Actions Menu");

    // Open quick actions for Ubuntu
    await openQuickActions("Ubuntu");
    await videoPause(PAUSE_LONG);

    // Scroll down so manage submenu is visible
    await browser.execute(() => window.scrollBy(0, 150));
    await videoPause(PAUSE_SHORT);

    // Show manage submenu
    const manageAction = await $(selectors.manageSubmenu);
    await manageAction.click();
    await videoPause(PAUSE_LONG);

    await closeMenu();
    // Scroll back to top
    await browser.execute(() => window.scrollTo(0, 0));
    await videoPause(PAUSE_MEDIUM);

    // =========================================================================
    // SCENE 4: Export Distribution
    // =========================================================================
    scene("Export Distribution");

    await openQuickActions("Debian");
    const exportAction = await $('[data-testid="quick-action-export"]');
    if (await isElementDisplayedSafe(exportAction)) {
      // Highlight the export action (don't click - it opens native file dialog)
      await exportAction.moveTo();
      await videoPause(PAUSE_LONG);
    }
    await closeMenu();
    await videoPause(PAUSE_SHORT);

    // =========================================================================
    // SCENE 5: Distribution Information
    // =========================================================================
    scene("Distribution Information");

    await openQuickActions("Ubuntu");
    await videoPause(PAUSE_SHORT);

    const infoAction = await $('[data-testid="quick-action-info"]');
    await infoAction.click();
    await waitForDialog(selectors.distroInfoDialog);
    await videoPause(PAUSE_SCENE);

    // Close dialog
    const infoCloseButton = await $(selectors.infoCloseButton);
    await infoCloseButton.click();
    await videoPause(PAUSE_MEDIUM);

    // =========================================================================
    // SCENE 6: Import Distribution
    // =========================================================================
    scene("Import Distribution");

    const importButton = await $(selectors.importButton);
    await importButton.click();
    await waitForDialog('[role="dialog"]');
    await videoPause(PAUSE_SCENE);

    // Close dialog by clicking Cancel button
    const importCancelButton = await $('button=Cancel');
    await importCancelButton.click();
    await videoPause(PAUSE_MEDIUM);

    // =========================================================================
    // SCENE 7: Create New Distribution Dialog
    // =========================================================================
    scene("Create New Distribution");

    const newButton = await $(selectors.newDistroButton);
    await newButton.click();
    await waitForDialog(selectors.newDistroDialog);
    await videoPause(PAUSE_LONG);

    // Show quick install tab (default) - Microsoft Store distributions
    await $('[data-testid="quick-install-content"]').waitForDisplayed({ timeout: 5000 });
    await videoPause(PAUSE_MEDIUM);

    // Select a distribution to highlight it (Store mode has no config dialog)
    const distroGrid = await $('[data-testid="quick-install-content"] .grid');
    const distroButtons = await distroGrid.$$('button:not([disabled])');
    if ((await distroButtons.length) > 0) {
      await distroButtons[0].click();
      await videoPause(PAUSE_LONG);
    }

    // Switch to LXC tab (Linux containers)
    const lxcTab = await $(selectors.newDistroTabLxc);
    await lxcTab.click();
    await $('[data-testid="lxc-content"]').waitForDisplayed({ timeout: 5000 });
    await videoPause(PAUSE_MEDIUM);

    // Switch to Container tab (Docker images)
    const containerTab = await $(selectors.newDistroTabContainer);
    await containerTab.click();
    await $('[data-testid="container-content"]').waitForDisplayed({ timeout: 5000 });
    await videoPause(PAUSE_MEDIUM);

    // Select a container to show the install config dialog with naming options
    const containerGrid = await $('[data-testid="container-content"] .grid');
    const containerButtons = await containerGrid.$$('button:not([disabled])');
    if ((await containerButtons.length) > 0) {
      await containerButtons[0].click();
      await waitForDialog('[data-testid="install-config-dialog"]');
      await videoPause(PAUSE_SCENE);

      // Close config dialog
      const configCancelButton = await $('[data-testid="install-config-cancel-button"]');
      await configCancelButton.click();
      await videoPause(PAUSE_SHORT);
    }

    // Switch to Download tab (direct URL downloads)
    const downloadTab = await $(selectors.newDistroTabDownload);
    await downloadTab.click();
    await $('[data-testid="download-content"]').waitForDisplayed({ timeout: 5000 });
    await videoPause(PAUSE_MEDIUM);

    // Close dialog
    const cancelButton = await $(selectors.newDistroCancelButton);
    await cancelButton.click();
    await videoPause(PAUSE_MEDIUM);

    // =========================================================================
    // SCENE 8: Clone Distribution
    // =========================================================================
    scene("Clone Distribution");

    // Use stopped distro to avoid stop confirmation
    await openQuickActions("Debian");
    const cloneAction = await $('[data-testid="quick-action-clone"]');
    await cloneAction.click();
    await waitForDialog(selectors.cloneDialog);
    await videoPause(PAUSE_SCENE);

    // Close dialog
    const cloneCancelButton = await $(selectors.cloneCancelButton);
    await cloneCancelButton.click();
    await videoPause(PAUSE_MEDIUM);

    // =========================================================================
    // SCENE 9: Shutdown All WSL
    // =========================================================================
    scene("Shutdown All WSL");

    const shutdownButton = await $(selectors.shutdownAllButton);
    await shutdownButton.click();
    await waitForDialog('[role="dialog"]');
    await videoPause(PAUSE_SCENE);

    // Cancel shutdown
    await browser.keys("Escape");
    await videoPause(PAUSE_MEDIUM);

    // =========================================================================
    // SCENE 10: Help Dialog
    // =========================================================================
    scene("Help Dialog");

    const helpButton = await $('[data-testid="help-button"]');
    await helpButton.click();
    await waitForDialog('[data-testid="help-dialog"]');
    await videoPause(PAUSE_SCENE);

    // Close help
    const helpCloseButton = await $('[data-testid="help-close-button"]');
    await helpCloseButton.click();
    await videoPause(PAUSE_MEDIUM);

    // =========================================================================
    // SCENE 11: Disk Mount Panel
    // =========================================================================
    scene("Disk Mount Panel");

    const diskButton = await $(selectors.diskMountButton);
    if (await isElementDisplayedSafe(diskButton)) {
      await diskButton.click();
      await videoPause(PAUSE_SCENE);
      await closeMenu();
    }
    await videoPause(PAUSE_MEDIUM);

    // =========================================================================
    // SCENE 12: Settings - Application
    // =========================================================================
    scene("Settings - Application");

    await goToSettings();
    await videoPause(PAUSE_SCENE);

    // =========================================================================
    // SCENE 13: Settings - Themes
    // =========================================================================
    scene("Settings - Themes");

    await switchToTab("appearance");
    await videoPause(PAUSE_MEDIUM);

    // Apply Dracula theme
    await applyTheme("dracula");
    await videoPause(PAUSE_LONG);

    // Apply Nord theme
    await applyTheme("nord");
    await videoPause(PAUSE_LONG);

    // Apply High Contrast theme
    await applyTheme("high-contrast");
    await videoPause(PAUSE_LONG);

    // Apply Light theme
    await applyTheme("light");
    await videoPause(PAUSE_LONG);

    // Reset to default
    await applyTheme("mission-control");
    await videoPause(PAUSE_MEDIUM);

    // =========================================================================
    // SCENE 14: Settings - WSL Configuration
    // =========================================================================
    scene("Settings - WSL Configuration");

    await switchToTab("wsl-global");
    await videoPause(PAUSE_SCENE);

    await switchToTab("wsl-distro");
    await videoPause(PAUSE_SCENE);

    // =========================================================================
    // SCENE 15: Settings - Custom Actions (with Import/Export)
    // =========================================================================
    scene("Settings - Custom Actions");

    await switchToTab("actions");
    await videoPause(PAUSE_MEDIUM);

    // Show import button
    const importActionsButton = await $('[data-testid="import-actions-button"]');
    if (await isElementDisplayedSafe(importActionsButton)) {
      await importActionsButton.moveTo();
      await videoPause(PAUSE_MEDIUM);
    }

    // Show export button
    const exportActionsButton = await $('[data-testid="export-actions-button"]');
    if (await isElementDisplayedSafe(exportActionsButton)) {
      await exportActionsButton.moveTo();
      await videoPause(PAUSE_MEDIUM);
    }

    await videoPause(PAUSE_MEDIUM);

    // =========================================================================
    // SCENE 16: Final Overview
    // =========================================================================
    scene("Final Overview");

    await goBack();
    await waitForResourceStats();
    await videoPause(PAUSE_SCENE);

    // Hover over status bar
    const statusBar = await $('[data-testid="status-bar"]');
    if (await isElementDisplayedSafe(statusBar)) {
      await statusBar.moveTo();
      await videoPause(PAUSE_LONG);
    }

    // End with a clean view of the dashboard
    const mainArea = await $("main");
    await mainArea.moveTo();
    await videoPause(PAUSE_SCENE);

    console.log("\n>>> DEMO COMPLETE\n");
  });
});
