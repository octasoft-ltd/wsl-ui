export interface Distribution {
  id?: string; // Distribution ID (GUID from Windows Registry)
  name: string;
  state: DistroState;
  version: number;
  isDefault: boolean;
  location?: string; // Installation path (from Windows Registry)
  diskSize?: number; // Size in bytes
  osInfo?: string; // e.g., "Ubuntu 22.04.3 LTS"
  metadata?: DistroMetadata; // Installation source info (if tracked)
}

export type DistroState = "Running" | "Stopped" | "Installing" | "Unknown";

/** Installation source types */
export type InstallSource = "store" | "container" | "download" | "lxc" | "import" | "clone" | "unknown";

/** Metadata for tracking how a distribution was installed */
export interface DistroMetadata {
  distroId: string;       // Distribution ID (GUID) - primary key
  distroName: string;     // Distribution name (can change via rename)
  installSource: InstallSource;
  installedAt: string;    // ISO 8601 timestamp
  imageReference?: string; // e.g., "docker.io/gitlab/gitlab-runner:latest" (for container)
  downloadUrl?: string;   // For download/lxc sources
  catalogEntry?: string;  // Reference to catalog entry ID
  clonedFrom?: string;    // Source distro ID for cloned distros
  importPath?: string;    // Original tar file path for imported distros
}

/** Colors for installation source indicators (matches NewDistroDialog tabs) */
export const INSTALL_SOURCE_COLORS: Record<InstallSource, string> = {
  store: "#10B981",     // Emerald (Quick Install)
  download: "#3B82F6",  // Blue (Download)
  lxc: "#A855F7",       // Purple (Community)
  container: "#F97316", // Orange (Container)
  import: "#06B6D4",    // Cyan (Import)
  clone: "#8B5CF6",     // Violet (Clone)
  unknown: "#a4b004",   // Yellow (External)
};

/** Display names for installation sources */
export const INSTALL_SOURCE_NAMES: Record<InstallSource, string> = {
  store: "Microsoft Store",
  container: "Container Image",
  download: "Direct Download",
  lxc: "Community",
  import: "Imported",
  clone: "Cloned",
  unknown: "External",
};

export interface WslStatus {
  defaultDistro: string | null;
  runningCount: number;
  totalCount: number;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "Unknown";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

