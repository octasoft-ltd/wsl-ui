import { useState, useEffect, useCallback, memo } from "react";
import { useTranslation } from "react-i18next";
import { lxcCatalogService } from "../services/lxcCatalogService";
import { useSettingsStore } from "../store/settingsStore";
import type { LxcDistribution, LxcDistributionGroup } from "../types/lxcCatalog";
import { formatLxcSize } from "../types/lxcCatalog";
import { getDistroLogo, LinuxLogo } from "./icons/DistroLogos";
import { CheckIcon, DownloadIcon, ChevronDownIcon, ChevronRightIcon } from "./icons";
import { type DistroFamily, DISTRO_FAMILY_NAMES, getDistroFamily } from "../types/catalog";

interface LxcCatalogBrowserProps {
  selectedDistro: LxcDistribution | null;
  onSelect: (distro: LxcDistribution) => void;
  disabled?: boolean;
}

function LxcCatalogBrowserInner({ selectedDistro, onSelect, disabled }: LxcCatalogBrowserProps) {
  const { t } = useTranslation("install");
  const { settings } = useSettingsStore();
  const [distributions, setDistributions] = useState<LxcDistribution[]>([]);
  const [groups, setGroups] = useState<LxcDistributionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [familyFilter, setFamilyFilter] = useState<DistroFamily | null>(null);

  const loadCatalog = useCallback(async (forceRefresh = false) => {
    if (!settings.distributionSources.lxcEnabled) {
      setError("Community catalog is disabled. Enable it in Settings.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await lxcCatalogService.fetchCatalog(
        settings.distributionSources,
        forceRefresh
      );
      setDistributions(result.distributions);
      setGroups(result.groups);

      // Start with all groups collapsed
      setExpandedGroups(new Set());
    } catch (err) {
      // Tauri returns string errors, not Error instances
      const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : "Failed to load catalog";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  }, [settings.distributionSources]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const toggleGroup = (os: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(os)) {
        next.delete(os);
      } else {
        next.add(os);
      }
      return next;
    });
  };

  // Filter distributions by search query
  const filteredDistros = searchQuery
    ? lxcCatalogService.searchDistributions(distributions, searchQuery)
    : distributions;

  // Filter by family
  const familyFilteredDistros = familyFilter
    ? filteredDistros.filter(d => getDistroFamily(d.name.toLowerCase().replace(/\s+/g, "")) === familyFilter)
    : filteredDistros;

  // Rebuild groups from filtered distributions
  const filteredGroups = groups
    .map(group => ({
      ...group,
      releases: group.releases
        .map(release => ({
          ...release,
          variants: release.variants.filter(v =>
            familyFilteredDistros.some(fd => fd.id === v.id)
          ),
        }))
        .filter(release => release.variants.length > 0),
    }))
    .filter(group => group.releases.length > 0);

  // Calculate family counts for filter tabs
  const familyCounts = new Map<DistroFamily, number>();
  for (const distro of filteredDistros) {
    const family = getDistroFamily(distro.name.toLowerCase().replace(/\s+/g, ""));
    familyCounts.set(family, (familyCounts.get(family) || 0) + 1);
  }

  const cacheInfo = lxcCatalogService.getCacheInfo();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-theme-text-muted">
        <svg className="w-8 h-8 animate-spin mb-3 text-theme-accent-primary" viewBox="0 0 24 24">
          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span className="text-sm">{t('loading')}</span>
        <span className="text-xs text-theme-text-muted mt-1"></span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-theme-text-muted">
        <svg className="w-12 h-12 mb-3 text-theme-status-error opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-sm text-theme-status-error mb-2">{error}</span>
        <button
          onClick={() => loadCatalog(true)}
          className="text-xs text-theme-accent-primary hover:underline"
        >
          {t('common:button.retry')}
        </button>
      </div>
    );
  }

  return (
    <div>
      {/* Search and controls */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search distributions..."
            disabled={disabled}
            className="w-full pl-10 pr-4 py-2.5 bg-theme-bg-tertiary border border-theme-border-secondary rounded-xl text-theme-text-primary placeholder-theme-text-muted focus:outline-none focus:border-theme-accent-primary text-sm disabled:opacity-50"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-theme-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-theme-text-muted hover:text-theme-text-primary transition-colors"
              title="Clear search"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        <button
          onClick={() => loadCatalog(true)}
          disabled={disabled || loading}
          className="p-2.5 bg-theme-bg-tertiary hover:bg-theme-bg-hover border border-theme-border-secondary text-theme-text-secondary rounded-xl transition-colors disabled:opacity-50"
          title="Refresh catalog"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {filteredGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-theme-text-muted">
          <LinuxLogo size={48} className="mb-3 opacity-50" />
          <span className="text-sm">No distributions match "{searchQuery}"</span>
        </div>
      ) : (
        <>

      {/* Family filter tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        <button
          onClick={() => setFamilyFilter(null)}
          disabled={disabled}
          className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
            familyFilter === null
              ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
              : "bg-theme-bg-tertiary text-theme-text-muted border border-theme-border-secondary hover:text-theme-text-secondary hover:border-theme-border-primary"
          }`}
        >
          All ({filteredDistros.length})
        </button>
        {(Object.entries(DISTRO_FAMILY_NAMES) as [DistroFamily, string][]).map(([family, name]) => {
          const count = familyCounts.get(family) || 0;
          if (count === 0) return null;
          return (
            <button
              key={family}
              onClick={() => setFamilyFilter(family)}
              disabled={disabled}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                familyFilter === family
                  ? "bg-purple-500/20 text-purple-400 border border-purple-500/30"
                  : "bg-theme-bg-tertiary text-theme-text-muted border border-theme-border-secondary hover:text-theme-text-secondary hover:border-theme-border-primary"
              }`}
            >
              {name} ({count})
            </button>
          );
        })}
      </div>

      {/* Distribution list */}
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
        {filteredGroups.map((group) => {
          const isExpanded = expandedGroups.has(group.os);
          const Logo = getDistroLogo(group.os);

          return (
            <div key={group.os} className="border border-theme-border-secondary rounded-xl overflow-hidden">
              {/* Group header */}
              <button
                onClick={() => toggleGroup(group.os)}
                disabled={disabled}
                className="w-full flex items-center gap-3 p-3 bg-theme-bg-tertiary/50 hover:bg-theme-bg-tertiary transition-colors text-left"
              >
                <div className="shrink-0 rounded-lg p-1 bg-theme-bg-tertiary">
                  <Logo size={28} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-theme-text-primary">{group.displayName}</div>
                  <div className="text-xs text-theme-text-muted">
                    {group.releases.length} version{group.releases.length !== 1 ? "s" : ""} available
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronDownIcon size="md" className="text-theme-text-muted" />
                ) : (
                  <ChevronRightIcon size="md" className="text-theme-text-muted" />
                )}
              </button>

              {/* Releases */}
              {isExpanded && (
                <div className="border-t border-theme-border-secondary">
                  {group.releases.map((release) => (
                    <div key={release.version}>
                      {release.variants.map((variant) => {
                        const isSelected = selectedDistro?.id === variant.id;
                        return (
                          <button
                            key={variant.id}
                            onClick={() => onSelect(variant)}
                            disabled={disabled}
                            className={`w-full flex items-center gap-3 px-4 py-3 transition-colors text-left ${
                              isSelected
                                ? "bg-purple-500/10 border-l-2 border-purple-500"
                                : "hover:bg-theme-bg-hover border-l-2 border-transparent"
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className={`font-medium ${isSelected ? "text-purple-300" : "text-theme-text-primary"}`}>
                                  {release.releaseTitle || release.version}
                                </span>
                                {variant.variant !== "default" && (
                                  <span className="text-xs px-1.5 py-0.5 bg-theme-bg-tertiary rounded text-theme-text-muted">
                                    {variant.variant}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-theme-text-muted mt-0.5">
                                <span className="flex items-center gap-1">
                                  <DownloadIcon size="sm" className="opacity-50" />
                                  {formatLxcSize(variant.sizeBytes)}
                                </span>
                                <span className="opacity-50">|</span>
                                <span>{variant.arch}</span>
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center shrink-0">
                                <CheckIcon size="sm" className="text-white" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Cache info */}
      {cacheInfo.lastUpdated && (
        <div className="mt-4 text-xs text-theme-text-muted text-center">
          Catalog cached {new Date(cacheInfo.lastUpdated).toLocaleDateString()} at {new Date(cacheInfo.lastUpdated).toLocaleTimeString()}
        </div>
      )}

        </>
      )}
    </div>
  );
}

// Memoize to prevent re-renders during download progress updates
export const LxcCatalogBrowser = memo(LxcCatalogBrowserInner);
