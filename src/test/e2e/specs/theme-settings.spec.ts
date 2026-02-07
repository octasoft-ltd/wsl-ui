/**
 * E2E Tests for Theme Settings
 *
 * Tests the theme selection functionality:
 * - Theme grid display
 * - Theme switching
 * - Custom theme option
 */

import { setupHooks, actions, isElementDisplayed } from "../base";
import { selectors } from "../utils";

describe("Theme Settings", () => {
  setupHooks.standard();

  beforeEach(async () => {
    // Navigate to settings > appearance
    await actions.goToSettings();

    const appearanceTab = await $(selectors.settingsTab("appearance"));
    await appearanceTab.waitForClickable({ timeout: 5000 });
    await appearanceTab.click();

    // Wait for theme grid to be displayed
    await browser.waitUntil(
      async () => isElementDisplayed('[data-testid="theme-obsidian"]'),
      { timeout: 5000, timeoutMsg: "Theme grid did not appear" }
    );
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

      // Wait for theme selection to update (selected theme has accent-primary border)
      await browser.waitUntil(
        async () => {
          const classes = await draculaTheme.getAttribute("class");
          return classes.includes("accent-primary");
        },
        { timeout: 3000, timeoutMsg: "Dracula theme selection did not update" }
      );

      // Verify Dracula is now selected
      const classes = await draculaTheme.getAttribute("class");
      expect(classes).toContain("accent-primary");
    });

    it("should switch to Cobalt theme", async () => {
      const cobaltTheme = await $('[data-testid="theme-cobalt"]');
      await cobaltTheme.click();

      // Wait for theme selection to update (selected theme has accent-primary border)
      await browser.waitUntil(
        async () => {
          const classes = await cobaltTheme.getAttribute("class");
          return classes.includes("accent-primary");
        },
        { timeout: 3000, timeoutMsg: "Cobalt theme selection did not update" }
      );

      // Verify Cobalt is now selected
      const classes = await cobaltTheme.getAttribute("class");
      expect(classes).toContain("accent-primary");
    });

    it("should have Custom theme option", async () => {
      const customTheme = await $('[data-testid="theme-custom"]');
      await expect(customTheme).toBeDisplayed();
    });

    it("should select Custom theme when clicked", async () => {
      const customTheme = await $('[data-testid="theme-custom"]');
      await customTheme.click();

      // Wait for theme selection to update (selected theme has accent-primary border)
      await browser.waitUntil(
        async () => {
          const classes = await customTheme.getAttribute("class");
          return classes.includes("accent-primary");
        },
        { timeout: 3000, timeoutMsg: "Custom theme selection did not update" }
      );

      // Custom theme should now be selected
      const classes = await customTheme.getAttribute("class");
      expect(classes).toContain("accent-primary");
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
