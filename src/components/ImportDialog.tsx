import { useState } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { useDistroStore } from "../store/distroStore";
import { DownloadIcon } from "./icons";
import { Portal } from "./ui/Portal";
import { Input, PathInput } from "./ui/Input";

interface ImportDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ImportDialog({ isOpen, onClose }: ImportDialogProps) {
  const { t } = useTranslation("dialogs");
  const [name, setName] = useState("");
  const [tarPath, setTarPath] = useState("");
  const [installLocation, setInstallLocation] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { fetchDistros, distributions } = useDistroStore();

  // Check if name already exists
  const nameExists = distributions.some(
    (d) => d.name.toLowerCase() === name.trim().toLowerCase()
  );

  if (!isOpen) return null;

  const handleBrowseTar = async () => {
    const path = await open({
      filters: [{ name: t('import.tarFilterName'), extensions: ["tar"] }],
      title: t('import.browseTarTitle'),
      multiple: false,
    });

    if (path && !Array.isArray(path)) {
      setTarPath(path);
      // Auto-suggest name from filename
      if (!name) {
        const filename = path.split(/[/\\]/).pop() || "";
        const suggestedName = filename.replace(/\.tar$/i, "").replace(/-\d{4}-\d{2}-\d{2}$/, "");
        setName(suggestedName);
      }
    }
  };

  const handleBrowseLocation = async () => {
    const path = await open({
      directory: true,
      title: t('import.browseLocationTitle'),
    });

    if (path && !Array.isArray(path)) {
      setInstallLocation(path);
    }
  };

  const handleImport = async () => {
    if (!name.trim()) {
      setError(t('import.errorNoName'));
      return;
    }
    if (nameExists) {
      setError(t('common:validation.duplicateName', { name: name.trim() }));
      return;
    }
    if (!tarPath) {
      setError(t('import.errorNoTar'));
      return;
    }
    if (!installLocation) {
      setError(t('import.errorNoLocation'));
      return;
    }

    setError(null);
    setIsImporting(true);

    try {
      await invoke("import_distribution", {
        name: name.trim(),
        installLocation,
        tarPath,
      });
      await fetchDistros();
      handleClose();
    } catch (err) {
      // Tauri returns string errors, not Error instances
      const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : t('import.errorFailed');
      setError(errorMessage);
    } finally {
      setIsImporting(false);
    }
  };

  const handleClose = () => {
    setName("");
    setTarPath("");
    setInstallLocation("");
    setError(null);
    onClose();
  };

  return (
    <Portal>
      <div className="fixed inset-0 z-[100] flex items-center justify-center">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-theme-bg-primary/80 backdrop-blur-xs" onClick={handleClose} />

        {/* Dialog */}
        <div role="dialog" aria-modal="true" className="relative bg-theme-bg-secondary border border-theme-border-secondary rounded-xl shadow-2xl shadow-black/50 max-w-lg w-full mx-4 p-6">
        <h2 className="text-xl font-semibold text-theme-text-primary mb-4">{t('import.title')}</h2>

        {/* Error message - always reserve space to prevent layout shift */}
        <div className="mb-4 min-h-11">
          {error && (
            <div className="p-3 bg-[rgba(var(--status-error-rgb),0.2)] border border-[rgba(var(--status-error-rgb),0.4)] rounded-lg text-theme-status-error text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Name */}
          <div>
            <Input
              label={t('import.nameLabel')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('import.namePlaceholder')}
              error={nameExists ? t('common:validation.nameExists') : undefined}
              showErrorIcon
              reserveErrorSpace
            />
          </div>

          {/* TAR Path */}
          <div>
            <PathInput
              label={t('import.tarLabel')}
              value={tarPath}
              readOnly
              placeholder={t('import.tarPlaceholder')}
              onBrowse={handleBrowseTar}
            />
          </div>

          {/* Install Location */}
          <div>
            <PathInput
              label={t('import.locationLabel')}
              value={installLocation}
              readOnly
              placeholder={t('import.locationPlaceholder')}
              onBrowse={handleBrowseLocation}
              helperText={t('import.locationHelper')}
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            disabled={isImporting}
            className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors disabled:opacity-50"
          >
            {t('common:button.cancel')}
          </button>
          <button
            onClick={handleImport}
            disabled={isImporting || !name.trim() || nameExists || !tarPath || !installLocation}
            className="px-4 py-2 text-sm font-medium bg-theme-accent-primary hover:opacity-90 text-theme-bg-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isImporting ? (
              t('import.importing')
            ) : (
              <>
                <DownloadIcon size="sm" />
                {t('import.import')}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}


