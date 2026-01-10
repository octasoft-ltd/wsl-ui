// LXC (Linux Containers) Image Catalog Types
// Based on simplestreams API: https://images.linuxcontainers.org

/**
 * Settings for distribution sources (LXC catalog)
 */
export interface DistributionSourceSettings {
  /** Enable community catalog (LXC Images) */
  lxcEnabled: boolean;
  /** LXC server base URL */
  lxcBaseUrl: string;
  /** Cache duration in hours */
  cacheDurationHours: number;
  /** Show experimental/unstable releases */
  showUnstableReleases: boolean;
}

export const DEFAULT_DISTRIBUTION_SOURCE_SETTINGS: DistributionSourceSettings = {
  lxcEnabled: true,
  lxcBaseUrl: "https://images.linuxcontainers.org",
  cacheDurationHours: 24,
  showUnstableReleases: false,
};

/**
 * Raw LXC simplestreams index response
 */
export interface LxcIndex {
  format: string;
  index: Record<string, LxcIndexEntry>;
}

export interface LxcIndexEntry {
  datatype: string;
  path: string;
  products: string[];
}

/**
 * Raw LXC images.json response structure
 */
export interface LxcImagesResponse {
  content_id: string;
  datatype: string;
  format: string;
  products: Record<string, LxcProduct>;
}

/**
 * Raw LXC product from API
 * Key format: {distro}:{release}:{arch}:{variant}
 */
export interface LxcProduct {
  aliases: string;
  arch: string;
  os: string;
  release: string;
  release_title: string;
  variant: string;
  versions: Record<string, LxcVersion>;
}

/**
 * Version entry containing download items
 */
export interface LxcVersion {
  items: Record<string, LxcItem>;
}

/**
 * Download item (rootfs, disk image, etc.)
 */
export interface LxcItem {
  ftype: string;
  path: string;
  sha256?: string;
  size: number;
  combined_sha256?: string;
  combined_rootxz_sha256?: string;
}

// ============= Parsed/Display Types =============

/**
 * Parsed distribution for display
 */
export interface LxcDistribution {
  /** Unique ID: {os}:{release}:{arch}:{variant} */
  id: string;
  /** Display name (e.g., "Alpine Linux") */
  name: string;
  /** Version/release (e.g., "3.20") */
  version: string;
  /** Human-readable release title */
  releaseTitle: string;
  /** Architecture (e.g., "amd64") */
  arch: string;
  /** Variant (e.g., "default", "cloud") */
  variant: string;
  /** Aliases for searching */
  aliases: string[];
  /** Download URL for rootfs.tar.xz */
  downloadUrl: string;
  /** File size in bytes */
  sizeBytes: number;
  /** SHA256 checksum */
  sha256?: string;
  /** Build date */
  buildDate: string;
}

/**
 * Distribution grouped by name for UI display
 */
export interface LxcDistributionGroup {
  /** OS name (e.g., "alpine") */
  os: string;
  /** Display name (e.g., "Alpine Linux") */
  displayName: string;
  /** Available releases */
  releases: LxcDistributionRelease[];
}

export interface LxcDistributionRelease {
  /** Version string */
  version: string;
  /** Release title */
  releaseTitle: string;
  /** Variants available */
  variants: LxcDistribution[];
}

/**
 * Cached catalog data
 */
export interface LxcCatalogCache {
  /** When the cache was last updated */
  lastUpdated: string;
  /** Cache expiry timestamp */
  expiresAt: string;
  /** The cached distributions */
  distributions: LxcDistribution[];
}

/**
 * Status of the LXC catalog
 */
export type LxcCatalogStatus = "idle" | "loading" | "loaded" | "error";

/**
 * LXC catalog state for the store
 */
export interface LxcCatalogState {
  status: LxcCatalogStatus;
  distributions: LxcDistribution[];
  groups: LxcDistributionGroup[];
  lastUpdated: string | null;
  error: string | null;
}

/**
 * Known distribution display names
 */
const LXC_DISTRO_NAMES: Record<string, string> = {
  alpine: "Alpine Linux",
  almalinux: "AlmaLinux",
  alt: "ALT Linux",
  amazonlinux: "Amazon Linux",
  archlinux: "Arch Linux",
  busybox: "BusyBox",
  centos: "CentOS",
  debian: "Debian",
  devuan: "Devuan",
  fedora: "Fedora",
  funtoo: "Funtoo",
  gentoo: "Gentoo",
  kali: "Kali Linux",
  mint: "Linux Mint",
  mageia: "Mageia",
  nixos: "NixOS",
  openwrt: "OpenWrt",
  opensuse: "openSUSE",
  oracle: "Oracle Linux",
  plamo: "Plamo Linux",
  rockylinux: "Rocky Linux",
  sabayon: "Sabayon",
  slackware: "Slackware",
  springdalelinux: "Springdale Linux",
  ubuntu: "Ubuntu",
  voidlinux: "Void Linux",
};

/**
 * Get display name for a distribution
 */
export function getLxcDistroDisplayName(os: string): string {
  return LXC_DISTRO_NAMES[os.toLowerCase()] || os.charAt(0).toUpperCase() + os.slice(1);
}

/**
 * Format bytes to human-readable string
 */
export function formatLxcSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  } else if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}
