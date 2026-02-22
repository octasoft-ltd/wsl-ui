import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

// English translations (bundled eagerly)
import commonEn from "./locales/en/common.json";
import headerEn from "./locales/en/header.json";
import dashboardEn from "./locales/en/dashboard.json";
import dialogsEn from "./locales/en/dialogs.json";
import settingsEn from "./locales/en/settings.json";
import actionsEn from "./locales/en/actions.json";
import installEn from "./locales/en/install.json";
import errorsEn from "./locales/en/errors.json";
import helpEn from "./locales/en/help.json";
import statusbarEn from "./locales/en/statusbar.json";

export const defaultNS = "common";
export const namespaces = [
  "common",
  "header",
  "dashboard",
  "dialogs",
  "settings",
  "actions",
  "install",
  "errors",
  "help",
  "statusbar",
] as const;

export const supportedLanguages = [
  { code: "en", name: "English", nativeName: "English" },
  { code: "zh-CN", name: "Chinese (Simplified)", nativeName: "简体中文" },
  { code: "zh-TW", name: "Chinese (Traditional)", nativeName: "繁體中文" },
  { code: "ja", name: "Japanese", nativeName: "日本語" },
  { code: "ko", name: "Korean", nativeName: "한국어" },
  { code: "es", name: "Spanish", nativeName: "Español" },
  { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
  { code: "fr", name: "French", nativeName: "Français" },
  { code: "de", name: "German", nativeName: "Deutsch" },
  { code: "pt-BR", name: "Portuguese (Brazil)", nativeName: "Português (Brasil)" },
  { code: "ar", name: "Arabic", nativeName: "العربية", dir: "rtl" as const },
] as const;

export type SupportedLanguage = (typeof supportedLanguages)[number]["code"];

/**
 * Resolve a browser language tag (e.g. "zh-TW", "zh-Hant", "pt-BR", "en-US")
 * to the best matching supported language code, or "en" as fallback.
 *
 * Priority: exact match → script-based match (zh-Hant→zh-TW) → base-language match → "en"
 */
export function resolveLanguage(browserLang: string): SupportedLanguage {
  // 1. Exact match (e.g. "zh-TW" → "zh-TW", "pt-BR" → "pt-BR")
  const exact = supportedLanguages.find((l) => l.code === browserLang);
  if (exact) return exact.code;

  // 2. Script-based mapping for Chinese (zh-Hant → zh-TW, zh-Hans → zh-CN)
  const lower = browserLang.toLowerCase();
  if (lower.includes("hant") || lower.includes("tw") || lower.includes("hk") || lower.includes("mo")) {
    return "zh-TW";
  }
  if (lower.includes("hans") || lower.includes("cn") || lower.includes("sg")) {
    return "zh-CN";
  }

  // 3. Base language match (e.g. "fr-CA" → "fr", "de-AT" → "de", "es-MX" → "es")
  const baseLang = browserLang.split("-")[0];
  const baseMatch = supportedLanguages.find((l) => l.code === baseLang);
  if (baseMatch) return baseMatch.code;

  // 4. Base language prefix match (e.g. "pt" → "pt-BR", "zh" → "zh-CN")
  const prefixMatch = supportedLanguages.find((l) => l.code.split("-")[0] === baseLang);
  if (prefixMatch) return prefixMatch.code;

  return "en";
}

// Lazy-load translations for non-English languages
const languageImports: Record<string, () => Promise<Record<string, Record<string, unknown>>>> = {
  "zh-CN": () => import("./locales/zh-CN/index").then((m) => m.default),
  "zh-TW": () => import("./locales/zh-TW/index").then((m) => m.default),
  ja: () => import("./locales/ja/index").then((m) => m.default),
  ko: () => import("./locales/ko/index").then((m) => m.default),
  es: () => import("./locales/es/index").then((m) => m.default),
  hi: () => import("./locales/hi/index").then((m) => m.default),
  fr: () => import("./locales/fr/index").then((m) => m.default),
  de: () => import("./locales/de/index").then((m) => m.default),
  "pt-BR": () => import("./locales/pt-BR/index").then((m) => m.default),
  ar: () => import("./locales/ar/index").then((m) => m.default),
};

export async function loadLanguage(lng: string): Promise<void> {
  if (lng === "en" || !languageImports[lng]) return;

  // Check if already loaded
  if (i18n.hasResourceBundle(lng, "common")) return;

  const loader = languageImports[lng];
  const resources = await loader();
  for (const [ns, translations] of Object.entries(resources)) {
    i18n.addResourceBundle(lng, ns, translations, true, true);
  }
}

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
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
      },
    },
    defaultNS,
    ns: [...namespaces],
    fallbackLng: "en",
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "wsl-ui-language",
      caches: ["localStorage"],
    },
  });

export default i18n;
