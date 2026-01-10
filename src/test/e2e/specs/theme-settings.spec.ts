/**
 * E2E Tests for Theme Settings
 *
 * Tests the theme selection functionality:
 * - Theme grid display
 * - Theme switching
 * - Custom theme option
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  safeRefresh,
} from "../utils";

describe("Theme Settings", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(500);
    await resetMockState();
    await waitForAppReady();
    await browser.pause(500);

    // Navigate to settings > appearance
    const settingsButton = await $(selectors.settingsButton);
    await settingsButton.click();
    await browser.pause(500);

    const appearanceTab = await $(selectors.settingsTab("appearance"));
    await appearanceTab.click();
    await browser.pause(500);
  });

  describe("Theme Grid", () => {
    it("should display available themes", async () => {
      // Check for theme buttons
      const obsidianTheme = await $('[data-testid="theme-obsidian"]');
      await expect(obsidianTheme).toBeDisplayed();

      const cobaltTheme = await $('[data-testid="theme-cobalt"]');
      await expect(cobaltTheme).toBeDisplayed();

      const draculaTheme = await $('[data-testid="theme-dracula"]');
      await expect(draculaTheme).toBeDisplayed();
    });

    it("should have Obsidian as default theme", async () => {
      // Obsidian should be selected by default (has checkmark)
      const obsidianTheme = await $('[data-testid="theme-obsidian"]');
      const classes = await obsidianTheme.getAttribute("class");
      expect(classes).toContain("border-");
    });

    it("should switch to Dracula theme", async () => {
      const draculaTheme = await $('[data-testid="theme-dracula"]');
      await draculaTheme.click();
      await browser.pause(500);

      // Verify Dracula is now selected
      const classes = await draculaTheme.getAttribute("class");
      expect(classes).toContain("border-");
    });

    it("should switch to Cobalt theme", async () => {
      const cobaltTheme = await $('[data-testid="theme-cobalt"]');
      await cobaltTheme.click();
      await browser.pause(500);

      // Verify Cobalt is now selected
      const classes = await cobaltTheme.getAttribute("class");
      expect(classes).toContain("border-");
    });

    it("should have Custom theme option", async () => {
      const customTheme = await $('[data-testid="theme-custom"]');
      await expect(customTheme).toBeDisplayed();
    });

    it("should select Custom theme when clicked", async () => {
      const customTheme = await $('[data-testid="theme-custom"]');
      await customTheme.click();
      await browser.pause(500);

      // Custom theme should now be selected
      const classes = await customTheme.getAttribute("class");
      expect(classes).toContain("border-");
    });
  });

  describe("Theme Buttons", () => {
    it("should have clickable theme buttons", async () => {
      // All theme buttons should be clickable
      const nordTheme = await $('[data-testid="theme-nord"]');
      await expect(nordTheme).toBeDisplayed();
      
      const monokaiTheme = await $('[data-testid="theme-monokai"]');
      await expect(monokaiTheme).toBeDisplayed();
    });
  });
});




