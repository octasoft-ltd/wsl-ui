import { useState } from "react";
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
      filters: [{ name: "TAR Archive", extensions: ["tar"] }],
      title: "Select WSL Distribution Archive",
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
      title: "Select Installation Location",
    });

    if (path && !Array.isArray(path)) {
      setInstallLocation(path);
    }
  };

  const handleImport = async () => {
    if (!name.trim()) {
      setError("Please enter a name for the distribution");
      return;
    }
    if (nameExists) {
      setError(`A distribution named "${name.trim()}" already exists. Please choose a different name.`);
      return;
    }
    if (!tarPath) {
      setError("Please select a TAR archive");
      return;
    }
    if (!installLocation) {
      setError("Please select an installation location");
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
      const errorMessage = typeof err === "string" ? err : err instanceof Error ? err.message : "Failed to import distribution";
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
        <h2 className="text-xl font-semibold text-theme-text-primary mb-4">Import Distribution</h2>

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
              label="Distribution Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Ubuntu-Dev"
              error={nameExists ? "A distribution with this name already exists" : undefined}
              showErrorIcon
              reserveErrorSpace
            />
          </div>

          {/* TAR Path */}
          <div>
            <PathInput
              label="TAR Archive"
              value={tarPath}
              readOnly
              placeholder="Select a .tar file..."
              onBrowse={handleBrowseTar}
            />
          </div>

          {/* Install Location */}
          <div>
            <PathInput
              label="Installation Location"
              value={installLocation}
              readOnly
              placeholder="Select installation folder..."
              onBrowse={handleBrowseLocation}
              helperText="WSL will store the distribution's virtual disk here"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 mt-6">
          <button
            onClick={handleClose}
            disabled={isImporting}
            className="px-4 py-2 text-sm font-medium text-theme-text-secondary bg-theme-bg-tertiary hover:bg-theme-bg-hover rounded-lg transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={isImporting || !name.trim() || nameExists || !tarPath || !installLocation}
            className="px-4 py-2 text-sm font-medium bg-theme-accent-primary hover:opacity-90 text-theme-bg-primary rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isImporting ? (
              "Importing..."
            ) : (
              <>
                <DownloadIcon size="sm" />
                Import
              </>
            )}
          </button>
        </div>
      </div>
    </div>
    </Portal>
  );
}


