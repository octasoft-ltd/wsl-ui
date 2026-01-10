/**
 * Reusable Button Components
 *
 * Consistent, accessible button components with variants and sizes.
 * Mission Control aesthetic with cyber styling.
 */

import type { ButtonHTMLAttributes, ReactNode } from 'react';

// ==================== Types ====================

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost' | 'success' | 'accent' | 'link';
type ButtonSize = 'sm' | 'md' | 'lg';
type ColorScheme = 'blue' | 'orange' | 'emerald' | 'red' | 'amber';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
  /** Override primary/danger variant colors with a specific color scheme */
  colorScheme?: ColorScheme;
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode;
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Override variant colors with a specific color scheme */
  colorScheme?: ColorScheme;
}

// ==================== Style Mappings ====================

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'bg-theme-button-primary hover:bg-theme-button-primary-hover text-theme-bg-primary border-transparent shadow-lg shadow-[rgba(var(--accent-primary-rgb),0.2)] hover:shadow-[rgba(var(--accent-primary-rgb),0.3)]',
  secondary: 'bg-theme-bg-tertiary hover:bg-theme-bg-hover text-theme-text-secondary hover:text-theme-text-primary border-theme-border-secondary',
  danger: 'bg-[rgba(var(--status-error-rgb),0.1)] hover:bg-[rgba(var(--status-error-rgb),0.2)] text-theme-button-danger border-[rgba(var(--status-error-rgb),0.3)] hover:border-[rgba(var(--status-error-rgb),0.5)]',
  ghost: 'bg-transparent hover:bg-theme-bg-tertiary text-theme-text-muted hover:text-theme-text-secondary border-transparent hover:border-theme-border-secondary',
  success: 'bg-[rgba(var(--status-running-rgb),0.1)] hover:bg-[rgba(var(--status-running-rgb),0.2)] text-theme-status-running border-[rgba(var(--status-running-rgb),0.3)] hover:border-[rgba(var(--status-running-rgb),0.5)]',
  accent: 'bg-[rgba(var(--accent-primary-rgb),0.1)] hover:bg-[rgba(var(--accent-primary-rgb),0.2)] text-theme-accent-primary border-[rgba(var(--accent-primary-rgb),0.3)] hover:border-[rgba(var(--accent-primary-rgb),0.5)]',
  link: 'bg-transparent hover:bg-transparent text-theme-accent-primary brightness-100 hover:brightness-125 underline underline-offset-2 border-transparent',
};

/** Solid color schemes that override primary variant */
const COLOR_SCHEME_CLASSES: Record<ColorScheme, string> = {
  blue: 'bg-blue-600 hover:bg-blue-500 text-white border-transparent shadow-lg shadow-blue-600/20 hover:shadow-blue-600/30',
  orange: 'bg-orange-600 hover:bg-orange-500 text-white border-transparent shadow-lg shadow-orange-600/20 hover:shadow-orange-600/30',
  emerald: 'bg-emerald-600 hover:bg-emerald-500 text-white border-transparent shadow-lg shadow-emerald-600/20 hover:shadow-emerald-600/30',
  red: 'bg-red-600 hover:bg-red-500 text-white border-transparent shadow-lg shadow-red-600/20 hover:shadow-red-600/30',
  amber: 'bg-amber-600 hover:bg-amber-500 text-white border-transparent shadow-lg shadow-amber-600/20 hover:shadow-amber-600/30',
};

/** Ghost color schemes for icon buttons with colored hover */
const GHOST_COLOR_SCHEME_CLASSES: Record<ColorScheme, string> = {
  blue: 'bg-transparent hover:bg-blue-500/10 text-theme-text-muted hover:text-blue-400 border-transparent',
  orange: 'bg-transparent hover:bg-orange-500/10 text-theme-text-muted hover:text-orange-400 border-transparent',
  emerald: 'bg-transparent hover:bg-emerald-500/10 text-theme-text-muted hover:text-emerald-400 border-transparent',
  red: 'bg-transparent hover:bg-red-500/10 text-theme-text-muted hover:text-red-400 border-transparent',
  amber: 'bg-transparent hover:bg-amber-500/10 text-theme-text-muted hover:text-amber-400 border-transparent hover:border-amber-500/30',
};

function getVariantClasses(variant: ButtonVariant, colorScheme?: ColorScheme): string {
  if (colorScheme) {
    if (variant === 'primary') {
      return COLOR_SCHEME_CLASSES[colorScheme];
    }
    if (variant === 'ghost') {
      return GHOST_COLOR_SCHEME_CLASSES[colorScheme];
    }
    if (variant === 'danger' && colorScheme === 'red') {
      return COLOR_SCHEME_CLASSES.red;
    }
  }
  return VARIANT_CLASSES[variant];
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2.5 text-sm',
  lg: 'px-6 py-3 text-base',
};

const ICON_BUTTON_SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'p-1.5',
  md: 'p-2.5',
  lg: 'p-3',
};

// ==================== Components ====================

function LoadingSpinner() {
  return (
    <div className="relative w-4 h-4">
      <div className="absolute inset-0 border-2 border-current opacity-25 rounded-full" />
      <div className="absolute inset-0 border-2 border-transparent border-t-current rounded-full animate-spin" />
    </div>
  );
}

export function Button({
  variant = 'primary',
  size = 'md',
  icon,
  loading = false,
  fullWidth = false,
  colorScheme,
  disabled,
  className = '',
  children,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  const classes = [
    // Base styles
    'inline-flex items-center justify-center gap-2',
    'font-medium rounded-lg border',
    'transition-colors',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    // Variant (with optional colorScheme override)
    getVariantClasses(variant, colorScheme),
    // Size
    SIZE_CLASSES[size],
    // Full width
    fullWidth ? 'w-full' : '',
    // Custom classes
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      disabled={isDisabled}
      {...props}
    >
      {loading ? <LoadingSpinner /> : icon}
      {children}
    </button>
  );
}

export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  loading = false,
  colorScheme,
  disabled,
  className = '',
  ...props
}: IconButtonProps) {
  const isDisabled = disabled || loading;

  const classes = [
    // Base styles
    'inline-flex items-center justify-center',
    'rounded-lg border',
    'transition-colors',
    'disabled:opacity-50 disabled:cursor-not-allowed',
    // Variant (with optional colorScheme override)
    getVariantClasses(variant, colorScheme),
    // Size
    ICON_BUTTON_SIZE_CLASSES[size],
    // Custom classes
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      disabled={isDisabled}
      title={label}
      aria-label={label}
      {...props}
    >
      {loading ? <LoadingSpinner /> : icon}
    </button>
  );
}





