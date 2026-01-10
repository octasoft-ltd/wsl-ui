/**
 * E2E Tests for WSL Global Settings
 *
 * Tests the WSL global settings configuration (.wslconfig):
 * - Navigation to WSL Global settings tab
 * - Resource settings (memory, processors, swap)
 * - Feature toggles (GUI apps, localhost forwarding, nested virtualization)
 * - Networking mode selection
 * - Save and discard changes
 */

import {
  waitForAppReady,
  resetMockState,
  selectors,
  byText,
  safeRefresh,
} from "../utils";

const wslGlobalSelectors = {
  settingsButton: '[data-testid="settings-button"]',
  wslGlobalTab: '[data-testid="settings-tab-wsl-global"]',
  wslGlobalSettings: '[data-testid="wsl-global-settings"]',
  // Resource inputs
  memoryInput: '[data-testid="wsl-memory-input"]',
  processorsInput: '[data-testid="wsl-processors-input"]',
  swapInput: '[data-testid="wsl-swap-input"]',
  // Feature toggles
  guiAppsToggle: '[data-testid="wsl-gui-apps-toggle"]',
  localhostForwardingToggle: '[data-testid="wsl-localhost-forwarding-toggle"]',
  nestedVirtualizationToggle: '[data-testid="wsl-nested-virtualization-toggle"]',
  prereleaseUpdatesToggle: '[data-testid="wsl-prerelease-updates-toggle"]',
  // Networking
  networkingModeSelect: '[data-testid="wsl-networking-mode-select"]',
  // Actions
  saveButton: '[data-testid="wsl-save-button"]',
};

async function navigateToWslGlobalSettings(): Promise<void> {
  const settingsButton = await $(wslGlobalSelectors.settingsButton);
  await settingsButton.waitForClickable({ timeout: 5000 });
  await settingsButton.click();
  await browser.pause(500);

  const wslGlobalTab = await $(wslGlobalSelectors.wslGlobalTab);
  await wslGlobalTab.waitForClickable({ timeout: 5000 });
  await wslGlobalTab.click();
  await browser.pause(500);

  // Wait for the settings page to load
  const settings = await $(wslGlobalSelectors.wslGlobalSettings);
  await settings.waitForDisplayed({ timeout: 5000 });
}

describe("WSL Global Settings", () => {
  beforeEach(async () => {
    await safeRefresh();
    await browser.pause(500);
    await resetMockState();
    await waitForAppReady();
    await browser.pause(500);
  });

  describe("Navigation", () => {
    it("should navigate to WSL Global settings tab", async () => {
      await navigateToWslGlobalSettings();

      const settings = await $(wslGlobalSelectors.wslGlobalSettings);
      await expect(settings).toBeDisplayed();
    });

    it("should display WSL Global tab in settings sidebar", async () => {
      const settingsButton = await $(wslGlobalSelectors.settingsButton);
      await settingsButton.click();
      await browser.pause(300);

      const wslGlobalTab = await $(wslGlobalSelectors.wslGlobalTab);
      await expect(wslGlobalTab).toBeDisplayed();
    });

    it("should highlight active tab", async () => {
      await navigateToWslGlobalSettings();

      const wslGlobalTab = await $(wslGlobalSelectors.wslGlobalTab);
      const classes = await wslGlobalTab.getAttribute("class");
      // Active tab should have accent color styling
      expect(classes).toContain("accent");
    });
  });

  describe("Resource Settings", () => {
    beforeEach(async () => {
      await navigateToWslGlobalSettings();
    });

    it("should display Memory Limit input", async () => {
      const memoryInput = await $(wslGlobalSelectors.memoryInput);
      await expect(memoryInput).toBeDisplayed();
    });

    it("should display Processors input", async () => {
      const processorsInput = await $(wslGlobalSelectors.processorsInput);
      await expect(processorsInput).toBeDisplayed();
    });

    it("should display Swap Size input", async () => {
      const swapInput = await $(wslGlobalSelectors.swapInput);
      await expect(swapInput).toBeDisplayed();
    });

    it("should allow entering memory limit value", async () => {
      const memoryInput = await $(wslGlobalSelectors.memoryInput);
      await memoryInput.setValue("8GB");
      await browser.pause(200);

      const value = await memoryInput.getValue();
      expect(value).toBe("8GB");
    });

    it("should allow entering processor count", async () => {
      const processorsInput = await $(wslGlobalSelectors.processorsInput);
      await processorsInput.clearValue();
      await processorsInput.setValue("4");
      await browser.pause(200);

      const value = await processorsInput.getValue();
      expect(value).toBe("4");
    });

    it("should allow entering swap size", async () => {
      const swapInput = await $(wslGlobalSelectors.swapInput);
      await swapInput.setValue("4GB");
      await browser.pause(200);

      const value = await swapInput.getValue();
      expect(value).toBe("4GB");
    });
  });

  describe("Feature Toggles", () => {
    beforeEach(async () => {
      await navigateToWslGlobalSettings();
    });

    it("should display GUI Applications toggle", async () => {
      const toggle = await $(wslGlobalSelectors.guiAppsToggle);
      await expect(toggle).toBeDisplayed();
    });

    it("should display Localhost Forwarding toggle", async () => {
      const toggle = await $(wslGlobalSelectors.localhostForwardingToggle);
      await expect(toggle).toBeDisplayed();
    });

    it("should display Nested Virtualization toggle", async () => {
      const toggle = await $(wslGlobalSelectors.nestedVirtualizationToggle);
      await expect(toggle).toBeDisplayed();
    });

    it("should toggle GUI Applications", async () => {
      const toggle = await $(wslGlobalSelectors.guiAppsToggle);
      await toggle.click();
      await browser.pause(200);

      // Should show save button after making change
      const saveButton = await $(wslGlobalSelectors.saveButton);
      await expect(saveButton).toBeDisplayed();
    });

    it("should toggle Localhost Forwarding", async () => {
      const toggle = await $(wslGlobalSelectors.localhostForwardingToggle);
      await toggle.click();
      await browser.pause(200);

      // Should show save button after making change
      const saveButton = await $(wslGlobalSelectors.saveButton);
      await expect(saveButton).toBeDisplayed();
    });

    it("should toggle Nested Virtualization", async () => {
      const toggle = await $(wslGlobalSelectors.nestedVirtualizationToggle);
      await toggle.click();
      await browser.pause(200);

      // Should show save button after making change
      const saveButton = await $(wslGlobalSelectors.saveButton);
      await expect(saveButton).toBeDisplayed();
    });
  });

  describe("Networking Settings", () => {
    beforeEach(async () => {
      await navigateToWslGlobalSettings();
    });

    it("should display Networking Mode selector", async () => {
      const select = await $(wslGlobalSelectors.networkingModeSelect);
      await expect(select).toBeDisplayed();
    });

    it("should have NAT as default option", async () => {
      const select = await $(wslGlobalSelectors.networkingModeSelect);
      const value = await select.getValue();
      expect(value).toBe("NAT");
    });

    it("should allow changing networking mode to Mirrored", async () => {
      const select = await $(wslGlobalSelectors.networkingModeSelect);
      await select.selectByVisibleText("Mirrored");
      await browser.pause(200);

      const value = await select.getValue();
      expect(value).toBe("mirrored");
    });
  });

  describe("Save Changes", () => {
    beforeEach(async () => {
      await navigateToWslGlobalSettings();
    });

    it("should not show save button initially", async () => {
      const saveButton = await $(wslGlobalSelectors.saveButton);
      const isDisplayed = await saveButton.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });

    it("should show save button after making changes", async () => {
      const memoryInput = await $(wslGlobalSelectors.memoryInput);
      await memoryInput.setValue("16GB");
      await browser.pause(200);

      const saveButton = await $(wslGlobalSelectors.saveButton);
      await expect(saveButton).toBeDisplayed();
    });

    it("should hide save button after saving", async () => {
      const memoryInput = await $(wslGlobalSelectors.memoryInput);
      await memoryInput.setValue("16GB");
      await browser.pause(200);

      const saveButton = await $(wslGlobalSelectors.saveButton);
      await saveButton.click();
      await browser.pause(500);

      const saveButtonAfter = await $(wslGlobalSelectors.saveButton);
      const isDisplayed = await saveButtonAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });
  });

  describe("Warning Message", () => {
    beforeEach(async () => {
      await navigateToWslGlobalSettings();
    });

    it("should display warning about WSL restart", async () => {
      const warningText = await $(byText("wsl --shutdown"));
      await expect(warningText).toBeDisplayed();
    });

    it("should display note about changes requiring restart", async () => {
      const noteText = await $(byText("require"));
      await expect(noteText).toBeDisplayed();
    });
  });

  describe("Updates Settings", () => {
    beforeEach(async () => {
      await navigateToWslGlobalSettings();
    });

    it("should display Pre-Release Updates toggle", async () => {
      const toggle = await $(wslGlobalSelectors.prereleaseUpdatesToggle);
      await expect(toggle).toBeDisplayed();
    });

    it("should toggle Pre-Release Updates setting", async () => {
      const toggle = await $(wslGlobalSelectors.prereleaseUpdatesToggle);
      await toggle.click();
      await browser.pause(200);

      // Toggle should respond to click
      await expect(toggle).toBeClickable();
    });
  });

  describe("Section Headers", () => {
    beforeEach(async () => {
      await navigateToWslGlobalSettings();
    });

    it("should display Resources section", async () => {
      const header = await $(byText("Resources"));
      await expect(header).toBeDisplayed();
    });

    it("should display Features section", async () => {
      const header = await $(byText("Features"));
      await expect(header).toBeDisplayed();
    });

    it("should display Networking section", async () => {
      const header = await $(byText("Networking"));
      await expect(header).toBeDisplayed();
    });

    it("should display Updates section", async () => {
      const header = await $(byText("Updates"));
      await expect(header).toBeDisplayed();
    });
  });

  describe("Input Placeholders", () => {
    beforeEach(async () => {
      await navigateToWslGlobalSettings();
    });

    it("should have memory input placeholder", async () => {
      const memoryInput = await $(wslGlobalSelectors.memoryInput);
      const placeholder = await memoryInput.getAttribute("placeholder");
      expect(placeholder).toContain("8GB");
    });

    it("should have processors input placeholder", async () => {
      const processorsInput = await $(wslGlobalSelectors.processorsInput);
      const placeholder = await processorsInput.getAttribute("placeholder");
      expect(placeholder).toContain("4");
    });

    it("should have swap input placeholder", async () => {
      const swapInput = await $(wslGlobalSelectors.swapInput);
      const placeholder = await swapInput.getAttribute("placeholder");
      expect(placeholder).toContain("4GB");
    });
  });

  describe("Multiple Changes", () => {
    beforeEach(async () => {
      await navigateToWslGlobalSettings();
    });

    it("should track multiple changes before save", async () => {
      // Make multiple changes
      const memoryInput = await $(wslGlobalSelectors.memoryInput);
      await memoryInput.setValue("16GB");

      const processorsInput = await $(wslGlobalSelectors.processorsInput);
      await processorsInput.clearValue();
      await processorsInput.setValue("8");

      const toggle = await $(wslGlobalSelectors.nestedVirtualizationToggle);
      await toggle.click();

      await browser.pause(200);

      // Save button should be visible
      const saveButton = await $(wslGlobalSelectors.saveButton);
      await expect(saveButton).toBeDisplayed();

      // Save all changes at once
      await saveButton.click();
      await browser.pause(500);

      // Save button should hide after saving
      const saveButtonAfter = await $(wslGlobalSelectors.saveButton);
      const isDisplayed = await saveButtonAfter.isDisplayed().catch(() => false);
      expect(isDisplayed).toBe(false);
    });
  });
});
