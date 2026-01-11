import { useState, useRef, useEffect } from "react";
import type { Distribution } from "../types/distribution";
import { useDistroStore } from "../store/distroStore";
import { useActionsStore } from "../store/actionsStore";
import { useNotificationStore } from "../store/notificationStore";
import { wslService } from "../services/wslService";
import { CloneDialog } from "./CloneDialog";
import { MoveDistroDialog } from "./MoveDistroDialog";
import { ResizeDistroDialog } from "./ResizeDistroDialog";
import { SetDefaultUserDialog } from "./SetDefaultUserDialog";
import { SetVersionDialog } from "./SetVersionDialog";
import { RenameDialog } from "./RenameDialog";
import { StopAndActionDialog } from "./StopAndActionDialog";
import { DistroInfoDialog } from "./DistroInfoDialog";
import { ACTION_ICONS } from "../types/actions";
import type { CustomAction } from "../types/actions";
import { ConfirmDialog } from "./ConfirmDialog";
import { PasswordPromptDialog } from "./PasswordPromptDialog";
import { Portal } from "./ui/Portal";
import { IconButton } from "./ui/Button";
import { logger } from "../utils/logger";
import { useStopBeforeAction } from "../hooks/useStopBeforeAction";
import {
  FolderIcon,
  CodeIcon,
  RefreshIcon,
  UploadIcon,
  CopyIcon,
  StarIcon,
  MenuIcon,
  CloseIcon,
  SettingsIcon,
  ChevronRightIcon,
  UserIcon,
  ServerIcon,
  SparklesIcon,
  PauseIcon,
  PowerIcon,
  InfoIcon,
} from "./icons";

interface QuickActionsMenuProps {
  distro: Distribution;
  disabled?: boolean;
  onOpenChange?: (isOpen: boolean) => void;
}

interface QuickAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  action: () => void;
  disabled?: boolean;
  highlight?: boolean;
  danger?: boolean;
  requiresStopped?: boolean;
}

export function QuickActionsMenu({ distro, disabled, onOpenChange }: QuickActionsMenuProps) {
  const [isOpen, setIsOpenState] = useState(false);

  const setIsOpen = (open: boolean) => {
    setIsOpenState(open);
    onOpenChange?.(open);
  };
  const [showManageSubmenu, setShowManageSubmenu] = useState(false);
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showResizeDialog, setShowResizeDialog] = useState(false);
  const [showSetUserDialog, setShowSetUserDialog] = useState(false);
  const [showSetVersionDialog, setShowSetVersionDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);
  const [sparseEnabled, setSparseEnabled] = useState(false);
  const [isTogglingSprase, setIsTogglingSprase] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState<{ actionId: string; actionName: string } | null>(null);
  const [showSparseConfirm, setShowSparseConfirm] = useState(false);
  const [showOutputDialog, setShowOutputDialog] = useState<{ title: string; output: string; error?: string } | null>(null);
  const [showPasswordPrompt, setShowPasswordPrompt] = useState<CustomAction | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const {
    setDefault,
    openFileExplorer,
    openIDE,
    restartDistro,
    exportDistro,
    actionInProgress,
    setActionInProgress,
  } = useDistroStore();
  const { actions, fetchActions, executeAction, runActionInTerminal, isExecuting } = useActionsStore();
  const { addNotification } = useNotificationStore();
  const {
    state: stopBeforeActionState,
    executeWithStopCheck,
    handleStopAndContinue,
    handleCancel: handleStopDialogCancel,
  } = useStopBeforeAction();

  const isDisabled = disabled || !!actionInProgress || isExecuting || isTogglingSprase;

  const handleToggleSparse = async (confirmed = false) => {
    // Show warning when enabling sparse mode (not when disabling)
    if (!sparseEnabled && !confirmed) {
      setShowSparseConfirm(true);
      setIsOpen(false);
      setShowManageSubmenu(false);
      return;
    }

    setIsTogglingSprase(true);
    try {
      const newState = !sparseEnabled;
      await wslService.setSparseDisk(distro.name, newState);
      setSparseEnabled(newState);
      addNotification({
        type: "success",
        title: "Sparse Mode Changed",
        message: `Sparse mode ${newState ? "enabled" : "disabled"} for ${distro.name}`,
      });
      setIsOpen(false);
      setShowManageSubmenu(false);
    } catch (err) {
      // Tauri returns string errors, not Error instances
      const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : "Unknown error occurred";
      addNotification({
        type: "error",
        title: "Failed to Toggle Sparse Mode",
        message: errorMessage,
      });
    } finally {
      setIsTogglingSprase(false);
    }
  };

  // Handle sparse toggle with stop-before-action pattern
  // Requires full WSL shutdown as VHDX must not be in use
  const handleSparseWithStopCheck = () => {
    executeWithStopCheck(distro, "Toggle Sparse Mode", () => {
      handleToggleSparse();
    }, { requiresShutdown: true });
    setIsOpen(false);
    setShowManageSubmenu(false);
  };

  // Fetch actions on mount
  useEffect(() => {
    fetchActions();
  }, [fetchActions]);

  // Get applicable custom actions for this distro
  const applicableActions = actions.filter((action) => {
    if (action.scope.type === "all") return true;
    if (action.scope.type === "pattern") {
      try {
        return new RegExp(action.scope.pattern).test(distro.name);
      } catch (error) {
        // Log invalid regex pattern to help users debug their actions
        logger.warn(
          `Invalid regex pattern in action "${action.name}" (${action.id}): "${action.scope.pattern}"`,
          "QuickActionsMenu",
          error instanceof Error ? error.message : error
        );
        return false;
      }
    }
    if (action.scope.type === "specific") {
      return action.scope.distros.includes(distro.name);
    }
    return false;
  });

  const getActionIcon = (iconId: string) => {
    return ACTION_ICONS.find((i) => i.id === iconId)?.emoji || "⚡";
  };

  const runCustomAction = async (actionId: string, confirm: boolean, showOutput: boolean, actionName: string, requiresSudo: boolean) => {
    if (confirm) {
      setShowConfirmDialog({ actionId, actionName });
      setIsOpen(false);
      return;
    }

    const action = actions.find((a) => a.id === actionId);

    // If action runs in terminal, just open terminal and run (user types password there if needed)
    if (action?.runInTerminal) {
      setIsOpen(false);
      try {
        await runActionInTerminal(actionId, distro.name, distro.id);
      } catch (error) {
        addNotification({
          type: "error",
          title: "Action Failed",
          message: `Failed to run action: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
      return;
    }

    // If action requires sudo (and not running in terminal), prompt for password
    if (requiresSudo && action) {
      setShowPasswordPrompt(action);
      setIsOpen(false);
      return;
    }

    setIsOpen(false);
    setActionInProgress(`Running ${actionName}...`);
    try {
      const result = await executeAction(actionId, distro.name, distro.id);

      if (showOutput && result) {
        setShowOutputDialog({
          title: actionName,
          output: result.output,
          error: result.error,
        });
      }
    } finally {
      setActionInProgress(null);
    }
  };

  const handleConfirmAction = async () => {
    if (showConfirmDialog) {
      const action = actions.find((a) => a.id === showConfirmDialog.actionId);
      setShowConfirmDialog(null);
      if (action) {
        // If action runs in terminal, just open terminal and run
        if (action.runInTerminal) {
          try {
            await runActionInTerminal(action.id, distro.name, distro.id);
          } catch (error) {
            addNotification({
              type: "error",
              title: "Action Failed",
              message: `Failed to run action: ${error instanceof Error ? error.message : "Unknown error"}`,
            });
          }
          return;
        }

        // If action requires sudo (and not running in terminal), prompt for password after confirmation
        if (action.requiresSudo) {
          setShowPasswordPrompt(action);
          return;
        }

        setActionInProgress(`Running ${action.name}...`);
        try {
          const result = await executeAction(action.id, distro.name, distro.id);
          if (action.showOutput && result) {
            setShowOutputDialog({
              title: action.name,
              output: result.output,
              error: result.error,
            });
          }
        } finally {
          setActionInProgress(null);
        }
      }
    }
  };

  const handlePasswordSubmit = async (password: string) => {
    if (showPasswordPrompt) {
      const action = showPasswordPrompt;
      setShowPasswordPrompt(null);

      setActionInProgress(`Running ${action.name}...`);
      try {
        const result = await executeAction(action.id, distro.name, distro.id, password);
        if (action.showOutput && result) {
          setShowOutputDialog({
            title: action.name,
            output: result.output,
            error: result.error,
          });
        }
      } finally {
        setActionInProgress(null);
      }
    }
  };

  // Close menu when clicking outside or pressing Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setShowManageSubmenu(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const builtInActions: QuickAction[] = [
    {
      id: "info",
      label: "Distribution Info",
      icon: <InfoIcon size="sm" />,
      action: () => {
        setShowInfoDialog(true);
        setIsOpen(false);
      },
    },
    {
      id: "explorer",
      label: "Open File Explorer",
      icon: <FolderIcon size="sm" />,
      action: () => {
        openFileExplorer(distro.name);
        setIsOpen(false);
      },
    },
    {
      id: "ide",
      label: "Open in IDE",
      icon: <CodeIcon size="sm" />,
      action: () => {
        openIDE(distro.name);
        setIsOpen(false);
      },
    },
    {
      id: "restart",
      label: "Restart",
      icon: <RefreshIcon size="sm" />,
      action: () => {
        restartDistro(distro.name, distro.id);
        setIsOpen(false);
      },
    },
    {
      id: "export",
      label: "Export to File...",
      icon: <UploadIcon size="sm" />,
      requiresStopped: true,
      action: () => {
        executeWithStopCheck(distro, "Export", () => {
          exportDistro(distro.name);
        });
        setIsOpen(false);
      },
    },
    {
      id: "clone",
      label: "Clone...",
      icon: <CopyIcon size="sm" />,
      requiresStopped: true,
      action: () => {
        executeWithStopCheck(distro, "Clone", () => {
          setShowCloneDialog(true);
        });
        setIsOpen(false);
      },
    },
    {
      id: "default",
      label: distro.isDefault ? "Default Distribution" : "Set as Default",
      icon: <StarIcon size="sm" filled={distro.isDefault} />,
      action: () => {
        if (!distro.isDefault) {
          setDefault(distro.name);
        }
        setIsOpen(false);
      },
      disabled: distro.isDefault,
      highlight: distro.isDefault,
    },
  ];

  const handleToggleMenu = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div className="relative" ref={menuRef}>
      <IconButton
        icon={<MenuIcon size="sm" />}
        label="Quick Actions"
        variant="secondary"
        className="btn-cyber"
        onClick={handleToggleMenu}
        disabled={isDisabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        data-testid="quick-actions-button"
      />

      {isOpen && (
        <div
          data-testid="quick-actions-menu"
          role="menu"
          aria-label={`Actions for ${distro.name}`}
          className="absolute right-0 top-full mt-2 w-56 bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-xl shadow-black/70 z-[100] overflow-hidden"
        >
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-theme-accent-primary/30 to-transparent" />

          <div className="py-1">
            {builtInActions.map((action) => (
              <button
                key={action.id}
                role="menuitem"
                onClick={action.action}
                disabled={action.disabled}
                data-testid={`quick-action-${action.id}`}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-all ${
                  action.disabled
                    ? "text-theme-status-stopped cursor-not-allowed"
                    : action.danger
                    ? "text-theme-status-error hover:bg-[rgba(var(--status-error-rgb),0.15)]"
                    : action.highlight
                    ? "text-[#f97316] hover:bg-[#f97316]/10"
                    : "text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary"
                }`}
              >
                <span className={action.danger ? "text-theme-status-error" : action.highlight ? "text-[#f97316]" : "text-theme-text-muted"}>
                  {action.icon}
                </span>
                {action.label}
                {action.requiresStopped && distro.state === "Running" && (
                  <span
                    data-testid="requires-stop-indicator"
                    className="ml-auto text-theme-status-warning"
                    title="Requires stopping distribution"
                  >
                    <PauseIcon size="sm" />
                  </span>
                )}
              </button>
            ))}

            {/* Manage Submenu */}
            <div className="border-t border-theme-border-primary my-1" />
            <div className="relative">
              <button
                onClick={() => setShowManageSubmenu(!showManageSubmenu)}
                data-testid="quick-action-manage"
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
              >
                <span className="flex items-center gap-3">
                  <span className="text-theme-text-muted"><SettingsIcon size="sm" /></span>
                  Manage
                </span>
                <ChevronRightIcon size="sm" className={`text-theme-text-muted transition-transform ${showManageSubmenu ? "rotate-90" : ""}`} />
              </button>

              {showManageSubmenu && (
                <div className="bg-theme-bg-primary/50 border-y border-theme-border-primary">
                  <button
                    onClick={() => {
                      executeWithStopCheck(distro, "Move Distribution", () => {
                        setShowMoveDialog(true);
                      }, { requiresShutdown: true });
                      setIsOpen(false);
                      setShowManageSubmenu(false);
                    }}
                    data-testid="manage-action-move"
                    className="w-full flex items-center gap-3 px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
                  >
                    <span className="text-theme-text-muted"><FolderIcon size="sm" /></span>
                    Move Distribution...
                    {distro.state === "Running" && (
                      <span
                        data-testid="requires-shutdown-indicator"
                        className="ml-auto text-theme-status-error"
                        title="Requires WSL shutdown"
                      >
                        <PowerIcon size="sm" />
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      executeWithStopCheck(distro, "Resize Disk", () => {
                        setShowResizeDialog(true);
                      }, { requiresShutdown: true });
                      setIsOpen(false);
                      setShowManageSubmenu(false);
                    }}
                    data-testid="manage-action-resize"
                    className="w-full flex items-center gap-3 px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
                  >
                    <span className="text-theme-text-muted"><ServerIcon size="sm" /></span>
                    Resize Disk...
                    {distro.state === "Running" && (
                      <span
                        data-testid="requires-shutdown-indicator"
                        className="ml-auto text-theme-status-error"
                        title="Requires WSL shutdown"
                      >
                        <PowerIcon size="sm" />
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setShowSetUserDialog(true);
                      setIsOpen(false);
                      setShowManageSubmenu(false);
                    }}
                    data-testid="manage-action-user"
                    className="w-full flex items-center gap-3 px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
                  >
                    <span className="text-theme-text-muted"><UserIcon size="sm" /></span>
                    Set Default User...
                  </button>
                  <button
                    onClick={() => {
                      if (!distro.id) return;
                      executeWithStopCheck(distro, "Rename", () => {
                        setShowRenameDialog(true);
                      });
                      setIsOpen(false);
                      setShowManageSubmenu(false);
                    }}
                    disabled={!distro.id}
                    title={!distro.id ? "Distribution ID not available" : undefined}
                    data-testid="manage-action-rename"
                    className="w-full flex items-center gap-3 px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-theme-text-secondary"
                  >
                    <span className="text-theme-text-muted">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </span>
                    Rename...
                    {distro.state === "Running" && (
                      <span
                        data-testid="requires-stop-indicator"
                        className="ml-auto text-theme-status-warning"
                        title="Requires stopping distribution"
                      >
                        <PauseIcon size="sm" />
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => handleSparseWithStopCheck()}
                    disabled={isTogglingSprase}
                    data-testid="manage-action-sparse"
                    className="w-full flex items-center justify-between px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all disabled:opacity-50"
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-theme-text-muted"><SparklesIcon size="sm" /></span>
                      Sparse Mode
                    </span>
                    <div className="flex items-center gap-2">
                      {distro.state === "Running" && (
                        <span
                          data-testid="requires-shutdown-indicator"
                          className="text-theme-status-error"
                          title="Requires WSL shutdown"
                        >
                          <PowerIcon size="sm" />
                        </span>
                      )}
                      <span className={`text-xs px-2 py-0.5 rounded ${sparseEnabled ? "bg-[rgba(var(--status-running-rgb),0.1)] text-theme-status-running border border-[rgba(var(--status-running-rgb),0.3)]" : "bg-theme-bg-tertiary text-theme-text-muted border border-theme-border-secondary"}`}>
                        {sparseEnabled ? "On" : "Off"}
                      </span>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      executeWithStopCheck(distro, "Set WSL Version", () => {
                        setShowSetVersionDialog(true);
                      });
                      setIsOpen(false);
                      setShowManageSubmenu(false);
                    }}
                    data-testid="manage-action-set-version"
                    className="w-full flex items-center justify-between px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
                  >
                    <span className="flex items-center gap-3">
                      <span className="text-theme-text-muted">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                        </svg>
                      </span>
                      Set WSL Version
                    </span>
                    <div className="flex items-center gap-2">
                      {distro.state === "Running" && (
                        <span
                          data-testid="requires-stop-indicator"
                          className="text-theme-status-warning"
                          title="Requires stopping distribution"
                        >
                          <PauseIcon size="sm" />
                        </span>
                      )}
                      <span className="text-xs px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-muted border border-theme-border-secondary">
                        v{distro.version}
                      </span>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Custom Actions */}
            {applicableActions.length > 0 && (
              <>
                <div className="border-t border-theme-border-primary my-1" />
                <div className="px-4 py-1.5 text-xs text-theme-text-muted uppercase tracking-wider font-mono">
                  Custom Actions
                </div>
                {applicableActions.map((action) => (
                  <button
                    key={action.id}
                    onClick={() => {
                      if (action.requiresStopped) {
                        executeWithStopCheck(distro, action.name, () => {
                          runCustomAction(action.id, action.confirmBeforeRun, action.showOutput, action.name, action.requiresSudo);
                        });
                        setIsOpen(false);
                      } else {
                        runCustomAction(action.id, action.confirmBeforeRun, action.showOutput, action.name, action.requiresSudo);
                      }
                    }}
                    disabled={isExecuting}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all disabled:opacity-50"
                  >
                    <span className="text-base">{getActionIcon(action.icon)}</span>
                    {action.name}
                    <div className="ml-auto flex items-center gap-1.5">
                      {action.requiresStopped && distro.state === "Running" && (
                        <span
                          data-testid="requires-stop-indicator"
                          className="text-theme-status-warning"
                          title="Requires stopping distribution"
                        >
                          <PauseIcon size="sm" />
                        </span>
                      )}
                      {action.requiresSudo && (
                        <span className="text-xs text-theme-text-muted opacity-60" title="Requires sudo password">
                          🔒
                        </span>
                      )}
                    </div>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}

      <CloneDialog
        isOpen={showCloneDialog}
        sourceName={distro.name}
        onClose={() => setShowCloneDialog(false)}
      />

      <DistroInfoDialog
        isOpen={showInfoDialog}
        distro={distro}
        onClose={() => setShowInfoDialog(false)}
      />

      {/* Manage Dialogs */}
      <MoveDistroDialog
        isOpen={showMoveDialog}
        distro={distro}
        onClose={() => setShowMoveDialog(false)}
      />

      <ResizeDistroDialog
        isOpen={showResizeDialog}
        distro={distro}
        onClose={() => setShowResizeDialog(false)}
      />

      <SetDefaultUserDialog
        isOpen={showSetUserDialog}
        distro={distro}
        onClose={() => setShowSetUserDialog(false)}
      />

      <SetVersionDialog
        isOpen={showSetVersionDialog}
        distro={distro}
        onClose={() => setShowSetVersionDialog(false)}
      />

      <RenameDialog
        isOpen={showRenameDialog}
        distroId={distro.id || ""}
        currentName={distro.name}
        onClose={() => setShowRenameDialog(false)}
      />

      {/* Confirm Dialog for custom actions */}
      <ConfirmDialog
        isOpen={!!showConfirmDialog}
        title={`Run "${showConfirmDialog?.actionName}"?`}
        message={`Are you sure you want to run this action on ${distro.name}?`}
        confirmLabel="Run"
        onConfirm={handleConfirmAction}
        onCancel={() => setShowConfirmDialog(null)}
      />

      {/* Sparse Mode Warning Dialog */}
      <ConfirmDialog
        isOpen={showSparseConfirm}
        title="Enable Sparse Mode?"
        message="Warning: Microsoft has flagged sparse VHD support as potentially causing data corruption. While it can help reclaim disk space automatically, there is a risk of data loss. Make sure you have backups before enabling this feature."
        confirmLabel="Enable Anyway"
        onConfirm={() => {
          setShowSparseConfirm(false);
          handleToggleSparse(true);
        }}
        onCancel={() => setShowSparseConfirm(false)}
        danger
      />

      {/* Password Prompt Dialog for sudo actions */}
      <PasswordPromptDialog
        isOpen={!!showPasswordPrompt}
        actionName={showPasswordPrompt?.name || ""}
        distroName={distro.name}
        onSubmit={handlePasswordSubmit}
        onCancel={() => setShowPasswordPrompt(null)}
      />

      {/* Stop Before Action Dialog */}
      <StopAndActionDialog
        isOpen={stopBeforeActionState.showStopDialog}
        distroName={stopBeforeActionState.distro?.name ?? ""}
        actionName={stopBeforeActionState.actionName}
        requiresShutdown={stopBeforeActionState.requiresShutdown}
        onStopAndContinue={handleStopAndContinue}
        onCancel={handleStopDialogCancel}
      />

      {/* Output Dialog */}
      {showOutputDialog && (
        <Portal>
          <div className="fixed inset-0 bg-theme-bg-primary/90 backdrop-blur-sm flex items-center justify-center z-[100] p-4" role="dialog" aria-modal="true">
            <div className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/70 max-w-2xl w-full max-h-[80vh] overflow-hidden animate-fade-slide-in">
              {/* Top accent line */}
              <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-theme-accent-primary/50 to-transparent" />

              <div className="flex items-center justify-between px-5 py-4 border-b border-theme-border-primary">
                <h3 className="font-semibold text-theme-text-primary">{showOutputDialog.title} - Output</h3>
                <IconButton
                  icon={<CloseIcon size="md" />}
                  label="Close"
                  variant="ghost"
                  onClick={() => setShowOutputDialog(null)}
                />
              </div>
              <div className="p-5 overflow-auto max-h-96">
                {showOutputDialog.output && (
                  <pre className="text-sm text-theme-text-secondary font-mono whitespace-pre-wrap">{showOutputDialog.output}</pre>
                )}
                {showOutputDialog.error && (
                  <pre className="mt-2 text-sm text-theme-status-error font-mono whitespace-pre-wrap">{showOutputDialog.error}</pre>
                )}
                {!showOutputDialog.output && !showOutputDialog.error && (
                  <p className="text-theme-text-muted text-sm font-mono">No output.</p>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}



