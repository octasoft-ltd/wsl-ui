/**
 * Language Settings Component
 *
 * Allows users to select the application display language.
 */

import { useTranslation } from "react-i18next";
import { useSettingsStore } from "../../store/settingsStore";
import { supportedLanguages, loadLanguage, resolveLanguage } from "../../i18n";
import { GlobeIcon, ExternalLinkIcon } from "../icons";

export function LanguageSettings() {
  const { t, i18n } = useTranslation("settings");
  const { settings, updateSetting } = useSettingsStore();

  if (!settings) return null;

  const currentLocale = settings.locale || "auto";

  const handleLanguageChange = async (locale: string) => {
    await updateSetting("locale", locale);

    const targetLang = locale === "auto"
      ? resolveLanguage(navigator.language || "en")
      : locale;

    // Sync to localStorage so i18next LanguageDetector restores the correct
    // language on next startup (before Tauri settings are loaded asynchronously)
    localStorage.setItem("wsl-ui-language", targetLang);

    await loadLanguage(targetLang);
    i18n.changeLanguage(targetLang);

    // Set RTL direction for Arabic
    const langConfig = supportedLanguages.find((l) => l.code === (locale === "auto" ? i18n.language : locale));
    document.documentElement.dir = langConfig && "dir" in langConfig && langConfig.dir === "rtl" ? "rtl" : "ltr";
  };

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden bg-linear-to-br from-blue-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-blue-800/30 rounded-xl p-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,_var(--tw-gradient-stops))] from-blue-500/5 via-transparent to-transparent" />
        <div className="relative">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-linear-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
              <GlobeIcon size="md" className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-theme-text-primary">{t("language.title")}</h2>
              <p className="text-sm text-theme-text-secondary">{t("language.description")}</p>
            </div>
          </div>

          <div className="space-y-2">
            {/* Auto-detect option */}
            <label
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                currentLocale === "auto"
                  ? "border-theme-accent-primary bg-theme-accent-primary/10"
                  : "border-theme-border-primary hover:border-theme-border-secondary"
              }`}
            >
              <input
                type="radio"
                name="language"
                value="auto"
                checked={currentLocale === "auto"}
                onChange={() => handleLanguageChange("auto")}
                className="accent-theme-accent-primary"
              />
              <div>
                <span className="text-sm font-medium text-theme-text-primary">
                  {t("language.auto")}
                </span>
                <p className="text-xs text-theme-text-muted">
                  {t("language.autoDesc")}
                </p>
              </div>
            </label>

            {/* Language options */}
            {supportedLanguages.map((lang) => (
              <label
                key={lang.code}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  currentLocale === lang.code
                    ? "border-theme-accent-primary bg-theme-accent-primary/10"
                    : "border-theme-border-primary hover:border-theme-border-secondary"
                }`}
              >
                <input
                  type="radio"
                  name="language"
                  value={lang.code}
                  checked={currentLocale === lang.code}
                  onChange={() => handleLanguageChange(lang.code)}
                  className="accent-theme-accent-primary"
                />
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-theme-text-primary">
                    {lang.nativeName}
                  </span>
                  {lang.code !== "en" && (
                    <span className="text-xs text-theme-text-muted">
                      ({lang.name})
                    </span>
                  )}
                </div>
              </label>
            ))}
          </div>

          <div className="mt-4 pt-3 border-t border-theme-border-primary/50">
            <a
              href="https://github.com/octasoft-ltd/wsl-ui/issues/new?title=Language+Request&body=%2A%2ALanguage+requested%3A%2A%2A+%5BPlease+specify+the+language%5D%0A%2A%2ALanguage+code+%28if+known%29%3A%2A%2A+%5Be.g.%2C+it%2C+nl%2C+ru%5D%0A%0AI%27d+like+to+request+support+for+this+language+in+WSL+UI.&labels=enhancement"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-sm text-theme-text-muted hover:text-theme-accent-primary transition-colors"
            >
              <span>{t("language.requestLanguage")}</span>
              <span className="underline">{t("language.requestLanguageLink")}</span>
              <ExternalLinkIcon size="sm" />
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
