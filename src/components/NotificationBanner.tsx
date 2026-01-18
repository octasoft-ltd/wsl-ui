import { useState, useEffect, useRef } from "react";
import { CloseIcon, CheckIcon, WarningIcon, InfoIcon } from "./icons";
import type { NotificationType } from "../store/notificationStore";

const styles = {
  success: {
    container: "bg-[rgba(var(--status-running-rgb),0.05)] border-[rgba(var(--status-running-rgb),0.3)] shadow-[rgba(var(--status-running-rgb),0.05)]",
    accent: "via-[rgba(var(--status-running-rgb),0.5)]",
    icon: "bg-[rgba(var(--status-running-rgb),0.1)] border-[rgba(var(--status-running-rgb),0.3)]",
    text: "text-theme-status-running",
    button: "hover:text-theme-status-running hover:bg-[rgba(var(--status-running-rgb),0.1)] hover:border-[rgba(var(--status-running-rgb),0.3)]",
  },
  info: {
    container: "bg-[rgba(var(--accent-primary-rgb),0.05)] border-[rgba(var(--accent-primary-rgb),0.3)] shadow-[rgba(var(--accent-primary-rgb),0.05)]",
    accent: "via-[rgba(var(--accent-primary-rgb),0.5)]",
    icon: "bg-[rgba(var(--accent-primary-rgb),0.1)] border-[rgba(var(--accent-primary-rgb),0.3)]",
    text: "text-theme-accent-primary",
    button: "hover:text-theme-accent-primary hover:bg-[rgba(var(--accent-primary-rgb),0.1)] hover:border-[rgba(var(--accent-primary-rgb),0.3)]",
  },
  warning: {
    container: "bg-[rgba(var(--status-warning-rgb),0.05)] border-[rgba(var(--status-warning-rgb),0.3)] shadow-[rgba(var(--status-warning-rgb),0.05)]",
    accent: "via-[rgba(var(--status-warning-rgb),0.5)]",
    icon: "bg-[rgba(var(--status-warning-rgb),0.1)] border-[rgba(var(--status-warning-rgb),0.3)]",
    text: "text-theme-status-warning",
    button: "hover:text-theme-status-warning hover:bg-[rgba(var(--status-warning-rgb),0.1)] hover:border-[rgba(var(--status-warning-rgb),0.3)]",
  },
  error: {
    container: "bg-[rgba(var(--status-error-rgb),0.05)] border-[rgba(var(--status-error-rgb),0.3)] shadow-[rgba(var(--status-error-rgb),0.05)]",
    accent: "via-[rgba(var(--status-error-rgb),0.5)]",
    icon: "bg-[rgba(var(--status-error-rgb),0.1)] border-[rgba(var(--status-error-rgb),0.3)]",
    text: "text-theme-status-error",
    button: "hover:text-theme-status-error hover:bg-[rgba(var(--status-error-rgb),0.1)] hover:border-[rgba(var(--status-error-rgb),0.3)]",
  },
};

const icons = {
  success: CheckIcon,
  info: InfoIcon,
  warning: WarningIcon,
  error: WarningIcon,
};

interface NotificationBannerProps {
  type: NotificationType;
  title: string;
  message: string;
  onDismiss?: () => void;
  autoDismiss?: number; // milliseconds, 0 = no auto-dismiss
  children?: React.ReactNode;
  testId?: string;
}

export function NotificationBanner({
  type,
  title,
  message,
  onDismiss,
  autoDismiss = 0,
  children,
  testId = "notification-banner"
}: NotificationBannerProps) {
  const [isVisible, setIsVisible] = useState(false); // Start hidden for enter animation
  const [isClosing, setIsClosing] = useState(false);
  const dismissTimerRef = useRef<number | null>(null);
  const onDismissRef = useRef(onDismiss); // Store onDismiss in ref to avoid effect re-runs
  const style = styles[type];
  const Icon = icons[type];

  // Keep the ref updated with the latest onDismiss
  useEffect(() => {
    onDismissRef.current = onDismiss;
  }, [onDismiss]);

  // Derive child testIds from the main testId (e.g., "error-banner" -> "error-message", "error-dismiss-button")
  const testIdPrefix = testId.replace(/-banner$/, "");
  const messageTestId = `${testIdPrefix}-message`;
  const dismissTestId = `${testIdPrefix}-dismiss-button`;

  // Trigger enter animation after mount
  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setIsVisible(true);
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  const handleDismiss = () => {
    if (isClosing) return; // Prevent double-trigger
    setIsClosing(true);
    // Wait for animation to complete before calling onDismiss
    setTimeout(() => {
      onDismissRef.current?.();
    }, 300);
  };

  // Auto-dismiss after specified time (with animation)
  // Only depends on autoDismiss - onDismiss is accessed via ref
  useEffect(() => {
    if (autoDismiss && autoDismiss > 0 && onDismissRef.current) {
      dismissTimerRef.current = window.setTimeout(() => {
        handleDismiss();
      }, autoDismiss);
    }
    return () => {
      if (dismissTimerRef.current !== null) {
        clearTimeout(dismissTimerRef.current);
      }
    };
  }, [autoDismiss]);

  const isExpanded = isVisible && !isClosing;

  // Accessibility: Use assertive for errors/warnings, polite for info/success
  const ariaLive = type === "error" || type === "warning" ? "assertive" : "polite";
  const role = type === "error" || type === "warning" ? "alert" : "status";

  return (
    <div
      role={role}
      aria-live={ariaLive}
      aria-atomic="true"
      className="grid transition-[grid-template-rows,margin] duration-300 ease-out"
      style={{ gridTemplateRows: isExpanded ? "1fr" : "0fr", marginTop: isExpanded ? 24 : 0, marginBottom: isExpanded ? 20 : 0 }}
    >
      <div className="overflow-hidden">
        <div
          data-testid={testId}
          className={`p-4 border rounded-xl shadow-lg transition-opacity duration-200 ${
            isExpanded ? "opacity-100" : "opacity-0"
          } ${style.container}`}
        >
        {/* Top accent line */}
        <div className={`absolute top-0 left-4 right-4 h-px bg-gradient-to-r from-transparent ${style.accent} to-transparent`} />

        <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-lg border flex items-center justify-center flex-shrink-0 ${style.icon}`}>
          <Icon size="md" className={style.text} />
        </div>
        <div className="flex-1 min-w-0">
          <p data-testid={`${testIdPrefix}-title`} className={`font-semibold text-sm uppercase tracking-wider font-mono ${style.text}`}>
            {title}
          </p>
          <p data-testid={messageTestId} className="text-sm mt-2 text-theme-text-secondary break-words whitespace-pre-wrap leading-relaxed">
            {message}
          </p>
          {children && <div className="mt-4">{children}</div>}
        </div>
        {onDismiss && (
          <button
            onClick={handleDismiss}
            data-testid={dismissTestId}
            aria-label="Dismiss notification"
            className={`p-2 text-theme-text-muted rounded-lg border border-transparent transition-all flex-shrink-0 ${style.button}`}
            title="Dismiss"
          >
            <CloseIcon size="sm" />
          </button>
        )}
          </div>
        </div>
      </div>
    </div>
  );
}
