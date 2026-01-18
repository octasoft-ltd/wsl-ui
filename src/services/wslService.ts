import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { save, open } from "@tauri-apps/plugin-dialog";
import type { DistroCatalog, DownloadDistro, ContainerImage, MsStoreDistroInfo } from "../types/catalog";
import type { Distribution, DistroMetadata } from "../types/distribution";
import type { WslConfig, WslConf, InstalledTerminal } from "../types/settings";
import { debug, info } from "../utils/logger";

/**
 * Download progress event payload
 */
export interface DownloadProgress {
  distroName: string;
  stage: "downloading" | "importing" | "complete" | "error";
  bytesDownloaded: number;
  totalBytes: number | null;
  percent: number | null;
}

/**
 * Get default export filename with date
 */
const getDefaultExportFilename = (distroName: string): string => {
  const date = new Date().toISOString().split("T")[0]; // YYYY-MM-DD
  return `${distroName}-${date}.tar`;
};

/**
 * WSL Service - always uses Tauri backend
 * The Rust backend handles mock mode for non-Windows development
 */
export const wslService = {
  async listDistributions(): Promise<Distribution[]> {
    debug("[wslService] Listing distributions");
    const distros = await invoke<Distribution[]>("list_distributions");
    debug(`[wslService] Found ${distros.length} distributions`);
    // Refresh tray menu to keep it in sync with distro states
    await invoke("refresh_tray_menu").catch(() => {});
    return distros;
  },

  async refreshTrayMenu(): Promise<void> {
    debug("[wslService] Refreshing tray menu");
    await invoke("refresh_tray_menu");
  },

  /**
   * Quit the application
   */
  async quitApp(): Promise<void> {
    debug("[wslService] Quitting application");
    await invoke("quit_app");
  },

  /**
   * Hide the main window (minimize to tray)
   */
  async hideWindow(): Promise<void> {
    debug("[wslService] Hiding window");
    await invoke("hide_window");
  },

  async startDistribution(name: string, id?: string): Promise<void> {
    info(`[wslService] Starting distribution: ${name}`);
    await invoke("start_distribution", { name, id });
  },

  async stopDistribution(name: string): Promise<void> {
    info(`[wslService] Stopping distribution: ${name}`);
    await invoke("stop_distribution", { name });
  },

  async forceStopDistribution(name: string): Promise<void> {
    info(`[wslService] Force stopping distribution: ${name}`);
    await invoke("force_stop_distribution", { name });
  },

  async deleteDistribution(name: string): Promise<void> {
    info(`[wslService] Deleting distribution: ${name}`);
    await invoke("delete_distribution", { name });
  },

  async shutdownAll(): Promise<void> {
    info("[wslService] Shutting down all WSL");
    await invoke("shutdown_all");
  },

  async forceKillWsl(): Promise<void> {
    info("[wslService] Force killing WSL");
    await invoke("force_kill_wsl");
  },

  async setDefaultDistribution(name: string): Promise<void> {
    info(`[wslService] Setting default distribution: ${name}`);
    await invoke("set_default_distribution", { name });
  },

  async openTerminal(name: string, id?: string): Promise<void> {
    info(`[wslService] Opening terminal for: ${name}`);
    await invoke("open_terminal", { name, id });
  },

  async openSystemTerminal(): Promise<void> {
    info("[wslService] Opening system terminal");
    await invoke("open_system_terminal");
  },

  async openFileExplorer(name: string): Promise<void> {
    info(`[wslService] Opening file explorer for: ${name}`);
    await invoke("open_file_explorer", { name });
  },

  async openFolder(path: string): Promise<void> {
    debug(`[wslService] Opening folder: ${path}`);
    await invoke("open_folder", { path });
  },

  async openIDE(name: string): Promise<void> {
    info(`[wslService] Opening IDE for: ${name}`);
    await invoke("open_ide", { name });
  },

  async restartDistribution(name: string, id?: string): Promise<void> {
    info(`[wslService] Restarting distribution: ${name}`);
    await invoke("restart_distribution", { name, id });
  },

  async cloneDistribution(source: string, newName: string, installLocation?: string): Promise<void> {
    info(`[wslService] Cloning distribution: ${source} -> ${newName}`);
    await invoke("clone_distribution", { source, newName, installLocation: installLocation || null });
  },

  /**
   * Validate an install path to check if it's already in use by another distribution
   */
  async validateInstallPath(path: string, newName: string): Promise<{
    isValid: boolean;
    error?: string;
    existingDistro?: string;
  }> {
    debug(`[wslService] Validating install path: ${path}`);
    return await invoke("validate_install_path", { path, newName });
  },

  async getDistributionDiskSize(name: string): Promise<number> {
    debug(`[wslService] Getting disk size for: ${name}`);
    return await invoke<number>("get_distribution_disk_size", { name });
  },

  /**
   * Get both file size and virtual size of a distribution's VHD
   */
  async getDistributionVhdSize(name: string): Promise<VhdSizeInfo> {
    debug(`[wslService] Getting VHD size for: ${name}`);
    return await invoke<VhdSizeInfo>("get_distribution_vhd_size", { name });
  },

  async getDistributionOsInfo(name: string, id?: string): Promise<string> {
    debug(`[wslService] Getting OS info for: ${name}`);
    return await invoke<string>("get_distribution_os_info", { name, id });
  },

  /**
   * Get the installation location (BasePath) of a distribution
   */
  async getDistributionLocation(name: string): Promise<string | null> {
    debug(`[wslService] Getting location for: ${name}`);
    return await invoke<string | null>("get_distribution_location", { name });
  },

  /**
   * Get the default install path for a new distribution
   * Uses settings-based base path (with env var expansion)
   */
  async getDefaultDistroPath(name: string): Promise<string> {
    debug(`[wslService] Getting default path for: ${name}`);
    return await invoke<string>("get_default_distro_path", { name });
  },

  async createFromImage(
    image: string,
    distroName: string,
    installLocation?: string,
    wslVersion?: number,
  ): Promise<void> {
    info(`[wslService] Creating from image: ${image} -> ${distroName}`);
    await invoke("create_from_image", {
      image,
      distroName,
      installLocation: installLocation || null,
      wslVersion: wslVersion || null,
    });
  },

  async listOnlineDistributions(): Promise<string[]> {
    debug("[wslService] Listing online distributions");
    return await invoke<string[]>("list_online_distributions");
  },

  async listDownloadableDistributions(): Promise<string[]> {
    debug("[wslService] Listing downloadable distributions");
    return await invoke<string[]>("list_downloadable_distributions");
  },

  async quickInstallDistribution(distroId: string): Promise<void> {
    info(`[wslService] Quick installing distribution: ${distroId}`);
    await invoke("quick_install_distribution", { distroId });
  },

  /**
   * Custom install with progress events
   * Use onDownloadProgress to listen for progress updates
   */
  async customInstallWithProgress(
    distroId: string,
    customName: string,
    installLocation?: string,
    wslVersion?: number,
  ): Promise<void> {
    info(`[wslService] Custom installing: ${distroId} as ${customName}`);
    await invoke("custom_install_with_progress", {
      distroId,
      customName,
      installLocation: installLocation || null,
      wslVersion: wslVersion || null,
    });
  },

  /**
   * Listen for download progress events
   * Returns an unlisten function to stop listening
   */
  async onDownloadProgress(callback: (progress: DownloadProgress) => void): Promise<UnlistenFn> {
    debug("[wslService] Registering download progress listener");
    return await listen<DownloadProgress>("download-progress", (event) => {
      debug(`[wslService] Download progress: ${event.payload.stage} ${event.payload.percent ?? 0}%`);
      callback(event.payload);
    });
  },

  /**
   * Export a distribution - opens save dialog and exports to tar
   * Returns the path if successful, null if cancelled
   */
  async exportDistribution(name: string): Promise<string | null> {
    info(`[wslService] Export dialog opened for: ${name}`);
    const path = await save({
      defaultPath: getDefaultExportFilename(name),
      filters: [{ name: "TAR Archive", extensions: ["tar"] }],
      title: `Export ${name}`,
    });

    if (!path) {
      debug("[wslService] Export cancelled by user");
      return null; // User cancelled
    }

    info(`[wslService] Exporting ${name} to: ${path}`);
    await invoke("export_distribution", { name, path });
    return path;
  },

  /**
   * Import a distribution - opens file dialog to select tar
   * Returns the new distribution name if successful, null if cancelled
   */
  async importDistribution(name: string, installLocation: string): Promise<string | null> {
    info(`[wslService] Import dialog opened for: ${name}`);
    const tarPath = await open({
      filters: [{ name: "TAR Archive", extensions: ["tar"] }],
      title: "Select WSL Distribution Archive",
      multiple: false,
    });

    if (!tarPath || Array.isArray(tarPath)) {
      debug("[wslService] Import cancelled by user");
      return null; // User cancelled or invalid selection
    }

    info(`[wslService] Importing ${name} from: ${tarPath}`);
    await invoke("import_distribution", { name, installLocation, tarPath });
    return name;
  },

  /**
   * Install a distribution from a rootfs URL (e.g., from LXC catalog)
   * Downloads the rootfs and imports it into WSL
   */
  async installFromRootfsUrl(
    url: string,
    name: string,
    installLocation?: string,
    wslVersion?: number,
  ): Promise<void> {
    info(`[wslService] Installing from URL: ${name} <- ${url}`);
    await invoke("install_from_rootfs_url", {
      url,
      name,
      installLocation: installLocation || null,
      wslVersion: wslVersion || null,
    });
  },

  // WSL Configuration functions

  /**
   * Get global WSL2 configuration (.wslconfig)
   */
  async getWslConfig(): Promise<WslConfig> {
    debug("[wslService] Getting global WSL config");
    return await invoke<WslConfig>("get_wsl_config");
  },

  /**
   * Save global WSL2 configuration (.wslconfig)
   */
  async saveWslConfig(config: WslConfig): Promise<void> {
    info("[wslService] Saving global WSL config");
    await invoke("save_wsl_config", { config });
  },

  /**
   * Get per-distribution configuration (wsl.conf)
   */
  async getWslConf(distroName: string, id?: string): Promise<WslConf> {
    debug(`[wslService] Getting wsl.conf for: ${distroName}`);
    return await invoke<WslConf>("get_wsl_conf", { distroName, id });
  },

  /**
   * Get raw per-distribution configuration content (wsl.conf)
   * Returns null if the file doesn't exist
   */
  async getWslConfRaw(distroName: string, id?: string): Promise<string | null> {
    debug(`[wslService] Getting raw wsl.conf for: ${distroName}`);
    return await invoke<string | null>("get_wsl_conf_raw", { distroName, id });
  },

  /**
   * Save per-distribution configuration (wsl.conf)
   */
  async saveWslConf(distroName: string, config: WslConf): Promise<void> {
    info(`[wslService] Saving wsl.conf for: ${distroName}`);
    await invoke("save_wsl_conf", { distroName, config });
  },

  // Distro Catalog functions

  /**
   * Get the full distribution catalog (merged defaults + user overrides)
   */
  async getDistroCatalog(): Promise<DistroCatalog> {
    debug("[wslService] Getting distro catalog");
    return await invoke<DistroCatalog>("get_distro_catalog");
  },

  /**
   * Reset catalog to defaults (removes all user overrides)
   */
  async resetDistroCatalog(): Promise<DistroCatalog> {
    info("[wslService] Resetting entire distro catalog");
    return await invoke<DistroCatalog>("reset_distro_catalog");
  },

  /**
   * Reset only download distros to defaults
   */
  async resetDownloadDistros(): Promise<DistroCatalog> {
    info("[wslService] Resetting download distros");
    return await invoke<DistroCatalog>("reset_download_distros");
  },

  /**
   * Reset only container images to defaults
   */
  async resetContainerImages(): Promise<DistroCatalog> {
    info("[wslService] Resetting container images");
    return await invoke<DistroCatalog>("reset_container_images");
  },

  /**
   * Reset only MS Store metadata to defaults
   */
  async resetMsStoreDistros(): Promise<DistroCatalog> {
    info("[wslService] Resetting MS Store distros");
    return await invoke<DistroCatalog>("reset_ms_store_distros");
  },

  /**
   * Add a new download distro
   */
  async addDownloadDistro(distro: DownloadDistro): Promise<DistroCatalog> {
    info(`[wslService] Adding download distro: ${distro.id}`);
    return await invoke<DistroCatalog>("add_download_distro", { distro });
  },

  /**
   * Update an existing download distro
   */
  async updateDownloadDistro(distro: DownloadDistro): Promise<DistroCatalog> {
    info(`[wslService] Updating download distro: ${distro.id}`);
    return await invoke<DistroCatalog>("update_download_distro", { distro });
  },

  /**
   * Delete a download distro (only user-added can be deleted)
   */
  async deleteDownloadDistro(id: string): Promise<DistroCatalog> {
    info(`[wslService] Deleting download distro: ${id}`);
    return await invoke<DistroCatalog>("delete_download_distro", { id });
  },

  /**
   * Add a new container image
   */
  async addContainerImage(image: ContainerImage): Promise<DistroCatalog> {
    info(`[wslService] Adding container image: ${image.id}`);
    return await invoke<DistroCatalog>("add_container_image", { image });
  },

  /**
   * Update an existing container image
   */
  async updateContainerImage(image: ContainerImage): Promise<DistroCatalog> {
    info(`[wslService] Updating container image: ${image.id}`);
    return await invoke<DistroCatalog>("update_container_image", { image });
  },

  /**
   * Delete a container image (only user-added can be deleted)
   */
  async deleteContainerImage(id: string): Promise<DistroCatalog> {
    info(`[wslService] Deleting container image: ${id}`);
    return await invoke<DistroCatalog>("delete_container_image", { id });
  },

  /**
   * Update MS Store distro metadata
   */
  async updateMsStoreDistro(distroId: string, distroInfo: MsStoreDistroInfo): Promise<DistroCatalog> {
    info(`[wslService] Updating MS Store distro: ${distroId}`);
    return await invoke<DistroCatalog>("update_ms_store_distro", { distroId, info: distroInfo });
  },

  /**
   * Delete MS Store distro metadata override
   */
  async deleteMsStoreDistro(distroId: string): Promise<DistroCatalog> {
    info(`[wslService] Deleting MS Store distro override: ${distroId}`);
    return await invoke<DistroCatalog>("delete_ms_store_distro", { distroId });
  },

  // Resource monitoring

  /**
   * Get resource usage stats (global WSL2 memory + per-distro breakdown)
   */
  async getResourceStats(): Promise<ResourceStats> {
    debug("[wslService] Getting resource stats");
    return await invoke<ResourceStats>("get_resource_stats");
  },

  /**
   * Get WSL health status (process count, overall health)
   */
  async getWslHealth(): Promise<WslHealth> {
    debug("[wslService] Getting WSL health");
    return await invoke<WslHealth>("get_wsl_health");
  },

  // WSL Version & Update

  /**
   * Check if WSL is installed and ready to use
   * Returns a WslPreflightStatus indicating readiness or specific error
   */
  async checkWslPreflight(): Promise<WslPreflightStatus> {
    debug("[wslService] Checking WSL preflight");
    return await invoke<WslPreflightStatus>("check_wsl_preflight");
  },

  /**
   * Get WSL version information
   */
  async getWslVersion(): Promise<WslVersionInfo> {
    debug("[wslService] Getting WSL version");
    return await invoke<WslVersionInfo>("get_wsl_version");
  },

  /**
   * Get WSL2 IP address (shared across all distros)
   * Returns null if no distros are running
   */
  async getWslIp(): Promise<string | null> {
    debug("[wslService] Getting WSL IP");
    return await invoke<string | null>("get_wsl_ip");
  },

  /**
   * Get information about the WSL2 system distribution (CBL-Mariner/Azure Linux)
   */
  async getSystemDistroInfo(): Promise<SystemDistroInfo> {
    debug("[wslService] Getting system distro info");
    return await invoke<SystemDistroInfo>("get_system_distro_info");
  },

  /**
   * Update WSL using `wsl --update`
   * @param preRelease If true, uses `wsl --update --pre-release`
   * @param currentVersion The current WSL version (for comparison after update)
   * @returns The update result message
   */
  async updateWsl(preRelease: boolean = false, currentVersion?: string): Promise<string> {
    info(`[wslService] Updating WSL (preRelease: ${preRelease}, currentVersion: ${currentVersion})`);
    return await invoke<string>("update_wsl", { preRelease, currentVersion: currentVersion || null });
  },

  // Manage Distribution functions

  /**
   * Move a distribution to a new location
   * Distribution must be stopped first
   */
  async moveDistribution(name: string, location: string): Promise<void> {
    info(`[wslService] Moving distribution ${name} to: ${location}`);
    await invoke("move_distribution", { name, location });
  },

  /**
   * Set sparse mode for a distribution's virtual disk
   * Sparse mode allows automatic disk space reclamation
   * Distribution must be stopped first
   */
  async setSparseDisk(name: string, enabled: boolean): Promise<void> {
    info(`[wslService] Setting sparse disk for ${name}: ${enabled}`);
    await invoke("set_sparse", { name, enabled });
  },

  /**
   * Set the default user for a distribution
   */
  async setDefaultUser(name: string, username: string): Promise<void> {
    info(`[wslService] Setting default user for ${name}: ${username}`);
    await invoke("set_distro_default_user", { name, username });
  },

  /**
   * Resize a distribution's virtual disk
   * @param size The new size as a string (e.g., "256GB", "1TB")
   * Distribution must be stopped first
   */
  async resizeDistribution(name: string, size: string): Promise<void> {
    info(`[wslService] Resizing distribution ${name} to: ${size}`);
    await invoke("resize_distribution", { name, size });
  },

  /**
   * Compact a distribution's virtual disk to reclaim unused space
   * This operation:
   * - Requires WSL to be fully shutdown (not just the distro stopped)
   * - May take several minutes for large disks (~1 minute per GB)
   * - Requires administrator privileges (UAC prompt will appear)
   * @returns CompactResult with size before and after
   */
  async compactDistribution(name: string): Promise<CompactResult> {
    info(`[wslService] Compacting distribution disk: ${name}`);
    return invoke<CompactResult>("compact_distribution", { name });
  },

  /**
   * Set the WSL version for a distribution (1 or 2)
   * This converts the distribution between WSL 1 and WSL 2.
   * Note: This operation can take several minutes.
   * Distribution must be stopped first
   */
  async setDistroVersion(name: string, version: 1 | 2): Promise<void> {
    info(`[wslService] Setting WSL version for ${name} to: ${version}`);
    await invoke("set_distro_version", { name, version });
  },

  /**
   * Rename a distribution
   * @param id The distribution GUID (required for registry modification)
   * @param newName The new name for the distribution
   * @param updateTerminalProfile If true, updates the Windows Terminal profile display name
   * @param updateShortcut If true, renames the Start Menu shortcut file
   * @returns The old distribution name
   */
  async renameDistribution(
    id: string,
    newName: string,
    updateTerminalProfile: boolean,
    updateShortcut: boolean
  ): Promise<string> {
    info(`[wslService] Renaming distribution ${id} to: ${newName}`);
    return await invoke<string>("rename_distribution", {
      id,
      newName,
      updateTerminalProfile,
      updateShortcut,
    });
  },

  // Disk Mount functions

  /**
   * Mount a disk to WSL
   */
  async mountDisk(options: MountDiskOptions): Promise<void> {
    info(`[wslService] Mounting disk: ${options.diskPath}`);
    await invoke("mount_disk", { options });
  },

  /**
   * Unmount a disk from WSL
   * If diskPath is not provided, unmounts all disks
   */
  async unmountDisk(diskPath?: string): Promise<void> {
    info(`[wslService] Unmounting disk: ${diskPath ?? "all"}`);
    await invoke("unmount_disk", { diskPath: diskPath || null });
  },

  /**
   * List disks currently mounted in WSL
   */
  async listMountedDisks(): Promise<MountedDisk[]> {
    debug("[wslService] Listing mounted disks");
    return await invoke<MountedDisk[]>("list_mounted_disks");
  },

  /**
   * List physical disks available for mounting
   */
  async listPhysicalDisks(): Promise<PhysicalDisk[]> {
    debug("[wslService] Listing physical disks");
    return await invoke<PhysicalDisk[]>("list_physical_disks");
  },

  // Terminal Detection functions

  /**
   * Get installed Windows Store terminal applications
   * Returns a list of detected terminals with their installation status
   */
  async getInstalledTerminals(): Promise<InstalledTerminal[]> {
    debug("[wslService] Getting installed terminals");
    return await invoke<InstalledTerminal[]>("get_installed_terminals");
  },

  // OCI Image functions

  /**
   * Parse an OCI image reference and get suggested name
   * Returns registry, repository, tag, and a suggested distro name
   */
  async parseImageReference(image: string): Promise<ImageReferenceInfo> {
    debug(`[wslService] Parsing image reference: ${image}`);
    return await invoke<ImageReferenceInfo>("parse_image_reference", { image });
  },

  // Distro Metadata functions
  //
  // Note: Backend now manages metadata creation for most operations (install, clone, import, etc.)
  // Frontend primarily reads metadata for display purposes.

  /**
   * Get all distro metadata (installation source information)
   * Returns a map of distro ID (GUID) to metadata
   */
  async getAllDistroMetadata(): Promise<Record<string, DistroMetadata>> {
    debug("[wslService] Getting all distro metadata");
    return await invoke<Record<string, DistroMetadata>>("get_all_distro_metadata");
  },

  /**
   * Get metadata for a specific distribution by ID (GUID)
   * Returns null if no metadata is tracked for this distro
   */
  async getDistroMetadata(id: string): Promise<DistroMetadata | null> {
    debug(`[wslService] Getting metadata for distro: ${id}`);
    return await invoke<DistroMetadata | null>("get_distro_metadata", { id });
  },

  /**
   * Get metadata for a specific distribution by name
   * Returns null if no metadata is tracked for this distro
   * @deprecated Use getDistroMetadata(id) when possible - name lookup is slower
   */
  async getDistroMetadataByName(name: string): Promise<DistroMetadata | null> {
    debug(`[wslService] Getting metadata by name: ${name}`);
    return await invoke<DistroMetadata | null>("get_distro_metadata_by_name", { name });
  },

  /**
   * Save metadata for a distribution (uses distro_id as key)
   * Note: Backend now manages metadata creation for most operations.
   * This is kept for manual metadata correction if needed.
   */
  async saveDistroMetadata(metadata: DistroMetadata): Promise<void> {
    debug(`[wslService] Saving metadata for distro: ${metadata.distroId}`);
    await invoke("save_distro_metadata", { metadataEntry: metadata });
  },

  /**
   * Delete metadata for a distribution by ID (GUID)
   * Note: Backend automatically deletes metadata when distributions are deleted.
   * This is kept for manual cleanup if needed.
   */
  async deleteDistroMetadata(id: string): Promise<void> {
    debug(`[wslService] Deleting metadata for distro: ${id}`);
    await invoke("delete_distro_metadata", { id });
  },

  /**
   * Delete metadata for a distribution by name
   * @deprecated Use deleteDistroMetadata(id) when possible
   */
  async deleteDistroMetadataByName(name: string): Promise<void> {
    debug(`[wslService] Deleting metadata by name: ${name}`);
    await invoke("delete_distro_metadata_by_name", { name });
  },

  /**
   * Open the Windows Subsystem for Linux Settings app
   */
  async openWslSettings(): Promise<void> {
    info("[wslService] Opening WSL Settings");
    await invoke("open_wsl_settings");
  },

  // ==================== Logging ====================

  /**
   * Set the debug logging level at runtime
   * @param enabled - true for debug level, false for info level
   */
  async setDebugLogging(enabled: boolean): Promise<void> {
    info(`[wslService] Setting debug logging: ${enabled}`);
    await invoke("set_debug_logging", { enabled });
  },

  /**
   * Get the path to the log file directory
   */
  async getLogPath(): Promise<string> {
    debug("[wslService] Getting log path");
    return invoke<string>("get_log_path");
  },
};

/**
 * VHD size information
 */
export interface VhdSizeInfo {
  fileSize: number;
  virtualSize: number;
}

/**
 * Result of a VHDX compact operation
 */
export interface CompactResult {
  sizeBefore: number;
  sizeAfter: number;
  /** Bytes trimmed by fstrim (if available) */
  fstrimBytes: number | null;
  /** Message from fstrim (success output or failure reason) */
  fstrimMessage: string | null;
}

/**
 * Global WSL2 resource usage
 */
export interface WslResourceUsage {
  memoryUsedBytes: number;
  memoryLimitBytes: number | null;
}

/**
 * Per-distribution resource usage
 */
export interface DistroResourceUsage {
  name: string;
  memoryUsedBytes: number;
  cpuPercent: number | null;
}

/**
 * Combined resource stats
 */
export interface ResourceStats {
  global: WslResourceUsage;
  perDistro: DistroResourceUsage[];
}

/**
 * WSL health status levels
 */
export type WslHealthStatus = "stopped" | "healthy" | "warning" | "unhealthy";

/**
 * WSL health information
 */
export interface WslHealth {
  status: WslHealthStatus;
  message: string;
  wslProcessCount: number;
  vmRunning: boolean;
}

/**
 * WSL version information from `wsl --version`
 */
export interface WslVersionInfo {
  wslVersion: string;
  kernelVersion: string;
  wslgVersion: string;
  msrdcVersion: string;
  direct3dVersion: string;
  dxcoreVersion: string;
  windowsVersion: string;
}

/**
 * Information about the WSL2 system distribution (CBL-Mariner/Azure Linux)
 */
export interface SystemDistroInfo {
  name: string;
  version: string;
  versionId: string;
}

// ==================== Disk Mount Types ====================

/**
 * Information about a disk mounted in WSL
 */
export interface MountedDisk {
  path: string;
  mountPoint: string;
  filesystem: string | null;
  isVhd: boolean;
}

/**
 * Information about a physical disk available for mounting
 */
export interface PhysicalDisk {
  deviceId: string;
  friendlyName: string;
  sizeBytes: number;
  partitions: DiskPartition[];
}

/**
 * Information about a partition on a physical disk
 */
export interface DiskPartition {
  index: number;
  sizeBytes: number;
  filesystem: string | null;
  driveLetter: string | null;
}

/**
 * Options for mounting a disk
 */
export interface MountDiskOptions {
  diskPath: string;
  isVhd: boolean;
  mountName?: string | null;
  filesystemType?: string | null;
  mountOptions?: string | null;
  partition?: number | null;
  bare: boolean;
}

// ==================== OCI Image Types ====================

/**
 * Parsed OCI image reference information
 */
export interface ImageReferenceInfo {
  registry: string;
  repository: string;
  tag: string;
  suggestedName: string;
  fullReference: string;
}

// ==================== Preflight Check Types ====================

/**
 * WSL preflight check status - determines if WSL is ready to use
 * This is a discriminated union based on the 'status' field
 */
export type WslPreflightStatus =
  | { status: "ready" }
  | { status: "notInstalled"; configuredPath: string }
  | { status: "featureDisabled"; errorCode: string }
  | { status: "kernelUpdateRequired" }
  | { status: "virtualizationDisabled"; errorCode: string }
  | { status: "unknown"; message: string };

/**
 * Helper to check if WSL is ready
 */
export function isWslReady(status: WslPreflightStatus): boolean {
  return status.status === "ready";
}

/**
 * Get a user-friendly title for the preflight status
 */
export function getPreflightTitle(status: WslPreflightStatus): string {
  switch (status.status) {
    case "ready":
      return "WSL Ready";
    case "notInstalled":
      return "WSL Not Installed";
    case "featureDisabled":
      return "WSL Feature Disabled";
    case "kernelUpdateRequired":
      return "WSL Kernel Update Required";
    case "virtualizationDisabled":
      return "Virtualization Not Enabled";
    case "unknown":
      return "WSL Unavailable";
  }
}

/**
 * Get a user-friendly message for the preflight status
 */
export function getPreflightMessage(status: WslPreflightStatus): string {
  switch (status.status) {
    case "ready":
      return "WSL is installed and ready to use.";
    case "notInstalled":
      return `WSL executable not found at '${status.configuredPath}'. Install WSL using 'wsl --install' in an Administrator PowerShell, or check your WSL path in Settings.`;
    case "featureDisabled":
      return `The Windows Subsystem for Linux feature is not enabled (${status.errorCode}). Enable it via 'Turn Windows features on or off' or run 'wsl --install' as Administrator.`;
    case "kernelUpdateRequired":
      return "WSL2 kernel needs to be updated. Run 'wsl --update' in PowerShell to install the latest kernel.";
    case "virtualizationDisabled":
      return `Virtual Machine Platform is not enabled or virtualization is disabled in BIOS (${status.errorCode}). Enable 'Virtual Machine Platform' in Windows Features and ensure virtualization is enabled in your BIOS settings.`;
    case "unknown":
      return `WSL check failed: ${status.message}. Try running 'wsl --status' in PowerShell to diagnose.`;
  }
}

/**
 * Get a help URL for the preflight status
 */
export function getPreflightHelpUrl(status: WslPreflightStatus): string | null {
  switch (status.status) {
    case "ready":
      return null;
    case "notInstalled":
    case "featureDisabled":
      return "https://learn.microsoft.com/en-us/windows/wsl/install";
    case "kernelUpdateRequired":
      return "https://learn.microsoft.com/en-us/windows/wsl/install#update-to-wsl-2";
    case "virtualizationDisabled":
      return "https://learn.microsoft.com/en-us/windows/wsl/troubleshooting#error-0x80370102-the-virtual-machine-could-not-be-started";
    case "unknown":
      return "https://learn.microsoft.com/en-us/windows/wsl/troubleshooting";
  }
}
