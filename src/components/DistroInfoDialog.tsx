import { useState, useEffect } from "react";
import type { Distribution } from "../types/distribution";
import {
  formatBytes,
  INSTALL_SOURCE_NAMES,
  INSTALL_SOURCE_COLORS,
} from "../types/distribution";
import { useResourceStore } from "../store/resourceStore";
import { Portal } from "./ui/Portal";
import {
  InfoIcon,
  SourceIcon,
  CopyIcon,
  CheckIcon,
  ClockIcon,
  ServerIcon,
  CPUIcon,
  SettingsIcon,
} from "./icons";
import { open } from "@tauri-apps/plugin-shell";
import { wslService } from "../services/wslService";

interface DistroInfoDialogProps {
  isOpen: boolean;
  distro: Distribution;
  onClose: () => void;
}

/** Format a date string to a readable format */
function formatDate(isoString: string): string {
  try {
    const date = new Date(isoString);
    return date.toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}

/** Strip Windows extended path prefix (\\?\) for display */
function stripExtendedPathPrefix(path: string): string {
  if (path.startsWith("\\\\?\\")) {
    return path.slice(4);
  }
  return path;
}

/** Get the source reference display based on install source type */
function getSourceReference(distro: Distribution): string | null {
  const metadata = distro.metadata;
  if (!metadata) return null;

  switch (metadata.installSource) {
    case "container":
      return metadata.imageReference || null;
    case "download":
    case "lxc":
      return metadata.downloadUrl || null;
    case "clone":
      return metadata.clonedFrom ? `Cloned from ID: ${metadata.clonedFrom}` : null;
    case "import":
      return metadata.importPath || null;
    default:
      return null;
  }
}

/** Get a label for the source reference based on install source type */
function getSourceReferenceLabel(source: string): string {
  switch (source) {
    case "container":
      return "Image";
    case "download":
    case "lxc":
      return "Source URL";
    case "clone":
      return "Cloned From";
    case "import":
      return "Import Path";
    default:
      return "Reference";
  }
}

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  testId?: string;
}

function InfoRow({ label, value, testId }: InfoRowProps) {
  return (
    <div className="flex justify-between items-start py-2 border-b border-theme-border-secondary/50 last:border-b-0">
      <span className="text-theme-text-secondary text-sm">{label}</span>
      <span
        className="text-theme-text-primary text-sm text-right max-w-[60%] break-all"
        data-testid={testId}
      >
        {value}
      </span>
    </div>
  );
}

interface CopyButtonProps {
  text: string;
  label?: string;
}

function CopyButton({ text, label }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="ml-2 p-1.5 text-theme-text-tertiary hover:text-theme-accent-primary hover:bg-theme-accent-primary/10 transition-all rounded-md border border-transparent hover:border-theme-accent-primary/30"
      title={copied ? "Copied!" : `Copy ${label || "to clipboard"}`}
      data-testid="copy-button"
    >
      {copied ? (
        <CheckIcon size="sm" className="text-theme-status-success" />
      ) : (
        <CopyIcon size="sm" />
      )}
    </button>
  );
}

export function DistroInfoDialog({
  isOpen,
  distro,
  onClose,
}: DistroInfoDialogProps) {
  const { getDistroResources } = useResourceStore();
  const isRunning = distro.state === "Running";
  const resources = isRunning ? getDistroResources(distro.name) : undefined;
  const metadata = distro.metadata;
  const sourceReference = getSourceReference(distro);

  // WSL configuration state (raw file content)
  const [wslConfRaw, setWslConfRaw] = useState<string | null>(null);
  const [wslConfLoading, setWslConfLoading] = useState(false);
  const [wslConfError, setWslConfError] = useState<string | null>(null);

  // Handle Escape key to close the dialog (global listener for reliability)
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Fetch raw wsl.conf when dialog opens (only if distro is running)
  useEffect(() => {
    if (!isOpen || !isRunning) {
      setWslConfRaw(null);
      setWslConfError(null);
      return;
    }

    const fetchWslConf = async () => {
      setWslConfLoading(true);
      setWslConfError(null);
      try {
        const content = await wslService.getWslConfRaw(distro.name, distro.id);
        setWslConfRaw(content);
      } catch (err) {
        setWslConfError(err instanceof Error ? err.message : "Failed to load configuration");
      } finally {
        setWslConfLoading(false);
      }
    };

    fetchWslConf();
  }, [isOpen, isRunning, distro.name, distro.id]);

  if (!isOpen) return null;

  const installSource = metadata?.installSource || "unknown";
  const sourceColor = INSTALL_SOURCE_COLORS[installSource];

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-theme-bg-primary/80 backdrop-blur-xs"
          onClick={onClose}
        />

        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          data-testid="distro-info-dialog"
          className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-2xl w-full mx-4 p-6 max-h-[85vh] overflow-y-auto"
        >
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div
              className="p-2 rounded-lg"
              style={{ backgroundColor: `${sourceColor}20` }}
            >
              <InfoIcon size="lg" style={{ color: sourceColor }} />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-theme-text-primary">
                {distro.name}
              </h2>
              <p className="text-sm text-theme-text-secondary">
                Distribution Information
              </p>
            </div>
          </div>

          {/* Identity Section */}
          <div className="mb-5">
            <h3 className="text-sm font-medium text-theme-text-tertiary uppercase tracking-wider mb-2">
              Identity
            </h3>
            <div className="bg-theme-bg-tertiary/50 rounded-lg px-4 py-1">
              <InfoRow label="Name" value={distro.name} testId="info-name" />
              <InfoRow
                label="Distribution ID"
                value={
                  distro.id ? (
                    <span className="flex items-center">
                      <code className="text-xs font-mono bg-theme-bg-primary/50 px-1.5 py-0.5 rounded">
                        {distro.id}
                      </code>
                      <CopyButton text={distro.id} label="ID" />
                    </span>
                  ) : (
                    <span className="text-theme-text-tertiary">—</span>
                  )
                }
                testId="info-id"
              />
              <InfoRow
                label="WSL Version"
                value={`WSL ${distro.version}`}
                testId="info-version"
              />
              <InfoRow
                label="Default"
                value={
                  distro.isDefault ? (
                    <span className="text-theme-status-success">Yes</span>
                  ) : (
                    "No"
                  )
                }
                testId="info-default"
              />
            </div>
          </div>

          {/* Location Section */}
          <div className="mb-5">
            <h3 className="text-sm font-medium text-theme-text-tertiary uppercase tracking-wider mb-2">
              Storage
            </h3>
            <div className="bg-theme-bg-tertiary/50 rounded-lg px-4 py-1">
              <InfoRow
                label="Install Location"
                value={
                  distro.location ? (
                    <span className="flex items-center gap-1">
                      <button
                        onClick={() => wslService.openFolder(stripExtendedPathPrefix(distro.location!))}
                        className="truncate max-w-[320px] font-mono text-xs text-theme-accent-primary hover:underline cursor-pointer text-left"
                        title={stripExtendedPathPrefix(distro.location)}
                      >
                        {stripExtendedPathPrefix(distro.location)}
                      </button>
                      <CopyButton text={stripExtendedPathPrefix(distro.location)} label="path" />
                    </span>
                  ) : (
                    <span className="text-theme-text-tertiary">—</span>
                  )
                }
                testId="info-location"
              />
              <InfoRow
                label="Disk Size"
                value={
                  distro.diskSize ? (
                    formatBytes(distro.diskSize)
                  ) : (
                    <span className="text-theme-text-tertiary">—</span>
                  )
                }
                testId="info-disk-size"
              />
            </div>
          </div>

          {/* Source Section */}
          <div className="mb-5">
            <h3 className="text-sm font-medium text-theme-text-tertiary uppercase tracking-wider mb-2">
              Source
            </h3>
            <div className="bg-theme-bg-tertiary/50 rounded-lg px-4 py-1">
              <InfoRow
                label="Install Source"
                value={
                  <span className="flex items-center gap-2">
                    <SourceIcon source={installSource} size="sm" style={{ color: sourceColor }} />
                    <span style={{ color: sourceColor }}>
                      {INSTALL_SOURCE_NAMES[installSource]}
                    </span>
                  </span>
                }
                testId="info-source"
              />
              {sourceReference && (
                <InfoRow
                  label={getSourceReferenceLabel(installSource)}
                  value={
                    <span className="flex items-center gap-1">
                      {(installSource === "download" || installSource === "lxc") ? (
                        // Download URLs are clickable
                        <>
                          <button
                            onClick={() => open(sourceReference)}
                            className="truncate max-w-[320px] font-mono text-xs text-theme-accent-primary hover:underline cursor-pointer text-left"
                            title={sourceReference}
                          >
                            {sourceReference}
                          </button>
                          <CopyButton text={sourceReference} label="URL" />
                        </>
                      ) : (
                        // Container images and other references are just copyable
                        <>
                          <span
                            className="truncate max-w-[320px] font-mono text-xs"
                            title={sourceReference}
                          >
                            {sourceReference}
                          </span>
                          <CopyButton text={sourceReference} label="reference" />
                        </>
                      )}
                    </span>
                  }
                  testId="info-source-ref"
                />
              )}
              <InfoRow
                label="Installed"
                value={
                  metadata?.installedAt ? (
                    <span className="flex items-center gap-1">
                      <ClockIcon size="sm" className="text-theme-text-tertiary" />
                      {formatDate(metadata.installedAt)}
                    </span>
                  ) : (
                    <span className="text-theme-text-tertiary">—</span>
                  )
                }
                testId="info-installed-at"
              />
            </div>
          </div>

          {/* Runtime Section (only shown when running) */}
          {isRunning && (
            <div className="mb-5">
              <h3 className="text-sm font-medium text-theme-text-tertiary uppercase tracking-wider mb-2">
                Runtime
              </h3>
              <div className="bg-theme-bg-tertiary/50 rounded-lg px-4 py-1">
                <InfoRow
                  label="Operating System"
                  value={
                    distro.osInfo ? (
                      <span className="flex items-center gap-1">
                        <ServerIcon size="sm" className="text-theme-text-tertiary" />
                        {distro.osInfo}
                      </span>
                    ) : (
                      <span className="text-theme-text-tertiary">—</span>
                    )
                  }
                  testId="info-os"
                />
                {resources && (
                  <>
                    <InfoRow
                      label="Memory Usage"
                      value={formatBytes(resources.memoryUsedBytes)}
                      testId="info-memory"
                    />
                    {resources.cpuPercent !== null && resources.cpuPercent !== undefined && (
                      <InfoRow
                        label="CPU Usage"
                        value={
                          <span className="flex items-center gap-1">
                            <CPUIcon size="sm" className="text-theme-text-tertiary" />
                            {resources.cpuPercent.toFixed(1)}%
                          </span>
                        }
                        testId="info-cpu"
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* WSL Configuration Section (only shown when running) */}
          {isRunning && (
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-theme-text-tertiary uppercase tracking-wider flex items-center gap-2">
                  <SettingsIcon size="sm" className="text-theme-text-tertiary" />
                  Configuration
                </h3>
                <span className="text-xs text-theme-text-tertiary font-mono">/etc/wsl.conf</span>
              </div>
              <div className="bg-theme-bg-tertiary/50 rounded-lg p-4">
                {wslConfLoading ? (
                  <div className="text-theme-text-tertiary text-sm flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-theme-text-tertiary/30 border-t-theme-text-tertiary rounded-full animate-spin" />
                    Loading configuration...
                  </div>
                ) : wslConfError ? (
                  <div className="text-theme-status-error text-sm">{wslConfError}</div>
                ) : wslConfRaw ? (
                  <div className="relative group">
                    <pre
                      className="text-xs font-mono text-theme-text-primary overflow-x-auto whitespace-pre"
                      data-testid="wsl-conf-content"
                    >
                      {wslConfRaw}
                    </pre>
                    <div className="absolute top-0 right-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <CopyButton text={wslConfRaw} label="configuration" />
                    </div>
                  </div>
                ) : (
                  <div className="text-theme-text-tertiary text-sm italic">
                    No configuration file (using defaults)
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Close Button */}
          <div className="flex justify-end mt-6">
            <button
              onClick={onClose}
              data-testid="info-close-button"
              className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
