import "@testing-library/jest-dom";
import { vi } from "vitest";

// Load English translations for test mock
import commonEn from "../i18n/locales/en/common.json";
import headerEn from "../i18n/locales/en/header.json";
import dashboardEn from "../i18n/locales/en/dashboard.json";
import dialogsEn from "../i18n/locales/en/dialogs.json";
import settingsEn from "../i18n/locales/en/settings.json";
import actionsEn from "../i18n/locales/en/actions.json";
import installEn from "../i18n/locales/en/install.json";
import errorsEn from "../i18n/locales/en/errors.json";
import helpEn from "../i18n/locales/en/help.json";
import statusbarEn from "../i18n/locales/en/statusbar.json";

const translations: Record<string, Record<string, unknown>> = {
  common: commonEn,
  header: headerEn,
  dashboard: dashboardEn,
  dialogs: dialogsEn,
  settings: settingsEn,
  actions: actionsEn,
  install: installEn,
  errors: errorsEn,
  help: helpEn,
  statusbar: statusbarEn,
};

function getNestedValue(obj: unknown, path: string): string | undefined {
  const parts = path.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return typeof current === "string" ? current : undefined;
}

function resolveKey(ns: string, key: string): string {
  // Handle cross-namespace references like "common:button.cancel"
  let namespace = ns;
  let lookupKey = key;
  if (key.includes(":")) {
    const [crossNs, rest] = key.split(":", 2);
    namespace = crossNs;
    lookupKey = rest;
  }

  const nsData = translations[namespace];
  if (!nsData) return key;

  const value = getNestedValue(nsData, lookupKey);
  return value ?? key;
}

// Mock i18next for testing - returns actual English translations
vi.mock("react-i18next", () => ({
  useTranslation: (ns: string = "common") => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      let result = resolveKey(ns, key);
      if (opts && typeof opts === "object") {
        result = Object.entries(opts).reduce(
          (str, [k, v]) => str.replace(`{{${k}}}`, String(v)),
          result
        );
      }
      return result;
    },
    i18n: {
      language: "en",
      changeLanguage: vi.fn(),
    },
  }),
  withTranslation: (ns: string = "common") => (Component: unknown) => {
    const tFn = (key: string, opts?: Record<string, unknown>) => {
      let result = resolveKey(ns, key);
      if (opts && typeof opts === "object") {
        result = Object.entries(opts).reduce(
          (str, [k, v]) => str.replace(`{{${k}}}`, String(v)),
          result
        );
      }
      return result;
    };
    const i18nObj = { language: "en", changeLanguage: vi.fn() };

    if (typeof Component === "function") {
      // Check if it's a class component (has prototype.render)
      if (Component.prototype && Component.prototype.render) {
        // For class components, return a wrapper that passes t and i18n as props
        const { createElement, forwardRef } = require("react");
        const Wrapped = forwardRef((props: Record<string, unknown>, ref: unknown) =>
          createElement(Component as React.ComponentType, { ...props, t: tFn, i18n: i18nObj, ref })
        );
        Wrapped.displayName = `withTranslation(${(Component as Function).name || "Component"})`;
        // Copy static methods (like getDerivedStateFromError)
        Object.keys(Component).forEach((key) => {
          if (!(key in Wrapped)) {
            (Wrapped as unknown as Record<string, unknown>)[key] = (Component as unknown as Record<string, unknown>)[key];
          }
        });
        return Wrapped;
      }
      // For function components
      const WrappedComponent = (props: Record<string, unknown>) => {
        return (Component as Function)({ ...props, t: tFn, i18n: i18nObj });
      };
      WrappedComponent.displayName = `withTranslation(${(Component as Function).name || "Component"})`;
      return WrappedComponent;
    }
    return Component;
  },
  Trans: ({ children }: { children: React.ReactNode }) => children,
  initReactI18next: { type: "3rdParty", init: vi.fn() },
}));

// Mock i18n module
vi.mock("../i18n", () => ({
  default: {
    language: "en",
    changeLanguage: vi.fn(),
  },
  loadLanguage: vi.fn().mockResolvedValue(undefined),
  resolveLanguage: vi.fn().mockReturnValue("en"),
  supportedLanguages: [
    { code: "en", name: "English", nativeName: "English" },
  ],
}));

// Mock Tauri APIs for testing
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

vi.mock("@tauri-apps/plugin-dialog", () => ({
  save: vi.fn(),
  open: vi.fn(),
}));
