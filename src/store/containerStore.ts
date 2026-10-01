import { create } from "zustand";
import {
  containerService,
  type ContainerService,
} from "../services/containerService";
import type {
  ContainerConnection,
  ContainerProbe,
  ContainerSummary,
  ContainerInspect,
  ContainerAction,
  ContainerCreateSpec,
  ContainerBackupResult,
  ContainerRestoreResult,
} from "../types/containers";
type RecoveryOutcome =
  | {
      kind: "backup";
      sessionName: string;
      sessionId: string;
      targetName: string;
      targetId: string;
      result: ContainerBackupResult;
    }
  | {
      kind: "restore";
      sessionName: string;
      sessionId: string;
      targetName: string;
      result: ContainerRestoreResult;
    };
interface ContainerStore {
  recoveryOutcome: RecoveryOutcome | null;
  clearRecoveryOutcome: () => void;
  probeResult: ContainerProbe | null;
  connection: ContainerConnection | null;
  containers: ContainerSummary[];
  isLoading: boolean;
  busy: string | null;
  error: string | null;
  operationError: string | null;
  selectedId: string | null;
  detail: ContainerInspect | null;
  detailLoading: boolean;
  detailError: string | null;
  failedAction: { id: string; action: ContainerAction } | null;
  search: string;
  filter: string;
  updatedAt: number | null;
  probe: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => void;
  reportReadError: (connection: ContainerConnection, error: unknown) => void;
  refresh: () => Promise<void>;
  select: (id: string | null) => Promise<void>;
  action: (id: string, action: ContainerAction) => Promise<void>;
  create: (spec: ContainerCreateSpec, originalId?: string) => Promise<boolean>;
  terminal: (id: string, executable?: string, args?: string[]) => Promise<void>;
  backup: (id: string, path: string) => Promise<ContainerBackupResult | null>;
  restore: (
    path: string,
    name: string,
  ) => Promise<ContainerRestoreResult | null>;
  setSearch: (value: string) => void;
  setFilter: (value: string) => void;
  clearOperationError: () => void;
}
function message(error: unknown) {
  return typeof error === "object" && error && "message" in error
    ? String(error.message)
    : String(error);
}
export function createContainerStore(
  service: ContainerService = containerService,
) {
  let epoch = 0;
  let detailRequest = 0;
  let probing: Promise<void> | null = null;
  let refreshing: { epoch: number; promise: Promise<void> } | null = null;
  return create<ContainerStore>((set, get) => {
    const current = (captured: number) => captured === epoch;
    const fail = (
      error: unknown,
      captured: number,
      field: "error" | "operationError" | "detailError",
    ) => {
      if (!current(captured)) return;
      const code =
        typeof error === "object" && error && "code" in error
          ? String(error.code)
          : "";
      if (
        [
          "sessionLost",
          "runtimeUnavailable",
          "mutationOutcomeUnknown",
        ].includes(code)
      ) {
        epoch++;
        refreshing = null;
        set({
          connection: null,
          selectedId: null,
          detail: null,
          isLoading: false,
          detailLoading: false,
          error: message(error),
        });
      } else set({ [field]: message(error) });
    };
    return {
      reportReadError: (connection, error) => {
        if (get().connection !== connection) return;
        const code =
          typeof error === "object" && error && "code" in error
            ? String(error.code)
            : "";
        if (
          [
            "sessionLost",
            "runtimeUnavailable",
            "mutationOutcomeUnknown",
          ].includes(code)
        ) {
          fail(error, epoch, "error");
        }
      },
      recoveryOutcome: null,
      clearRecoveryOutcome: () => set({ recoveryOutcome: null }),
      probeResult: null,
      connection: null,
      containers: [],
      isLoading: false,
      busy: null,
      error: null,
      operationError: null,
      selectedId: null,
      detail: null,
      detailLoading: false,
      detailError: null,
      failedAction: null,
      search: "",
      filter: "all",
      updatedAt: null,
      setSearch: (search) => set({ search }),
      setFilter: (filter) => set({ filter }),
      clearOperationError: () =>
        set({ operationError: null, failedAction: null }),
      probe: () => {
        if (probing) return probing;
        const captured = epoch;
        probing = (async () => {
          try {
            const probeResult = await service.probe();
            if (current(captured)) set({ probeResult });
          } catch (e) {
            fail(e, captured, "error");
          } finally {
            probing = null;
          }
        })();
        return probing;
      },
      disconnect: () => {
        epoch++;
        refreshing = null;
        set({
          connection: null,
          selectedId: null,
          detail: null,
          isLoading: false,
          detailLoading: false,
        });
      },
      connect: async () => {
        if (get().isLoading || get().busy) return;
        const captured = ++epoch;
        refreshing = null;
        set({
          isLoading: true,
          error: null,
          operationError: null,
          connection: null,
        });
        try {
          const connection = await service.connect();
          if (!current(captured)) return;
          set({ connection });
          await get().refresh();
        } catch (e) {
          fail(e, captured, "error");
        } finally {
          if (current(captured)) set({ isLoading: false });
        }
      },
      refresh: () => {
        const connection = get().connection;
        const captured = epoch;
        if (!connection || get().busy) return Promise.resolve();
        if (refreshing?.epoch === captured) return refreshing.promise;
        set({ isLoading: true });
        const promise = (async () => {
          try {
            const containers = await service.list(connection);
            if (!current(captured)) return;
            set({ containers, error: null, updatedAt: Date.now() });
            if (
              get().selectedId &&
              !containers.some((c) => c.id === get().selectedId)
            )
              set({ selectedId: null, detail: null });
            else if (get().selectedId) {
              const id = get().selectedId!;
              const request = ++detailRequest;
              try {
                const detail = await service.inspect(connection, id);
                if (
                  current(captured) &&
                  get().selectedId === id &&
                  request === detailRequest
                )
                  set({ detail, detailError: null, detailLoading: false });
              } catch (e) {
                if (
                  current(captured) &&
                  get().selectedId === id &&
                  request === detailRequest
                ) {
                  set({ detail: null, detailLoading: false });
                  fail(e, captured, "detailError");
                }
              }
            }
          } catch (e) {
            fail(e, captured, "error");
          } finally {
            if (current(captured)) {
              set({ isLoading: false });
              refreshing = null;
            }
          }
        })();
        refreshing = { epoch: captured, promise };
        return promise;
      },
      select: async (selectedId) => {
        const request = ++detailRequest;
        set({ selectedId, detail: null, detailError: null });
        if (!selectedId || !get().connection) return;
        const captured = epoch;
        const connection = get().connection!;
        set({ detailLoading: true });
        try {
          const detail = await service.inspect(connection, selectedId);
          if (
            current(captured) &&
            get().selectedId === selectedId &&
            request === detailRequest
          )
            set({ detail });
        } catch (e) {
          if (get().selectedId === selectedId && request === detailRequest)
            fail(e, captured, "detailError");
        } finally {
          if (
            current(captured) &&
            get().selectedId === selectedId &&
            request === detailRequest
          )
            set({ detailLoading: false });
        }
      },
      action: async (id, action) => {
        const connection = get().connection;
        if (!connection || get().busy || get().isLoading) return;
        const captured = epoch;
        detailRequest++;
        set({
          busy: `${action}:${id}`,
          operationError: null,
          failedAction: null,
        });
        try {
          const result = await service.action(connection, id, action);
          if (!current(captured)) return;
          set({ operationError: result.warning });
          if (result.container && get().selectedId === id) {
            detailRequest++;
            set({ detail: result.container, detailLoading: false });
          }
          if (action === "remove" && get().selectedId === id)
            set({ selectedId: null, detail: null });
        } catch (e) {
          fail(e, captured, "operationError");
          if (current(captured)) set({ failedAction: { id, action } });
        } finally {
          set({ busy: null });
        }
        if (current(captured)) await get().refresh();
      },
      create: async (spec, originalId) => {
        const connection = get().connection;
        if (!connection || get().busy || get().isLoading) return false;
        const captured = epoch;
        let success = false;
        set({ busy: originalId ? "recreate" : "create", operationError: null });
        try {
          const result = originalId
            ? await service.recreate(connection, originalId, spec)
            : await service.create(connection, spec);
          if (!current(captured)) return false;
          set({ operationError: result.warning });
          success = true;
        } catch (e) {
          fail(e, captured, "operationError");
        } finally {
          set({ busy: null });
        }
        if (current(captured)) await get().refresh();
        return success;
      },
      backup: async (id, path) => {
        const connection = get().connection;
        if (!connection || get().busy || get().isLoading) return null;
        const captured = epoch;
        set({ busy: "backup", operationError: null });
        try {
          const targetName =
            get().containers.find((c) => c.id === id)?.name || id;
          const result = await service.backup(connection, id, path);
          set({
            recoveryOutcome: {
              kind: "backup",
              sessionName: connection.sessionName,
              sessionId: connection.sessionId,
              targetName,
              targetId: id,
              result,
            },
          });
          return current(captured) ? result : null;
        } catch (e) {
          fail(e, captured, "operationError");
          return null;
        } finally {
          set({ busy: null });
        }
      },
      restore: async (path, name) => {
        const connection = get().connection;
        if (!connection || get().busy || get().isLoading) return null;
        const captured = epoch;
        set({ busy: "restore", operationError: null });
        let result = null;
        try {
          result = await service.restore(connection, path, name);
          set({
            recoveryOutcome: {
              kind: "restore",
              sessionName: connection.sessionName,
              sessionId: connection.sessionId,
              targetName: result.name,
              result,
            },
          });
          if (!current(captured)) return null;
        } catch (e) {
          fail(e, captured, "operationError");
        } finally {
          set({ busy: null });
        }
        if (current(captured)) await get().refresh();
        return result;
      },
      terminal: async (id, executable = "/bin/sh", args = []) => {
        const connection = get().connection;
        if (!connection || get().busy || get().isLoading) return;
        const captured = epoch;
        set({ busy: `terminal:${id}`, operationError: null });
        try {
          await service.terminal(connection, id, { executable, args });
        } catch (e) {
          fail(e, captured, "operationError");
        } finally {
          set({ busy: null });
        }
      },
    };
  });
}
export const useContainerStore = createContainerStore();
