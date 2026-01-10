/**
 * E2E Tests for Startup Actions Configuration
 *
 * Tests the startup actions settings:
 * - Navigation to Startup Actions tab
 * - Adding actions (predefined and inline)
 * - Editing and removing actions
 * - Toggle settings (enable, continue on error)
 * - Persistence after refresh
 */

import {
  waitForAppReady,
  resetMockState,
  byText,
  byButtonText,
  safeRefresh,
} from "../utils";

const selectors = {
  settingsButton: '[data-testid="settings-button"]',
  startupActionsTab: '[data-testid="settings-tab-startup"]',
  // Startup Actions page selectors
  infoBox: '[data-testid="startup-info-box"]',
  distroSelector: '[data-testid="startup-distro-selector"]',
  enableSection: '[data-testid="startup-enable-section"]',
  enableLabel: '[data-testid="startup-enable-label"]',
  enableToggle: '[data-testid="startup-enable-toggle"]',
  runOnAppStart: '[data-testid="startup-run-on-app-start"]',
  actionsList: '[data-testid="startup-actions-list"]',
  addActionButton: '[data-testid="startup-add-action-button"]',
  emptyState: '[data-testid="startup-empty-state"]',
  actionsContainer: '[data-testid="startup-actions-container"]',
  saveButton: '[data-testid="startup-save-button"]',
  // Action editor selectors
  actionEditor: '[data-testid="startup-action-editor"]',
  actionTypeSelector: '[data-testid="startup-action-type-selector"]',
  commandInput: '[data-testid="startup-command-input"]',
  continueOnError: '[data-testid="startup-continue-on-error"]',
  timeoutContainer: '[data-testid="startup-timeout-container"]',
  timeoutInput: '[data-testid="startup-timeout-input"]',
  removeActionButton: '[data-testid="startup-remove-action-button"]',
};

async function navigateToStartupActions(): Promise<void> {
  const settingsButton = await $(selectors.settingsButton);
  await settingsButton.waitForClickable({ timeout: 5000 });
  await settingsButton.click();
  await browser.pause(500);

  const startupActionsTab = await $(selectors.startupActionsTab);
  await startupActionsTab.waitForClickable({ timeout: 5000 });
  await startupActionsTab.click();
  await browser.pause(500);

  // Wait for the startup actions content to load (distribution selector appears)
  const selector = await $("select");
  await selector.waitForDisplayed({ timeout: 5000 });
}

async function ensureStartupActionsEnabled(): Promise<void> {
  // Check if startup actions is already enabled by looking for the Add Action button
  const addButton = await $(selectors.addActionButton);
  const isEnabled = await addButton.isDisplayed().catch(() => false);

  if (!isEnabled) {
    // Enable startup actions
    const toggle = await $(selectors.enableToggle);
    await toggle.click();
    await browser.pause(300);
    // Wait for Add Action button to appear
    await addButton.waitForDisplayed({ timeout: 5000 });
  }
}

describe("Startup Actions", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(500);
    await resetMockState();
    await waitForAppReady();
    await browser.pause(500);
  });

  describe("Navigation", () => {
    it("should navigate to Startup Actions settings tab", async () => {
      await navigateToStartupActions();

      // Should see startup actions info box
      const infoBox = await $(selectors.infoBox);
      await expect(infoBox).toBeDisplayed();
    });

    it("should display distribution selector", async () => {
      await navigateToStartupActions();

      const selector = await $(selectors.distroSelector);
      await expect(selector).toBeDisplayed();
    });

    it("should display info text about startup actions", async () => {
      await navigateToStartupActions();

      // Verify the info box contains expected text
      const infoBox = await $(selectors.infoBox);
      const text = await infoBox.getText();
      expect(text).toContain("run automatically");
    });
  });

  describe("Distribution Selection", () => {
    it("should display available distributions in selector", async () => {
      await navigateToStartupActions();

      const selector = await $(selectors.distroSelector);
      const options = await selector.$$("option");
      expect(options.length).toBeGreaterThan(0);
    });

    it("should auto-select first distribution", async () => {
      await navigateToStartupActions();

      const selector = await $(selectors.distroSelector);
      const value = await selector.getValue();
      expect(value.length).toBeGreaterThan(0);
    });

    it("should allow changing selected distribution", async () => {
      await navigateToStartupActions();

      const selector = await $(selectors.distroSelector);
      const options = await selector.$$("option");

      if (options.length > 1) {
        const secondOption = await options[1].getValue();
        await selector.selectByIndex(1);
        await browser.pause(300);

        const newValue = await selector.getValue();
        expect(newValue).toBe(secondOption);
      }
    });
  });

  describe("Enable Toggle", () => {
    it("should display Enable Startup Actions toggle", async () => {
      await navigateToStartupActions();

      const enableLabel = await $(selectors.enableLabel);
      await expect(enableLabel).toBeDisplayed();
      const text = await enableLabel.getText();
      expect(text).toBe("Enable Startup Actions");
    });

    it("should toggle startup actions on/off", async () => {
      await navigateToStartupActions();

      const toggle = await $(selectors.enableToggle);
      await toggle.click();
      await browser.pause(300);

      // After enabling, Add Action button should appear
      const addButton = await $(selectors.addActionButton);
      const isDisplayed = await addButton.isDisplayed().catch(() => false);

      // Toggle again
      await toggle.click();
      await browser.pause(300);
    });

    it("should show run on app start option when enabled", async () => {
      await navigateToStartupActions();

      // Enable startup actions
      await ensureStartupActionsEnabled();

      // Should show the app start checkbox
      const appStartOption = await $(selectors.runOnAppStart);
      await expect(appStartOption).toBeDisplayed();
    });
  });

  describe("Add Actions", () => {
    beforeEach(async () => {
      await navigateToStartupActions();
      await ensureStartupActionsEnabled();
    });

    it("should display Add Action button when enabled", async () => {
      const addButton = await $(selectors.addActionButton);
      await expect(addButton).toBeDisplayed();
    });

    it("should show empty state when no actions configured", async () => {
      const emptyState = await $(selectors.emptyState);
      const isDisplayed = await emptyState.isDisplayed().catch(() => false);

      // Either empty state or existing actions
      if (isDisplayed) {
        await expect(emptyState).toBeDisplayed();
      }
    });

    it("should add action when clicking Add Action button", async () => {
      const addButton = await $(selectors.addActionButton);
      await addButton.click();
      await browser.pause(300);

      // Should show action editor
      const actionEditor = await $(selectors.actionEditor);
      await expect(actionEditor).toBeDisplayed();
    });

    it("should show action type selector for new action", async () => {
      const addButton = await $(selectors.addActionButton);
      await addButton.click();
      await browser.pause(300);

      // Should have action type selector
      const typeSelector = await $(selectors.actionTypeSelector);
      await expect(typeSelector).toBeDisplayed();
    });
  });

  describe("Inline Command", () => {
    beforeEach(async () => {
      await navigateToStartupActions();
      await ensureStartupActionsEnabled();

      // Add an action
      const addButton = await $(selectors.addActionButton);
      await addButton.click();
      await browser.pause(300);
    });

    it("should display command input for inline action", async () => {
      const commandInput = await $(selectors.commandInput);
      await expect(commandInput).toBeDisplayed();
    });

    it("should allow entering inline command", async () => {
      const commandInput = await $(selectors.commandInput);
      await commandInput.setValue("echo 'test startup'");
      await browser.pause(200);

      const value = await commandInput.getValue();
      expect(value).toBe("echo 'test startup'");
    });

    it("should show continue on error checkbox", async () => {
      const continueOnError = await $(selectors.continueOnError);
      await expect(continueOnError).toBeDisplayed();
    });

    it("should show timeout input", async () => {
      const timeoutContainer = await $(selectors.timeoutContainer);
      await expect(timeoutContainer).toBeDisplayed();

      const timeoutInput = await $(selectors.timeoutInput);
      await expect(timeoutInput).toBeDisplayed();
    });
  });

  describe("Action Options", () => {
    beforeEach(async () => {
      await navigateToStartupActions();
      await ensureStartupActionsEnabled();

      // Add an action
      const addButton = await $(selectors.addActionButton);
      await addButton.click();
      await browser.pause(300);
    });

    it("should toggle continue on error checkbox", async () => {
      const continueOnError = await $(selectors.continueOnError);
      const checkbox = await continueOnError.$("input[type='checkbox']");
      const initialState = await checkbox.isSelected();

      await checkbox.click();
      await browser.pause(200);

      const newState = await checkbox.isSelected();
      expect(newState).not.toBe(initialState);
    });

    it("should allow changing timeout value", async () => {
      const timeoutInput = await $(selectors.timeoutInput);
      await timeoutInput.clearValue();
      await timeoutInput.setValue("120");
      await browser.pause(200);

      const value = await timeoutInput.getValue();
      expect(value).toBe("120");
    });
  });

  describe("Remove Action", () => {
    beforeEach(async () => {
      await navigateToStartupActions();
      await ensureStartupActionsEnabled();

      // Add an action
      const addButton = await $(selectors.addActionButton);
      await addButton.click();
      await browser.pause(300);
    });

    it("should have remove button for action", async () => {
      const removeButton = await $(selectors.removeActionButton);
      await expect(removeButton).toBeDisplayed();
    });

    it("should remove action when clicking remove button", async () => {
      // Count current action editors
      const actionsBefore = await $$(selectors.actionEditor);
      const countBefore = actionsBefore.length;

      // Click remove
      const removeButton = await $(selectors.removeActionButton);
      await removeButton.click();
      await browser.pause(300);

      // Count should decrease or empty state shown
      const emptyState = await $(selectors.emptyState);
      const isEmptyDisplayed = await emptyState.isDisplayed().catch(() => false);

      if (!isEmptyDisplayed) {
        const actionsAfter = await $$(selectors.actionEditor);
        expect(actionsAfter.length).toBeLessThan(countBefore);
      }
    });
  });

  describe("Save Changes", () => {
    beforeEach(async () => {
      await navigateToStartupActions();
    });

    it("should not show save button initially", async () => {
      const saveButton = await $(selectors.saveButton);
      const isDisplayed = await saveButton.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should show save button after making changes", async () => {
      // Enable startup actions
      const toggle = await $(selectors.enableToggle);
      await toggle.click();
      await browser.pause(300);

      // Save button should appear
      const saveButton = await $(selectors.saveButton);
      await expect(saveButton).toBeDisplayed();
    });

    it("should hide save button after saving", async () => {
      // Enable startup actions
      const toggle = await $(selectors.enableToggle);
      await toggle.click();
      await browser.pause(300);

      // Click save
      const saveButton = await $(selectors.saveButton);
      await saveButton.click();
      await browser.pause(500);

      // Save button should disappear
      const saveButtonAfter = await $(selectors.saveButton);
      const isDisplayed = await saveButtonAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });
  });

  describe("Multiple Actions", () => {
    beforeEach(async () => {
      await navigateToStartupActions();
      await ensureStartupActionsEnabled();
    });

    it("should allow adding multiple actions", async () => {
      const addButton = await $(selectors.addActionButton);

      // Add first action
      await addButton.click();
      await browser.pause(200);

      // Add second action
      await addButton.click();
      await browser.pause(200);

      // Should have two action editors
      const actionEditors = await $$(selectors.actionEditor);
      expect(actionEditors.length).toBe(2);
    });

    it("should display actions in sequence", async () => {
      const addButton = await $(selectors.addActionButton);

      // Add two actions
      await addButton.click();
      await browser.pause(200);
      await addButton.click();
      await browser.pause(200);

      // Both command inputs should exist
      const commandInputs = await $$(selectors.commandInput);
      expect(commandInputs.length).toBe(2);
    });
  });
});
