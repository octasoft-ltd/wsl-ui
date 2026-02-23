import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { wslService } from "../services/wslService";
import { useDistroStore } from "../store/distroStore";
import { DownloadIcon } from "./icons";
import { Portal } from "./ui/Portal";
import { Input, PathInput, RadioButton } from "./ui/Input";

export interface InstallConfig {
  distroName: string;
  installLocation?: string;
  wslVersion: 1 | 2;
}

interface InstallConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onInstall: (config: InstallConfig) => void;
  mode: "community" | "container" | "download";
  selectedItem: {
    name: string;
    suggestedName: string;
    description?: string;
  };
}

export function InstallConfigDialog({
  isOpen,
  onClose,
  onInstall,
  mode,
  selectedItem,
}: InstallConfigDialogProps) {
  const { t } = useTranslation("dialogs");
  const [distroName, setDistroName] = useState(selectedItem.suggestedName);
  const [isCustomPath, setIsCustomPath] = useState(false);
  const [customPath, setCustomPath] = useState("");
  const [defaultPath, setDefaultPath] = useState<string>("");
  const [pathError, setPathError] = useState<string | null>(null);
  const [isValidatingPath, setIsValidatingPath] = useState(false);
  const [wslVersion, setWslVersion] = useState<2 | 1>(2);
  const { distributions } = useDistroStore();

  // The actual path that will be used (either custom or default)
  const effectivePath = isCustomPath ? customPath : defaultPath;

  // Reset state when dialog opens with new selection
  useEffect(() => {
    if (isOpen) {
      setDistroName(selectedItem.suggestedName);
      setIsCustomPath(false);
      setCustomPath("");
      setPathError(null);
      setWslVersion(2);
    }
  }, [isOpen, selectedItem.suggestedName]);

  // Fetch default path from backend when name changes (debounced)
  useEffect(() => {
    const trimmedName = distroName.trim();
    if (!trimmedName || !isOpen) {
      setDefaultPath("");
      return;
    }

    const timeoutId = setTimeout(async () => {
      try {
        const path = await wslService.getDefaultDistroPath(trimmedName);
        setDefaultPath(path);
      } catch {
        setDefaultPath("");
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [distroName, isOpen]);

  // Validate install path when name or location changes (debounced)
  useEffect(() => {
    const trimmedName = distroName.trim();
    if (!trimmedName || !isOpen) {
      setPathError(null);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsValidatingPath(true);
      try {
        const pathToValidate = isCustomPath ? customPath : "";
        const validation = await wslService.validateInstallPath(pathToValidate, trimmedName);
        if (!validation.isValid) {
          setPathError(validation.error || t('installConfig.invalidLocation'));
        } else {
          setPathError(null);
        }
      } catch {
        setPathError(null);
      } finally {
        setIsValidatingPath(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [distroName, customPath, isCustomPath, isOpen]);

  // Real-time name validation
  const nameValidationError = (() => {
    const trimmedName = distroName.trim();

    if (!trimmedName) {
      return null;
    }

    if (!/^[a-zA-Z0-9._-]+$/.test(trimmedName)) {
      return t('common:validation.invalidChars') as string;
    }

    const isDuplicate = distributions.some(
      (d) => d.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (isDuplicate) {
      return t('common:validation.duplicateName', { name: trimmedName }) as string;
    }

    return null;
  })();

  const handleBrowseLocation = async () => {
    const selectedPath = await open({
      directory: true,
      multiple: false,
      title: t('installConfig.browseTitle'),
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

  const handleInstall = () => {
    const trimmedName = distroName.trim();
    if (!trimmedName || nameValidationError || pathError) {
      return;
    }

    onInstall({
      distroName: trimmedName,
      installLocation: isCustomPath && customPath.trim() ? customPath.trim() : undefined,
      wslVersion,
    });
    onClose();
  };

  const handleClose = () => {
    setDistroName(selectedItem.suggestedName);
    setIsCustomPath(false);
    setCustomPath("");
    setPathError(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && distroName.trim() && !nameValidationError && !pathError && !isValidatingPath) {
      handleInstall();
    } else if (e.key === "Escape") {
      handleClose();
    }
  };

  if (!isOpen) return null;

  // Mode-specific colors
  const modeColors = {
    community: {
      accent: "purple",
      border: "border-purple-500/50",
      bg: "bg-purple-500/10",
      text: "text-purple-400",
      focus: "focus:border-purple-500/50",
      radio: "text-purple-500 focus:ring-purple-500",
    },
    container: {
      accent: "orange",
      border: "border-orange-500/50",
      bg: "bg-orange-500/10",
      text: "text-orange-400",
      focus: "focus:border-orange-500/50",
      radio: "text-orange-500 focus:ring-orange-500",
    },
    download: {
      accent: "blue",
      border: "border-blue-500/50",
      bg: "bg-blue-500/10",
      text: "text-blue-400",
      focus: "focus:border-blue-500/50",
      radio: "text-blue-500 focus:ring-blue-500",
    },
  };

  const colors = modeColors[mode];

  const canInstall = distroName.trim() && !nameValidationError && !pathError && !isValidatingPath;

  return (
    <Portal>
      <div className="fixed inset-0 z-[110] flex items-center justify-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-theme-bg-primary/80 backdrop-blur-xs" onClick={handleClose} />

        {/* Dialog */}
        <div
          role="dialog"
          aria-modal="true"
          data-testid="install-config-dialog"
          className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-md w-full mx-4 p-6"
        >
          {/* Header */}
          <h2 className="text-xl font-semibold text-theme-text-primary mb-2">{t('installConfig.title')}</h2>
          <p className="text-sm text-theme-text-secondary mb-1">
            {t('installConfig.installing')} <span className={`font-medium ${colors.text}`}>{selectedItem.name}</span>
          </p>
          {selectedItem.description && (
            <p className="text-xs text-theme-text-muted mb-4 font-mono truncate">{selectedItem.description}</p>
          )}

          {/* Distribution Name */}
          <div className="mb-4">
            <Input
              label={t('installConfig.nameLabel')}
              value={distroName}
              onChange={(e) => setDistroName(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={t('installConfig.namePlaceholder')}
              autoFocus
              data-testid="install-config-name-input"
              error={nameValidationError || undefined}
              showErrorIcon
              errorTestId="install-config-name-error"
              reserveErrorSpace
              customFocus
              className={`font-mono ${colors.focus}`}
            />
          </div>

          {/* Installation Location */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium text-theme-text-primary">
                {t('installConfig.locationLabel')}
              </label>
              {isCustomPath && (
                <button
                  type="button"
                  onClick={handleResetToDefault}
                  className={`text-xs ${colors.text} hover:underline`}
                >
                  {t('common:button.resetToDefault')}
                </button>
              )}
            </div>
            <PathInput
              value={effectivePath}
              onChange={(e) => handlePathChange(e.target.value)}
              placeholder={t('installConfig.locationPlaceholder')}
              onBrowse={handleBrowseLocation}
              helperText={isCustomPath ? t('installConfig.locationCustom') : t('installConfig.locationDefault')}
              error={pathError || undefined}
              showErrorIcon
              errorTestId="install-config-path-error"
              reserveErrorSpace
              data-testid="install-config-location-input"
            />
          </div>

          {/* WSL Version */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-theme-text-primary mb-2">
              {t('installConfig.wslVersion')}
            </label>
            <div className="flex gap-4">
              <RadioButton
                name="installWslVersion"
                checked={wslVersion === 2}
                onChange={() => setWslVersion(2)}
                inline
                labelClassName="text-theme-text-secondary"
                className={colors.radio}
                label={<>WSL 2 <span className="text-theme-text-muted">({t('installConfig.recommended')})</span></>}
              />
              <RadioButton
                name="installWslVersion"
                checked={wslVersion === 1}
                onChange={() => setWslVersion(1)}
                inline
                labelClassName="text-theme-text-secondary"
                className={colors.radio}
                label="WSL 1"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={handleClose}
              data-testid="install-config-cancel-button"
              className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors"
            >
              {t('common:button.cancel')}
            </button>
            <button
              onClick={handleInstall}
              disabled={!canInstall}
              data-testid="install-config-confirm-button"
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 ${
                mode === "community"
                  ? "bg-purple-600 hover:bg-purple-500 text-white"
                  : mode === "container"
                  ? "bg-orange-600 hover:bg-orange-500 text-white"
                  : "bg-blue-600 hover:bg-blue-500 text-white"
              }`}
            >
              <DownloadIcon size="sm" />
              {t('installConfig.install')}
            </button>
          </div>
        </div>
      </div>
    </Portal>
  );
}
