import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { open, save } from "@tauri-apps/plugin-dialog";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "../ui/Modal";
import { containerService } from "../../services/containerService";
import { useContainerStore } from "../../store/containerStore";
import type {
  ContainerBackupCoverage,
  ContainerConnection,
} from "../../types/containers";
function errorMessage(e: unknown) {
  return typeof e === "object" && e && "message" in e
    ? String(e.message)
    : String(e);
}
export function ContainerBackupsPanel({
  connection,
  id,
  name,
  visible,
}: {
  connection: ContainerConnection;
  id: string;
  name: string;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const [coverage, setCoverage] = useState<ContainerBackupCoverage | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const { busy, isLoading, backup } = useContainerStore();
  useEffect(() => {
    if (!visible) return;
    let active = true;
    setCoverage(null);
    void containerService
      .backupPreflight(connection, id)
      .then((result) => {
        if (active) {
          setCoverage(result);
          setError(null);
        }
      })
      .catch((e) => {
        useContainerStore.getState().reportReadError(connection, e);
        if (active) setError(errorMessage(e));
      });
    return () => {
      active = false;
    };
  }, [connection, id, visible]);
  const saveBackup = async () => {
    try {
      const path = await save({
        defaultPath: `${name}.wslcbackup`,
        filters: [{ name: "WSLc backup", extensions: ["wslcbackup"] }],
      });
      if (path) {
        const result = await backup(id, path);
        if (result) setSavedPath(result.path);
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  };
  return (
    <div
      className="space-y-3 text-sm text-theme-text-secondary"
      data-testid="container-backup-panel"
    >
      <h3>{t("containers.coverage")}</h3>
      {error && (
        <p role="alert" className="text-theme-status-error break-words">
          {error}
        </p>
      )}
      {!coverage && !error && <p>{t("containers.loading")}</p>}
      {coverage && (
        <>
          <dl>
            <dt>{t("containers.rootfs")}</dt>
            <dd>
              {coverage.rootFilesystem ? "✓" : t("containers.unavailable")}
            </dd>
            <dt>{t("containers.configCoverage")}</dt>
            <dd>
              {coverage.configuration ? "✓" : t("containers.unavailable")}
            </dd>
            <dt>{t("containers.namedVolumes")}</dt>
            <dd>{coverage.namedVolumes.join(", ") || "—"}</dd>
          </dl>
          <ul className="list-disc ps-5 break-words">
            {[...coverage.blockers, ...coverage.warnings].map(
              (reason, index) => (
                <li key={index}>{reason}</li>
              ),
            )}
          </ul>
        </>
      )}
      {savedPath && <p className="break-all">{savedPath}</p>}
      <Button
        data-testid="container-backup-save"
        size="sm"
        disabled={!coverage?.supported || !!busy || isLoading}
        onClick={saveBackup}
      >
        {t("containers.saveBackup")}
      </Button>
    </div>
  );
}
export function ContainerRestore({
  connection,
  onClose,
}: {
  connection: ContainerConnection;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const { busy, isLoading, operationError, restore } = useContainerStore();
  return (
    <Modal
      isOpen
      onClose={onClose}
      labelledBy={titleId}
      className="max-h-[90vh] overflow-auto"
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (
            !path ||
            !name.trim() ||
            useContainerStore.getState().connection !== connection
          )
            return;
          const result = await restore(path, name);
          if (result) onClose();
        }}
      >
        <ModalHeader
          titleId={titleId}
          title={t("containers.restore")}
          onClose={onClose}
        />
        <ModalBody className="space-y-4">
          <p className="text-sm text-theme-text-secondary">
            {t("containers.restoreHint")}
          </p>
          <Button
            type="button"
            disabled={!!busy}
            onClick={async () => {
              try {
                const selected = await open({
                  multiple: false,
                  filters: [
                    { name: "WSLc backup", extensions: ["wslcbackup"] },
                  ],
                });
                if (typeof selected === "string") setPath(selected);
              } catch (e) {
                setError(errorMessage(e));
              }
            }}
          >
            {t("containers.chooseBackup")}
          </Button>
          <p className="break-all text-xs text-theme-text-muted">{path}</p>
          <Input
            label={t("containers.restoreName")}
            data-testid="container-restore-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            disabled={!!busy}
          />
          {(error || operationError) && (
            <p role="alert" className="text-theme-status-error break-words">
              {error || operationError}
            </p>
          )}
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("containers.cancel")}
          </Button>
          <Button
            type="submit"
            data-testid="container-restore-submit"
            disabled={!path || !name || !!busy || isLoading}
            loading={!!busy}
          >
            {t("containers.restoreSubmit")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
