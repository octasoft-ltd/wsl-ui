import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { Button } from "../ui/Button";
import { useContainerStore } from "../../store/containerStore";
import { containerService } from "../../services/containerService";
import type { ContainerConnection } from "../../types/containers";
const LIMIT = 256 * 1024;
export function ContainerLogsPanel({
  connection,
  id,
  visible,
}: {
  connection: ContainerConnection;
  id: string;
  visible: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [follow, setFollow] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [copied, setCopied] = useState(false);
  const displayGeneration = useRef(0);
  const loaded = useRef<string | null>(null);
  useEffect(() => {
    if (!visible) return;
    const key = `${connection.sessionName}:${connection.sessionId}:${id}`;
    if (!follow && loaded.current === key) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      const generation = displayGeneration.current;
      try {
        const result = await containerService.logs(connection, id, 200);
        if (!active || generation !== displayGeneration.current) return;
        loaded.current = key;
        setText(result.text.slice(-LIMIT));
        setTruncated(result.truncated || result.text.length > LIMIT);
        setError(null);
      } catch (e) {
        useContainerStore.getState().reportReadError(connection, e);
        if (active) {
          setError(
            typeof e === "object" && e && "message" in e
              ? String(e.message)
              : String(e),
          );
          setFollow(false);
        }
      }
      if (active && follow) timer = setTimeout(read, 2000);
    };
    void read();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [connection, id, follow, visible]);
  const saveLogs = async () => {
    try {
      const path = await save({
        defaultPath: "container.log",
        filters: [{ name: "Log", extensions: ["log", "txt"] }],
      });
      if (path) await writeTextFile(path, text);
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <div className="space-y-3" data-testid="container-logs-panel">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          onClick={() => setFollow(!follow)}
          aria-pressed={follow}
          data-testid="container-logs-follow"
        >
          {t(follow ? "containers.pause" : "containers.follow")}
        </Button>
        <Button
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch (e) {
              setError(String(e));
            }
          }}
          disabled={!text}
        >
          {t(copied ? "containers.copied" : "containers.copy")}
        </Button>
        <Button size="sm" onClick={saveLogs} disabled={!text}>
          {t("containers.saveLogs")}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            displayGeneration.current++;
            loaded.current = `${connection.sessionName}:${connection.sessionId}:${id}`;
            setFollow(false);
            setText("");
          }}
        >
          {t("containers.clear")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-theme-status-error break-words">
          {error}
        </p>
      )}
      {truncated && (
        <p className="text-xs text-theme-text-muted">
          {t("containers.truncated")}
        </p>
      )}
      <pre
        data-testid="container-log-output"
        className="max-h-[45vh] overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-theme-text-secondary bg-theme-bg-primary p-3 rounded-lg"
      >
        {text || t("containers.emptyLogs")}
      </pre>
    </div>
  );
}
