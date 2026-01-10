// Distribution catalog types for config-driven distro management

/**
 * Metadata for Microsoft Store distributions
 * Keyed by the distro ID returned from `wsl --list --online`
 */
export interface MsStoreDistroInfo {
  description: string;
  enabled?: boolean;
}

/**
 * Direct download distribution entry
 */
export interface DownloadDistro {
  id: string;
  name: string;
  description: string;
  url: string;
  size?: string;
  enabled?: boolean;
  isBuiltIn?: boolean;
}

/**
 * Container image entry for Podman/Docker installation
 */
export interface ContainerImage {
  id: string;
  name: string;
  description: string;
  image: string;
  enabled?: boolean;
  isBuiltIn?: boolean;
}

/**
 * Full distribution catalog
 */
export interface DistroCatalog {
  version: string;
  msStoreDistros: Record<string, MsStoreDistroInfo>;
  downloadDistros: DownloadDistro[];
  containerImages: ContainerImage[];
}

/**
 * Distribution family types
 */
export type DistroFamily = "debian" | "redhat" | "arch" | "suse" | "independent";

/**
 * Family display names
 */
export const DISTRO_FAMILY_NAMES: Record<DistroFamily, string> = {
  debian: "Debian",
  redhat: "Red Hat",
  arch: "Arch",
  suse: "SUSE",
  independent: "Independent",
};

/**
 * Map distro IDs to their distribution family
 */
const ID_TO_FAMILY: Record<string, DistroFamily> = {
  // Debian-based
  ubuntu: "debian",
  debian: "debian",
  kali: "debian",
  mint: "debian",

  // Red Hat-based (RPM)
  fedora: "redhat",
  rhel: "redhat",
  centos: "redhat",
  rocky: "redhat",
  almalinux: "redhat",
  oracle: "redhat",

  // Arch-based
  arch: "arch",
  manjaro: "arch",

  // SUSE-based
  opensuse: "suse",
  suse: "suse",

  // Independent
  alpine: "independent",
  nixos: "independent",
  void: "independent",
  gentoo: "independent",
};

/**
 * Get distribution family from distro ID or name
 */
export function getDistroFamily(distroId: string): DistroFamily {
  const lower = distroId.toLowerCase();

  // Check direct match
  if (ID_TO_FAMILY[lower]) {
    return ID_TO_FAMILY[lower];
  }

  // Check if ID contains family indicators
  if (lower.includes("ubuntu") || lower.includes("debian") || lower.includes("kali") || lower.includes("mint")) {
    return "debian";
  }
  if (lower.includes("fedora") || lower.includes("rhel") || lower.includes("centos") ||
      lower.includes("rocky") || lower.includes("alma") || lower.includes("oracle")) {
    return "redhat";
  }
  if (lower.includes("arch") || lower.includes("manjaro")) {
    return "arch";
  }
  if (lower.includes("suse") || lower.includes("opensuse")) {
    return "suse";
  }
  if (lower.includes("alpine") || lower.includes("nixos") || lower.includes("nix") ||
      lower.includes("void") || lower.includes("gentoo")) {
    return "independent";
  }

  return "independent";
}


