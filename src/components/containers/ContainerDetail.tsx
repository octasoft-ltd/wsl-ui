import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useContainerStore } from "../../store/containerStore";
import { containerService } from "../../services/containerService";
import type { ContainerStats } from "../../types/containers";
import { ContainerLogsPanel } from "./ContainerLogsPanel";
import { ContainerForm } from "./ContainerForm";
import { ContainerBackupsPanel } from "./ContainerRecovery";
export function ContainerDetail({
  visible,
  queryActive,
  initialTab = "overview",
  onBack,
}: {
  visible: boolean;
  queryActive: boolean;
  initialTab?: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const {
    selectedId,
    detail,
    connection,
    detailLoading,
    detailError,
    busy,
    select,
    terminal,
  } = useContainerStore();
  const [stats, setStats] = useState<ContainerStats | null>(null);
  const [tab, setTab] = useState(initialTab);
  const [editing, setEditing] = useState(false);
  const [shell, setShell] = useState("/bin/sh");
  useEffect(() => {
    setTab(initialTab);
  }, [selectedId, initialTab]);
  useEffect(() => {
    if (!visible) return;
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !editing) onBack();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [visible, editing, onBack]);
  useEffect(() => {
    setStats(null);
    if (
      !queryActive ||
      tab !== "overview" ||
      !connection ||
      !detail ||
      detail.state !== "running"
    )
      return;
    const id = detail.id;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const result = await containerService.stats(connection, id);
        if (active) setStats(result);
      } catch (error) {
        useContainerStore.getState().reportReadError(connection, error);
        if (active) setStats(null);
      }
      if (active) timer = setTimeout(read, 5000);
    };
    void read();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [connection, detail?.id, detail?.state, tab, queryActive]);
  const configurationForDisplay =
    detail?.configuration ?? detail?.projectedConfiguration ?? null;
  if (!selectedId) return null;
  return (
    <aside
      aria-label={detail?.name || t("containers.details")}
      data-testid="container-detail"
      className="min-w-0 w-full xl:w-[440px] xl:shrink-0 bg-theme-bg-secondary rounded-xl border border-theme-border-secondary p-4 space-y-4 max-h-[75vh] overflow-auto"
    >
      <div className="flex flex-wrap justify-between gap-2">
        <Button size="sm" onClick={onBack}>
          {t("containers.back")}
        </Button>
        <Button
          size="sm"
          disabled={!connection || !!busy}
          onClick={() => select(selectedId)}
        >
          {t("containers.refreshDetail")}
        </Button>
      </div>
      <h2 className="text-lg font-semibold text-theme-text-primary break-words">
        {detail?.name || t("containers.loading")}
      </h2>
      <nav
        aria-label={t("containers.details")}
        className="flex flex-wrap gap-1"
      >
        {["overview", "logs", "configuration", "backups"].map((item) => (
          <Button
            key={item}
            size="sm"
            aria-pressed={tab === item}
            onClick={() => setTab(item)}
            data-testid={`container-tab-${item}`}
          >
            {t(`containers.${item}`)}
          </Button>
        ))}
      </nav>
      {detailError && (
        <p role="alert" className="text-theme-status-error break-words">
          {detailError}
        </p>
      )}
      {detailLoading && (
        <p className="text-theme-text-muted">{t("containers.loading")}</p>
      )}
      {detail && tab === "overview" && (
        <div className="space-y-4 text-sm text-theme-text-secondary">
          <dl className="space-y-2">
            {[
              [t("containers.cpuUsage"), stats?.cpuPercent],
              [t("containers.memoryUsage"), stats?.memoryUsage],
              [t("containers.state"), detail.rawState],
              [t("containers.health"), detail.health],
              [t("containers.image"), detail.image],
              [t("containers.ports"), detail.ports],
              [t("containers.data"), detail.mounts],
              [t("containers.exitCode"), detail.exitCode],
              [t("containers.lastError"), detail.lastError],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-theme-text-muted">{label}</dt>
                <dd className="break-words">
                  {value ?? t("containers.unavailable")}
                </dd>
              </div>
            ))}
          </dl>
          <details>
            <summary className="cursor-pointer">
              {t("containers.advanced")}
            </summary>
            <p className="break-all font-mono text-xs mt-2">
              {t("containers.id")}: {detail.id}
            </p>
            <p className="break-all text-xs">
              {t("containers.session")}:{" "}
              {connection?.sessionName || t("containers.unavailable")} (
              {connection?.sessionId})
            </p>
          </details>
          <Input
            label={t("containers.shell")}
            value={shell}
            onChange={(e) => setShell(e.target.value)}
          />
          <p className="text-xs text-theme-text-muted">
            {t("containers.terminalHint")}
          </p>
          <Button
            size="sm"
            disabled={!connection || detail.state !== "running" || !!busy}
            onClick={() => terminal(detail.id, shell)}
          >
            {t("containers.openTerminal")}
          </Button>
        </div>
      )}
      {detail && tab === "logs" && connection && (
        <ContainerLogsPanel
          connection={connection}
          id={detail.id}
          visible={queryActive}
        />
      )}
      {detail && tab === "configuration" && (
        <div className="space-y-4 text-sm text-theme-text-secondary">
          {(!detail.configuration || detail.unsupportedFields.length > 0) && (
            <div>
              <p>{t("containers.unsupportedConfig")}</p>
              {detail.configurationCoverageReason &&
                !detail.unsupportedFields.includes(
                  detail.configurationCoverageReason,
                ) && <p>{detail.configurationCoverageReason}</p>}
              <ul className="list-disc ps-5">
                {detail.unsupportedFields.map((field) => (
                  <li key={field}>{field}</li>
                ))}
              </ul>
            </div>
          )}
          {configurationForDisplay && (
            <dl className="space-y-2">
              <div>
                <dt>{t("containers.command")}</dt>
                <dd className="font-mono break-words">
                  {configurationForDisplay.command.join(" ") ||
                    t("containers.unavailable")}
                </dd>
              </div>
              <div>
                <dt>{t("containers.environment")}</dt>
                <dd className="break-words">
                  {configurationForDisplay.environment
                    .map((e) => `${e.key}=••••••`)
                    .join(", ") || t("containers.unavailable")}
                </dd>
              </div>
              <div>
                <dt>{t("containers.data")}</dt>
                <dd className="break-words">
                  {detail.dataMounts
                    .map(
                      (m) =>
                        `${m.source} → ${m.target}${m.readOnly ? " (ro)" : ""}`,
                    )
                    .join(", ") || t("containers.unavailable")}
                </dd>
              </div>
              <div>
                <dt>{t("containers.ports")}</dt>
                <dd className="break-words">
                  {detail.publishedPorts
                    .map(
                      (p) =>
                        `${p.hostIp}:${p.hostPort} → ${p.containerPort}/${p.protocol}`,
                    )
                    .join(", ") || t("containers.unavailable")}
                </dd>
              </div>
            </dl>
          )}
          <Button
            size="sm"
            disabled={
              !connection ||
              !!busy ||
              !detail.configuration ||
              detail.unsupportedFields.length > 0
            }
            onClick={() => setEditing(true)}
          >
            {t("containers.recreate")}
          </Button>
        </div>
      )}
      {detail && tab === "backups" && connection && (
        <ContainerBackupsPanel
          connection={connection}
          id={detail.id}
          name={detail.name}
          visible={queryActive}
        />
      )}
      {editing && visible && detail?.configuration && (
        <ContainerForm
          initial={detail.configuration}
          originalId={detail.id}
          onClose={() => setEditing(false)}
        />
      )}
    </aside>
  );
}
