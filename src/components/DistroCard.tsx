import { useState, memo } from "react";
import { useTranslation } from "react-i18next";
import type { Distribution } from "../types/distribution";
import { formatBytes, INSTALL_SOURCE_COLORS } from "../types/distribution";
import { useDistroStore } from "../store/distroStore";
import { useResourceStore } from "../store/resourceStore";
import { ConfirmDialog } from "./ConfirmDialog";
import { DistroInfoDialog } from "./DistroInfoDialog";
import { NoRdpDetectedDialog } from "./NoRdpDetectedDialog";
import { QuickActionsMenu } from "./QuickActionsMenu";
import { IconButton } from "./ui/Button";
import { PlayIcon, StopIcon, TrashIcon, SourceIcon, TerminalWindowIcon, MonitorIcon } from "./icons";

interface DistroCardProps {
  distro: Distribution;
  index?: number;
}

function DistroCardComponent({ distro, index = 0 }: DistroCardProps) {
  const { t } = useTranslation("dashboard");
  const { startDistro, stopDistro, deleteDistro, openTerminal, openRemoteDesktop, actionInProgress, compactingDistro } = useDistroStore();
  const { getDistroResources } = useResourceStore();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showNoRdpDialog, setShowNoRdpDialog] = useState(false);

  const isRunning = distro.state === "Running";
  const isCompacting = compactingDistro === distro.name;
  const isDisabled = !!actionInProgress || isCompacting;

  // Get resource stats for this distro (only available when running)
  const resources = isRunning ? getDistroResources(distro.name) : undefined;

  const handleToggle = () => {
    if (isRunning) {
      stopDistro(distro.name);
    } else {
      startDistro(distro.name, distro.id);
    }
  };

  const handleDelete = () => {
    setShowDeleteConfirm(true);
  };

  const handleOpenRemoteDesktop = async () => {
    const result = await openRemoteDesktop(distro.name, distro.id);
    if (!result.success && result.type === "none") {
      // Show the "no RDP detected" dialog
      setShowNoRdpDialog(true);
    }
  };

  const confirmDelete = () => {
    deleteDistro(distro.name);
    setShowDeleteConfirm(false);
  };

  // Stagger class based on index
  const staggerClass = `stagger-${Math.min(index + 1, 6)}`;

  // Get install source color for accent line
  const installSource = distro.metadata?.installSource || "unknown";
  const accentColor = INSTALL_SOURCE_COLORS[installSource];

  return (
    <>
      <div
        data-testid={`distro-card-${distro.name}`}
        className={`module-card p-4 animate-fade-slide-in ${staggerClass} ${menuOpen ? 'z-50' : ''} ${isCompacting ? 'opacity-75' : ''}`}
      >
        {/* Badges row: WSL (left) + Primary + State (right) */}
        <div className="flex items-center justify-between mb-3">
          {/* WSL Version badge (color-coded by install source) - clickable to show info */}
          <button
            data-testid="wsl-version-badge"
            onClick={() => setShowInfoDialog(true)}
            className="btn-cyber text-[10px] font-mono font-semibold px-2 py-1 rounded uppercase tracking-wider flex items-center gap-1.5 leading-none cursor-pointer transition-all hover:shadow-lg"
            style={{
              backgroundColor: `${accentColor}20`,
              color: accentColor,
              borderWidth: '1px',
              borderColor: `${accentColor}50`,
              // @ts-expect-error CSS custom property for hover shadow
              '--tw-shadow-color': `${accentColor}30`,
            }}
            title="Click to view distribution info"
          >
            v{distro.version}
            <SourceIcon source={installSource} className="!w-3.5 !h-3.5" />
          </button>

          {/* Primary + State badges */}
          <div className="flex items-center gap-2">
            {distro.isDefault && (
              <span className="text-[10px] px-2 py-1 bg-[rgba(var(--accent-primary-rgb),0.1)] text-theme-accent-primary rounded border border-[rgba(var(--accent-primary-rgb),0.3)] font-mono font-semibold uppercase tracking-wider">
                {t('common:status.primary')}
              </span>
            )}
            {isCompacting ? (
              <span
                data-testid="compacting-badge"
                className="text-[10px] font-mono font-semibold px-3 py-1 rounded uppercase tracking-wider bg-[rgba(var(--accent-primary-rgb),0.15)] text-theme-accent-primary border border-[rgba(var(--accent-primary-rgb),0.4)] flex items-center gap-1.5"
              >
                <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('common:status.compacting')}
              </span>
            ) : (
              <span
                data-testid="state-badge"
                className={`text-[10px] font-mono font-semibold px-3 py-1 rounded uppercase tracking-wider ${
                  isRunning
                    ? "bg-[rgba(var(--status-running-rgb),0.1)] text-theme-status-running border border-[rgba(var(--status-running-rgb),0.3)]"
                    : "bg-theme-bg-tertiary text-theme-text-muted border border-theme-border-secondary"
                }`}
              >
                {isRunning ? t('common:status.online') : t('common:status.offline')}
              </span>
            )}
          </div>
        </div>

        {/* Distro name and info */}
        <div className="flex items-center gap-3 mb-4">
          {/* Status indicator with pulsing ring */}
          <div className={`status-indicator ${isRunning ? 'running' : ''}`}>
            <div
              className={`w-3 h-3 rounded-full transition-all ${
                isRunning
                  ? "bg-theme-status-running shadow-lg shadow-[rgba(var(--status-running-rgb),0.5)]"
                  : "bg-theme-status-stopped"
              }`}
            />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-theme-text-primary text-lg break-words">
              {distro.name}
            </h3>
            <p className="text-xs font-mono text-theme-text-muted mt-0.5">
              {distro.osInfo ? (
                <span className="text-theme-text-secondary">{distro.osInfo}</span>
              ) : (
                <span>WSL {distro.version}</span>
              )}
            </p>
          </div>
        </div>

        {/* Telemetry section */}
        <div className="grid grid-cols-3 gap-4 mb-4 p-2.5 bg-theme-bg-primary/50 rounded-lg border border-theme-border-primary">
          {/* Disk */}
          <div className="text-center">
            <span className="data-label block mb-1">{t('common:label.disk')}</span>
            <span className="data-value text-sm text-theme-text-secondary">
              {distro.diskSize && distro.diskSize > 0 ? formatBytes(distro.diskSize) : '—'}
            </span>
          </div>

          {/* Memory */}
          <div className="text-center border-x border-theme-border-primary">
            <span className="data-label block mb-1">{t('common:label.memory')}</span>
            <span data-testid="memory-usage" className="data-value text-sm text-theme-accent-primary">
              {resources ? formatBytes(resources.memoryUsedBytes) : '—'}
            </span>
          </div>

          {/* CPU */}
          <div className="text-center">
            <span className="data-label block mb-1">{t('common:label.cpu')}</span>
            <span data-testid="cpu-usage" className="data-value text-sm text-theme-status-warning">
              {resources?.cpuPercent != null ? `${resources.cpuPercent.toFixed(1)}%` : '—'}
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleToggle}
            disabled={isDisabled}
            data-testid={isRunning ? "stop-button" : "start-button"}
            className={`btn-cyber flex-1 px-4 py-2.5 text-sm font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              isRunning
                ? "bg-[rgba(var(--status-warning-rgb),0.1)] text-theme-status-warning border border-[rgba(var(--status-warning-rgb),0.3)] hover:bg-[rgba(var(--status-warning-rgb),0.2)] hover:shadow-lg hover:shadow-[rgba(var(--status-warning-rgb),0.1)]"
                : "bg-[rgba(var(--status-running-rgb),0.1)] text-theme-status-running border border-[rgba(var(--status-running-rgb),0.3)] hover:bg-[rgba(var(--status-running-rgb),0.2)] hover:shadow-lg hover:shadow-[rgba(var(--status-running-rgb),0.1)]"
            }`}
          >
            {isRunning ? (
              <span className="flex items-center justify-center gap-2">
                <StopIcon size="sm" />
                {t('card.suspend')}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <PlayIcon size="sm" />
                {t('card.launch')}
              </span>
            )}
          </button>

          <IconButton
            icon={<TerminalWindowIcon size="sm" className="text-amber-500" />}
            label={t('card.openTerminal')}
            variant="secondary"
            colorScheme="amber"
            className="btn-cyber"
            onClick={() => openTerminal(distro.name, distro.id)}
            disabled={isDisabled}
            data-testid="terminal-button"
          />

          <IconButton
            icon={<MonitorIcon size="sm" className="text-blue-500" />}
            label={t('card.openRdp')}
            variant="secondary"
            colorScheme="blue"
            className="btn-cyber"
            onClick={handleOpenRemoteDesktop}
            disabled={isDisabled}
            data-testid="rdp-button"
          />

          <QuickActionsMenu distro={distro} disabled={isDisabled} onOpenChange={setMenuOpen} />

          <IconButton
            icon={<TrashIcon size="sm" />}
            label={t('card.deleteDistro')}
            variant="danger"
            className="btn-cyber"
            onClick={handleDelete}
            disabled={isDisabled}
            data-testid="delete-button"
          />
        </div>

      </div>

      <ConfirmDialog
        isOpen={showDeleteConfirm}
        title={t('deleteDialog.title')}
        message={
          distro.isDefault
            ? t('deleteDialog.messageDefault', { name: distro.name })
            : t('deleteDialog.message', { name: distro.name })
        }
        confirmLabel={t('deleteDialog.confirm')}
        onConfirm={confirmDelete}
        onCancel={() => setShowDeleteConfirm(false)}
        danger
      />

      <DistroInfoDialog
        isOpen={showInfoDialog}
        distro={distro}
        onClose={() => setShowInfoDialog(false)}
      />

      <NoRdpDetectedDialog
        isOpen={showNoRdpDialog}
        onClose={() => setShowNoRdpDialog(false)}
      />
    </>
  );
}

// Wrap with React.memo for performance optimization
// This prevents unnecessary re-renders when the distro prop hasn't changed
export const DistroCard = memo(DistroCardComponent);
DistroCard.displayName = 'DistroCard';

