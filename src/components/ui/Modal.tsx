/**
 * Reusable Modal Components
 *
 * Consistent, accessible modal/dialog components.
 * Mission Control aesthetic with cyber styling.
 */

import { type ReactNode, useEffect, useRef, useId } from 'react';
import { CloseIcon, WarningIcon } from '../icons';
import { Button } from './Button';
import { Portal } from './Portal';

// ==================== Types ====================

type ModalSize = 'sm' | 'md' | 'lg' | 'xl';
type DialogVariant = 'default' | 'danger';

export interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  size?: ModalSize;
  closeOnBackdrop?: boolean;
  className?: string;
  /** ID of the element that labels this modal (for aria-labelledby) */
  labelledBy?: string;
}

export interface ModalHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  showCloseButton?: boolean;
  /** ID for the title element (for aria-labelledby connection) */
  titleId?: string;
}

export interface ModalBodyProps {
  children: ReactNode;
  className?: string;
}

export interface ModalFooterProps {
  children: ReactNode;
  className?: string;
}

export interface DialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  variant?: DialogVariant;
  loading?: boolean;
}

// ==================== Style Mappings ====================

const SIZE_CLASSES: Record<ModalSize, string> = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

// ==================== Components ====================

export function Modal({
  isOpen,
  onClose,
  children,
  size = 'md',
  closeOnBackdrop = true,
  className = '',
  labelledBy,
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);

  // Store the previously focused element and focus the modal when opened
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      // Focus the modal container for keyboard navigation
      modalRef.current?.focus();
    } else if (previousActiveElement.current) {
      // Return focus when closed
      previousActiveElement.current.focus();
      previousActiveElement.current = null;
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleBackdropClick = () => {
    if (closeOnBackdrop) {
      onClose();
    }
  };

  const modalClasses = [
    'relative bg-theme-bg-secondary border border-theme-border-secondary',
    'rounded-xl shadow-2xl shadow-black/70',
    SIZE_CLASSES[size],
    'w-full mx-4',
    'animate-fade-slide-in',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        {/* Backdrop with grid pattern */}
        <div
          className="absolute inset-0 bg-theme-bg-primary/90 backdrop-blur-sm"
          onClick={handleBackdropClick}
        />

        {/* Modal */}
        <div ref={modalRef} tabIndex={-1} className={modalClasses}>
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-theme-accent-primary/50 to-transparent" />

          {/* Corner accents */}
          <div className="absolute top-0 left-0 w-4 h-px bg-gradient-to-r from-theme-accent-primary/70 to-transparent" />
          <div className="absolute top-0 left-0 w-px h-4 bg-gradient-to-b from-theme-accent-primary/70 to-transparent" />
          <div className="absolute top-0 right-0 w-4 h-px bg-gradient-to-l from-theme-accent-primary/70 to-transparent" />
          <div className="absolute top-0 right-0 w-px h-4 bg-gradient-to-b from-theme-accent-primary/70 to-transparent" />
          <div className="absolute bottom-0 left-0 w-4 h-px bg-gradient-to-r from-theme-accent-primary/30 to-transparent" />
          <div className="absolute bottom-0 left-0 w-px h-4 bg-gradient-to-t from-theme-accent-primary/30 to-transparent" />
          <div className="absolute bottom-0 right-0 w-4 h-px bg-gradient-to-l from-theme-accent-primary/30 to-transparent" />
          <div className="absolute bottom-0 right-0 w-px h-4 bg-gradient-to-t from-theme-accent-primary/30 to-transparent" />

          {children}
        </div>
      </div>
    </Portal>
  );
}

export function ModalHeader({
  title,
  subtitle,
  onClose,
  showCloseButton = true,
  titleId,
}: ModalHeaderProps) {
  return (
    <div className="flex items-start justify-between p-6 border-b border-theme-border-primary">
      <div>
        <h2 id={titleId} className="text-xl font-semibold text-theme-text-primary">{title}</h2>
        {subtitle && <p className="text-sm text-theme-text-muted mt-1 font-mono">{subtitle}</p>}
      </div>
      {showCloseButton && (
        <button
          onClick={onClose}
          className="p-1.5 text-theme-text-muted hover:text-theme-accent-primary transition-colors rounded-lg hover:bg-theme-bg-tertiary border border-transparent hover:border-theme-border-secondary"
          aria-label="Close dialog"
        >
          <CloseIcon size="md" />
        </button>
      )}
    </div>
  );
}

export function ModalBody({ children, className = '' }: ModalBodyProps) {
  return (
    <div className={`p-6 ${className}`}>
      {children}
    </div>
  );
}

export function ModalFooter({ children, className = '' }: ModalFooterProps) {
  return (
    <div className={`flex items-center justify-end gap-3 p-6 border-t border-theme-border-primary ${className}`}>
      {children}
    </div>
  );
}

/**
 * Dialog - A pre-built confirmation dialog using Modal components.
 * Replaces the old ConfirmDialog component.
 */
export function Dialog({
  isOpen,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  variant = 'default',
  loading = false,
}: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previousActiveElement = useRef<HTMLElement | null>(null);
  const titleId = useId();

  // Store the previously focused element and focus the dialog when opened
  useEffect(() => {
    if (isOpen) {
      previousActiveElement.current = document.activeElement as HTMLElement;
      dialogRef.current?.focus();
    } else if (previousActiveElement.current) {
      previousActiveElement.current.focus();
      previousActiveElement.current = null;
    }
  }, [isOpen]);

  // Handle Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  const isDanger = variant === 'danger';

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center" role="alertdialog" aria-modal="true" aria-labelledby={titleId}>
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-theme-bg-primary/90 backdrop-blur-sm"
          onClick={onCancel}
        />

        {/* Dialog */}
        <div ref={dialogRef} tabIndex={-1} className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/70 max-w-md w-full mx-4 p-6 animate-fade-slide-in">
          {/* Top accent line */}
          <div className={`absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent ${isDanger ? 'via-theme-status-error/50' : 'via-theme-accent-primary/50'} to-transparent`} />

          <div className="flex items-start gap-4 mb-6">
            <div
              className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0 ${
                isDanger
                  ? 'bg-[rgba(var(--status-error-rgb),0.1)] text-theme-status-error border border-[rgba(var(--status-error-rgb),0.3)]'
                  : 'bg-[rgba(var(--status-warning-rgb),0.1)] text-theme-status-warning border border-[rgba(var(--status-warning-rgb),0.3)]'
              }`}
              aria-hidden="true"
            >
              <WarningIcon size="md" />
            </div>
            <div>
              <h3 id={titleId} className="text-lg font-semibold text-theme-text-primary">{title}</h3>
              <p className="text-sm text-theme-text-secondary mt-1.5 leading-relaxed">{message}</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3">
            <Button
              variant="secondary"
              onClick={onCancel}
              disabled={loading}
            >
              {cancelLabel}
            </Button>
            <Button
              variant={isDanger ? 'danger' : 'primary'}
              onClick={onConfirm}
              loading={loading}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </div>
    </Portal>
  );
}





