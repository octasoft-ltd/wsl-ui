import { useState, useEffect } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { wslService } from "../services/wslService";
import { useDistroStore } from "../store/distroStore";
import { CopyIcon } from "./icons";
import { Portal } from "./ui/Portal";
import { Input, PathInput } from "./ui/Input";

interface CloneDialogProps {
  isOpen: boolean;
  sourceName: string;
  onClose: () => void;
}

export function CloneDialog({ isOpen, sourceName, onClose }: CloneDialogProps) {
  const [newName, setNewName] = useState(`${sourceName}-clone`);
  // Track if user has customized the path (vs using auto-generated default)
  const [isCustomPath, setIsCustomPath] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const [isCloning, setIsCloning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pathError, setPathError] = useState<string | null>(null);
  const [isValidatingPath, setIsValidatingPath] = useState(false);
  // Default path fetched from backend (with env vars expanded)
  const [defaultPath, setDefaultPath] = useState<string>("");
  const { distributions, fetchDistros } = useDistroStore();

  // Fetch default path from backend when name changes
  useEffect(() => {
    const trimmedName = newName.trim();
    if (!trimmedName || !isOpen) {
      setDefaultPath("");
      return;
    }

    // Debounce the path fetch
    const timeoutId = setTimeout(async () => {
      try {
        const path = await wslService.getDefaultDistroPath(trimmedName);
        setDefaultPath(path);
      } catch {
        // Fallback - shouldn't happen but handle gracefully
        setDefaultPath("");
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [newName, isOpen]);

  // The actual path that will be used (either custom or default)
  const effectivePath = isCustomPath ? customPath : defaultPath;

  // Reset state when dialog opens with new source
  useEffect(() => {
    if (isOpen) {
      setNewName(`${sourceName}-clone`);
      setIsCustomPath(false);
      setCustomPath("");
      setError(null);
      setPathError(null);
    }
  }, [isOpen, sourceName]);

  // Validate install path when name or location changes (debounced)
  useEffect(() => {
    const trimmedName = newName.trim();
    if (!trimmedName || !isOpen) {
      setPathError(null);
      return;
    }

    // Debounce the validation
    const timeoutId = setTimeout(async () => {
      setIsValidatingPath(true);
      try {
        // Pass empty string for default path (backend will compute it)
        // Pass the custom path if user specified one
        const pathToValidate = isCustomPath ? customPath : "";
        const validation = await wslService.validateInstallPath(pathToValidate, trimmedName);
        if (!validation.isValid) {
          setPathError(validation.error || "Invalid install location");
        } else {
          setPathError(null);
        }
      } catch {
        // Ignore validation errors silently - will catch on submit
        setPathError(null);
      } finally {
        setIsValidatingPath(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [newName, customPath, isCustomPath, isOpen]);

  const handleBrowseLocation = async () => {
    const selectedPath = await open({
      directory: true,
      multiple: false,
      title: "Select Installation Folder for Distribution",
    });

    if (selectedPath && !Array.isArray(selectedPath)) {
      setCustomPath(selectedPath);
      setIsCustomPath(true);
    }
  };

  const handlePathChange = (value: string) => {
    setCustomPath(value);
    setIsCustomPath(true);
  };

  const handleResetToDefault = () => {
    setIsCustomPath(false);
    setCustomPath("");
  };

  // Real-time validation as user types
  const validationError = (() => {
    const trimmedName = newName.trim();

    if (!trimmedName) {
      return null; // No error for empty (button will be disabled)
    }

    if (trimmedName === sourceName) {
      return "Clone name must be different from the source";
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(trimmedName)) {
      return "Name can only contain letters, numbers, dots, underscores, and hyphens";
    }

    const isDuplicate = distributions.some(
      (d) => d.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      return `A distribution named "${trimmedName}" already exists`;
    }

    return null;
  })();

  if (!isOpen) return null;

  const handleClone = async () => {
    const trimmedName = newName.trim();

    if (!trimmedName || validationError || pathError) {
      return;
    }

    setError(null);
    setIsCloning(true);

    try {
      // Pass custom path if set, otherwise undefined (backend uses default)
      const locationToUse = isCustomPath && customPath.trim() ? customPath.trim() : undefined;
      await wslService.cloneDistribution(sourceName, trimmedName, locationToUse);
      await fetchDistros();
      handleClose();
    } catch (err) {
      // Tauri returns string errors, not Error instances
      const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : "Failed to clone distribution";
      setError(errorMessage);
    } finally {
      setIsCloning(false);
    }
  };

  const handleClose = () => {
    setNewName(`${sourceName}-clone`);
    setIsCustomPath(false);
    setCustomPath("");
    setError(null);
    setPathError(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !isCloning && newName.trim() && !validationError && !pathError && !isValidatingPath) {
      handleClone();
    } else if (e.key === "Escape") {
      handleClose();
    }
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-theme-bg-primary/80 backdrop-blur-xs" onClick={handleClose} />

        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          data-testid="clone-dialog"
          className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-md w-full mx-4 p-6"
        >
        <h2 className="text-xl font-semibold text-theme-text-primary mb-2">Clone Distribution</h2>
        <p className="text-sm text-theme-text-secondary mb-4">
          Create a copy of <span className="text-theme-status-warning font-medium">{sourceName}</span>
        </p>

        {error && (
          <div
            data-testid="clone-error"
            className="mb-4 p-3 bg-[rgba(var(--status-error-rgb),0.2)] border border-[rgba(var(--status-error-rgb),0.4)] rounded-lg text-theme-status-error text-sm"
          >
            {error}
          </div>
        )}

        <div className="mb-6">
          <Input
            label="New Distribution Name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Enter name for the clone"
            disabled={isCloning}
            autoFocus
            data-testid="clone-name-input"
            error={validationError || undefined}
            showErrorIcon
            errorTestId="clone-validation-error"
            reserveErrorSpace
          />
        </div>

        <div className="mb-6">
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm font-medium text-theme-text-primary">
              Installation Location
            </label>
            {isCustomPath && (
              <button
                type="button"
                onClick={handleResetToDefault}
                className="text-xs text-theme-accent-primary hover:underline"
                disabled={isCloning}
              >
                Reset to default
              </button>
            )}
          </div>
          <PathInput
            value={effectivePath}
            onChange={(e) => handlePathChange(e.target.value)}
            placeholder="Select installation folder..."
            disabled={isCloning}
            onBrowse={handleBrowseLocation}
            helperText={isCustomPath ? "Using custom location" : "Using default location"}
            error={pathError || undefined}
            showErrorIcon
            errorTestId="clone-path-error"
            reserveErrorSpace
            data-testid="clone-location-input"
          />
        </div>

        {isCloning && (
          <div data-testid="clone-progress" className="mb-4 p-3 bg-theme-bg-tertiary border border-theme-border-secondary rounded-lg">
            <div className="flex items-center gap-3 text-theme-text-secondary text-sm">
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
              <span>Cloning distribution... This may take a while for large distros.</span>
            </div>
          </div>
        )}

        <div className="flex items-center justify-end gap-3">
          <button
            onClick={handleClose}
            disabled={isCloning}
            data-testid="clone-cancel-button"
            className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleClone}
            disabled={isCloning || !newName.trim() || !!validationError || !!pathError || isValidatingPath}
            data-testid="clone-confirm-button"
            className="px-4 py-2 text-sm font-medium bg-theme-accent-primary hover:opacity-90 text-theme-bg-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isCloning ? (
              "Cloning..."
            ) : (
              <>
                <CopyIcon size="sm" />
                Clone
              </>
            )}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}
