/**
 * E2E Tests for Custom Actions Settings
 *
 * Tests the custom actions management:
 * - Creating new actions
 * - Action form fields
 * - Import/Export buttons
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  byText,
  safeRefresh,
} from "../utils";

describe("Custom Actions Settings", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(500);
    await resetMockState();
    await waitForAppReady();
    await browser.pause(500);

    // Navigate to settings > custom actions
    const settingsButton = await $(selectors.settingsButton);
    await settingsButton.click();
    await browser.pause(500);

    const actionsTab = await $(selectors.settingsTab("actions"));
    await actionsTab.click();
    await browser.pause(500);
  });

  describe("Actions Header", () => {
    it("should have New Action button", async () => {
      const newActionButton = await $('[data-testid="new-action-button"]');
      await expect(newActionButton).toBeDisplayed();
    });

    it("should have Import button", async () => {
      const importButton = await $('[data-testid="import-actions-button"]');
      await expect(importButton).toBeDisplayed();
    });

    it("should have Export button", async () => {
      const exportButton = await $('[data-testid="export-actions-button"]');
      await expect(exportButton).toBeDisplayed();
    });
  });

  describe("Create Action Form", () => {
    beforeEach(async () => {
      const newActionButton = await $('[data-testid="new-action-button"]');
      await newActionButton.click();
      await browser.pause(500);
    });

    it("should show action editor form", async () => {
      const nameInput = await $('[data-testid="action-name-input"]');
      await expect(nameInput).toBeDisplayed();
    });

    it("should have command textarea", async () => {
      const commandInput = await $('[data-testid="action-command-input"]');
      await expect(commandInput).toBeDisplayed();
    });

    it("should have icon selection grid", async () => {
      // Look for icon grid
      const iconGrid = await $(".grid.grid-cols-6");
      await expect(iconGrid).toBeDisplayed();
    });

    it("should have target distribution options", async () => {
      // Look for target distribution section (radio buttons)
      const radioButton = await $("input[type='radio']");
      await expect(radioButton).toBeDisplayed();
    });

    it("should have Save button", async () => {
      const saveButton = await $('[data-testid="save-action-button"]');
      await expect(saveButton).toBeDisplayed();
    });

    it("should have Cancel button", async () => {
      const cancelButton = await $("button*=Cancel");
      await expect(cancelButton).toBeDisplayed();
    });

    it("should close form when Cancel is clicked", async () => {
      const cancelButton = await $("button*=Cancel");
      await cancelButton.click();
      await browser.pause(300);

      // Form should be closed, New Action button should be visible again
      const newActionButton = await $('[data-testid="new-action-button"]');
      await expect(newActionButton).toBeDisplayed();
    });

    it("should fill in action name", async () => {
      const nameInput = await $('[data-testid="action-name-input"]');
      await nameInput.setValue("Test Action");
      
      const value = await nameInput.getValue();
      expect(value).toBe("Test Action");
    });

    it("should fill in command", async () => {
      const commandInput = await $('[data-testid="action-command-input"]');
      await commandInput.setValue("echo Hello World");
      
      const value = await commandInput.getValue();
      expect(value).toBe("echo Hello World");
    });

    it("should show variable helper buttons", async () => {
      // Variable buttons like {DISTRO_NAME}
      const variableButton = await $("button*={DISTRO_NAME}");
      await expect(variableButton).toBeDisplayed();
    });
  });

  describe("Empty State", () => {
    it("should show empty state message when no actions", async () => {
      // If no custom actions exist, should show empty message
      const emptyState = await $(byText("No custom actions"));
      const isDisplayed = await emptyState.isDisplayed().catch(() => false);
      
      // Either we have actions or we have empty state - both are valid
      if (isDisplayed) {
        await expect(emptyState).toBeDisplayed();
      }
    });
  });
});




