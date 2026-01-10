/**
 * State Components
 *
 * Consistent loading, error, empty, and progress states.
 */

import type { ReactNode } from 'react';
import { Button } from './Button';
import { WarningIcon, RefreshIcon } from '../icons';

// ==================== Types ====================

type SpinnerSize = 'sm' | 'md' | 'lg';
type ErrorVariant = 'error' | 'warning' | 'info';
type ProgressSize = 'sm' | 'md' | 'lg';
type ProgressVariant = 'default' | 'success' | 'warning' | 'danger';

export interface LoadingSpinnerProps {
  size?: SpinnerSize;
  label?: string;
  className?: string;
}

export interface LoadingOverlayProps {
  message?: string;
  inline?: boolean;
}

export interface ErrorMessageProps {
  title?: string;
  message: string;
  variant?: ErrorVariant;
  onRetry?: () => void;
  onDismiss?: () => void;
}

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export interface ProgressBarProps {
  value: number;
  showLabel?: boolean;
  size?: ProgressSize;
  variant?: ProgressVariant;
  className?: string;
}

// ==================== Style Mappings ====================

const SPINNER_SIZE_CLASSES: Record<SpinnerSize, string> = {
  sm: 'w-4 h-4',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

const ERROR_VARIANT_CLASSES: Record<ErrorVariant, { bg: string; border: string; text: string }> = {
  error: { bg: 'bg-[rgba(var(--status-error-rgb),0.2)]', border: 'border-[rgba(var(--status-error-rgb),0.4)]', text: 'text-theme-status-error' },
  warning: { bg: 'bg-[rgba(var(--status-warning-rgb),0.2)]', border: 'border-[rgba(var(--status-warning-rgb),0.4)]', text: 'text-theme-status-warning' },
  info: { bg: 'bg-[rgba(var(--accent-primary-rgb),0.2)]', border: 'border-[rgba(var(--accent-primary-rgb),0.4)]', text: 'text-theme-accent-primary' },
};

const PROGRESS_SIZE_CLASSES: Record<ProgressSize, string> = {
  sm: 'h-1',
  md: 'h-2',
  lg: 'h-3',
};

const PROGRESS_VARIANT_CLASSES: Record<ProgressVariant, string> = {
  default: 'bg-theme-accent-primary',
  success: 'bg-theme-status-running',
  warning: 'bg-theme-status-warning',
  danger: 'bg-theme-status-error',
};

// ==================== Components ====================

export function LoadingSpinner({ size = 'md', label, className = '' }: LoadingSpinnerProps) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        className={`animate-spin ${SPINNER_SIZE_CLASSES[size]}`}
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
        />
      </svg>
      {label && <span className="text-theme-text-secondary text-sm">{label}</span>}
    </div>
  );
}

export function LoadingOverlay({ message = 'Loading...', inline = false }: LoadingOverlayProps) {
  const containerClasses = inline
    ? 'flex items-center justify-center py-8'
    : 'absolute inset-0 flex items-center justify-center bg-theme-bg-primary/80 backdrop-blur-xs';

  return (
    <div className={containerClasses}>
      <div className="flex flex-col items-center gap-3">
        <LoadingSpinner size="lg" />
        <span className="text-theme-text-secondary text-sm">{message}</span>
      </div>
    </div>
  );
}

export function ErrorMessage({
  title,
  message,
  variant = 'error',
  onRetry,
  onDismiss,
}: ErrorMessageProps) {
  const styles = ERROR_VARIANT_CLASSES[variant];

  return (
    <div className={`${styles.bg} border ${styles.border} rounded-lg p-4`}>
      <div className="flex items-start gap-3">
        <WarningIcon className={`${styles.text} shrink-0 mt-0.5`} size="md" />
        <div className="flex-1 min-w-0">
          {title && (
            <h4 className={`font-medium ${styles.text}`}>{title}</h4>
          )}
          <p className={`text-sm ${styles.text} ${title ? 'mt-1' : ''}`}>{message}</p>
        </div>
      </div>
      {(onRetry || onDismiss) && (
        <div className="flex items-center gap-2 mt-3 ml-8">
          {onRetry && (
            <Button variant="secondary" size="sm" onClick={onRetry} icon={<RefreshIcon size="sm" />}>
              Retry
            </Button>
          )}
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      {icon && (
        <div className="text-4xl mb-4 text-theme-text-muted">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-medium text-theme-text-primary">{title}</h3>
      {description && (
        <p className="text-sm text-theme-text-muted mt-1 max-w-md">{description}</p>
      )}
      {action && (
        <div className="mt-4">
          <Button onClick={action.onClick}>{action.label}</Button>
        </div>
      )}
    </div>
  );
}

export function ProgressBar({
  value,
  showLabel = false,
  size = 'md',
  variant = 'default',
  className = '',
}: ProgressBarProps) {
  // Clamp value between 0 and 100
  const clampedValue = Math.max(0, Math.min(100, value));

  return (
    <div className={`w-full ${className}`}>
      <div className={`bg-theme-border-secondary rounded-full overflow-hidden ${PROGRESS_SIZE_CLASSES[size]}`}>
        <div
          className={`${PROGRESS_VARIANT_CLASSES[variant]} ${PROGRESS_SIZE_CLASSES[size]} rounded-full transition-all duration-300`}
          style={{ width: `${clampedValue}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-theme-text-secondary mt-1 block text-right">{clampedValue}%</span>
      )}
    </div>
  );
}





