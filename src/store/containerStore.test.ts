import { describe, it, expect, vi } from "vitest";
import type {
  ContainerConnection,
  ContainerSummary,
  ContainerInspect,
} from "../types/containers";
const connection: ContainerConnection = {
  sessionName: "default",
  sessionId: "session-a",
  runtimeVersion: "3.0.1",
};
const external: ContainerSummary = {
  id: "a".repeat(64),
  name: "external-web",
  image: "nginx:stable",
  state: "running",
  rawState: "running",
  status: "Up",
  health: null,
  origin: "external",
  ports: "127.0.0.1:8080->80/tcp",
  mounts: "",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
async function makeStore(overrides = {}) {
  const mod = await import("./containerStore").catch(() => null);
  expect(
    mod?.createContainerStore,
    "container state is implemented",
  ).toBeTypeOf("function");
  const service = {
    probe: vi.fn().mockResolvedValue({
      available: true,
      supported: true,
      runtimeVersion: "3.0.1",
      reason: null,
    }),
    connect: vi.fn().mockResolvedValue(connection),
    list: vi.fn().mockResolvedValue([external]),
    inspect: vi.fn(),
    action: vi.fn(),
    create: vi.fn(),
    recreate: vi.fn(),
    logs: vi.fn(),
    terminal: vi.fn(),
    stats: vi.fn(),
    backupPreflight: vi.fn(),
    backup: vi.fn(),
    restore: vi.fn(),
    ...overrides,
  };
  return { store: mod!.createContainerStore(service), service };
}
describe("container state boundaries", () => {
  it("keeps background refresh quiet while retaining the current inventory", async () => {
    const pending = deferred<ContainerSummary[]>();
    const { store, service } = await makeStore();
    await store.getState().connect();
    service.list.mockReturnValueOnce(pending.promise);
    const refresh = store.getState().refresh();
    expect(store.getState().isLoading).toBe(false);
    expect(store.getState().containers).toEqual([external]);
    pending.resolve([{ ...external, state: "exited" }]);
    await refresh;
    expect(store.getState().containers[0].state).toBe("exited");
  });
  it.each([false, true])(
    "allows actions during a refresh and discards its stale result (error: %s)",
    async (error) => {
      const pending = deferred<ContainerSummary[]>();
      const stopped = { ...external, state: "exited" as const };
      const { store, service } = await makeStore({
        action: vi.fn().mockResolvedValue({ container: null, warning: null }),
      });
      await store.getState().connect();
      service.list
        .mockReturnValueOnce(
          pending.promise.then((rows) => {
            if (error)
              throw { code: "sessionLost", message: "Obsolete read failure" };
            return rows;
          }),
        )
        .mockResolvedValue([stopped]);
      const oldRead = store.getState().refresh();
      await store.getState().action(external.id, "stop");
      expect(store.getState().containers[0].state).toBe("exited");
      pending.resolve([external]);
      await oldRead;
      expect(store.getState().containers[0].state).toBe("exited");
      expect(store.getState().connection).toEqual(connection);
      expect(store.getState().error).toBeNull();
    },
  );
  it("closes details after confirmed removal", async () => {
    const { store, service } = await makeStore({
      action: vi.fn().mockResolvedValue({ container: null, warning: null }),
    });
    await store.getState().connect();
    store.setState({ selectedId: external.id });
    service.list.mockResolvedValue([]);
    await store.getState().action(external.id, "stopAndRemove");
    expect(store.getState().selectedId).toBeNull();
    expect(store.getState().containers).toEqual([]);
    expect(store.getState().operationError).toBeNull();
  });
  it("does no discovery until requested and never connects from probe or refresh", async () => {
    const { store, service } = await makeStore();
    expect(service.probe).not.toHaveBeenCalled();
    await store.getState().refresh();
    await store.getState().probe();
    expect(service.connect).not.toHaveBeenCalled();
    expect(service.list).not.toHaveBeenCalled();
    expect(store.getState().probeResult?.supported).toBe(true);
  });
  it("explicit connection includes containers created elsewhere", async () => {
    const { store } = await makeStore();
    await store.getState().connect();
    expect(store.getState().containers[0]).toMatchObject({
      name: "external-web",
      origin: "external",
    });
    expect(store.getState().connection).toEqual(connection);
  });
  it("retains inventory and reports a failed operation separately from loading", async () => {
    const { store } = await makeStore({
      action: vi
        .fn()
        .mockRejectedValue({ code: "commandFailed", message: "Stop failed" }),
    });
    await store.getState().connect();
    await store.getState().action(external.id, "stop");
    expect(store.getState().containers).toEqual([external]);
    expect(store.getState().operationError).toBe("Stop failed");
    expect(store.getState().busy).toBeNull();
    expect(store.getState().isLoading).toBe(false);
  });
  it("keeps recovery operation busy independently of connection refresh", async () => {
    const pending = deferred<{
      path: string;
      bytes: number;
      manifestVersion: number;
    }>();
    const { store, service } = await makeStore({
      backup: vi.fn().mockReturnValue(pending.promise),
    });
    await store.getState().connect();
    const operation = store
      .getState()
      .backup(external.id, "C:\\backup.wslcbackup");
    expect(store.getState().busy).toBe("backup");
    await store.getState().refresh();
    expect(service.list).toHaveBeenCalledTimes(1);
    pending.resolve({
      path: "C:\\backup.wslcbackup",
      bytes: 32,
      manifestVersion: 1,
    });
    await operation;
    expect(store.getState().busy).toBeNull();
  });
  it("serializes concurrent refreshes", async () => {
    const pending = deferred<ContainerSummary[]>();
    const { store, service } = await makeStore();
    await store.getState().connect();
    service.list.mockReturnValue(pending.promise);
    const first = store.getState().refresh();
    const second = store.getState().refresh();
    pending.resolve([external]);
    await Promise.all([first, second]);
    expect(service.list).toHaveBeenCalledTimes(2);
    expect(store.getState().containers).toEqual([external]);
  });
  it("rejects stale inventory after a new connection replaces the session", async () => {
    const pending = deferred<ContainerSummary[]>();
    const { store, service } = await makeStore();
    await store.getState().connect();
    service.list.mockReturnValueOnce(pending.promise);
    const stale = store.getState().refresh();
    store.getState().disconnect();
    service.connect.mockResolvedValue({
      ...connection,
      sessionId: "session-b",
    });
    service.list.mockResolvedValueOnce([]);
    await store.getState().connect();
    pending.resolve([external]);
    await stale;
    expect(store.getState().connection?.sessionId).toBe("session-b");
    expect(store.getState().containers).toEqual([]);
  });
  it("reconciles open details after an external stop and clears them when disconnected", async () => {
    const running = {
      ...external,
      imageId: "sha256:image",
      publishedPorts: [],
      dataMounts: [],
      exitCode: null,
      lastError: null,
      configuration: null,
      unsupportedFields: [],
    };
    const { store, service } = await makeStore({
      inspect: vi.fn().mockResolvedValue(running),
    });
    await store.getState().connect();
    await store.getState().select(external.id);
    service.list.mockResolvedValue([
      { ...external, state: "exited", rawState: "exited" },
    ]);
    service.inspect.mockResolvedValue({
      ...running,
      state: "exited",
      rawState: "exited",
      exitCode: 42,
    });
    await store.getState().refresh();
    expect(store.getState().detail?.exitCode).toBe(42);
    store.getState().disconnect();
    expect(store.getState().detail).toBeNull();
    expect(store.getState().selectedId).toBeNull();
  });
  it("rejects older same-session inspect replies after A to B to A selection", async () => {
    const first = deferred<any>();
    const latest = deferred<any>();
    const middle = deferred<any>();
    const { store } = await makeStore({
      inspect: vi
        .fn()
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(middle.promise)
        .mockReturnValueOnce(latest.promise),
    });
    await store.getState().connect();
    const oldRead = store.getState().select(external.id);
    const midRead = store.getState().select("b".repeat(64));
    const newRead = store.getState().select(external.id);
    latest.resolve({ ...external, exitCode: 42 });
    await newRead;
    first.resolve({ ...external, exitCode: null });
    await oldRead;
    middle.resolve({ ...external, id: "b".repeat(64) });
    await midRead;
    expect(store.getState().detail?.exitCode).toBe(42);
  });
  it("keeps completed backup context and restore warnings in application state", async () => {
    const pending = deferred<{
      path: string;
      bytes: number;
      manifestVersion: number;
    }>();
    const { store } = await makeStore({
      backup: vi.fn().mockReturnValue(pending.promise),
      restore: vi.fn().mockResolvedValue({
        containerId: "new-id",
        name: "restored",
        volumeNames: ["fresh-data"],
        warning: "Review the restored environment",
      }),
    });
    await store.getState().connect();
    const operation = store
      .getState()
      .backup(external.id, "C:\\backup.wslcbackup");
    await store.getState().select(null);
    pending.resolve({
      path: "C:\\backup.wslcbackup",
      bytes: 32,
      manifestVersion: 1,
    });
    await operation;
    expect(store.getState().recoveryOutcome).toMatchObject({
      kind: "backup",
      sessionName: "default",
      targetName: "external-web",
      result: { path: "C:\\backup.wslcbackup" },
    });
    await store.getState().restore("C:\\backup.wslcbackup", "restored");
    expect(store.getState().recoveryOutcome).toMatchObject({
      kind: "restore",
      targetName: "restored",
      result: {
        containerId: "new-id",
        volumeNames: ["fresh-data"],
        warning: "Review the restored environment",
      },
    });
  });
  it.each([true, false])(
    "clears detail loading when periodic inspect supersedes selection, successful: %s",
    async (success) => {
      const first = deferred<ContainerInspect>();
      const current: ContainerInspect = {
        ...external,
        imageId: "sha256:image",
        publishedPorts: [],
        dataMounts: [],
        exitCode: 42,
        lastError: null,
        configuration: null,
        unsupportedFields: [],
      };
      const inspect = vi.fn().mockReturnValueOnce(first.promise);
      if (success) inspect.mockResolvedValueOnce(current);
      else
        inspect.mockRejectedValueOnce({
          code: "commandFailed",
          message: "Inspect failed",
        });
      const { store } = await makeStore({ inspect });
      await store.getState().connect();
      const oldRead = store.getState().select(external.id);
      expect(store.getState().detailLoading).toBe(true);
      await store.getState().refresh();
      expect(store.getState().detailLoading).toBe(false);
      if (success) expect(store.getState().detail?.exitCode).toBe(42);
      else expect(store.getState().detailError).toBe("Inspect failed");
      first.resolve({ ...current, exitCode: null });
      await oldRead;
      expect(store.getState().detailLoading).toBe(false);
    },
  );
  it("disconnects after uncertain mutation outcome and retains rows without retrying", async () => {
    const { store, service } = await makeStore({
      action: vi.fn().mockRejectedValue({
        code: "mutationOutcomeUnknown",
        message:
          "Session changed during mutation; outcome is unknown. Reconnect and inspect before retrying.",
      }),
    });
    await store.getState().connect();
    await store.getState().action(external.id, "stop");
    expect(store.getState().connection).toBeNull();
    expect(store.getState().containers).toEqual([external]);
    expect(store.getState().error).toContain("outcome is unknown");
    await store.getState().action(external.id, "stop");
    expect(service.action).toHaveBeenCalledTimes(1);
  });
  it("ignores lost-session read errors from a superseded connection", async () => {
    const { store, service } = await makeStore();
    await store.getState().connect();
    const captured = store.getState().connection!;
    store.getState().disconnect();
    service.connect.mockResolvedValueOnce({
      ...connection,
      sessionId: "session-b",
    });
    await store.getState().connect();
    store.getState().reportReadError(captured, {
      code: "sessionLost",
      message: "Old session vanished",
    });
    expect(store.getState().connection?.sessionId).toBe("session-b");
    expect(store.getState().error).toBeNull();
  });
  it("retains stale rows but disables writes on session loss", async () => {
    const { store, service } = await makeStore();
    await store.getState().connect();
    service.list.mockRejectedValueOnce({
      code: "sessionLost",
      message: "Session changed. Reconnect.",
    });
    await store.getState().refresh();
    await store.getState().action(external.id, "stop");
    expect(store.getState().connection).toBeNull();
    expect(store.getState().containers).toEqual([external]);
    expect(service.action).not.toHaveBeenCalled();
    expect(store.getState().error).toContain("Reconnect");
  });
});
