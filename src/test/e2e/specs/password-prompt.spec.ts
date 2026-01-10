/**
 * E2E Tests for Password Prompt Dialog
 *
 * Tests the password prompt dialog for sudo custom actions:
 * - Dialog appearance and content
 * - Password input behavior
 * - Form submission
 * - Cancel and close functionality
 * - Keyboard navigation
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  byText,
  byButtonText,
  safeRefresh,
} from "../utils";

const passwordPromptSelectors = {
  // Password prompt dialog
  overlay: '[data-testid="password-prompt-overlay"]',
  dialog: '[data-testid="password-prompt-dialog"]',
  title: '[data-testid="password-prompt-title"]',
  closeButton: '[data-testid="password-prompt-close"]',
  form: '[data-testid="password-prompt-form"]',
  actionName: '[data-testid="password-prompt-action-name"]',
  distroName: '[data-testid="password-prompt-distro-name"]',
  passwordInput: '[data-testid="password-prompt-input"]',
  securityNote: '[data-testid="password-prompt-security-note"]',
  cancelButton: '[data-testid="password-prompt-cancel"]',
  submitButton: '[data-testid="password-prompt-submit"]',
  // Custom actions settings
  settingsButton: '[data-testid="settings-button"]',
  backButton: '[data-testid="back-button"]',
  newActionButton: '[data-testid="new-action-button"]',
  actionNameInput: '[data-testid="action-name-input"]',
  actionCommandInput: '[data-testid="action-command-input"]',
  requiresSudoCheckbox: '[data-testid="action-requires-sudo-checkbox"]',
  saveActionButton: '[data-testid="save-action-button"]',
  customActionsTab: byButtonText("Custom Actions"),
  // Quick actions menu
  quickActionsButton: '[data-testid="quick-actions-button"]',
  quickActionsMenu: '[data-testid="quick-actions-menu"]',
};

const TEST_ACTION_NAME = "Sudo Test Action";
const TEST_COMMAND = "echo test";
const TEST_DISTRO = "Ubuntu";

async function navigateToCustomActions(): Promise<void> {
  const settingsButton = await $(passwordPromptSelectors.settingsButton);
  await settingsButton.waitForClickable({ timeout: 5000 });
  await settingsButton.click();
  await browser.pause(500);

  const customActionsTab = await $(passwordPromptSelectors.customActionsTab);
  await customActionsTab.waitForClickable({ timeout: 5000 });
  await customActionsTab.click();
  await browser.pause(500);
}

async function createSudoAction(): Promise<void> {
  await navigateToCustomActions();

  // Click New Action button
  const newActionButton = await $(passwordPromptSelectors.newActionButton);
  await newActionButton.waitForClickable({ timeout: 5000 });
  await newActionButton.click();
  await browser.pause(300);

  // Fill in action details
  const nameInput = await $(passwordPromptSelectors.actionNameInput);
  await nameInput.waitForDisplayed({ timeout: 5000 });
  await nameInput.setValue(TEST_ACTION_NAME);

  const commandInput = await $(passwordPromptSelectors.actionCommandInput);
  await commandInput.setValue(TEST_COMMAND);

  // Enable sudo requirement
  const sudoCheckbox = await $(passwordPromptSelectors.requiresSudoCheckbox);
  await sudoCheckbox.click();
  await browser.pause(200);

  // Save the action
  const saveButton = await $(passwordPromptSelectors.saveActionButton);
  await saveButton.click();
  await browser.pause(500);

  // Navigate back to the main view
  const backButton = await $(passwordPromptSelectors.backButton);
  await backButton.waitForClickable({ timeout: 5000 });
  await backButton.click();
  await browser.pause(500);
}

async function openQuickActionsForDistro(distroName: string): Promise<void> {
  // Find the distro card
  const card = await $(selectors.distroCardByName(distroName));
  await card.waitForDisplayed({ timeout: 5000 });

  // Find and click the quick actions button within the card
  const quickActionsButton = await card.$(passwordPromptSelectors.quickActionsButton);
  await quickActionsButton.waitForClickable({ timeout: 5000 });
  await quickActionsButton.click();
  await browser.pause(300);
}

async function triggerSudoAction(): Promise<void> {
  await openQuickActionsForDistro(TEST_DISTRO);

  // Custom actions are displayed directly in the menu (not in a submenu)
  // Find and click the sudo test action by text
  const actionButton = await $(byText(TEST_ACTION_NAME));
  await actionButton.waitForClickable({ timeout: 5000 });
  await actionButton.click();
  await browser.pause(500);
}

describe("Password Prompt Dialog", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(500);
    await resetMockState();
    await waitForAppReady();
    await browser.pause(500);
  });

  describe("Setup and Trigger", () => {
    it("should be able to create a custom action with sudo requirement", async () => {
      await createSudoAction();

      // Verify action was created by checking settings
      await navigateToCustomActions();
      const actionText = await $(byText(TEST_ACTION_NAME));
      await expect(actionText).toBeDisplayed();
    });
  });

  describe("Dialog Appearance", () => {
    beforeEach(async () => {
      await createSudoAction();
    });

    it("should show password prompt when triggering sudo action", async () => {
      await triggerSudoAction();

      const dialog = await $(passwordPromptSelectors.dialog);
      await expect(dialog).toBeDisplayed();
    });

    it("should display correct title", async () => {
      await triggerSudoAction();

      const title = await $(passwordPromptSelectors.title);
      await expect(title).toBeDisplayed();
      const titleText = await title.getText();
      expect(titleText).toContain("Sudo Password Required");
    });

    it("should display action name", async () => {
      await triggerSudoAction();

      const actionName = await $(passwordPromptSelectors.actionName);
      await expect(actionName).toBeDisplayed();
      const text = await actionName.getText();
      expect(text).toContain(TEST_ACTION_NAME);
    });

    it("should display distribution name", async () => {
      await triggerSudoAction();

      const distroName = await $(passwordPromptSelectors.distroName);
      await expect(distroName).toBeDisplayed();
      const text = await distroName.getText();
      expect(text).toContain(TEST_DISTRO);
    });

    it("should display security note about password not being stored", async () => {
      await triggerSudoAction();

      const securityNote = await $(passwordPromptSelectors.securityNote);
      await expect(securityNote).toBeDisplayed();
      const text = await securityNote.getText();
      expect(text.toLowerCase()).toContain("not stored");
    });

    it("should display overlay behind dialog", async () => {
      await triggerSudoAction();

      const overlay = await $(passwordPromptSelectors.overlay);
      await expect(overlay).toBeDisplayed();
    });
  });

  describe("Password Input", () => {
    beforeEach(async () => {
      await createSudoAction();
      await triggerSudoAction();
    });

    it("should display password input field", async () => {
      const passwordInput = await $(passwordPromptSelectors.passwordInput);
      await expect(passwordInput).toBeDisplayed();
    });

    it("should have password input type (masked)", async () => {
      const passwordInput = await $(passwordPromptSelectors.passwordInput);
      const inputType = await passwordInput.getAttribute("type");
      expect(inputType).toBe("password");
    });

    it("should auto-focus password input", async () => {
      const passwordInput = await $(passwordPromptSelectors.passwordInput);
      const isFocused = await passwordInput.isFocused();
      expect(isFocused).toBe(true);
    });

    it("should allow typing in password field", async () => {
      const passwordInput = await $(passwordPromptSelectors.passwordInput);
      await passwordInput.setValue("testpassword123");
      await browser.pause(200);

      const value = await passwordInput.getValue();
      expect(value).toBe("testpassword123");
    });

    it("should have placeholder text", async () => {
      const passwordInput = await $(passwordPromptSelectors.passwordInput);
      const placeholder = await passwordInput.getAttribute("placeholder");
      expect(placeholder).toBe("Password");
    });
  });

  describe("Submit Button", () => {
    beforeEach(async () => {
      await createSudoAction();
      await triggerSudoAction();
    });

    it("should display submit button", async () => {
      const submitButton = await $(passwordPromptSelectors.submitButton);
      await expect(submitButton).toBeDisplayed();
    });

    it("should show 'Run with Sudo' text", async () => {
      const submitButton = await $(passwordPromptSelectors.submitButton);
      const text = await submitButton.getText();
      expect(text).toContain("Run with Sudo");
    });

    it("should be disabled when password is empty", async () => {
      const submitButton = await $(passwordPromptSelectors.submitButton);
      const isDisabled = await submitButton.getAttribute("disabled");
      expect(isDisabled).not.toBeNull();
    });

    it("should be enabled when password is entered", async () => {
      const passwordInput = await $(passwordPromptSelectors.passwordInput);
      await passwordInput.setValue("testpassword");
      await browser.pause(200);

      const submitButton = await $(passwordPromptSelectors.submitButton);
      const isDisabled = await submitButton.getAttribute("disabled");
      expect(isDisabled).toBeNull();
    });

    it("should close dialog after submit", async () => {
      const passwordInput = await $(passwordPromptSelectors.passwordInput);
      await passwordInput.setValue("testpassword");
      await browser.pause(200);

      const submitButton = await $(passwordPromptSelectors.submitButton);
      await submitButton.click();
      await browser.pause(500);

      const dialog = await $(passwordPromptSelectors.dialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });
  });

  describe("Cancel Functionality", () => {
    beforeEach(async () => {
      await createSudoAction();
      await triggerSudoAction();
    });

    it("should display cancel button", async () => {
      const cancelButton = await $(passwordPromptSelectors.cancelButton);
      await expect(cancelButton).toBeDisplayed();
    });

    it("should close dialog when cancel button is clicked", async () => {
      const cancelButton = await $(passwordPromptSelectors.cancelButton);
      await cancelButton.click();
      await browser.pause(300);

      const dialog = await $(passwordPromptSelectors.dialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should close dialog when close (X) button is clicked", async () => {
      const closeButton = await $(passwordPromptSelectors.closeButton);
      await closeButton.click();
      await browser.pause(300);

      const dialog = await $(passwordPromptSelectors.dialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should clear password when cancelled", async () => {
      const passwordInput = await $(passwordPromptSelectors.passwordInput);
      await passwordInput.setValue("testpassword");
      await browser.pause(200);

      const cancelButton = await $(passwordPromptSelectors.cancelButton);
      await cancelButton.click();
      await browser.pause(300);

      // Trigger the action again to check password is cleared
      await triggerSudoAction();

      const newPasswordInput = await $(passwordPromptSelectors.passwordInput);
      const value = await newPasswordInput.getValue();
      expect(value).toBe("");
    });
  });

  describe("Keyboard Navigation", () => {
    beforeEach(async () => {
      await createSudoAction();
      await triggerSudoAction();
    });

    it("should close dialog when Escape key is pressed", async () => {
      await browser.keys("Escape");
      await browser.pause(300);

      const dialog = await $(passwordPromptSelectors.dialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should submit form when Enter key is pressed with password", async () => {
      const passwordInput = await $(passwordPromptSelectors.passwordInput);
      await passwordInput.setValue("testpassword");
      await browser.pause(200);

      await browser.keys("Enter");
      await browser.pause(500);

      const dialog = await $(passwordPromptSelectors.dialog);
      const isDisplayed = await dialog.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should not submit form when Enter key is pressed without password", async () => {
      await browser.keys("Enter");
      await browser.pause(300);

      // Dialog should still be open
      const dialog = await $(passwordPromptSelectors.dialog);
      await expect(dialog).toBeDisplayed();
    });
  });

  describe("Form Elements", () => {
    beforeEach(async () => {
      await createSudoAction();
      await triggerSudoAction();
    });

    it("should have form element", async () => {
      const form = await $(passwordPromptSelectors.form);
      await expect(form).toBeDisplayed();
    });

    it("should have lock icon displayed", async () => {
      // The lock icon is in the header area
      const dialog = await $(passwordPromptSelectors.dialog);
      const svgElements = await dialog.$$("svg");
      expect(svgElements.length).toBeGreaterThan(0);
    });
  });
});
