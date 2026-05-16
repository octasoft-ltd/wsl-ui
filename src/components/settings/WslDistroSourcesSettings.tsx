/**
 * WSL Distribution Sources Settings Component
 *
 * Manages the HKLM `DistributionListUrl` / `DistributionListUrlAppend`
 * registry values that point `wsl --list --online` / `wsl --install <name>`
 * at community-maintained manifests.
 *
 * Backend in `src-tauri/src/wsl/distro_sources.rs`. All writes require UAC.
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { wslService } from "../../services/wslService";
import {
  SUGGESTED_SOURCES,
  type DistroSource,
  type DistroSourceMode,
  type ManifestPreview,
  type SuggestedSource,
} from "../../types/distroSources";

type BannerKind = "success" | "error";

interface Banner {
  kind: BannerKind;
  message: string;
}

export function WslDistroSourcesSettings() {
  const { t } = useTranslation("settings");

  const [currentSource, setCurrentSource] = useState<DistroSource | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [urlInput, setUrlInput] = useState("");
  const [mode, setMode] = useState<DistroSourceMode>("append");

  const [preview, setPreview] = useState<ManifestPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [isApplying, setIsApplying] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [banner, setBanner] = useState<Banner | null>(null);

  // Refresh the registered source from the registry. Does not touch the
  // user's typed URL — seeding only happens once on initial mount via the
  // separate effect below. This prevents an in-flight apply from clobbering
  // text the user has edited while the UAC prompt is open.
  const refreshCurrent = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const src = await wslService.getDistroSource();
      setCurrentSource(src);
    } catch (e) {
      setLoadError(String(e));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const src = await wslService.getDistroSource();
        if (cancelled) return;
        setCurrentSource(src);
        if (src) {
          setUrlInput(src.url);
          setMode(src.mode);
        }
      } catch (e) {
        if (!cancelled) setLoadError(String(e));
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePreview = async (urlToPreview?: string) => {
    const url = (urlToPreview ?? urlInput).trim();
    if (!url) {
      setPreviewError(t("distroSources.errors.emptyUrl"));
      return;
    }
    setPreview(null);
    setPreviewError(null);
    setIsPreviewing(true);
    try {
      const result = await wslService.previewDistroManifest(url);
      setPreview(result);
    } catch (e) {
      setPreviewError(String(e));
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleApply = async () => {
    const url = urlInput.trim();
    if (!url) {
      setBanner({ kind: "error", message: t("distroSources.errors.emptyUrl") });
      return;
    }
    setIsApplying(true);
    setBanner(null);
    try {
      await wslService.applyDistroSource({ url, mode });
      setBanner({ kind: "success", message: t("distroSources.applied") });
      await refreshCurrent();
    } catch (e) {
      setBanner({ kind: "error", message: String(e) });
    } finally {
      setIsApplying(false);
    }
  };

  const handleClear = async () => {
    setIsClearing(true);
    setBanner(null);
    try {
      await wslService.clearDistroSource();
      setBanner({ kind: "success", message: t("distroSources.cleared") });
      setPreview(null);
      setUrlInput("");
      await refreshCurrent();
    } catch (e) {
      setBanner({ kind: "error", message: String(e) });
    } finally {
      setIsClearing(false);
    }
  };

  const handleAddSuggested = async (s: SuggestedSource) => {
    setUrlInput(s.url);
    setMode("append");
    await handlePreview(s.url);
  };

  return (
    <section className="relative overflow-hidden bg-linear-to-br from-emerald-900/20 via-theme-bg-secondary/50 to-theme-bg-secondary/50 border border-emerald-800/30 rounded-xl p-6">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/10 via-transparent to-transparent" />
      <div className="relative">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 rounded-lg bg-linear-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-lg shadow-emerald-900/30">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-medium text-theme-text-primary">
              {t("distroSources.title")}
            </h2>
            <p className="text-sm text-theme-text-muted">
              {t("distroSources.description")}
            </p>
          </div>
        </div>

        {/* Warning banner */}
        <div className="mb-6 p-4 bg-amber-900/20 border border-amber-700/50 rounded-lg">
          <p className="text-xs text-amber-200">
            <strong>{t("distroSources.warningTitle")}:</strong>{" "}
            {t("distroSources.warningBody")}
          </p>
        </div>

        {/* Status banner */}
        {banner && (
          <div
            className={`mb-4 p-3 rounded-lg text-sm ${
              banner.kind === "success"
                ? "bg-emerald-900/20 border border-emerald-700/50 text-emerald-200"
                : "bg-red-900/20 border border-red-700/50 text-red-200"
            }`}
          >
            {banner.message}
          </div>
        )}

        {/* Current state */}
        <div className="mb-6 pb-6 border-b border-theme-border-secondary/50">
          <p className="text-xs text-theme-text-muted mb-2">
            {t("distroSources.currentLabel")}
          </p>
          <div className="p-3 bg-theme-bg-tertiary/50 rounded-md text-sm">
            {isLoading ? (
              <span className="text-theme-text-muted">
                {t("distroSources.loading")}
              </span>
            ) : loadError ? (
              <span className="text-red-300">{loadError}</span>
            ) : currentSource ? (
              <div className="space-y-1">
                <div className="flex justify-between gap-2">
                  <span className="text-theme-text-secondary">
                    {t("distroSources.modeLabel")}
                  </span>
                  <span className="font-mono text-theme-text-primary">
                    {currentSource.mode === "append"
                      ? t("distroSources.modeAppend")
                      : t("distroSources.modeReplace")}
                  </span>
                </div>
                <div className="text-xs text-theme-text-muted break-all font-mono">
                  {currentSource.url}
                </div>
              </div>
            ) : (
              <span className="text-theme-text-muted">
                {t("distroSources.noCurrent")}
              </span>
            )}
          </div>
        </div>

        {/* Mode selector */}
        <div className="mb-4">
          <p className="block text-sm font-medium text-theme-text-primary mb-2">
            {t("distroSources.modeLabel")}
          </p>
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="distro-source-mode"
                value="append"
                checked={mode === "append"}
                onChange={() => setMode("append")}
                className="mt-1"
              />
              <div>
                <div className="text-sm text-theme-text-primary">
                  {t("distroSources.modeAppend")}
                </div>
                <div className="text-xs text-theme-text-muted">
                  {t("distroSources.modeAppendDesc")}
                </div>
              </div>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="radio"
                name="distro-source-mode"
                value="replace"
                checked={mode === "replace"}
                onChange={() => setMode("replace")}
                className="mt-1"
              />
              <div>
                <div className="text-sm text-theme-text-primary">
                  {t("distroSources.modeReplace")}
                </div>
                <div className="text-xs text-amber-300">
                  {t("distroSources.modeReplaceWarning")}
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* URL input */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-theme-text-primary mb-1">
            {t("distroSources.urlLabel")}
          </label>
          <p className="text-xs text-theme-text-muted mb-2">
            {t("distroSources.urlDesc")}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => {
                setUrlInput(e.target.value);
                setPreview(null);
                setPreviewError(null);
              }}
              placeholder="https://example.com/distributions.json"
              className="flex-1 px-3 py-2 bg-theme-bg-secondary border border-theme-border-secondary rounded-lg text-theme-text-primary text-sm font-mono focus:outline-none focus:border-emerald-500"
            />
            <button
              onClick={() => handlePreview()}
              disabled={isPreviewing || !urlInput.trim()}
              className="px-3 py-2 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg text-theme-text-secondary hover:text-theme-text-primary transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm"
            >
              {isPreviewing
                ? t("distroSources.previewing")
                : t("distroSources.preview")}
            </button>
          </div>
        </div>

        {/* Preview */}
        {(preview || previewError) && (
          <div className="mb-6 p-3 bg-theme-bg-tertiary/50 rounded-md">
            <p className="text-xs text-theme-text-muted mb-2">
              {t("distroSources.previewLabel")}
            </p>
            {previewError ? (
              <p className="text-sm text-red-300">{previewError}</p>
            ) : preview && preview.entries.length === 0 ? (
              <p className="text-sm text-theme-text-muted">
                {t("distroSources.previewEmpty")}
              </p>
            ) : preview ? (
              <ul className="space-y-1 text-sm">
                {preview.entries.map((e) => (
                  <li
                    key={`${e.flavor}-${e.name}`}
                    className="flex flex-wrap items-baseline gap-2"
                  >
                    <span className="font-mono text-theme-text-primary">
                      {e.name}
                    </span>
                    <span className="text-xs text-theme-text-muted">
                      {e.friendlyName}
                    </span>
                    <span className="text-xs text-theme-text-muted">
                      ({[e.hasAmd64 && "x64", e.hasArm64 && "arm64"]
                        .filter(Boolean)
                        .join(", ") || "no arch"}
                      {e.default ? `, ${t("distroSources.defaultTag")}` : ""})
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 mb-6">
          <button
            onClick={handleApply}
            disabled={isApplying || !urlInput.trim()}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isApplying
              ? t("distroSources.applying")
              : t("distroSources.apply")}
          </button>
          <button
            onClick={handleClear}
            disabled={isClearing || (!currentSource && !urlInput.trim())}
            className="px-4 py-2 bg-theme-bg-tertiary hover:bg-theme-bg-secondary border border-theme-border-secondary rounded-lg text-theme-text-secondary text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isClearing
              ? t("distroSources.clearing")
              : t("distroSources.clear")}
          </button>
        </div>

        {/* Suggested sources */}
        <div className="pt-6 border-t border-theme-border-secondary/50">
          <p className="text-sm font-medium text-theme-text-primary mb-1">
            {t("distroSources.suggestedTitle")}
          </p>
          <p className="text-xs text-theme-text-muted mb-3">
            {t("distroSources.suggestedDesc")}
          </p>
          <ul className="space-y-2">
            {SUGGESTED_SOURCES.map((s) => (
              <li
                key={s.id}
                className="flex items-start gap-3 p-3 bg-theme-bg-tertiary/30 border border-theme-border-secondary/40 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm text-theme-text-primary">
                    {s.label}
                  </div>
                  <div className="text-xs text-theme-text-muted">
                    {s.description}
                  </div>
                  <div className="text-xs text-theme-text-muted font-mono break-all mt-1">
                    {s.url}
                  </div>
                </div>
                <button
                  onClick={() => handleAddSuggested(s)}
                  className="shrink-0 px-3 py-1.5 text-xs text-emerald-300 hover:text-emerald-200 border border-emerald-700/50 hover:border-emerald-500 rounded-md transition-colors"
                >
                  {t("distroSources.suggestedAdd")}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
