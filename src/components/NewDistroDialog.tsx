import { useState, useEffect, useRef, useCallback } from "react";
import { wslService, type DownloadProgress } from "../services/wslService";
import { useDistroStore } from "../store/distroStore";
import { useSettingsStore } from "../store/settingsStore";
import { CheckIcon, DownloadIcon, StoreIcon, SourceDownloadIcon, LxcIcon, ContainerIcon, CloseIcon } from "./icons";
import { getDistroLogo, DockerLogo, LinuxLogo } from "./icons/DistroLogos";
import type { DistroCatalog, DownloadDistro, ContainerImage, DistroFamily } from "../types/catalog";
import { getDistroFamily, DISTRO_FAMILY_NAMES } from "../types/catalog";
import type { LxcDistribution } from "../types/lxcCatalog";
import { LxcCatalogBrowser } from "./LxcCatalogBrowser";
import { Portal } from "./ui/Portal";
import { Button, IconButton } from "./ui/Button";
import { InstallConfigDialog, type InstallConfig } from "./InstallConfigDialog";

// Note: Backend now handles metadata creation for all install operations.
// Frontend no longer needs to call saveInstallMetadata.

/** Format bytes to human-readable string */
function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  } else if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  } else if (bytes >= 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${bytes} B`;
}

interface NewDistroDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

type InstallMode = "quick" | "custom" | "community" | "container";

const MODE_CONFIG = {
  quick: {
    label: "Quick Install",
    description: "Install from Microsoft Store",
    color: "emerald",
    Icon: StoreIcon,
  },
  community: {
    label: "Community",
    description: "Browse LXC image catalog",
    color: "purple",
    Icon: LxcIcon,
  },
  container: {
    label: "Container",
    description: "Create from container image",
    color: "orange",
    Icon: ContainerIcon,
  },
  custom: {
    label: "Download",
    description: "Direct download with custom name",
    color: "blue",
    Icon: SourceDownloadIcon,
  },
} as const;

// Pending install item for config dialog
interface PendingInstallItem {
  name: string;
  suggestedName: string;
  description?: string;
}

export function NewDistroDialog({ isOpen, onClose }: NewDistroDialogProps) {
  const [mode, setMode] = useState<InstallMode>("quick");
  const [catalog, setCatalog] = useState<DistroCatalog | null>(null);
  const [onlineDistros, setOnlineDistros] = useState<string[]>([]);
  const [loadingDistros, setLoadingDistros] = useState(false);
  const [selectedDistro, setSelectedDistro] = useState<string | null>(null);
  const [selectedContainer, setSelectedContainer] = useState<ContainerImage | null>(null);
  const [selectedLxcDistro, setSelectedLxcDistro] = useState<LxcDistribution | null>(null);
  const [customImage, setCustomImage] = useState("");
  const [useCustomImage, setUseCustomImage] = useState(false);
  const [customUrl, setCustomUrl] = useState("");
  const [useCustomUrl, setUseCustomUrl] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<DownloadProgress | null>(null);
  const [familyFilter, setFamilyFilter] = useState<DistroFamily | null>(null);
  // Install config dialog state
  const [showInstallConfig, setShowInstallConfig] = useState(false);
  const [pendingInstallItem, setPendingInstallItem] = useState<PendingInstallItem | null>(null);
  const unlistenRef = useRef<(() => void) | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastProgressUpdateRef = useRef<number>(0);
  const { fetchDistros, distributions } = useDistroStore();
  const { settings } = useSettingsStore();

  // Throttled progress update - only update every 100ms to reduce re-renders
  const throttledSetProgress = useCallback((msg: string) => {
    const now = Date.now();
    if (now - lastProgressUpdateRef.current > 100) {
      lastProgressUpdateRef.current = now;
      setProgress(msg);
    }
  }, []);

  // Get enabled download distros from catalog (sorted alphabetically)
  const downloadableDistros = (catalog?.downloadDistros.filter(d => d.enabled) || [])
    .sort((a, b) => a.name.localeCompare(b.name));

  // Get enabled container images from catalog (sorted alphabetically)
  const containerImages = (catalog?.containerImages.filter(i => i.enabled) || [])
    .sort((a, b) => a.name.localeCompare(b.name));

  // Get enabled online distros (filtered by MS Store metadata enabled status, sorted alphabetically)
  const enabledOnlineDistros = onlineDistros
    .filter(distro => {
      const info = catalog?.msStoreDistros[distro];
      // Include if no metadata exists OR if enabled is not explicitly false
      return !info || info.enabled !== false;
    })
    .sort((a, b) => a.localeCompare(b));

  // Get MS Store metadata from catalog
  const getMsStoreInfo = (distroId: string) => {
    const info = catalog?.msStoreDistros[distroId];
    if (info) {
      return { description: info.description };
    }
    return { description: "" };
  };

  // Get download distro info from catalog
  const getDownloadInfo = (distroId: string): DownloadDistro | undefined => {
    return downloadableDistros.find(d => d.id === distroId);
  };

  // Fetch catalog and available distros when dialog opens (only if not already loaded)
  useEffect(() => {
    if (isOpen && !catalog && onlineDistros.length === 0) {
      setLoadingDistros(true);
      const minDelay = new Promise(resolve => setTimeout(resolve, 600));
      Promise.all([
        wslService.getDistroCatalog().catch(() => null),
        wslService.listOnlineDistributions().catch(() => []),
        minDelay,
      ])
        .then(([catalogData, online]) => {
          setCatalog(catalogData as DistroCatalog | null);
          setOnlineDistros(online as string[]);
        })
        .finally(() => setLoadingDistros(false));
    }
  }, [isOpen]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (closeTimeoutRef.current !== null) {
        clearTimeout(closeTimeoutRef.current);
        closeTimeoutRef.current = null;
      }
    };
  }, []);

  // Scroll to top when progress starts to ensure user sees progress indicator
  useEffect(() => {
    if (progress && contentRef.current) {
      contentRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [progress]);

  if (!isOpen) return null;

  // Handle quick install (Microsoft Store) - no config dialog needed
  const handleQuickInstall = async () => {
    setError(null);

    if (!selectedDistro) {
      setError("Please select a distribution");
      return;
    }

    const exists = distributions.some(
      (d) => d.name.toLowerCase() === selectedDistro.toLowerCase()
    );
    if (exists) {
      setError(`"${selectedDistro}" is already installed`);
      return;
    }

    setIsCreating(true);
    setProgress("Installing from Microsoft Store...");

    try {
      await wslService.quickInstallDistribution(selectedDistro);
      setProgress("Installed successfully!");
      await fetchDistros();

      if (closeTimeoutRef.current !== null) {
        clearTimeout(closeTimeoutRef.current);
      }
      closeTimeoutRef.current = window.setTimeout(() => {
        handleClose();
        closeTimeoutRef.current = null;
      }, 1000);
    } catch (err) {
      const errorMessage = err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : "Failed to install distribution";
      setError(errorMessage);
      setProgress(null);
    } finally {
      setIsCreating(false);
    }
  };

  // Handle install from config dialog (community, container, download modes)
  const handleInstallFromConfig = async (config: InstallConfig) => {
    setError(null);
    setShowInstallConfig(false);

    if (mode === "custom") {
      const url = useCustomUrl ? customUrl.trim() : (selectedDistro ? getDownloadInfo(selectedDistro)?.url : undefined);
      if (!url) return;

      setIsCreating(true);
      setProgress("Starting download...");
      setDownloadProgress(null);

      const unlisten = await wslService.onDownloadProgress((progress) => {
        if (progress.distroName === config.distroName) {
          setDownloadProgress(progress);
          if (progress.stage === "downloading") {
            const percent = progress.percent != null ? Math.round(progress.percent) : 0;
            const downloaded = formatBytes(progress.bytesDownloaded);
            const total = progress.totalBytes ? formatBytes(progress.totalBytes) : "?";
            throttledSetProgress(`Downloading: ${percent}% (${downloaded} / ${total})`);
          } else if (progress.stage === "importing") {
            setProgress("Importing into WSL...");
          } else if (progress.stage === "complete") {
            setProgress("Installed successfully!");
          } else if (progress.stage === "error") {
            setProgress(null);
            setError("Download failed");
          }
        }
      });
      unlistenRef.current = unlisten;

      try {
        if (useCustomUrl) {
          await wslService.installFromRootfsUrl(
            url,
            config.distroName,
            config.installLocation,
            config.wslVersion,
          );
        } else {
          await wslService.customInstallWithProgress(
            selectedDistro!,
            config.distroName,
            config.installLocation,
            config.wslVersion,
          );
        }
        setProgress("Installed successfully!");

        // Save custom URL to catalog for future use
        if (useCustomUrl && url) {
          const urlExists = downloadableDistros.some(d => d.url === url);
          if (!urlExists) {
            try {
              const urlObj = new URL(url);
              const filename = urlObj.pathname.split('/').pop() || 'custom';
              const suggestedName = filename.replace(/\.(tar\.gz|tar\.xz|tar|rootfs)$/i, '').replace(/[^a-zA-Z0-9]/g, '-');
              const newDownloadDistro: DownloadDistro = {
                id: `custom-${Date.now()}`,
                name: suggestedName || 'Custom Distribution',
                description: url,
                url: url,
                enabled: true,
              };
              const updatedCatalog = await wslService.addDownloadDistro(newDownloadDistro);
              setCatalog(updatedCatalog);
            } catch {
              // Silently ignore
            }
          }
        }

        setSelectedDistro(null);
        setCustomUrl("");
        setUseCustomUrl(false);
        await fetchDistros();

        if (closeTimeoutRef.current !== null) {
          clearTimeout(closeTimeoutRef.current);
        }
        closeTimeoutRef.current = window.setTimeout(() => {
          handleClose();
          closeTimeoutRef.current = null;
        }, 1000);
      } catch (err) {
        const errorMessage = err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : "Failed to install distribution";
        setError(errorMessage);
        setProgress(null);
      } finally {
        setIsCreating(false);
        setDownloadProgress(null);
        if (unlistenRef.current) {
          unlistenRef.current();
          unlistenRef.current = null;
        }
      }
    } else if (mode === "community" && selectedLxcDistro) {
      setIsCreating(true);
      setProgress(`Downloading ${selectedLxcDistro.name} ${selectedLxcDistro.releaseTitle}...`);
      setDownloadProgress(null);

      const unlisten = await wslService.onDownloadProgress((progress) => {
        if (progress.distroName === config.distroName) {
          setDownloadProgress(progress);
          if (progress.stage === "downloading") {
            const percent = progress.percent != null ? Math.round(progress.percent) : 0;
            const downloaded = formatBytes(progress.bytesDownloaded);
            const total = progress.totalBytes ? formatBytes(progress.totalBytes) : formatBytes(selectedLxcDistro.sizeBytes);
            throttledSetProgress(`Downloading: ${percent}% (${downloaded} / ${total})`);
          } else if (progress.stage === "importing") {
            setProgress("Importing into WSL...");
          } else if (progress.stage === "complete") {
            setProgress("Installed successfully!");
          } else if (progress.stage === "error") {
            setProgress(null);
            setError("Download failed");
          }
        }
      });
      unlistenRef.current = unlisten;

      try {
        await wslService.installFromRootfsUrl(
          selectedLxcDistro.downloadUrl,
          config.distroName,
          config.installLocation,
          config.wslVersion,
        );
        setProgress("Installed successfully!");
        setSelectedLxcDistro(null);
        await fetchDistros();

        if (closeTimeoutRef.current !== null) {
          clearTimeout(closeTimeoutRef.current);
        }
        closeTimeoutRef.current = window.setTimeout(() => {
          handleClose();
          closeTimeoutRef.current = null;
        }, 1000);
      } catch (err) {
        const errorMessage = err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : "Failed to install distribution";
        setError(errorMessage);
        setProgress(null);
      } finally {
        setIsCreating(false);
        setDownloadProgress(null);
        if (unlistenRef.current) {
          unlistenRef.current();
          unlistenRef.current = null;
        }
      }
    } else if (mode === "container") {
      const image = useCustomImage ? customImage.trim() : selectedContainer?.image;
      if (!image) return;

      setIsCreating(true);
      setProgress("Pulling container image...");

      try {
        await wslService.createFromImage(
          image,
          config.distroName,
          config.installLocation,
          config.wslVersion,
        );
        setProgress("Installed successfully!");

        // Save custom image to catalog for future use
        if (useCustomImage && image) {
          const imageExists = containerImages.some(ci => ci.image === image);
          if (!imageExists) {
            try {
              const imageInfo = await wslService.parseImageReference(image);
              const newContainerImage: ContainerImage = {
                id: `custom-${Date.now()}`,
                name: imageInfo.suggestedName,
                description: imageInfo.fullReference,
                image: image,
                enabled: true,
              };
              const updatedCatalog = await wslService.addContainerImage(newContainerImage);
              setCatalog(updatedCatalog);
            } catch {
              // Silently ignore
            }
          }
        }

        setSelectedContainer(null);
        setCustomImage("");
        setUseCustomImage(false);
        await fetchDistros();

        if (closeTimeoutRef.current !== null) {
          clearTimeout(closeTimeoutRef.current);
        }
        closeTimeoutRef.current = window.setTimeout(() => {
          handleClose();
          closeTimeoutRef.current = null;
        }, 1000);
      } catch (err) {
        const errorMessage = err instanceof Error
          ? err.message
          : typeof err === 'string'
            ? err
            : "Failed to create distribution";
        setError(errorMessage);
        setProgress(null);
      } finally {
        setIsCreating(false);
      }
    }
  };

  const handleClose = () => {
    if (unlistenRef.current) {
      unlistenRef.current();
      unlistenRef.current = null;
    }

    if (closeTimeoutRef.current !== null) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }

    setSelectedDistro(null);
    setSelectedContainer(null);
    setSelectedLxcDistro(null);
    setCustomImage("");
    setUseCustomImage(false);
    setCustomUrl("");
    setUseCustomUrl(false);
    setShowInstallConfig(false);
    setPendingInstallItem(null);
    setError(null);
    setProgress(null);
    setDownloadProgress(null);
    onClose();
  };

  // Open config dialog for download mode
  const handleSelectDistroForDownload = (distroId: string) => {
    const info = getDownloadInfo(distroId);
    setSelectedDistro(distroId);
    setUseCustomUrl(false);
    setPendingInstallItem({
      name: info?.name || distroId,
      suggestedName: distroId.replace(/[^a-zA-Z0-9_-]/g, "-"),
      description: info?.description,
    });
    setShowInstallConfig(true);
  };

  // Open config dialog for custom URL
  const handleSelectCustomUrl = () => {
    if (!customUrl.trim()) return;
    setUseCustomUrl(true);
    setSelectedDistro(null);
    const urlObj = new URL(customUrl.trim());
    const filename = urlObj.pathname.split('/').pop() || 'custom';
    const suggestedName = filename.replace(/\.(tar\.gz|tar\.xz|tar|rootfs)$/i, '').replace(/[^a-zA-Z0-9]/g, '-');
    setPendingInstallItem({
      name: "Custom URL",
      suggestedName: suggestedName || "custom-distro",
      description: customUrl.trim(),
    });
    setShowInstallConfig(true);
  };

  // Open config dialog for container mode
  const handleSelectContainer = (image: ContainerImage) => {
    setSelectedContainer(image);
    setUseCustomImage(false);
    setPendingInstallItem({
      name: image.name,
      suggestedName: image.name.split(" ")[0].toLowerCase(),
      description: image.image,
    });
    setShowInstallConfig(true);
  };

  // Open config dialog for custom image
  const handleSelectCustomImage = async () => {
    if (!customImage.trim()) return;
    setUseCustomImage(true);
    setSelectedContainer(null);
    try {
      const info = await wslService.parseImageReference(customImage.trim());
      setPendingInstallItem({
        name: "Custom Image",
        suggestedName: info.suggestedName,
        description: info.fullReference,
      });
    } catch {
      setPendingInstallItem({
        name: "Custom Image",
        suggestedName: "custom-container",
        description: customImage.trim(),
      });
    }
    setShowInstallConfig(true);
  };

  // Open config dialog for LXC distro
  const handleSelectLxcDistro = (distro: LxcDistribution) => {
    setSelectedLxcDistro(distro);
    const baseName = distro.name.toLowerCase().replace(/\s+/g, "-");
    const version = distro.version.replace(/[^a-zA-Z0-9]/g, "");
    setPendingInstallItem({
      name: `${distro.name} ${distro.releaseTitle}`,
      suggestedName: `${baseName}-${version}`,
      description: `${distro.arch} - ${formatBytes(distro.sizeBytes)}`,
    });
    setShowInstallConfig(true);
  };

  // Select distro for quick install (MS Store) - no config dialog
  const handleSelectQuickInstallDistro = (distro: string) => {
    setSelectedDistro(distro);
  };

  const handleModeChange = (newMode: InstallMode) => {
    setMode(newMode);
    setSelectedDistro(null);
    setSelectedContainer(null);
    setSelectedLxcDistro(null);
    setShowInstallConfig(false);
    setPendingInstallItem(null);
    // Don't reset customUrl/useCustomUrl or customImage/useCustomImage - preserve state
    setError(null);
    setFamilyFilter(null);
  };

  // Calculate if can install (only for quick mode - other modes use config dialog)
  const canQuickInstall = !isCreating && mode === "quick" && !!selectedDistro;

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-theme-bg-primary/85 backdrop-blur-sm transition-opacity"
          onClick={handleClose}
        />

        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-2xl shadow-2xl shadow-black/50 max-w-4xl w-full mx-4 h-[95vh] min-h-[500px] flex flex-col overflow-hidden animate-fade-slide-in"
        >
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-theme-accent-primary/50 to-transparent" />

          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-8 h-px bg-gradient-to-r from-theme-accent-primary/70 to-transparent" />
          <div className="absolute top-0 left-0 w-px h-8 bg-gradient-to-b from-theme-accent-primary/70 to-transparent" />
          <div className="absolute top-0 right-0 w-8 h-px bg-gradient-to-l from-theme-accent-primary/70 to-transparent" />
          <div className="absolute top-0 right-0 w-px h-8 bg-gradient-to-b from-theme-accent-primary/70 to-transparent" />

          {/* Header */}
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-2xl font-semibold text-theme-text-primary">Add Distribution</h2>
              <IconButton
                icon={<CloseIcon size="md" />}
                label="Close"
                variant="ghost"
                onClick={handleClose}
              />
            </div>
            <p className="text-sm text-theme-text-muted">Choose how you want to install your Linux distribution</p>
          </div>

          {/* Mode Selector - Card style */}
          <div className="px-6 pb-4">
            <div className="grid grid-cols-4 gap-2">
              {(Object.entries(MODE_CONFIG) as [InstallMode, typeof MODE_CONFIG.quick][]).map(([key, config]) => {
                const isActive = mode === key;
                const colorClasses = {
                  emerald: isActive ? "border-emerald-500/50 bg-emerald-500/10" : "border-theme-border-secondary hover:border-emerald-500/30",
                  blue: isActive ? "border-blue-500/50 bg-blue-500/10" : "border-theme-border-secondary hover:border-blue-500/30",
                  purple: isActive ? "border-purple-500/50 bg-purple-500/10" : "border-theme-border-secondary hover:border-purple-500/30",
                  orange: isActive ? "border-orange-500/50 bg-orange-500/10" : "border-theme-border-secondary hover:border-orange-500/30",
                }[config.color];
                const iconColor = {
                  emerald: isActive ? "text-emerald-400" : "text-theme-text-muted",
                  blue: isActive ? "text-blue-400" : "text-theme-text-muted",
                  purple: isActive ? "text-purple-400" : "text-theme-text-muted",
                  orange: isActive ? "text-orange-400" : "text-theme-text-muted",
                }[config.color];

                // Map mode keys to data-testid values
                const testIdMap: Record<InstallMode, string> = {
                  quick: "quick-install",
                  custom: "download",
                  community: "lxc",
                  container: "container",
                };

                return (
                  <button
                    key={key}
                    data-testid={`new-distro-tab-${testIdMap[key]}`}
                    onClick={() => handleModeChange(key)}
                    disabled={isCreating}
                    className={`relative p-4 rounded-xl border transition-all duration-200 text-left group ${colorClasses} disabled:opacity-50`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg bg-theme-bg-tertiary ${iconColor} transition-colors`}>
                        <config.Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-theme-text-primary text-sm">{config.label}</div>
                        <div className="text-xs text-theme-text-muted mt-0.5 leading-tight">{config.description}</div>
                      </div>
                    </div>
                    {isActive && (
                      <div className="absolute top-2 right-2">
                        <CheckIcon size="sm" className={iconColor} />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Download info - for download mode, shown above name input */}
          {mode === "custom" && (
            <div className="px-6 pb-3">
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-3">
                <svg className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-blue-300">
                  This catalog can be customized in <strong>Settings &gt; Distribution Sources</strong>. Custom URLs are saved for future use.
                </p>
              </div>
            </div>
          )}

          {/* Community info - for community mode when enabled, shown above name input */}
          {mode === "community" && settings.distributionSources.lxcEnabled && (
            <div className="px-6 pb-3">
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-start gap-3">
                <svg className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <p className="text-sm text-purple-300">
                  Images from <a href={settings.distributionSources.lxcBaseUrl} target="_blank" rel="noopener noreferrer" className="underline hover:text-purple-200">{settings.distributionSources.lxcBaseUrl}</a>. Configure in <strong>Settings &gt; Distribution Sources</strong>.
                </p>
              </div>
            </div>
          )}

          {/* Container runtime info - for container mode, shown above name input */}
          {mode === "container" && (
            <div className="px-6 pb-3">
              <div className="p-3 bg-orange-500/10 border border-orange-500/20 rounded-xl flex items-start gap-3">
                <svg className="w-5 h-5 text-orange-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                </svg>
                <div className="text-sm text-orange-300">
                  <span>Selected Runtime configured in settings: </span>
                  <span className="font-semibold">
                  {(() => {
                    const runtime = settings.containerRuntime;
                    if (runtime === "builtin") return "Built-in OCI (public registries only)";
                    if (runtime === "docker") return "Docker (supports authenticated registries)";
                    if (runtime === "podman") return "Podman (supports authenticated registries)";
                    if (typeof runtime === "object" && "custom" in runtime) return `Custom: ${runtime.custom}`;
                    return "Built-in OCI";
                  })()}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* Content */}
          <div ref={contentRef} className="flex-1 overflow-y-auto px-6 pb-4">
            {/* Error Message */}
            {error && (
              <div
                data-testid="install-error"
                className="mb-4 p-4 bg-[rgba(var(--status-error-rgb),0.1)] border border-[rgba(var(--status-error-rgb),0.3)] rounded-xl text-theme-status-error text-sm flex items-start gap-3"
              >
                <svg className="w-5 h-5 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <span data-testid="install-error-text">{error}</span>
              </div>
            )}

            {/* Progress */}
            {progress && (
              <div
                data-testid="install-progress"
                data-stage={downloadProgress?.stage || (progress.toLowerCase().includes("success") ? "complete" : "working")}
                className="mb-4 p-4 bg-theme-bg-tertiary border border-theme-border-secondary rounded-xl"
              >
                <div className="flex items-center gap-3">
                  {isCreating ? (
                    <div className="relative w-8 h-8">
                      <svg className="w-8 h-8 animate-spin text-theme-accent-primary" viewBox="0 0 24 24">
                        <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                        <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-theme-status-success/20 flex items-center justify-center">
                      <CheckIcon size="md" className="text-theme-status-success" />
                    </div>
                  )}
                  <div className="flex-1">
                    <p data-testid="install-progress-text" className="text-sm text-theme-text-primary font-medium">{progress}</p>
                    {downloadProgress?.stage === "downloading" && downloadProgress.percent != null && (
                      <div className="mt-2">
                        <div className="h-1.5 bg-theme-border-secondary rounded-full overflow-hidden">
                          <div
                            data-testid="install-progress-bar"
                            data-percent={Math.round(downloadProgress.percent)}
                            className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-200 rounded-full"
                            style={{ width: `${Math.min(downloadProgress.percent, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* Quick Install Mode */}
            {mode === "quick" && (
              <div className="min-h-[320px]">
                {/* Info hint */}
                <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-start gap-3">
                  <svg className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  <p className="text-sm text-emerald-300">
                    Official distributions from the <a href="ms-windows-store://search/?query=WSL" className="underline hover:text-emerald-200">Microsoft Store</a>. Installs to the default Windows-managed location.
                  </p>
                </div>

                {loadingDistros ? (
                  <div className="flex flex-col items-center justify-center py-16 text-theme-text-muted">
                    <svg className="w-8 h-8 animate-spin mb-3 text-theme-accent-primary" viewBox="0 0 24 24">
                      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span className="text-sm">Loading available distributions...</span>
                  </div>
                ) : enabledOnlineDistros.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-theme-text-muted">
                    <LinuxLogo size={48} className="mb-3 opacity-50" />
                    <span className="text-sm">No distributions available</span>
                  </div>
                ) : (
                  <div className="animate-fade-in">
                    {/* Family Filter Tabs */}
                    <div className="flex gap-2 mb-4 flex-wrap">
                      <button
                        onClick={() => setFamilyFilter(null)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                          familyFilter === null
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : "bg-theme-bg-tertiary text-theme-text-muted border border-theme-border-secondary hover:text-theme-text-secondary hover:border-theme-border-primary"
                        }`}
                      >
                        All
                      </button>
                      {(Object.entries(DISTRO_FAMILY_NAMES) as [DistroFamily, string][]).map(([family, name]) => {
                        const count = enabledOnlineDistros.filter(d => {
                          return getDistroFamily(d) === family;
                        }).length;
                        if (count === 0) return null;
                        return (
                          <button
                            key={family}
                            onClick={() => setFamilyFilter(family)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                              familyFilter === family
                                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                                : "bg-theme-bg-tertiary text-theme-text-muted border border-theme-border-secondary hover:text-theme-text-secondary hover:border-theme-border-primary"
                            }`}
                          >
                            {name} ({count})
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      {enabledOnlineDistros
                        .filter(distro => {
                          if (familyFilter === null) return true;
                          return getDistroFamily(distro) === familyFilter;
                        })
                        .map((distro, index) => {
                      const info = getMsStoreInfo(distro);
                      const exists = distributions.some(d => d.name.toLowerCase() === distro.toLowerCase());
                      const isSelected = selectedDistro === distro;
                      const Logo = getDistroLogo(distro);

                      return (
                        <button
                          key={distro}
                          onClick={() => !exists && handleSelectQuickInstallDistro(distro)}
                          disabled={isCreating || exists}
                          className={`group relative p-4 text-left rounded-xl border transition-all duration-200 ${
                            isSelected
                              ? "border-emerald-500/50 bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 shadow-[0_4px_20px_rgba(16,185,129,0.15),inset_0_0_20px_rgba(16,185,129,0.05)]"
                              : exists
                              ? "border-theme-border-secondary bg-theme-bg-tertiary/30 opacity-60 cursor-not-allowed"
                              : "border-[rgba(var(--accent-primary-rgb),0.1)] bg-gradient-to-br from-theme-bg-secondary to-theme-bg-tertiary hover:border-[rgba(var(--accent-primary-rgb),0.3)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.2),0_0_20px_rgba(var(--accent-primary-rgb),0.1),inset_0_0_20px_rgba(var(--accent-primary-rgb),0.02)] hover:-translate-y-0.5"
                          }`}
                          style={{
                            animationDelay: `${index * 30}ms`,
                          }}
                        >
                          <div className="flex items-center gap-4">
                            <div
                              className={`relative shrink-0 rounded-xl p-1.5 transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg bg-theme-bg-tertiary ${
                                isSelected ? "ring-2 ring-emerald-500/50" : ""
                              }`}
                            >
                              <Logo size={36} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-theme-text-primary truncate group-hover:text-theme-text-accent transition-colors">{distro}</div>
                              {info.description && (
                                <div className="text-xs text-theme-text-muted mt-0.5 line-clamp-1">{info.description}</div>
                              )}
                            </div>
                            {exists ? (
                              <span className="text-xs text-theme-text-muted bg-theme-bg-tertiary px-2 py-1 rounded-md">Installed</span>
                            ) : isSelected ? (
                              <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
                                <CheckIcon size="sm" className="text-white" />
                              </div>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Custom Download Mode */}
            {mode === "custom" && (
              <div>
                {downloadableDistros.length === 0 && !useCustomUrl ? (
                  <div className="flex flex-col items-center justify-center py-16 text-theme-text-muted">
                    <DownloadIcon size="lg" className="mb-3 opacity-50" />
                    <span className="text-sm mb-4">No downloadable distributions configured</span>
                    <button
                      onClick={() => setUseCustomUrl(true)}
                      className="text-sm text-theme-accent-primary hover:underline"
                    >
                      Use a custom URL instead
                    </button>
                  </div>
                ) : downloadableDistros.length === 0 && useCustomUrl ? (
                  /* Custom URL input - shown when no distros configured but custom URL selected */
                  <div className="p-4 rounded-xl border border-blue-500/50 bg-gradient-to-br from-blue-500/10 to-blue-600/5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 rounded-lg bg-blue-500/20 text-blue-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-medium text-theme-text-primary text-sm">Custom URL</div>
                        <div className="text-xs text-theme-text-muted">Enter a direct link to a rootfs tarball</div>
                      </div>
                    </div>
                    <input
                      type="text"
                      value={customUrl}
                      onChange={(e) => setCustomUrl(e.target.value)}
                      placeholder="e.g., https://example.com/distro-rootfs.tar.gz"
                      disabled={isCreating}
                      className="w-full px-3 py-2.5 bg-theme-bg-primary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder-theme-text-muted text-sm font-mono focus:outline-none focus:border-blue-500/50"
                    />
                  </div>
                ) : (
                  <>
                    {/* Family Filter Tabs */}
                    <div className="flex gap-2 mb-4 flex-wrap">
                      <button
                        onClick={() => setFamilyFilter(null)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                          familyFilter === null
                            ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                            : "bg-theme-bg-tertiary text-theme-text-muted border border-theme-border-secondary hover:text-theme-text-secondary hover:border-theme-border-primary"
                        }`}
                      >
                        All
                      </button>
                      {(Object.entries(DISTRO_FAMILY_NAMES) as [DistroFamily, string][]).map(([family, name]) => {
                        const count = downloadableDistros.filter(d => getDistroFamily(d.id) === family).length;
                        if (count === 0) return null;
                        return (
                          <button
                            key={family}
                            onClick={() => setFamilyFilter(family)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-all duration-200 ${
                              familyFilter === family
                                ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                                : "bg-theme-bg-tertiary text-theme-text-muted border border-theme-border-secondary hover:text-theme-text-secondary hover:border-theme-border-primary"
                            }`}
                          >
                            {name} ({count})
                          </button>
                        );
                      })}
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {downloadableDistros
                        .filter(distro => familyFilter === null || getDistroFamily(distro.id) === familyFilter)
                        .map((distro, index) => {
                        const isSelected = selectedDistro === distro.id;
                        const Logo = getDistroLogo(distro.id);

                        return (
                          <button
                            key={distro.id}
                            onClick={() => handleSelectDistroForDownload(distro.id)}
                            disabled={isCreating}
                            className={`group relative p-4 text-left rounded-xl border transition-all duration-200 ${
                              isSelected
                                ? "border-blue-500/50 bg-gradient-to-br from-blue-500/10 to-blue-600/5 shadow-[0_4px_20px_rgba(59,130,246,0.15),inset_0_0_20px_rgba(59,130,246,0.05)]"
                                : "border-[rgba(var(--accent-primary-rgb),0.1)] bg-gradient-to-br from-theme-bg-secondary to-theme-bg-tertiary hover:border-[rgba(var(--accent-primary-rgb),0.3)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.2),0_0_20px_rgba(var(--accent-primary-rgb),0.1),inset_0_0_20px_rgba(var(--accent-primary-rgb),0.02)] hover:-translate-y-0.5"
                            }`}
                            style={{ animationDelay: `${index * 30}ms` }}
                          >
                            <div className="flex items-start gap-4">
                              <div
                                className={`relative shrink-0 rounded-xl p-1.5 transition-all duration-200 group-hover:scale-110 group-hover:shadow-lg bg-theme-bg-tertiary ${
                                  isSelected ? "ring-2 ring-blue-500/50" : ""
                                }`}
                              >
                                <Logo size={40} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-theme-text-primary group-hover:text-theme-text-accent transition-colors">{distro.name}</div>
                                <div className="text-xs text-theme-text-muted mt-0.5 line-clamp-2">{distro.description}</div>
                                {distro.size && (
                                  <div className="text-xs text-theme-text-muted mt-2 font-mono flex items-center gap-1">
                                    <DownloadIcon size="sm" className="opacity-50" />
                                    {distro.size}
                                  </div>
                                )}
                              </div>
                              {isSelected && (
                                <div className="w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center shrink-0 shadow-lg shadow-blue-500/30">
                                  <CheckIcon size="sm" className="text-white" />
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom URL input - always visible */}
                    <div className={`p-4 rounded-xl border transition-all duration-200 ${
                      useCustomUrl
                        ? "border-blue-500/50 bg-gradient-to-br from-blue-500/10 to-blue-600/5"
                        : "border-theme-border-secondary bg-theme-bg-tertiary/50"
                    }`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 rounded-lg transition-colors ${
                          useCustomUrl ? "bg-blue-500/20 text-blue-400" : "bg-theme-bg-tertiary text-theme-text-muted"
                        }`}>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-theme-text-primary text-sm">Custom URL</div>
                          <div className="text-xs text-theme-text-muted">Enter a direct link to a rootfs tarball</div>
                        </div>
                        {customUrl.trim() && (
                          <button
                            onClick={handleSelectCustomUrl}
                            disabled={isCreating}
                            className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors disabled:opacity-50"
                          >
                            Use URL
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={customUrl}
                        onChange={(e) => { setCustomUrl(e.target.value); setSelectedDistro(null); }}
                        placeholder="e.g., https://example.com/distro-rootfs.tar.gz"
                        disabled={isCreating}
                        className="w-full px-3 py-2.5 bg-theme-bg-primary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder-theme-text-muted text-sm font-mono focus:outline-none focus:border-blue-500/50"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Community LXC Catalog Mode */}
            {mode === "community" && (
              <div>
                {!settings.distributionSources.lxcEnabled ? (
                  <div className="flex flex-col items-center justify-center py-16 text-theme-text-muted">
                    <LinuxLogo size={48} className="mb-3 opacity-50" />
                    <span className="text-sm mb-2">Community catalog is disabled</span>
                    <span className="text-xs text-theme-text-muted">Enable it in Settings &gt; Distribution Sources</span>
                  </div>
                ) : (
                  <LxcCatalogBrowser
                    selectedDistro={selectedLxcDistro}
                    onSelect={handleSelectLxcDistro}
                    disabled={isCreating}
                  />
                )}
              </div>
            )}

            {/* Container Mode */}
            {mode === "container" && (
              <div>
                {containerImages.length === 0 && !useCustomImage ? (
                  <div className="flex flex-col items-center justify-center py-16 text-theme-text-muted">
                    <DockerLogo size={48} className="mb-3 opacity-50" />
                    <span className="text-sm mb-4">No container images configured</span>
                    <button
                      onClick={() => setUseCustomImage(true)}
                      className="text-sm text-theme-accent-primary hover:underline"
                    >
                      Use a custom image instead
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      {containerImages.map((image, index) => {
                        const isSelected = selectedContainer?.id === image.id && !useCustomImage;
                        const Logo = getDistroLogo(image.id);

                        return (
                          <button
                            key={image.id}
                            onClick={() => handleSelectContainer(image)}
                            disabled={isCreating}
                            className={`group relative p-4 text-left rounded-xl border transition-all duration-200 ${
                              isSelected
                                ? "border-orange-500/50 bg-gradient-to-br from-orange-500/10 to-orange-600/5 shadow-[0_4px_20px_rgba(249,115,22,0.15),inset_0_0_20px_rgba(249,115,22,0.05)]"
                                : "border-[rgba(var(--accent-primary-rgb),0.1)] bg-gradient-to-br from-theme-bg-secondary to-theme-bg-tertiary hover:border-[rgba(var(--accent-primary-rgb),0.3)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.2),0_0_20px_rgba(var(--accent-primary-rgb),0.1),inset_0_0_20px_rgba(var(--accent-primary-rgb),0.02)] hover:-translate-y-0.5"
                            }`}
                            style={{ animationDelay: `${index * 30}ms` }}
                          >
                            <div className="flex items-center gap-4">
                              <div
                                className={`relative shrink-0 rounded-xl p-1 transition-transform duration-200 group-hover:scale-110 bg-theme-bg-tertiary ${
                                  isSelected ? "ring-2 ring-orange-500/50" : ""
                                }`}
                              >
                                <Logo size={36} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="font-semibold text-theme-text-primary group-hover:text-theme-text-accent truncate transition-colors duration-200">{image.name}</div>
                                <div className="text-xs text-theme-text-muted mt-0.5 line-clamp-1">{image.description}</div>
                              </div>
                              {isSelected && (
                                <div className="w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center">
                                  <CheckIcon size="sm" className="text-white" />
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom image input - always visible */}
                    <div className={`p-4 rounded-xl border transition-all duration-200 ${
                      useCustomImage
                        ? "border-orange-500/50 bg-gradient-to-br from-orange-500/10 to-orange-600/5"
                        : "border-theme-border-secondary bg-theme-bg-tertiary/50"
                    }`}>
                      <div className="flex items-center gap-3 mb-3">
                        <div className={`p-2 rounded-lg transition-colors ${
                          useCustomImage ? "bg-orange-500/20 text-orange-400" : "bg-theme-bg-tertiary text-theme-text-muted"
                        }`}>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <div className="font-medium text-theme-text-primary text-sm">Custom Image</div>
                          <div className="text-xs text-theme-text-muted">Enter any OCI image reference</div>
                        </div>
                        {customImage.trim() && (
                          <button
                            onClick={handleSelectCustomImage}
                            disabled={isCreating}
                            className="px-3 py-1.5 text-xs font-medium bg-orange-600 hover:bg-orange-500 text-white rounded-lg transition-colors disabled:opacity-50"
                          >
                            Use Image
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={customImage}
                        onChange={(e) => { setCustomImage(e.target.value); setSelectedContainer(null); }}
                        placeholder="e.g., alpine:latest, gitlab/gitlab-runner:latest"
                        disabled={isCreating}
                        className="w-full px-3 py-2.5 bg-theme-bg-primary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder-theme-text-muted text-sm font-mono focus:outline-none focus:border-orange-500/50"
                      />
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Trademark disclaimer */}
            <div className="mt-6 pt-4 border-t border-theme-border-primary">
              <p className="text-[11px] text-theme-text-muted text-center leading-relaxed">
                Linux distribution logos are trademarks of their respective owners and are used here for identification purposes only.
                <br />
                This application is not affiliated with or endorsed by any distribution project.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-theme-border-primary bg-theme-bg-tertiary/30">
            <div className="flex items-center justify-between">
              {/* Selection summary - only for quick mode */}
              <div className="text-sm text-theme-text-muted font-mono truncate max-w-md">
                {mode === "quick" && selectedDistro && (
                  <span>Installing as <span className="text-theme-text-secondary">"{selectedDistro}"</span></span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-3">
                <Button
                  data-testid="new-distro-cancel-button"
                  variant="secondary"
                  onClick={handleClose}
                  disabled={isCreating}
                >
                  Cancel
                </Button>
                {/* Install button only for quick mode - other modes use config dialog */}
                {mode === "quick" && (
                  <Button
                    data-testid="new-distro-install-button"
                    variant="primary"
                    colorScheme="emerald"
                    onClick={handleQuickInstall}
                    disabled={!canQuickInstall}
                    loading={isCreating}
                    icon={!isCreating ? <DownloadIcon size="sm" /> : undefined}
                  >
                    {isCreating ? "Installing..." : "Install"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Install Configuration Dialog */}
      {pendingInstallItem && (
        <InstallConfigDialog
          isOpen={showInstallConfig}
          onClose={() => {
            setShowInstallConfig(false);
            setPendingInstallItem(null);
          }}
          onInstall={handleInstallFromConfig}
          mode={mode === "custom" ? "download" : mode as "community" | "container"}
          selectedItem={pendingInstallItem}
        />
      )}
    </Portal>
  );
}
