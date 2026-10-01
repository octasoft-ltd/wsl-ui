import { useState, useId } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "../ui/Button";
import { Input, Select, TextArea } from "../ui/Input";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "../ui/Modal";
import type { ContainerCreateSpec } from "../../types/containers";
import { useContainerStore } from "../../store/containerStore";
const empty: ContainerCreateSpec = {
  name: "",
  image: "",
  start: true,
  ports: [],
  mounts: [],
  environment: [],
  command: [],
  entrypoint: null,
  workingDirectory: null,
  user: null,
  cpus: null,
  memoryMb: null,
};
export function ContainerForm({
  initial,
  originalId,
  onClose,
}: {
  initial?: ContainerCreateSpec;
  originalId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [spec, setSpec] = useState<ContainerCreateSpec>(() =>
    initial
      ? { ...structuredClone(initial), name: `${initial.name}-updated` }
      : structuredClone(empty),
  );
  const [commandText, setCommandText] = useState(
    () => initial?.command.join("\n") ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const { create, busy, operationError } = useContainerStore();
  const update = <K extends keyof ContainerCreateSpec>(
    key: K,
    value: ContainerCreateSpec[K],
  ) => setSpec((s) => ({ ...s, [key]: value }));
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !spec.name.trim() ||
      !spec.image.trim() ||
      spec.ports.some(
        (p) =>
          !Number.isInteger(p.hostPort) ||
          !Number.isInteger(p.containerPort) ||
          p.hostPort < 1 ||
          p.hostPort > 65535 ||
          p.containerPort < 1 ||
          p.containerPort > 65535,
      ) ||
      spec.mounts.some((m) => !m.source || !m.target.startsWith("/"))
    ) {
      setError(t("containers.validation"));
      return;
    }
    if (initial && spec.name === initial.name) {
      setError(t("containers.newName"));
      return;
    }
    setError(null);
    if (
      await create(
        {
          ...spec,
          command: commandText === "" ? [] : commandText.split("\n"),
          environment: spec.environment.filter((e) => e.key || e.value),
        },
        originalId,
      )
    )
      onClose();
  };
  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      labelledBy={titleId}
      className="max-h-[90vh] overflow-y-auto"
    >
      <form onSubmit={submit} data-testid="container-create-form">
        <ModalHeader
          titleId={titleId}
          title={t(
            originalId ? "containers.recreateTitle" : "containers.createTitle",
          )}
          onClose={onClose}
        />
        <ModalBody className="space-y-4">
          {(error || operationError) && (
            <p role="alert" className="text-theme-status-error break-words">
              {error || operationError}
            </p>
          )}
          <fieldset disabled={!!busy} className="space-y-4">
            {originalId && (
              <label className="flex gap-2 text-sm text-theme-text-secondary">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                />
                {t("containers.recreateHint")}
              </label>
            )}
            <Input
              label={t("containers.name")}
              data-testid="container-create-name"
              value={spec.name}
              onChange={(e) => update("name", e.target.value)}
              required
            />
            <Input
              label={t("containers.image")}
              data-testid="container-create-image"
              value={spec.image}
              onChange={(e) => update("image", e.target.value)}
              required
            />
            <label className="flex items-center gap-2 text-sm text-theme-text-secondary">
              <input
                type="checkbox"
                checked={spec.start}
                onChange={(e) => update("start", e.target.checked)}
              />
              {t("containers.startAfter")}
            </label>
            <details open={spec.ports.length > 0}>
              <summary className="cursor-pointer text-theme-text-primary">
                {t("containers.ports")}
              </summary>
              <div className="space-y-3 mt-3">
                {spec.ports.map((port, index) => (
                  <div
                    key={index}
                    className="grid grid-cols-2 gap-2 rounded-lg border border-theme-border-secondary p-3"
                  >
                    <Input
                      label={`${t("containers.hostAddress")} ${index + 1}`}
                      value={port.hostIp}
                      onChange={(e) =>
                        update(
                          "ports",
                          spec.ports.map((p, i) =>
                            i === index ? { ...p, hostIp: e.target.value } : p,
                          ),
                        )
                      }
                    />
                    <Select
                      label={`${t("containers.protocol")} ${index + 1}`}
                      value={port.protocol}
                      options={[
                        { value: "tcp", label: "TCP" },
                        { value: "udp", label: "UDP" },
                      ]}
                      onChange={(e) =>
                        update(
                          "ports",
                          spec.ports.map((p, i) =>
                            i === index
                              ? {
                                  ...p,
                                  protocol: e.target.value as "tcp" | "udp",
                                }
                              : p,
                          ),
                        )
                      }
                    />
                    <Input
                      label={`${t("containers.hostPort")} ${index + 1}`}
                      type="number"
                      min={1}
                      max={65535}
                      value={port.hostPort || ""}
                      onChange={(e) =>
                        update(
                          "ports",
                          spec.ports.map((p, i) =>
                            i === index
                              ? { ...p, hostPort: Number(e.target.value) }
                              : p,
                          ),
                        )
                      }
                    />
                    <Input
                      label={`${t("containers.containerPort")} ${index + 1}`}
                      type="number"
                      min={1}
                      max={65535}
                      value={port.containerPort || ""}
                      onChange={(e) =>
                        update(
                          "ports",
                          spec.ports.map((p, i) =>
                            i === index
                              ? { ...p, containerPort: Number(e.target.value) }
                              : p,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        update(
                          "ports",
                          spec.ports.filter((_, i) => i !== index),
                        )
                      }
                    >
                      {t("containers.deleteRow")}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    update("ports", [
                      ...spec.ports,
                      {
                        hostIp: "127.0.0.1",
                        hostPort: 0,
                        containerPort: 0,
                        protocol: "tcp",
                      },
                    ])
                  }
                >
                  {t("containers.addPort")}
                </Button>
              </div>
            </details>
            <details open={spec.mounts.length > 0}>
              <summary className="cursor-pointer text-theme-text-primary">
                {t("containers.data")}
              </summary>
              <div className="space-y-3 mt-3">
                {spec.mounts.map((mount, index) => (
                  <div
                    key={index}
                    className="space-y-2 rounded-lg border border-theme-border-secondary p-3"
                  >
                    <Select
                      label={`${t("containers.mountKind")} ${index + 1}`}
                      value={mount.kind}
                      options={[
                        { value: "volume", label: t("containers.volume") },
                        { value: "bind", label: t("containers.bind") },
                      ]}
                      onChange={(e) =>
                        update(
                          "mounts",
                          spec.mounts.map((m, i) =>
                            i === index
                              ? {
                                  ...m,
                                  kind: e.target.value,
                                  readOnly: e.target.value === "bind",
                                  name: null,
                                }
                              : m,
                          ),
                        )
                      }
                    />
                    <Input
                      label={`${t("containers.source")} ${index + 1}`}
                      value={mount.source}
                      onChange={(e) =>
                        update(
                          "mounts",
                          spec.mounts.map((m, i) =>
                            i === index
                              ? {
                                  ...m,
                                  source: e.target.value,
                                  name:
                                    m.kind === "volume" ? e.target.value : null,
                                }
                              : m,
                          ),
                        )
                      }
                    />
                    {mount.kind === "bind" && (
                      <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                          const selected = await open({
                            directory: true,
                            multiple: false,
                          });
                          if (typeof selected === "string")
                            update(
                              "mounts",
                              spec.mounts.map((m, i) =>
                                i === index ? { ...m, source: selected } : m,
                              ),
                            );
                        }}
                      >
                        {t("containers.chooseFolder")}
                      </Button>
                    )}
                    <Input
                      label={`${t("containers.target")} ${index + 1}`}
                      value={mount.target}
                      onChange={(e) =>
                        update(
                          "mounts",
                          spec.mounts.map((m, i) =>
                            i === index ? { ...m, target: e.target.value } : m,
                          ),
                        )
                      }
                    />
                    <label className="flex gap-2 text-sm text-theme-text-secondary">
                      <input
                        type="checkbox"
                        checked={mount.readOnly}
                        onChange={(e) =>
                          update(
                            "mounts",
                            spec.mounts.map((m, i) =>
                              i === index
                                ? { ...m, readOnly: e.target.checked }
                                : m,
                            ),
                          )
                        }
                      />
                      {t("containers.readOnly")}
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        update(
                          "mounts",
                          spec.mounts.filter((_, i) => i !== index),
                        )
                      }
                    >
                      {t("containers.deleteRow")}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    update("mounts", [
                      ...spec.mounts,
                      {
                        kind: "volume",
                        source: "",
                        target: "",
                        readOnly: false,
                        name: null,
                      },
                    ])
                  }
                >
                  {t("containers.addMount")}
                </Button>
              </div>
            </details>
            <details open={spec.environment.length > 0}>
              <summary className="cursor-pointer text-theme-text-primary">
                {t("containers.environment")}
              </summary>
              <div className="space-y-3 mt-3">
                {spec.environment.map((variable, index) => (
                  <div key={index} className="grid grid-cols-2 gap-2">
                    <Input
                      label={`${t("containers.key")} ${index + 1}`}
                      value={variable.key}
                      onChange={(e) =>
                        update(
                          "environment",
                          spec.environment.map((v, i) =>
                            i === index ? { ...v, key: e.target.value } : v,
                          ),
                        )
                      }
                    />
                    <Input
                      label={`${t("containers.value")} ${index + 1}`}
                      type="password"
                      autoComplete="off"
                      value={variable.value}
                      onChange={(e) =>
                        update(
                          "environment",
                          spec.environment.map((v, i) =>
                            i === index ? { ...v, value: e.target.value } : v,
                          ),
                        )
                      }
                    />
                    <Button
                      type="button"
                      size="sm"
                      onClick={() =>
                        update(
                          "environment",
                          spec.environment.filter((_, i) => i !== index),
                        )
                      }
                    >
                      {t("containers.deleteRow")}
                    </Button>
                  </div>
                ))}
                <Button
                  type="button"
                  size="sm"
                  onClick={() =>
                    update("environment", [
                      ...spec.environment,
                      { key: "", value: "" },
                    ])
                  }
                >
                  {t("containers.addVariable")}
                </Button>
              </div>
            </details>
            <details>
              <summary className="cursor-pointer text-theme-text-primary">
                {t("containers.advanced")}
              </summary>
              <div className="space-y-3 mt-3">
                <TextArea
                  label={t("containers.command")}
                  value={commandText}
                  onChange={(e) => setCommandText(e.target.value)}
                />
                {(["entrypoint", "workingDirectory", "user"] as const).map(
                  (key) => (
                    <Input
                      key={key}
                      label={t(`containers.${key}`)}
                      value={spec[key] ?? ""}
                      onChange={(e) => update(key, e.target.value || null)}
                    />
                  ),
                )}
                <Input
                  label={t("containers.cpus")}
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={spec.cpus ?? ""}
                  onChange={(e) =>
                    update(
                      "cpus",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
                <Input
                  label={t("containers.memory")}
                  type="number"
                  min="1"
                  value={spec.memoryMb ?? ""}
                  onChange={(e) =>
                    update(
                      "memoryMb",
                      e.target.value ? Number(e.target.value) : null,
                    )
                  }
                />
              </div>
            </details>
          </fieldset>
        </ModalBody>
        <ModalFooter>
          <Button type="button" variant="secondary" onClick={onClose}>
            {t("containers.cancel")}
          </Button>
          <Button
            data-testid="container-create-submit"
            type="submit"
            loading={!!busy}
            disabled={!!busy || (!!originalId && !acknowledged)}
          >
            {t(originalId ? "containers.recreate" : "containers.createSubmit")}
          </Button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
