/**
 * Form Controls for Settings Pages
 *
 * Reusable toggle and input components for settings.
 */

import { useState, useEffect, useRef } from "react";

// Toggle component for boolean settings
export function Toggle({
  label,
  description,
  checked,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex items-center justify-between py-3" data-testid={testId ? `${testId}-container` : undefined}>
      <div>
        <p className="text-sm font-medium text-theme-text-primary" data-testid={testId ? `${testId}-label` : undefined}>{label}</p>
        {description && <p className="text-xs text-theme-text-muted">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        disabled={disabled}
        data-testid={testId ? `${testId}-toggle` : undefined}
        className={`relative w-11 h-6 rounded-full transition-colors ${
          checked ? "bg-theme-accent-primary" : "bg-theme-border-secondary"
        } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <div
          className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

// Select component for dropdown settings
export function SettingSelect({
  label,
  description,
  value,
  options,
  onChange,
  disabled,
  testId,
}: {
  label: string;
  description?: string;
  value: string | number;
  options: { value: string | number; label: string }[];
  onChange: (value: string | number) => void;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <div className="py-3" data-testid={testId ? `${testId}-container` : undefined}>
      <label className="block text-sm font-medium text-theme-text-primary mb-1">{label}</label>
      {description && <p className="text-xs text-theme-text-muted mb-2">{description}</p>}
      <select
        value={value}
        onChange={(e) => {
          const val = e.target.value;
          // Preserve number type if original value was a number
          onChange(typeof value === 'number' ? Number(val) : val);
        }}
        disabled={disabled}
        data-testid={testId}
        className="w-full px-3 py-2 bg-theme-bg-secondary border border-theme-border-secondary rounded-lg text-theme-text-primary focus:outline-hidden focus:border-theme-accent-primary disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// Input component for text/number settings
export function SettingInput({
  label,
  description,
  value,
  onChange,
  placeholder,
  type = "text",
  className = "",
  testId,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: "text" | "number";
  className?: string;
  testId?: string;
}) {
  return (
    <div className="py-3" data-testid={testId ? `${testId}-container` : undefined}>
      <label className="block text-sm font-medium text-theme-text-primary mb-1" data-testid={testId ? `${testId}-label` : undefined}>{label}</label>
      {description && <p className="text-xs text-theme-text-muted mb-2">{description}</p>}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testId ? `${testId}-input` : undefined}
        className={`w-full px-3 py-2 bg-theme-bg-secondary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-hidden focus:border-theme-accent-primary ${className}`}
      />
    </div>
  );
}

// Path input component with folder browse button
// Uses local state to prevent cursor jumping during async saves
export function SettingPathInput({
  label,
  description,
  value,
  onChange,
  onBrowse,
  placeholder,
  className = "",
  testId,
}: {
  label: string;
  description?: string;
  value: string;
  onChange: (value: string) => void;
  onBrowse: () => void;
  placeholder?: string;
  className?: string;
  testId?: string;
}) {
  const [localValue, setLocalValue] = useState(value);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local state when external value changes (e.g., from browse button or reset)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = (newValue: string) => {
    setLocalValue(newValue);

    // Debounce the onChange to avoid saving on every keystroke
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      onChange(newValue);
    }, 300);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  return (
    <div className="py-3" data-testid={testId ? `${testId}-container` : undefined}>
      <label className="block text-sm font-medium text-theme-text-primary mb-1" data-testid={testId ? `${testId}-label` : undefined}>{label}</label>
      {description && <p className="text-xs text-theme-text-muted mb-2">{description}</p>}
      <div className="flex gap-2">
        <input
          type="text"
          value={localValue}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          data-testid={testId ? `${testId}-input` : undefined}
          className={`flex-1 px-3 py-2 bg-theme-bg-secondary border border-theme-border-secondary rounded-lg text-theme-text-primary placeholder-theme-text-muted focus:outline-hidden focus:border-theme-accent-primary ${className}`}
        />
        <button
          type="button"
          onClick={onBrowse}
          data-testid={testId ? `${testId}-browse` : undefined}
          className="px-3 py-2 bg-theme-bg-tertiary hover:bg-theme-bg-hover border border-theme-border-secondary rounded-lg text-theme-text-secondary transition-colors"
          title="Browse for folder"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
          </svg>
        </button>
      </div>
    </div>
  );
}





