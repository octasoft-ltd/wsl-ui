import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { Distribution } from "../types/distribution";
import { useDistroStore } from "../store/distroStore";
import { useActionsStore } from "../store/actionsStore";
import { useNotificationStore } from "../store/notificationStore";
import { wslService } from "../services/wslService";
import { CloneDialog } from "./CloneDialog";
import { MoveDistroDialog } from "./MoveDistroDialog";
import { ResizeDistroDialog } from "./ResizeDistroDialog";
import { CompactDistroDialog } from "./CompactDistroDialog";
import { SetDefaultUserDialog } from "./SetDefaultUserDialog";
import { SetVersionDialog } from "./SetVersionDialog";
import { RenameDialog } from "./RenameDialog";
import { StopAndActionDialog } from "./StopAndActionDialog";
import { DistroInfoDialog } from "./DistroInfoDialog";
import type { CustomAction } from "../types/actions";
import { ConfirmDialog } from "./ConfirmDialog";
import { PasswordPromptDialog } from "./PasswordPromptDialog";
import { Portal } from "./ui/Portal";
import { IconButton } from "./ui/Button";
import { logger } from "../utils/logger";
import { useStopBeforeAction } from "../hooks/useStopBeforeAction";
import { estimatePopupHeight, usePopupWindow } from "../hooks/usePopupWindow";
import {
  MenuIcon,
  CloseIcon,
} from "./icons";

interface QuickActionsMenuProps {
  distro: Distribution;
  disabled?: boolean;
}

export function QuickActionsMenu({ distro, disabled }: QuickActionsMenuProps) {
  const { t, i18n } = useTranslation("actions");
  const [showCloneDialog, setShowCloneDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showResizeDialog, setShowResizeDialog] = useState(false);
  const [showCompactDialog, setShowCompactDialog] = useState(false);
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
  const buttonRef = useRef<HTMLDivElement>(null);
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
      return;
    }

    setIsTogglingSprase(true);
    try {
      const newState = !sparseEnabled;
      await wslService.setSparseDisk(distro.name, newState);
      setSparseEnabled(newState);
      addNotification({
        type: "success",
        title: t('sparseChanged'),
        message: t('sparseChangedMessage', { name: distro.name, state: newState ? t('common:label.on') : t('common:label.off') }),
      });
    } catch (err) {
      // Tauri returns string errors, not Error instances
      const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : t('common:errors.unknown');
      addNotification({
        type: "error",
        title: t('sparseToggleFailed'),
        message: errorMessage,
      });
    } finally {
      setIsTogglingSprase(false);
    }
  };

  // Handle sparse toggle with stop-before-action pattern
  // Requires full WSL shutdown as VHDX must not be in use
  const handleSparseWithStopCheck = () => {
    executeWithStopCheck(distro, t('sparseToggle'), () => {
      handleToggleSparse();
    }, { requiresShutdown: true });
  };

  // Route action IDs from the popup to existing action handlers
  const handlePopupAction = (actionId: string) => {
    // Built-in actions
    if (actionId === "info") {
      setShowInfoDialog(true);
      return;
    }
    if (actionId === "explorer") {
      openFileExplorer(distro.name);
      return;
    }
    if (actionId === "ide") {
      openIDE(distro.name);
      return;
    }
    if (actionId === "restart") {
      restartDistro(distro.name, distro.id);
      return;
    }
    if (actionId === "export") {
      executeWithStopCheck(distro, "Export", () => {
        exportDistro(distro.name);
      });
      return;
    }
    if (actionId === "clone") {
      executeWithStopCheck(distro, "Clone", () => {
        setShowCloneDialog(true);
      });
      return;
    }
    if (actionId === "default") {
      if (!distro.isDefault) {
        setDefault(distro.name);
      }
      return;
    }

    // Manage actions
    if (actionId === "manage:move") {
      executeWithStopCheck(distro, "Move Distribution", () => {
        setShowMoveDialog(true);
      }, { requiresShutdown: true });
      return;
    }
    if (actionId === "manage:resize") {
      executeWithStopCheck(distro, "Resize Disk", () => {
        setShowResizeDialog(true);
      }, { requiresShutdown: true });
      return;
    }
    if (actionId === "manage:compact") {
      setShowCompactDialog(true);
      return;
    }
    if (actionId === "manage:user") {
      setShowSetUserDialog(true);
      return;
    }
    if (actionId === "manage:rename") {
      if (!distro.id) return;
      executeWithStopCheck(distro, "Rename", () => {
        setShowRenameDialog(true);
      });
      return;
    }
    if (actionId === "manage:sparse") {
      handleSparseWithStopCheck();
      return;
    }
    if (actionId === "manage:setVersion") {
      executeWithStopCheck(distro, "Set WSL Version", () => {
        setShowSetVersionDialog(true);
      });
      return;
    }

    // Custom actions
    if (actionId.startsWith("custom:")) {
      const realActionId = actionId.slice("custom:".length);
      const customAction = applicableActions.find((action) => action.id === realActionId);
      if (!customAction) {
        logger.warn(`Ignored unknown or inapplicable custom action: ${realActionId}`, "QuickActionsMenu");
        return;
      }
      if (customAction.requiresStopped) {
        executeWithStopCheck(distro, customAction.name, () => {
          runCustomAction(customAction);
        });
      } else {
        runCustomAction(customAction);
      }
    }
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

  const popupWindow = usePopupWindow({
    anchorRef: buttonRef,
    height: estimatePopupHeight(8 + applicableActions.length, 1080, 40, applicableActions.length > 0 ? 2 : 1),
    label: "quick-actions-popup",
    onAction: handlePopupAction,
    popupType: "quick-actions",
    url: "/popup.html",
    width: 260,
  });

  const runCustomAction = async (action: CustomAction) => {
    if (action.confirmBeforeRun) {
      setShowConfirmDialog({ actionId: action.id, actionName: action.name });
      return;
    }

    // If action runs in terminal, just open terminal and run (user types password there if needed)
    if (action.runInTerminal) {
      try {
        await runActionInTerminal(action.id, distro.name, distro.id);
      } catch (error) {
        addNotification({
          type: "error",
          title: t('actionFailed'),
          message: `${t('actionFailedMessage')}: ${error instanceof Error ? error.message : t('common:errors.unknown')}`,
        });
      }
      return;
    }

    // If action requires sudo (and not running in terminal), prompt for password
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
              title: t('actionFailed'),
              message: `${t('actionFailedMessage')}: ${error instanceof Error ? error.message : t('common:errors.unknown')}`,
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

  const handleToggleMenu = () => {
    if (popupWindow.isOpen) {
      popupWindow.close();
      return;
    }

    popupWindow.open({
      locale: i18n.language || "en",
      payload: {
        actions: applicableActions,
        distro,
      },
    }).catch((error) => {
      logger.error("Failed to open Quick Actions popup", "QuickActionsMenu", error);
      addNotification({
        type: "error",
        title: t("actionFailed"),
        message: `${t("quickActions.title")}: ${error instanceof Error ? error.message : t("common:errors.unknown")}`,
      });
    });
  };

  return (
    <div className="relative">
      <div ref={buttonRef}>
      <IconButton
        icon={<MenuIcon size="sm" />}
        label={t('quickActions.title')}
        variant="secondary"
        className="btn-cyber"
        onClick={handleToggleMenu}
        disabled={isDisabled}
        aria-haspopup="menu"
        aria-expanded={popupWindow.isOpen}
        data-testid="quick-actions-button"
      />
      </div>

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

      <CompactDistroDialog
        isOpen={showCompactDialog}
        distro={distro}
        onClose={() => setShowCompactDialog(false)}
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
        title={t('confirmRunTitle', { action: showConfirmDialog?.actionName })}
        message={t('confirmRunMessage', { action: showConfirmDialog?.actionName, name: distro.name })}
        confirmLabel={t('common:button.run')}
        onConfirm={handleConfirmAction}
        onCancel={() => setShowConfirmDialog(null)}
      />

      {/* Sparse Mode Warning Dialog */}
      <ConfirmDialog
        isOpen={showSparseConfirm}
        title={t('sparseConfirm.title')}
        message={t('sparseConfirm.message')}
        confirmLabel={t('sparseConfirm.confirm')}
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
                <h3 className="font-semibold text-theme-text-primary">{showOutputDialog.title} {t('outputDialog.titleSuffix')}</h3>
                <IconButton
                  icon={<CloseIcon size="md" />}
                  label={t('common:button.close')}
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
                  <p className="text-theme-text-muted text-sm font-mono">{t('outputDialog.noOutput')}</p>
                )}
              </div>
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}
