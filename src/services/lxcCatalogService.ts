// LXC Catalog Service - Fetches and parses Linux Containers image catalog
import type {
  LxcImagesResponse,
  LxcProduct,
  LxcDistribution,
  LxcDistributionGroup,
  LxcDistributionRelease,
  LxcCatalogCache,
  DistributionSourceSettings,
} from "../types/lxcCatalog";
import { getLxcDistroDisplayName, DEFAULT_DISTRIBUTION_SOURCE_SETTINGS } from "../types/lxcCatalog";
import { debug, info, warn } from "../utils/logger";

const CACHE_KEY = "lxc-catalog-cache";

/**
 * Get the system architecture for filtering
 * WSL typically runs on amd64 (x86_64)
 */
function getSystemArch(): string {
  return "amd64";
}

/**
 * Parse a product key to extract components
 * Format: {distro}:{release}:{arch}:{variant}
 */
function parseProductKey(key: string): { os: string; release: string; arch: string; variant: string } | null {
  const parts = key.split(":");
  if (parts.length !== 4) return null;
  return {
    os: parts[0],
    release: parts[1],
    arch: parts[2],
    variant: parts[3],
  };
}

/**
 * Check if a release is considered stable (not experimental)
 */
function isStableRelease(os: string, release: string): boolean {
  const lower = release.toLowerCase();

  // Skip experimental, dev, edge releases unless explicitly wanted
  if (lower.includes("edge") || lower.includes("dev") || lower.includes("devel")) {
    return false;
  }
  if (lower.includes("rawhide") || lower.includes("sid") || lower.includes("unstable")) {
    return false;
  }
  if (lower === "current" && os !== "archlinux") {
    // "current" is fine for Arch, but might be rolling for others
    return true;
  }

  return true;
}

/**
 * Convert raw LXC product to parsed distribution
 */
function parseProduct(
  productKey: string,
  product: LxcProduct,
  baseUrl: string
): LxcDistribution | null {
  const parsed = parseProductKey(productKey);
  if (!parsed) return null;

  // Get the latest version (versions are date-keyed, like "20241215_13:00")
  const versionKeys = Object.keys(product.versions).sort().reverse();
  if (versionKeys.length === 0) return null;

  const latestVersion = product.versions[versionKeys[0]];
  if (!latestVersion?.items) return null;

  // Find the rootfs.tar.xz item
  const rootfsItem = latestVersion.items["rootfs.tar.xz"] || latestVersion.items["root.tar.xz"];
  if (!rootfsItem) return null;

  // Build download URL
  const downloadUrl = `${baseUrl}/${rootfsItem.path}`;

  return {
    id: productKey,
    name: getLxcDistroDisplayName(product.os),
    version: product.release,
    releaseTitle: product.release_title || product.release,
    arch: product.arch,
    variant: product.variant || "default",
    aliases: product.aliases ? product.aliases.split(",").map((a) => a.trim()) : [],
    downloadUrl,
    sizeBytes: rootfsItem.size,
    sha256: rootfsItem.sha256,
    buildDate: versionKeys[0],
  };
}

/**
 * Group distributions by OS for display
 */
function groupDistributions(distributions: LxcDistribution[]): LxcDistributionGroup[] {
  const grouped = new Map<string, LxcDistribution[]>();

  for (const distro of distributions) {
    const key = distro.name.toLowerCase().replace(/\s+/g, "");
    const existing = grouped.get(key) || [];
    existing.push(distro);
    grouped.set(key, existing);
  }

  const groups: LxcDistributionGroup[] = [];

  for (const [, distros] of grouped) {
    if (distros.length === 0) continue;

    const firstDistro = distros[0];
    const os = firstDistro.name.toLowerCase().replace(/\s+/g, "");

    // Group by version
    const versionMap = new Map<string, LxcDistribution[]>();
    for (const d of distros) {
      const existing = versionMap.get(d.version) || [];
      existing.push(d);
      versionMap.set(d.version, existing);
    }

    // Sort versions (newest first)
    const releases: LxcDistributionRelease[] = Array.from(versionMap.entries())
      .sort((a, b) => {
        // Try numeric comparison first
        const numA = parseFloat(a[0]);
        const numB = parseFloat(b[0]);
        if (!isNaN(numA) && !isNaN(numB)) {
          return numB - numA;
        }
        // Fall back to string comparison
        return b[0].localeCompare(a[0]);
      })
      .map(([version, variants]) => ({
        version,
        releaseTitle: variants[0].releaseTitle,
        variants: variants.sort((a, b) => {
          // Put "default" variant first
          if (a.variant === "default") return -1;
          if (b.variant === "default") return 1;
          return a.variant.localeCompare(b.variant);
        }),
      }));

    groups.push({
      os,
      displayName: firstDistro.name,
      releases,
    });
  }

  // Sort groups alphabetically
  groups.sort((a, b) => a.displayName.localeCompare(b.displayName));

  return groups;
}

/**
 * Load cached catalog from localStorage
 */
function loadCache(): LxcCatalogCache | null {
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      debug("[lxcCatalog] No cache found");
      return null;
    }

    const data = JSON.parse(cached) as LxcCatalogCache;

    // Check if cache has expired
    if (new Date(data.expiresAt) < new Date()) {
      debug("[lxcCatalog] Cache expired, removing");
      localStorage.removeItem(CACHE_KEY);
      return null;
    }

    debug(`[lxcCatalog] Cache hit: ${data.distributions.length} distributions`);
    return data;
  } catch {
    warn("[lxcCatalog] Failed to load cache");
    return null;
  }
}

/**
 * Save catalog to cache
 */
function saveCache(distributions: LxcDistribution[], cacheDurationHours: number): void {
  try {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + cacheDurationHours * 60 * 60 * 1000);

    const cache: LxcCatalogCache = {
      lastUpdated: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      distributions,
    };

    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    debug(`[lxcCatalog] Cache saved: ${distributions.length} distributions, expires ${expiresAt.toISOString()}`);
  } catch {
    warn("[lxcCatalog] Failed to save cache");
  }
}

/**
 * Clear the catalog cache
 */
function clearLxcCatalogCache(): void {
  info("[lxcCatalog] Clearing cache");
  localStorage.removeItem(CACHE_KEY);
}

/**
 * LXC Catalog Service
 */
export const lxcCatalogService = {
  /**
   * Fetch and parse the LXC catalog
   * Returns cached data if available and not expired
   */
  async fetchCatalog(
    settings?: DistributionSourceSettings,
    forceRefresh = false
  ): Promise<{ distributions: LxcDistribution[]; groups: LxcDistributionGroup[] }> {
    const config = settings || DEFAULT_DISTRIBUTION_SOURCE_SETTINGS;
    const systemArch = getSystemArch();

    debug(`[lxcCatalog] Fetching catalog (forceRefresh=${forceRefresh})`);

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = loadCache();
      if (cached) {
        debug("[lxcCatalog] Using cached catalog");
        const groups = groupDistributions(cached.distributions);
        return { distributions: cached.distributions, groups };
      }
    }

    // Fetch from server
    const catalogUrl = `${config.lxcBaseUrl}/streams/v1/images.json`;
    info(`[lxcCatalog] Fetching from: ${catalogUrl}`);

    const response = await fetch(catalogUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch LXC catalog: ${response.status} ${response.statusText}`);
    }

    const data = (await response.json()) as LxcImagesResponse;
    debug(`[lxcCatalog] Received ${Object.keys(data.products).length} products`);

    // Parse and filter products
    const distributions: LxcDistribution[] = [];

    for (const [key, product] of Object.entries(data.products)) {
      // Only include matching architecture
      if (product.arch !== systemArch) continue;

      // Filter unstable releases if not enabled
      if (!config.showUnstableReleases && !isStableRelease(product.os, product.release)) {
        continue;
      }

      const parsed = parseProduct(key, product, config.lxcBaseUrl);
      if (parsed) {
        distributions.push(parsed);
      }
    }

    info(`[lxcCatalog] Parsed ${distributions.length} distributions for ${systemArch}`);

    // Sort by name, then version
    distributions.sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;
      return b.version.localeCompare(a.version);
    });

    // Save to cache
    saveCache(distributions, config.cacheDurationHours);

    // Group for display
    const groups = groupDistributions(distributions);

    return { distributions, groups };
  },

  /**
   * Search distributions by query string
   */
  searchDistributions(
    distributions: LxcDistribution[],
    query: string
  ): LxcDistribution[] {
    if (!query.trim()) return distributions;

    const lower = query.toLowerCase();
    return distributions.filter((d) => {
      return (
        d.name.toLowerCase().includes(lower) ||
        d.version.toLowerCase().includes(lower) ||
        d.releaseTitle.toLowerCase().includes(lower) ||
        d.aliases.some((a) => a.toLowerCase().includes(lower))
      );
    });
  },

  /**
   * Get the last cache update time
   */
  getCacheInfo(): { lastUpdated: string | null; expiresAt: string | null } {
    const cached = loadCache();
    if (!cached) {
      return { lastUpdated: null, expiresAt: null };
    }
    return { lastUpdated: cached.lastUpdated, expiresAt: cached.expiresAt };
  },

  /**
   * Clear the cache
   */
  clearCache(): void {
    clearLxcCatalogCache();
  },
};
