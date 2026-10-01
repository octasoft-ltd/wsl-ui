import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Input, Select } from "../ui/Input";
import { Dialog } from "../ui/Modal";
import { useAppVisibility } from "../../hooks/useAppVisibility";
import { useContainerStore } from "../../store/containerStore";
import type { ContainerSummary } from "../../types/containers";
import { ContainerDetail } from "./ContainerDetail";
import { AddContainerDialog } from "./AddContainerDialog";
import { ContainerRestore } from "./ContainerRecovery";
export function ContainerWorkspace({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  const store = useContainerStore();
  const appVisible = useAppVisibility();
  const active = visible && appVisible;
  const probed = useRef(false);
  const [forceStop, setForceStop] = useState<ContainerSummary | null>(null);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [remove, setRemove] = useState<ContainerSummary | null>(null);
  const [detailTab, setDetailTab] = useState("overview");
  useEffect(() => {
    if (active && !probed.current) {
      probed.current = true;
      void store.probe();
    }
  }, [active, store.probe]);
  useEffect(() => {
    if (!active || !store.connection) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await useContainerStore.getState().refresh();
      if (!cancelled && useContainerStore.getState().connection)
        timer = setTimeout(tick, 5000);
    };
    timer = setTimeout(tick, 5000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [active, store.connection]);
  const disabled = !store.connection || !!store.busy || store.isLoading;
  const rows = store.containers.filter(
    (c) =>
      `${c.name} ${c.image} ${c.id}`
        .toLowerCase()
        .includes(store.search.toLowerCase()) &&
      (store.filter === "all" ||
        (store.filter === "running"
          ? c.state === "running"
          : ["created", "exited", "dead"].includes(c.state))),
  );
  const details = (id: string, tab = "overview") => {
    setDetailTab(tab);
    void store.select(id);
  };
  return (
    <section
      hidden={!visible}
      data-testid="container-workspace"
      className="flex-1 min-h-0 flex flex-col text-theme-text-primary"
    >
      <div className="px-4 sm:px-6 py-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{t("containers.title")}</h2>
          <p className="text-xs text-theme-text-muted">
            {store.connection
              ? `${store.connection.sessionName} · ${t("containers.connected")} · WSL ${store.connection.runtimeVersion}`
              : t("containers.disconnected")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            data-testid="container-create"
            disabled={disabled}
            onClick={() => setCreating(true)}
          >
            {t("containers.catalog.title")}
          </Button>
          <Button
            size="sm"
            data-testid="container-restore"
            disabled={disabled || store.probeResult?.restoreSupported === false}
            onClick={() => setRestoring(true)}
          >
            {t("containers.restore")}
          </Button>
          {store.connection && (
            <>
              <Button
                size="sm"
                data-testid="container-refresh"
                disabled={disabled}
                onClick={() => store.refresh()}
              >
                {t("containers.refresh")}
              </Button>
              <Button
                size="sm"
                disabled={!!store.busy || store.isLoading}
                onClick={store.disconnect}
              >
                {t("containers.disconnect")}
              </Button>
            </>
          )}
        </div>
      </div>
      <div className="overflow-auto flex-1 min-h-0 px-4 sm:px-6 pb-4 space-y-4">
        <p className="text-xs text-theme-text-muted">{t("containers.scope")}</p>
        {store.probeResult?.restoreSupported === false && (
          <p
            data-testid="container-restore-unavailable"
            className="text-xs text-theme-text-muted"
          >
            {store.probeResult.restoreUnavailableReason ||
              t("containers.recoveryUnavailable")}
          </p>
        )}
        {store.error && (
          <p
            role="alert"
            data-testid="container-error"
            className="rounded-lg border border-theme-border-secondary p-3 text-theme-status-error break-words"
          >
            {store.error}
          </p>
        )}
        {store.operationError && (
          <div
            role="alert"
            className="rounded-lg border border-theme-border-secondary p-3 text-theme-status-error break-words"
          >
            {store.operationError}
            <Button
              variant="ghost"
              size="sm"
              onClick={store.clearOperationError}
            >
              ×
            </Button>
          </div>
        )}
        {store.recoveryOutcome && (
          <div
            role="status"
            data-testid="container-recovery-outcome"
            className="rounded-lg border border-theme-border-secondary p-3 text-sm text-theme-text-secondary break-words"
          >
            <p>
              {t(
                store.recoveryOutcome.kind === "backup"
                  ? "containers.backupComplete"
                  : "containers.restoreComplete",
                { name: store.recoveryOutcome.targetName },
              )}
            </p>
            <p className="text-xs text-theme-text-muted">
              {store.recoveryOutcome.sessionName} ·{" "}
              {store.recoveryOutcome.sessionId}
            </p>
            {store.recoveryOutcome.kind === "backup" ? (
              <p className="break-all">{store.recoveryOutcome.result.path}</p>
            ) : (
              <>
                <p className="break-all">
                  {store.recoveryOutcome.result.containerId}
                </p>
                {store.recoveryOutcome.result.volumeNames.length > 0 && (
                  <p>
                    {t("containers.namedVolumes")}:{" "}
                    {store.recoveryOutcome.result.volumeNames.join(", ")}
                  </p>
                )}
                {store.recoveryOutcome.result.warning && (
                  <p className="text-theme-status-warning">
                    {store.recoveryOutcome.result.warning}
                  </p>
                )}
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={store.clearRecoveryOutcome}
            >
              {t("containers.dismiss")}
            </Button>
          </div>
        )}
        {store.busy && (
          <p
            role="status"
            data-testid="container-busy"
            className="text-theme-text-muted"
          >
            {t("containers.busy")}: {store.busy.split(":")[0]}
          </p>
        )}
        {!store.connection && (
          <div className="bg-theme-bg-secondary border border-theme-border-secondary rounded-xl p-5 space-y-3">
            {!store.probeResult && <p>{t("containers.checking")}</p>}
            {store.probeResult && !store.probeResult.supported && (
              <p>{store.probeResult.reason || t("containers.unsupported")}</p>
            )}
            {store.probeResult?.supported && (
              <>
                <p className="text-sm text-theme-text-secondary">
                  {t("containers.connectHint")}
                </p>
                <Button
                  data-testid="container-connect"
                  loading={store.isLoading}
                  disabled={!!store.busy || store.isLoading}
                  onClick={store.connect}
                >
                  {t("containers.connect")}
                </Button>
              </>
            )}
            {(!store.probeResult || !store.probeResult.supported) && (
              <Button size="sm" onClick={store.probe}>
                {t("containers.retry")}
              </Button>
            )}
          </div>
        )}
        {(store.connection || store.containers.length > 0) && (
          <>
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-40">
                <Input
                  label={t("containers.search")}
                  data-testid="container-search"
                  value={store.search}
                  onChange={(e) => store.setSearch(e.target.value)}
                />
              </div>
              <div className="w-40">
                <Select
                  label={t("containers.filter")}
                  data-testid="container-filter"
                  value={store.filter}
                  options={[
                    { value: "all", label: t("containers.all") },
                    { value: "running", label: t("containers.running") },
                    { value: "stopped", label: t("containers.stopped") },
                  ]}
                  onChange={(e) => store.setFilter(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col xl:flex-row gap-4 items-start min-w-0">
              <div
                className={`space-y-3 flex-1 min-w-0 w-full ${store.selectedId ? "hidden xl:block" : ""}`}
              >
                {rows.length === 0 && (
                  <p className="py-10 text-center text-theme-text-muted">
                    {t(
                      store.containers.length
                        ? "containers.noMatch"
                        : "containers.empty",
                    )}
                  </p>
                )}
                {rows.map((c) => (
                  <article
                    key={c.id}
                    data-testid={`container-card-${c.id}`}
                    className="bg-theme-bg-secondary border border-theme-border-secondary rounded-xl p-4 min-w-0 space-y-3"
                  >
                    <div className="flex flex-wrap justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="font-semibold break-words">{c.name}</h3>
                        <p className="text-sm text-theme-text-secondary break-words">
                          {c.image}
                        </p>
                        <p className="text-xs text-theme-text-muted">
                          {t(
                            c.origin === "wsl-ui"
                              ? "containers.owned"
                              : "containers.external",
                          )}
                        </p>
                      </div>
                      <div className="text-sm">
                        <p>{c.rawState}</p>
                        {c.health && (
                          <p className="text-xs text-theme-text-muted">
                            {t("containers.health")}: {c.health}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-theme-text-secondary break-words">
                      {t("containers.ports")}:{" "}
                      {c.ports || t("containers.unavailable")} ·{" "}
                      {t("containers.data")}:{" "}
                      {c.mounts || t("containers.unavailable")}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        size="sm"
                        data-testid={`container-details-${c.id}`}
                        onClick={() => details(c.id)}
                      >
                        {t("containers.details")}
                      </Button>
                      <Button
                        size="sm"
                        data-testid="container-logs"
                        disabled={!store.connection}
                        onClick={() => details(c.id, "logs")}
                      >
                        {t("containers.logs")}
                      </Button>
                      <Button
                        size="sm"
                        data-testid="container-terminal"
                        disabled={disabled || c.state !== "running"}
                        onClick={() => store.terminal(c.id)}
                      >
                        {t("containers.terminal")}
                      </Button>
                      {c.state === "running" ? (
                        <>
                          <Button
                            size="sm"
                            data-testid="container-stop"
                            disabled={disabled}
                            onClick={() => store.action(c.id, "stop")}
                          >
                            {t("containers.stop")}
                          </Button>
                          <Button
                            size="sm"
                            data-testid="container-restart"
                            disabled={disabled}
                            onClick={() => store.action(c.id, "restart")}
                          >
                            {t("containers.restart")}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          data-testid="container-start"
                          disabled={
                            disabled ||
                            !["created", "exited", "dead"].includes(c.state)
                          }
                          onClick={() => store.action(c.id, "start")}
                        >
                          {t("containers.start")}
                        </Button>
                      )}
                      {store.failedAction?.id === c.id &&
                        store.failedAction.action === "stop" &&
                        c.state === "running" && (
                          <Button
                            size="sm"
                            variant="danger"
                            disabled={disabled}
                            data-testid="container-force-stop"
                            onClick={() => setForceStop(c)}
                          >
                            {t("containers.forceStop")}
                          </Button>
                        )}
                      <Button
                        size="sm"
                        variant="danger"
                        data-testid="container-remove"
                        disabled={disabled || c.state === "unknown"}
                        onClick={() => setRemove(c)}
                      >
                        {t("containers.remove")}
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
              {store.selectedId && (
                <ContainerDetail
                  visible={visible}
                  queryActive={active}
                  initialTab={detailTab}
                  onBack={() => store.select(null)}
                />
              )}
            </div>
          </>
        )}
      </div>
      <footer className="border-t border-theme-border-primary px-6 py-2 text-xs text-theme-text-muted">
        WSLc · {store.connection?.sessionName || t("containers.disconnected")}
        {store.updatedAt &&
          ` · ${t("containers.updated")} ${new Date(store.updatedAt).toLocaleTimeString()}`}
      </footer>
      {visible && creating && (
        <AddContainerDialog onClose={() => setCreating(false)} />
      )}
      {visible && restoring && store.connection && (
        <ContainerRestore
          connection={store.connection}
          onClose={() => setRestoring(false)}
        />
      )}
      <Dialog
        isOpen={visible && !!forceStop}
        title={t("containers.forceStop")}
        message={t("containers.forceStopMessage", { name: forceStop?.name })}
        confirmLabel={t("containers.forceStop")}
        onCancel={() => setForceStop(null)}
        onConfirm={() => {
          if (forceStop) void store.action(forceStop.id, "kill");
          setForceStop(null);
        }}
        variant="danger"
      />
      <Dialog
        isOpen={visible && !!remove}
        title={t("containers.removeTitle")}
        message={t("containers.removeMessage", { name: remove?.name })}
        confirmLabel={t("containers.confirmRemove")}
        onCancel={() => setRemove(null)}
        onConfirm={() => {
          if (remove) void store.action(remove.id, "remove");
          setRemove(null);
        }}
        variant="danger"
      />
    </section>
  );
}
