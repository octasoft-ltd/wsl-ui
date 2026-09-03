import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { Distribution } from "../types/distribution";
import type { CustomAction } from "../types/actions";
import { ACTION_ICONS } from "../types/actions";
import {
  FolderIcon,
  CodeIcon,
  RefreshIcon,
  UploadIcon,
  CopyIcon,
  StarIcon,
  SettingsIcon,
  ChevronRightIcon,
  UserIcon,
  ServerIcon,
  SparklesIcon,
  PauseIcon,
  PowerIcon,
  InfoIcon,
  CompressIcon,
} from "./icons";

export interface QuickActionsPopupData {
  distro: Distribution;
  actions: CustomAction[];
}

interface QuickActionsPopupProps extends QuickActionsPopupData {
  onAction: (actionId: string) => void;
}

/** Renders quick-action content without owning Tauri window/event lifecycle. */
export function QuickActionsPopup({ distro, actions, onAction }: QuickActionsPopupProps) {
  const { t } = useTranslation(["actions", "common"]);
  const [showManageSubmenu, setShowManageSubmenu] = useState(false);

  const handleMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      return;
    }

    const menuItems = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled])'),
    );
    if (menuItems.length === 0) {
      return;
    }

    event.preventDefault();
    const focusedIndex = menuItems.indexOf(document.activeElement as HTMLButtonElement);
    let nextIndex: number;
    if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = menuItems.length - 1;
    } else if (event.key === "ArrowUp") {
      nextIndex = focusedIndex <= 0 ? menuItems.length - 1 : focusedIndex - 1;
    } else {
      nextIndex = focusedIndex < 0 || focusedIndex === menuItems.length - 1 ? 0 : focusedIndex + 1;
    }
    menuItems[nextIndex].focus();
  };

  const getActionIcon = (iconId: string) => {
    return ACTION_ICONS.find((actionIcon) => actionIcon.id === iconId)?.emoji || "⚡";
  };

  // Built-in actions
  const builtInActions = [
    { id: "info", label: t("quickActions.info"), icon: <InfoIcon size="sm" /> },
    { id: "explorer", label: t("quickActions.explorer"), icon: <FolderIcon size="sm" /> },
    { id: "ide", label: t("quickActions.ide"), icon: <CodeIcon size="sm" /> },
    { id: "restart", label: t("quickActions.restart"), icon: <RefreshIcon size="sm" /> },
    { id: "export", label: t("quickActions.export"), icon: <UploadIcon size="sm" />, requiresStopped: true },
    { id: "clone", label: t("quickActions.clone"), icon: <CopyIcon size="sm" />, requiresStopped: true },
    {
      id: "default",
      label: distro.isDefault ? t("quickActions.alreadyDefault") : t("quickActions.setDefault"),
      icon: <StarIcon size="sm" filled={distro.isDefault} />,
      disabled: distro.isDefault,
      highlight: distro.isDefault,
    },
  ];

  return (
    <div
      aria-label={`${t("quickActions.title")}: ${distro.name}`}
      className="bg-transparent min-w-[220px] h-screen"
      data-testid="quick-actions-menu"
      onKeyDown={handleMenuKeyDown}
      role="menu"
    >
      <div className="bg-theme-bg-secondary rounded-xl shadow-xl shadow-black/70 py-1 h-full overflow-y-auto">
      {/* Top accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-theme-accent-primary/30 to-transparent" />

      {/* Built-in actions */}
      {builtInActions.map((action) => (
        <button
          key={action.id}
          onClick={() => onAction(action.id)}
          disabled={action.disabled}
          data-testid={`quick-action-${action.id}`}
          role="menuitem"
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left transition-all ${
            action.disabled
              ? "text-theme-status-stopped cursor-not-allowed"
              : action.highlight
              ? "text-[#f97316] hover:bg-[#f97316]/10"
              : "text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary"
          }`}
        >
          <span className={action.highlight ? "text-[#f97316]" : "text-theme-text-muted"}>
            {action.icon}
          </span>
          {action.label}
          {action.requiresStopped && distro.state === "Running" && (
            <span
              className="ml-auto text-theme-status-warning"
              title={t("customActions.requiresStop")}
            >
              <PauseIcon size="sm" />
            </span>
          )}
        </button>
      ))}

      {/* Manage Submenu */}
      <div className="border-t border-theme-border-primary my-1" role="separator" />
      <div className="relative">
        <button
          aria-expanded={showManageSubmenu}
          aria-haspopup="menu"
          onClick={() => setShowManageSubmenu((isVisible) => !isVisible)}
          data-testid="quick-action-manage"
          role="menuitem"
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
        >
          <span className="flex items-center gap-3">
            <span className="text-theme-text-muted">
              <SettingsIcon size="sm" />
            </span>
            {t("manage.title")}
          </span>
          <ChevronRightIcon
            size="sm"
            className={`text-theme-text-muted transition-transform ${
              showManageSubmenu ? "rotate-90" : ""
            }`}
          />
        </button>

        {showManageSubmenu && (
          <div
            aria-label={t("manage.title")}
            className="bg-theme-bg-primary/50 border-y border-theme-border-primary"
            role="menu"
          >
            {distro.version === 2 && (
              <button
                onClick={() => onAction("manage:move")}
                data-testid="manage-action-move"
                role="menuitem"
                className="w-full flex items-center gap-3 px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
              >
                <span className="text-theme-text-muted"><FolderIcon size="sm" /></span>
                {t("manage.move")}
                {distro.state === "Running" && (
                  <span className="ml-auto text-theme-status-error" title={t("customActions.requiresShutdown")}>
                    <PowerIcon size="sm" />
                  </span>
                )}
              </button>
            )}
            {distro.version === 2 && (
              <button
                onClick={() => onAction("manage:resize")}
                data-testid="manage-action-resize"
                role="menuitem"
                className="w-full flex items-center gap-3 px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
              >
                <span className="text-theme-text-muted"><ServerIcon size="sm" /></span>
                {t("manage.resize")}
                {distro.state === "Running" && (
                  <span className="ml-auto text-theme-status-error" title={t("customActions.requiresShutdown")}>
                    <PowerIcon size="sm" />
                  </span>
                )}
              </button>
            )}
            {distro.version === 2 && (
              <button
                onClick={() => onAction("manage:compact")}
                data-testid="manage-action-compact"
                role="menuitem"
                className="w-full flex items-center gap-3 px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
              >
                <span className="text-theme-text-muted"><CompressIcon size="sm" /></span>
                {t("manage.compact")}
              </button>
            )}
            <button
              onClick={() => onAction("manage:user")}
              data-testid="manage-action-user"
              role="menuitem"
              className="w-full flex items-center gap-3 px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
            >
              <span className="text-theme-text-muted"><UserIcon size="sm" /></span>
              {t("manage.user")}
            </button>
            <button
              onClick={() => onAction("manage:rename")}
              data-testid="manage-action-rename"
              role="menuitem"
              className="w-full flex items-center gap-3 px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
            >
              <span className="text-theme-text-muted">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </span>
              {t("manage.rename")}
              {distro.state === "Running" && (
                <span className="ml-auto text-theme-status-warning" title={t("customActions.requiresStop")}>
                  <PauseIcon size="sm" />
                </span>
              )}
            </button>
            {distro.version === 2 && (
              <button
                onClick={() => onAction("manage:sparse")}
                data-testid="manage-action-sparse"
                role="menuitem"
                className="w-full flex items-center justify-between px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
              >
                <span className="flex items-center gap-3">
                  <span className="text-theme-text-muted"><SparklesIcon size="sm" /></span>
                  {t("manage.sparse")}
                </span>
                {distro.state === "Running" && (
                  <span className="text-theme-status-error" title={t("customActions.requiresShutdown")}>
                    <PowerIcon size="sm" />
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => onAction("manage:setVersion")}
              data-testid="manage-action-set-version"
              role="menuitem"
              className="w-full flex items-center justify-between px-6 py-2 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
            >
              <span className="flex items-center gap-3">
                <span className="text-theme-text-muted">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                </span>
                {t("manage.version")}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-theme-bg-tertiary text-theme-text-muted border border-theme-border-secondary">
                v{distro.version}
              </span>
            </button>
          </div>
        )}
      </div>

      {/* Custom Actions */}
      {actions.length > 0 && (
        <>
          <div className="border-t border-theme-border-primary my-1" role="separator" />
          <div className="px-4 py-1.5 text-xs text-theme-text-muted uppercase tracking-wider font-mono">
            {t("customActions.title")}
          </div>
          {actions.map((action) => (
            <button
              key={action.id}
              onClick={() => onAction(`custom:${action.id}`)}
              data-testid={`quick-action-custom-${action.id}`}
              role="menuitem"
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-left text-theme-text-secondary hover:bg-theme-bg-tertiary hover:text-theme-text-primary transition-all"
            >
              <span className="text-base">{getActionIcon(action.icon)}</span>
              {action.name}
              <div className="ml-auto flex items-center gap-1.5">
                {action.requiresStopped && distro.state === "Running" && (
                  <span className="text-theme-status-warning" title={t("customActions.requiresStop")}>
                    <PauseIcon size="sm" />
                  </span>
                )}
                {action.requiresSudo && (
                  <span className="text-xs text-theme-text-muted opacity-60" title={t("requiresSudo")}>
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
  );
}
