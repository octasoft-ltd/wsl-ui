import { invoke } from "@tauri-apps/api/core";
import type {
  ContainerConnection,
  ContainerProbe,
  ContainerSummary,
  ContainerInspect,
  ContainerAction,
  ContainerMutationResult,
  ContainerCreateSpec,
  ContainerLogs,
  ContainerTerminalRequest,
  ContainerBackupCoverage,
  ContainerBackupResult,
  ContainerRestoreResult,
  ContainerStats,
} from "../types/containers";
export const containerService = {
  backupPreflight: (connection: ContainerConnection, id: string) =>
    invoke<ContainerBackupCoverage>("container_backup_preflight", {
      connection,
      id,
    }),
  backup: (connection: ContainerConnection, id: string, path: string) =>
    invoke<ContainerBackupResult>("container_backup", { connection, id, path }),
  restore: (connection: ContainerConnection, path: string, name: string) =>
    invoke<ContainerRestoreResult>("container_restore", {
      connection,
      path,
      name,
    }),
  stats: (connection: ContainerConnection, id: string) =>
    invoke<ContainerStats>("container_stats", { connection, id }),
  probe: () => invoke<ContainerProbe>("container_probe"),
  connect: () => invoke<ContainerConnection>("container_connect"),
  list: (connection: ContainerConnection) =>
    invoke<ContainerSummary[]>("container_list", { connection }),
  inspect: (connection: ContainerConnection, id: string) =>
    invoke<ContainerInspect>("container_inspect", { connection, id }),
  action: (
    connection: ContainerConnection,
    id: string,
    action: ContainerAction,
  ) =>
    invoke<ContainerMutationResult>("container_action", {
      connection,
      id,
      action,
    }),
  create: (connection: ContainerConnection, spec: ContainerCreateSpec) =>
    invoke<ContainerMutationResult>("container_create", { connection, spec }),
  recreate: (
    connection: ContainerConnection,
    id: string,
    spec: ContainerCreateSpec,
  ) =>
    invoke<ContainerMutationResult>("container_recreate", {
      connection,
      id,
      spec,
    }),
  logs: (connection: ContainerConnection, id: string, tail = 200) =>
    invoke<ContainerLogs>("container_logs", { connection, id, tail }),
  terminal: (
    connection: ContainerConnection,
    id: string,
    request: ContainerTerminalRequest,
  ) => invoke<void>("container_terminal", { connection, id, request }),
};
export type ContainerService = typeof containerService;
