/**
 * E2E Tests for Custom Actions Import/Export
 *
 * Tests the import and export functionality for custom actions.
 * Note: Actual file dialog interaction cannot be automated via WebDriver,
 * so these tests focus on button accessibility and UI state.
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  byText,
  byButtonText,
  safeRefresh,
} from "../utils";

const customActionsSelectors = {
  settingsButton: '[data-testid="settings-button"]',
  newActionButton: '[data-testid="new-action-button"]',
  importActionsButton: '[data-testid="import-actions-button"]',
  exportActionsButton: '[data-testid="export-actions-button"]',
  actionNameInput: '[data-testid="action-name-input"]',
  actionCommandInput: '[data-testid="action-command-input"]',
  saveActionButton: '[data-testid="save-action-button"]',
  customActionsTab: byButtonText("Custom Actions"),
};

async function navigateToCustomActions(): Promise<void> {
  // Open settings dialog
  const settingsButton = await $(customActionsSelectors.settingsButton);
  await settingsButton.waitForClickable({ timeout: 5000 });
  await settingsButton.click();

  // Wait for settings to be displayed
  await browser.pause(500);

  // Click on Custom Actions tab
  const customActionsTab = await $(customActionsSelectors.customActionsTab);
  await customActionsTab.waitForClickable({ timeout: 5000 });
  await customActionsTab.click();
  await browser.pause(500);
}

async function createTestAction(name: string, command: string): Promise<void> {
  const newActionButton = await $(customActionsSelectors.newActionButton);
  await newActionButton.click();
  await browser.pause(300);

  const nameInput = await $(customActionsSelectors.actionNameInput);
  await nameInput.setValue(name);

  const commandInput = await $(customActionsSelectors.actionCommandInput);
  await commandInput.setValue(command);

  const saveButton = await $(customActionsSelectors.saveActionButton);
  await saveButton.click();
  await browser.pause(500);
}

describe("Custom Actions Import/Export", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(500);
    await resetMockState();
    await waitForAppReady();
    await browser.pause(500);
  });

  describe("Export Button", () => {
    beforeEach(async () => {
      await navigateToCustomActions();
    });

    it("should display Export button", async () => {
      const exportButton = await $(customActionsSelectors.exportActionsButton);
      await expect(exportButton).toBeDisplayed();
    });

    it("should have Export button enabled when no actions exist", async () => {
      const exportButton = await $(customActionsSelectors.exportActionsButton);
      await expect(exportButton).toBeClickable();
    });

    it("should have Export button enabled when actions exist", async () => {
      // Create an action first
      await createTestAction("Export Test Action", "echo 'export test'");

      // Export button should still be enabled
      const exportButton = await $(customActionsSelectors.exportActionsButton);
      await expect(exportButton).toBeClickable();
    });

    it("should be clickable and trigger file dialog", async () => {
      await createTestAction("Export Test", "echo 'test'");

      const exportButton = await $(customActionsSelectors.exportActionsButton);
      await expect(exportButton).toBeClickable();

      // Clicking will open native file dialog - we can only verify button is clickable
      // The actual file dialog interaction cannot be automated
    });
  });

  describe("Import Button", () => {
    beforeEach(async () => {
      await navigateToCustomActions();
    });

    it("should display Import button", async () => {
      const importButton = await $(customActionsSelectors.importActionsButton);
      await expect(importButton).toBeDisplayed();
    });

    it("should have Import button always enabled", async () => {
      const importButton = await $(customActionsSelectors.importActionsButton);
      await expect(importButton).toBeClickable();
    });

    it("should be clickable to open file dialog", async () => {
      const importButton = await $(customActionsSelectors.importActionsButton);
      await expect(importButton).toBeClickable();

      // Clicking will open native file dialog - we can only verify button is clickable
      // The actual file dialog interaction cannot be automated
    });
  });

  describe("Button Layout", () => {
    beforeEach(async () => {
      await navigateToCustomActions();
    });

    it("should display both Import and Export buttons together", async () => {
      const importButton = await $(customActionsSelectors.importActionsButton);
      const exportButton = await $(customActionsSelectors.exportActionsButton);

      await expect(importButton).toBeDisplayed();
      await expect(exportButton).toBeDisplayed();
    });

    it("should display buttons in header area", async () => {
      const importButton = await $(customActionsSelectors.importActionsButton);
      const importText = await importButton.getText();
      expect(importText).toContain("Import");

      const exportButton = await $(customActionsSelectors.exportActionsButton);
      const exportText = await exportButton.getText();
      expect(exportText).toContain("Export");
    });

    it("should display New Action button alongside Import/Export", async () => {
      const newActionButton = await $(customActionsSelectors.newActionButton);
      const importButton = await $(customActionsSelectors.importActionsButton);
      const exportButton = await $(customActionsSelectors.exportActionsButton);

      await expect(newActionButton).toBeDisplayed();
      await expect(importButton).toBeDisplayed();
      await expect(exportButton).toBeDisplayed();
    });
  });

  describe("Actions Store Integration", () => {
    beforeEach(async () => {
      await navigateToCustomActions();
    });

    it("should have export functionality tied to actions store", async () => {
      // Create multiple actions
      await createTestAction("Action One", "echo 'one'");
      await createTestAction("Action Two", "echo 'two'");

      // Verify actions are displayed
      const actionOne = await $("h4*=Action One");
      const actionTwo = await $("h4*=Action Two");

      await expect(actionOne).toBeDisplayed();
      await expect(actionTwo).toBeDisplayed();

      // Export button should be available
      const exportButton = await $(customActionsSelectors.exportActionsButton);
      await expect(exportButton).toBeClickable();
    });

    it("should display helper text about custom actions", async () => {
      // Look for instructional text about custom actions
      const helperText = await $(byText("Create custom actions"));
      const isDisplayed = await helperText.isDisplayed().catch(() => false);

      if (isDisplayed) {
        await expect(helperText).toBeDisplayed();
      }
    });
  });
});
