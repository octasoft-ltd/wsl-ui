/**
 * E2E Tests for Distribution-Specific Settings (wsl.conf)
 *
 * Tests the per-distribution settings configuration:
 * - Navigation and distribution selection
 * - Automount settings
 * - Network settings
 * - Interop settings
 * - Boot settings
 * - User settings
 * - Save functionality
 */

import { selectors, byText } from "../utils";
import { setupHooks, isElementDisplayed } from "../base";

const distroSettingsSelectors = {
  settingsButton: selectors.settingsButton,
  distroSettingsTab: '[data-testid="settings-tab-wsl-distro"]',
  distroSettings: '[data-testid="wsl-distro-settings"]',
  distroSelector: '[data-testid="distro-settings-selector"]',
  // Automount
  automountEnabledToggle: '[data-testid="distro-automount-enabled-toggle"]',
  mountFstabToggle: '[data-testid="distro-mount-fstab-toggle"]',
  mountRootInput: '[data-testid="distro-mount-root-input"]',
  mountOptionsInput: '[data-testid="distro-mount-options-input"]',
  // Network
  generateHostsToggle: '[data-testid="distro-generate-hosts-toggle"]',
  generateResolvToggle: '[data-testid="distro-generate-resolv-toggle"]',
  hostnameInput: '[data-testid="distro-hostname-input"]',
  // Interop
  interopEnabledToggle: '[data-testid="distro-interop-enabled-toggle"]',
  appendPathToggle: '[data-testid="distro-append-path-toggle"]',
  // Boot
  systemdToggle: '[data-testid="distro-systemd-toggle"]',
  bootCommandInput: '[data-testid="distro-boot-command-input"]',
  // User
  defaultUserInput: '[data-testid="distro-default-user-input"]',
  // Actions
  saveButton: '[data-testid="distro-save-button"]',
};

async function navigateToDistroSettings(): Promise<void> {
  const settingsButton = await $(distroSettingsSelectors.settingsButton);
  await settingsButton.waitForClickable({ timeout: 5000 });
  await settingsButton.click();

  // Wait for distro settings tab to appear
  await browser.waitUntil(
    async () => isElementDisplayed(distroSettingsSelectors.distroSettingsTab),
    { timeout: 5000, timeoutMsg: "Distro settings tab did not appear" }
  );

  const distroTab = await $(distroSettingsSelectors.distroSettingsTab);
  await distroTab.waitForClickable({ timeout: 5000 });
  await distroTab.click();

  // Wait for settings to load
  await browser.waitUntil(
    async () => isElementDisplayed(distroSettingsSelectors.distroSettings),
    { timeout: 5000, timeoutMsg: "Distro settings did not load" }
  );
}

describe("Distribution-Specific Settings", () => {
  setupHooks.standard();

  describe("Navigation", () => {
    it("should navigate to WSL Distro settings tab", async () => {
      await navigateToDistroSettings();

      const settings = await $(distroSettingsSelectors.distroSettings);
      await expect(settings).toBeDisplayed();
    });

    it("should display distribution selector", async () => {
      await navigateToDistroSettings();

      const selector = await $(distroSettingsSelectors.distroSelector);
      await expect(selector).toBeDisplayed();
    });

    it("should auto-select first distribution", async () => {
      await navigateToDistroSettings();

      const selector = await $(distroSettingsSelectors.distroSelector);
      const value = await selector.getValue();
      expect(value.length).toBeGreaterThan(0);
    });
  });

  describe("Distribution Selection", () => {
    beforeEach(async () => {
      await navigateToDistroSettings();
    });

    it("should show available distributions in dropdown", async () => {
      const selector = await $(distroSettingsSelectors.distroSelector);
      const options = await selector.$$("option");
      expect(options.length).toBeGreaterThan(0);
    });

    it("should allow changing selected distribution", async () => {
      const selector = await $(distroSettingsSelectors.distroSelector);
      const options = await selector.$$("option");

      if ((await options.length) > 1) {
        const secondOption = await options[1].getValue();
        await selector.selectByIndex(1);

        // Wait for selection to change
        await browser.waitUntil(
          async () => {
            const value = await selector.getValue();
            return value === secondOption;
          },
          { timeout: 3000, timeoutMsg: "Distribution selection did not change" }
        );

        const newValue = await selector.getValue();
        expect(newValue).toBe(secondOption);
      }
    });
  });

  describe("Automount Settings", () => {
    beforeEach(async () => {
      await navigateToDistroSettings();
    });

    it("should display Enable Automount toggle", async () => {
      const toggle = await $(distroSettingsSelectors.automountEnabledToggle);
      await expect(toggle).toBeDisplayed();
    });

    it("should display Mount fstab toggle", async () => {
      const toggle = await $(distroSettingsSelectors.mountFstabToggle);
      await expect(toggle).toBeDisplayed();
    });

    it("should display Mount Root input", async () => {
      const input = await $(distroSettingsSelectors.mountRootInput);
      await expect(input).toBeDisplayed();
    });

    it("should display Mount Options input", async () => {
      const input = await $(distroSettingsSelectors.mountOptionsInput);
      await expect(input).toBeDisplayed();
    });

    it("should toggle automount setting", async () => {
      const toggle = await $(distroSettingsSelectors.automountEnabledToggle);
      await toggle.click();

      // Wait for save button to appear
      await browser.waitUntil(
        async () => isElementDisplayed(distroSettingsSelectors.saveButton),
        { timeout: 3000, timeoutMsg: "Save button did not appear after toggle" }
      );

      const saveButton = await $(distroSettingsSelectors.saveButton);
      await expect(saveButton).toBeDisplayed();
    });

    it("should allow entering mount root path", async () => {
      const input = await $(distroSettingsSelectors.mountRootInput);
      await input.setValue("/custom/");

      // Wait for input value to be set
      await browser.waitUntil(
        async () => {
          const value = await input.getValue();
          return value === "/custom/";
        },
        { timeout: 3000, timeoutMsg: "Input value was not set" }
      );

      const value = await input.getValue();
      expect(value).toBe("/custom/");
    });
  });

  describe("Network Settings", () => {
    beforeEach(async () => {
      await navigateToDistroSettings();
    });

    it("should display Generate hosts toggle", async () => {
      const toggle = await $(distroSettingsSelectors.generateHostsToggle);
      await expect(toggle).toBeDisplayed();
    });

    it("should display Generate resolv.conf toggle", async () => {
      const toggle = await $(distroSettingsSelectors.generateResolvToggle);
      await expect(toggle).toBeDisplayed();
    });

    it("should display Hostname input", async () => {
      const input = await $(distroSettingsSelectors.hostnameInput);
      await expect(input).toBeDisplayed();
    });

    it("should allow entering custom hostname", async () => {
      const input = await $(distroSettingsSelectors.hostnameInput);
      await input.setValue("my-wsl-host");

      // Wait for input value to be set
      await browser.waitUntil(
        async () => {
          const value = await input.getValue();
          return value === "my-wsl-host";
        },
        { timeout: 3000, timeoutMsg: "Input value was not set" }
      );

      const value = await input.getValue();
      expect(value).toBe("my-wsl-host");
    });
  });

  describe("Interop Settings", () => {
    beforeEach(async () => {
      await navigateToDistroSettings();
    });

    it("should display Windows Interop toggle", async () => {
      const toggle = await $(distroSettingsSelectors.interopEnabledToggle);
      await expect(toggle).toBeDisplayed();
    });

    it("should display Append Windows PATH toggle", async () => {
      const toggle = await $(distroSettingsSelectors.appendPathToggle);
      await expect(toggle).toBeDisplayed();
    });

    it("should toggle Windows PATH interop", async () => {
      const toggle = await $(distroSettingsSelectors.appendPathToggle);
      await toggle.click();

      // Wait for save button to appear
      await browser.waitUntil(
        async () => isElementDisplayed(distroSettingsSelectors.saveButton),
        { timeout: 3000, timeoutMsg: "Save button did not appear after toggle" }
      );

      const saveButton = await $(distroSettingsSelectors.saveButton);
      await expect(saveButton).toBeDisplayed();
    });
  });

  describe("Boot Settings", () => {
    beforeEach(async () => {
      await navigateToDistroSettings();
    });

    it("should display systemd toggle", async () => {
      const toggle = await $(distroSettingsSelectors.systemdToggle);
      await expect(toggle).toBeDisplayed();
    });

    it("should display Boot Command input", async () => {
      const input = await $(distroSettingsSelectors.bootCommandInput);
      await expect(input).toBeDisplayed();
    });

    it("should allow entering boot command", async () => {
      const input = await $(distroSettingsSelectors.bootCommandInput);
      await input.setValue("echo 'Hello WSL'");

      // Wait for input value to be set
      await browser.waitUntil(
        async () => {
          const value = await input.getValue();
          return value === "echo 'Hello WSL'";
        },
        { timeout: 3000, timeoutMsg: "Input value was not set" }
      );

      const value = await input.getValue();
      expect(value).toBe("echo 'Hello WSL'");
    });
  });

  describe("User Settings", () => {
    beforeEach(async () => {
      await navigateToDistroSettings();
    });

    it("should display Default User input", async () => {
      const input = await $(distroSettingsSelectors.defaultUserInput);
      await expect(input).toBeDisplayed();
    });

    it("should allow entering default user", async () => {
      const input = await $(distroSettingsSelectors.defaultUserInput);
      await input.setValue("testuser");

      // Wait for input value to be set
      await browser.waitUntil(
        async () => {
          const value = await input.getValue();
          return value === "testuser";
        },
        { timeout: 3000, timeoutMsg: "Input value was not set" }
      );

      const value = await input.getValue();
      expect(value).toBe("testuser");
    });
  });

  describe("Save Functionality", () => {
    beforeEach(async () => {
      await navigateToDistroSettings();
    });

    it("should not show save button initially", async () => {
      const saveButtonVisible = await isElementDisplayed(distroSettingsSelectors.saveButton);
      expect(saveButtonVisible).toBe(false);
    });

    it("should show save button after making changes", async () => {
      const toggle = await $(distroSettingsSelectors.automountEnabledToggle);
      await toggle.click();

      // Wait for save button to appear
      await browser.waitUntil(
        async () => isElementDisplayed(distroSettingsSelectors.saveButton),
        { timeout: 3000, timeoutMsg: "Save button did not appear after toggle" }
      );

      const saveButton = await $(distroSettingsSelectors.saveButton);
      await expect(saveButton).toBeDisplayed();
    });

    it("should hide save button after saving", async () => {
      const toggle = await $(distroSettingsSelectors.systemdToggle);
      await toggle.click();

      // Wait for save button to appear
      await browser.waitUntil(
        async () => isElementDisplayed(distroSettingsSelectors.saveButton),
        { timeout: 3000, timeoutMsg: "Save button did not appear after toggle" }
      );

      const saveButton = await $(distroSettingsSelectors.saveButton);
      await saveButton.click();

      // Wait for save button to disappear
      await browser.waitUntil(
        async () => !(await isElementDisplayed(distroSettingsSelectors.saveButton)),
        { timeout: 5000, timeoutMsg: "Save button did not disappear after saving" }
      );

      const saveButtonVisible = await isElementDisplayed(distroSettingsSelectors.saveButton);
      expect(saveButtonVisible).toBe(false);
    });
  });

  describe("Warning Message", () => {
    beforeEach(async () => {
      await navigateToDistroSettings();
    });

    it("should display restart warning", async () => {
      const warningText = await $(byText("restart"));
      await expect(warningText).toBeDisplayed();
    });
  });

  describe("Section Headers", () => {
    beforeEach(async () => {
      await navigateToDistroSettings();
    });

    it("should display Automount section", async () => {
      const header = await $(byText("Automount"));
      await expect(header).toBeDisplayed();
    });

    it("should display Network section", async () => {
      const header = await $(byText("Network"));
      await expect(header).toBeDisplayed();
    });

    it("should display Interop section", async () => {
      const header = await $(byText("Interop"));
      await expect(header).toBeDisplayed();
    });

    it("should display Boot section", async () => {
      const header = await $(byText("Boot"));
      await expect(header).toBeDisplayed();
    });

    it("should display User section", async () => {
      const header = await $(byText("User"));
      await expect(header).toBeDisplayed();
    });
  });
});
