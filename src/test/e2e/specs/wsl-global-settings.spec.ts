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

import { selectors, byText } from "../utils";
import { setupHooks, actions, isElementDisplayed } from "../base";

const wslGlobalSelectors = {
  wslGlobalTab: selectors.settingsTab("wsl-global"),
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
  await actions.goToSettings();

  // Wait for WSL Global tab to appear
  await browser.waitUntil(
    async () => isElementDisplayed(wslGlobalSelectors.wslGlobalTab),
    { timeout: 5000, timeoutMsg: "WSL Global tab did not appear" }
  );

  const wslGlobalTab = await $(wslGlobalSelectors.wslGlobalTab);
  await wslGlobalTab.waitForClickable({ timeout: 5000 });
  await wslGlobalTab.click();

  // Wait for the settings page to load
  await browser.waitUntil(
    async () => isElementDisplayed(wslGlobalSelectors.wslGlobalSettings),
    { timeout: 5000, timeoutMsg: "WSL Global settings did not load" }
  );
}

describe("WSL Global Settings", () => {
  setupHooks.standard();

  describe("Navigation", () => {
    it("should navigate to WSL Global settings tab", async () => {
      await navigateToWslGlobalSettings();

      const settings = await $(wslGlobalSelectors.wslGlobalSettings);
      await expect(settings).toBeDisplayed();
    });

    it("should display WSL Global tab in settings sidebar", async () => {
      await actions.goToSettings();

      // Wait for WSL Global tab to appear
      await browser.waitUntil(
        async () => isElementDisplayed(wslGlobalSelectors.wslGlobalTab),
        { timeout: 5000, timeoutMsg: "WSL Global tab did not appear" }
      );

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

      // Wait for input value to be set
      await browser.waitUntil(
        async () => {
          const value = await memoryInput.getValue();
          return value === "8GB";
        },
        { timeout: 3000, timeoutMsg: "Memory input value was not set" }
      );

      const value = await memoryInput.getValue();
      expect(value).toBe("8GB");
    });

    it("should allow entering processor count", async () => {
      const processorsInput = await $(wslGlobalSelectors.processorsInput);
      await processorsInput.clearValue();
      await processorsInput.setValue("4");

      // Wait for input value to be set
      await browser.waitUntil(
        async () => {
          const value = await processorsInput.getValue();
          return value === "4";
        },
        { timeout: 3000, timeoutMsg: "Processors input value was not set" }
      );

      const value = await processorsInput.getValue();
      expect(value).toBe("4");
    });

    it("should allow entering swap size", async () => {
      const swapInput = await $(wslGlobalSelectors.swapInput);
      await swapInput.setValue("4GB");

      // Wait for input value to be set
      await browser.waitUntil(
        async () => {
          const value = await swapInput.getValue();
          return value === "4GB";
        },
        { timeout: 3000, timeoutMsg: "Swap input value was not set" }
      );

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
      await toggle.waitForClickable({ timeout: 5000 });
      await toggle.click();

      // Should show save button after making change
      await browser.waitUntil(
        async () => isElementDisplayed(wslGlobalSelectors.saveButton),
        { timeout: 5000, timeoutMsg: "Save button did not appear after toggle" }
      );

      const saveButton = await $(wslGlobalSelectors.saveButton);
      await expect(saveButton).toBeDisplayed();
    });

    it("should toggle Localhost Forwarding", async () => {
      const toggle = await $(wslGlobalSelectors.localhostForwardingToggle);
      await toggle.waitForClickable({ timeout: 5000 });
      await toggle.click();

      // Should show save button after making change
      await browser.waitUntil(
        async () => isElementDisplayed(wslGlobalSelectors.saveButton),
        { timeout: 5000, timeoutMsg: "Save button did not appear after toggle" }
      );

      const saveButton = await $(wslGlobalSelectors.saveButton);
      await expect(saveButton).toBeDisplayed();
    });

    it("should toggle Nested Virtualization", async () => {
      const toggle = await $(wslGlobalSelectors.nestedVirtualizationToggle);
      await toggle.waitForClickable({ timeout: 5000 });
      await toggle.click();

      // Should show save button after making change
      await browser.waitUntil(
        async () => isElementDisplayed(wslGlobalSelectors.saveButton),
        { timeout: 5000, timeoutMsg: "Save button did not appear after toggle" }
      );

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

      // Wait for select value to change
      await browser.waitUntil(
        async () => {
          const value = await select.getValue();
          return value === "mirrored";
        },
        { timeout: 3000, timeoutMsg: "Networking mode did not change" }
      );

      const value = await select.getValue();
      expect(value).toBe("mirrored");
    });
  });

  describe("Save Changes", () => {
    beforeEach(async () => {
      await navigateToWslGlobalSettings();
    });

    it("should not show save button initially", async () => {
      const saveButtonVisible = await isElementDisplayed(wslGlobalSelectors.saveButton);
      expect(saveButtonVisible).toBe(false);
    });

    it("should show save button after making changes", async () => {
      const memoryInput = await $(wslGlobalSelectors.memoryInput);
      await memoryInput.waitForClickable({ timeout: 5000 });
      await memoryInput.setValue("16GB");

      // Wait for save button to appear
      await browser.waitUntil(
        async () => isElementDisplayed(wslGlobalSelectors.saveButton),
        { timeout: 5000, timeoutMsg: "Save button did not appear after change" }
      );

      const saveButton = await $(wslGlobalSelectors.saveButton);
      await expect(saveButton).toBeDisplayed();
    });

    it("should hide save button after saving", async () => {
      const memoryInput = await $(wslGlobalSelectors.memoryInput);
      await memoryInput.waitForClickable({ timeout: 5000 });
      await memoryInput.setValue("16GB");

      // Wait for save button to appear
      await browser.waitUntil(
        async () => isElementDisplayed(wslGlobalSelectors.saveButton),
        { timeout: 5000, timeoutMsg: "Save button did not appear after change" }
      );

      const saveButton = await $(wslGlobalSelectors.saveButton);
      await saveButton.waitForClickable({ timeout: 5000 });
      await saveButton.click();

      // Wait for save button to disappear
      await browser.waitUntil(
        async () => !(await isElementDisplayed(wslGlobalSelectors.saveButton)),
        { timeout: 5000, timeoutMsg: "Save button did not disappear after saving" }
      );

      const saveButtonVisible = await isElementDisplayed(wslGlobalSelectors.saveButton);
      expect(saveButtonVisible).toBe(false);
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
      await toggle.waitForClickable({ timeout: 5000 });
      await toggle.click();

      // Pre-release updates uses the settings store directly, not WSL config
      // It doesn't trigger the save button - it saves automatically
      // Just verify the toggle is clickable and responds
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
      await memoryInput.waitForClickable({ timeout: 5000 });
      await memoryInput.setValue("16GB");

      const processorsInput = await $(wslGlobalSelectors.processorsInput);
      await processorsInput.waitForClickable({ timeout: 5000 });
      await processorsInput.clearValue();
      await processorsInput.setValue("8");

      const toggle = await $(wslGlobalSelectors.nestedVirtualizationToggle);
      await toggle.waitForClickable({ timeout: 5000 });
      await toggle.click();

      // Wait for save button to appear
      await browser.waitUntil(
        async () => isElementDisplayed(wslGlobalSelectors.saveButton),
        { timeout: 5000, timeoutMsg: "Save button did not appear after changes" }
      );

      // Save button should be visible
      const saveButton = await $(wslGlobalSelectors.saveButton);
      await expect(saveButton).toBeDisplayed();

      // Save all changes at once
      await saveButton.waitForClickable({ timeout: 5000 });
      await saveButton.click();

      // Wait for save button to disappear
      await browser.waitUntil(
        async () => !(await isElementDisplayed(wslGlobalSelectors.saveButton)),
        { timeout: 5000, timeoutMsg: "Save button did not disappear after saving" }
      );

      // Save button should hide after saving
      const saveButtonVisible = await isElementDisplayed(wslGlobalSelectors.saveButton);
      expect(saveButtonVisible).toBe(false);
    });
  });
});
