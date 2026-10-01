import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
  act,
} from "@testing-library/react";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { ContainerWorkspace } from "./ContainerWorkspace";
import { useContainerStore } from "../../store/containerStore";
const row = {
  id: "a".repeat(64),
  name: "external-web",
  image: "nginx:stable",
  state: "running",
  rawState: "running",
  status: "Up",
  health: "healthy",
  origin: "external",
  ports: "127.0.0.1:8080->80/tcp",
  mounts: "",
};
const spec = {
  name: "external-web",
  image: "nginx:stable",
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
const detail = {
  ...row,
  imageId: "sha256:image",
  publishedPorts: [],
  dataMounts: [],
  exitCode: null,
  lastError: null,
  configuration: spec,
  unsupportedFields: [],
};
const connection = {
  sessionName: "default",
  sessionId: "session-a",
  runtimeVersion: "3.0.1",
};
beforeEach(() => {
  useContainerStore.getState().disconnect();
  useContainerStore.setState(useContainerStore.getInitialState());
  vi.mocked(invoke).mockReset();
  vi.mocked(invoke).mockImplementation(async (command) => {
    if (command === "container_probe")
      return {
        available: true,
        supported: true,
        runtimeVersion: "3.0.1",
        reason: null,
      };
    if (command === "container_connect") return connection;
    if (command === "container_list") return [row];
    if (command === "container_inspect") return detail;
    if (command === "container_logs")
      return { text: "<script>escaped</script>\nready", truncated: false };
    if (command === "container_backup_preflight")
      return {
        supported: false,
        rootFilesystem: true,
        configuration: true,
        namedVolumes: [],
        blockers: ["Live restore verification required"],
        warnings: [],
      };
    return { container: detail, warning: null };
  });
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cleanup();
  useContainerStore.getState().disconnect();
});
async function connect() {
  fireEvent.click(await screen.findByTestId("container-connect"));
  await screen.findByText("external-web");
}
describe("container workspace", () => {
  it("keeps action buttons enabled during a periodic inventory refresh", async () => {
    const view = render(<ContainerWorkspace visible />);
    await connect();
    let finish!: (rows: (typeof row)[]) => void;
    const pending = new Promise<(typeof row)[]>((resolve) => {
      finish = resolve;
    });
    vi.mocked(invoke).mockImplementationOnce(() => pending);
    vi.useFakeTimers();
    view.rerender(<ContainerWorkspace visible={false} />);
    view.rerender(<ContainerWorkspace visible />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    expect(screen.getByTestId("container-create")).toBeEnabled();
    expect(screen.getByTestId("container-stop")).toBeEnabled();
    expect(screen.getByTestId("container-remove")).toBeEnabled();
    await act(async () => {
      finish([row]);
      await pending;
    });
  });
  it("never probes or connects while hidden, and requires explicit Connect when shown", async () => {
    const view = render(<ContainerWorkspace visible={false} />);
    expect(invoke).not.toHaveBeenCalled();
    view.rerender(<ContainerWorkspace visible />);
    await screen.findByTestId("container-connect");
    expect(vi.mocked(invoke).mock.calls.map((c) => c[0])).toEqual([
      "container_probe",
    ]);
    await connect();
    expect(screen.getByText("Created elsewhere")).toBeVisible();
  });
  it("explains unsupported WSLc without offering a connection", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      available: true,
      supported: false,
      runtimeVersion: "2.9.9",
      reason: "Update WSL to 3.0.1 or newer",
    });
    render(<ContainerWorkspace visible />);
    expect(
      await screen.findByText("Update WSL to 3.0.1 or newer"),
    ).toBeVisible();
    expect(screen.queryByTestId("container-connect")).not.toBeInTheDocument();
  });
  it("retains search and inventory when navigation hides the workspace", async () => {
    const view = render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.change(screen.getByTestId("container-search"), {
      target: { value: "external" },
    });
    view.rerender(<ContainerWorkspace visible={false} />);
    view.rerender(<ContainerWorkspace visible />);
    expect(screen.getByTestId("container-search")).toHaveValue("external");
    expect(screen.getByText("external-web")).toBeVisible();
  });
  it("requires confirmation before removal and keeps rows when removal fails", async () => {
    render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByRole("alertdialog")).toHaveTextContent("writable layer");
    expect(screen.getByRole("alertdialog")).toHaveTextContent(
      "stopped before removal",
    );
    expect(invoke).not.toHaveBeenCalledWith(
      "container_action",
      expect.anything(),
    );
    vi.mocked(invoke).mockImplementationOnce(async () => {
      throw { code: "COMMAND_FAILED", message: "Removal failed" };
    });
    fireEvent.click(screen.getByRole("button", { name: "Confirm remove" }));
    expect(await screen.findByText("Removal failed")).toBeVisible();
    expect(invoke).toHaveBeenCalledWith("container_action", {
      connection,
      id: row.id,
      action: "stopAndRemove",
    });
    expect(screen.getByText("external-web")).toBeVisible();
  });
  it("offers force stop separately after graceful stop fails", async () => {
    render(<ContainerWorkspace visible />);
    await connect();
    vi.mocked(invoke).mockImplementationOnce(async () => {
      throw { code: "commandFailed", message: "Graceful stop timed out" };
    });
    fireEvent.click(screen.getByTestId("container-stop"));
    fireEvent.click(await screen.findByRole("button", { name: "Force stop" }));
    expect(screen.getByRole("alertdialog")).toBeVisible();
    expect(invoke).not.toHaveBeenCalledWith(
      "container_action",
      expect.objectContaining({ action: "kill" }),
    );
  });
  it("shows escaped logs and an honest recovery coverage gate", async () => {
    render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    await screen.findByTestId("container-detail");
    fireEvent.click(screen.getByTestId("container-tab-logs"));
    expect(await screen.findByText(/<script>escaped<\/script>/)).toBeVisible();
    expect(document.querySelector("script")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Backups" }));
    expect(
      await screen.findByText("Live restore verification required"),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Save complete backup" }),
    ).toBeDisabled();
  });
  it("preserves sequential command entry and intentional blank arguments", async () => {
    render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.click(screen.getByTestId("container-create"));
    fireEvent.click(screen.getByTestId("container-custom-image"));
    const command = screen.getByLabelText("Command arguments (one per line)");
    fireEvent.change(command, { target: { value: "/bin/tool" } });
    fireEvent.change(command, {
      target: { value: `${(command as HTMLTextAreaElement).value}\n` },
    });
    expect(command).toHaveValue("/bin/tool\n");
    fireEvent.change(command, {
      target: { value: `${(command as HTMLTextAreaElement).value}\nlast` },
    });
    fireEvent.change(screen.getByTestId("container-create-name"), {
      target: { value: "arguments" },
    });
    fireEvent.change(screen.getByTestId("container-create-image"), {
      target: { value: "image:stable" },
    });
    fireEvent.click(screen.getByTestId("container-create-submit"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "container_create",
        expect.objectContaining({
          spec: expect.objectContaining({ command: ["/bin/tool", "", "last"] }),
        }),
      ),
    );
  });
  it("pauses inventory and following logs when the app is hidden and resumes when visible", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.click(screen.getByTestId("container-logs"));
    await screen.findByTestId("container-logs-follow");
    await act(async () =>
      fireEvent.click(screen.getByTestId("container-logs-follow")),
    );
    vi.useFakeTimers();
    hidden.mockReturnValue(true);
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    const reads = vi
      .mocked(invoke)
      .mock.calls.filter(
        ([name]) => name === "container_list" || name === "container_logs",
      ).length;
    await act(async () => vi.advanceTimersByTimeAsync(15000));
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(
          ([name]) => name === "container_list" || name === "container_logs",
        ),
    ).toHaveLength(reads);
    hidden.mockReturnValue(false);
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    await act(async () => vi.advanceTimersByTimeAsync(5000));
    expect(
      vi
        .mocked(invoke)
        .mock.calls.filter(
          ([name]) => name === "container_list" || name === "container_logs",
        ).length,
    ).toBeGreaterThan(reads);
    vi.useRealTimers();
    hidden.mockRestore();
  });
  it("retains backup completion after its panel closes and shows restore warnings", async () => {
    let complete!: (value: any) => void;
    const pending = new Promise((resolve) => {
      complete = resolve;
    });
    const original = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation(async (command, args) => {
      if (command === "container_backup_preflight")
        return {
          supported: true,
          rootFilesystem: true,
          configuration: true,
          namedVolumes: [],
          blockers: [],
          warnings: [],
        };
      if (command === "container_backup") return pending;
      if (command === "container_restore")
        return {
          containerId: "restored-id",
          name: "restored-web",
          volumeNames: ["fresh-volume"],
          warning: "Review restored credentials",
        };
      return original(command, args);
    });
    vi.mocked(save).mockResolvedValueOnce("C:\\selected.wslcbackup");
    render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(await screen.findByTestId("container-tab-backups"));
    await waitFor(() =>
      expect(screen.getByTestId("container-backup-save")).toBeEnabled(),
    );
    fireEvent.click(screen.getByTestId("container-backup-save"));
    await screen.findByTestId("container-busy");
    fireEvent.click(screen.getByTestId("container-tab-overview"));
    await act(async () =>
      complete({
        path: "C:\\selected.wslcbackup",
        bytes: 99,
        manifestVersion: 1,
      }),
    );
    expect(screen.getByTestId("container-recovery-outcome")).toHaveTextContent(
      "Backup completed for external-web.",
    );
    expect(screen.getByTestId("container-recovery-outcome")).toHaveTextContent(
      "C:\\selected.wslcbackup",
    );
    await act(async () => {
      await useContainerStore
        .getState()
        .restore("C:\\selected.wslcbackup", "restored-web");
    });
    expect(screen.getByTestId("container-recovery-outcome")).toHaveTextContent(
      "Review restored credentials",
    );
    expect(screen.getByTestId("container-recovery-outcome")).toHaveTextContent(
      "fresh-volume",
    );
  });
  it("shows selected CPU and memory snapshots while overview is visible", async () => {
    const original = vi.mocked(invoke).getMockImplementation()!;
    vi.mocked(invoke).mockImplementation(async (command, args) =>
      command === "container_stats"
        ? {
            id: row.id,
            cpuPercent: "2.5%",
            memoryUsage: "24 MiB / 2 GiB",
            memoryPercent: "1.2%",
            networkIo: "0 B / 0 B",
            blockIo: "0 B / 0 B",
            pids: 3,
          }
        : original(command, args),
    );
    render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    expect(await screen.findByText("2.5%")).toBeVisible();
    expect(screen.getByText("24 MiB / 2 GiB")).toBeVisible();
  });
  it("preserves a Recreate draft while app visibility changes", async () => {
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(await screen.findByTestId("container-tab-configuration"));
    fireEvent.click(
      await screen.findByRole("button", { name: "Recreate with changes" }),
    );
    fireEvent.change(screen.getByTestId("container-create-name"), {
      target: { value: "my-edited-replacement" },
    });
    fireEvent.click(
      screen.getByRole("checkbox", {
        name: /Creates a replacement under a new name/,
      }),
    );
    hidden.mockReturnValue(true);
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect(screen.getByTestId("container-create-name")).toHaveValue(
      "my-edited-replacement",
    );
    hidden.mockReturnValue(false);
    await act(async () =>
      document.dispatchEvent(new Event("visibilitychange")),
    );
    expect(screen.getByTestId("container-create-name")).toHaveValue(
      "my-edited-replacement",
    );
    expect(
      screen.getByRole("checkbox", {
        name: /Creates a replacement under a new name/,
      }),
    ).toBeChecked();
    hidden.mockRestore();
  });
  it("shows projected native configuration read-only when completeness is unproven", async () => {
    const original = vi.mocked(invoke).getMockImplementation()!;
    const projected = {
      ...detail,
      configuration: null,
      projectedConfiguration: {
        ...spec,
        command: ["/usr/bin/native", "arg"],
        environment: [{ key: "SECRET", value: "sensitive-value" }],
      },
      unsupportedFields: [
        "Native inspect schema cannot attest complete configuration.",
      ],
    };
    vi.mocked(invoke).mockImplementation(async (command, args) =>
      command === "container_inspect" ? projected : original(command, args),
    );
    render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.click(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(await screen.findByTestId("container-tab-configuration"));
    expect(await screen.findByText("/usr/bin/native arg")).toBeVisible();
    expect(screen.getByText("SECRET=••••••")).toBeVisible();
    expect(screen.queryByText("sensitive-value")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Native inspect schema cannot attest complete configuration.",
      ),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Recreate with changes" }),
    ).toBeDisabled();
  });
  it.each(["container_logs", "container_stats", "container_backup_preflight"])(
    "invalidates the connection when %s reports session loss",
    async (command) => {
      const original = vi.mocked(invoke).getMockImplementation()!;
      vi.mocked(invoke).mockImplementation(async (name, args) => {
        if (name === command)
          throw {
            code: "sessionLost",
            message: "Captured session disappeared. Reconnect.",
          };
        return original(name, args);
      });
      render(<ContainerWorkspace visible />);
      await connect();
      fireEvent.click(screen.getByRole("button", { name: "Details" }));
      if (command !== "container_stats")
        fireEvent.click(
          await screen.findByTestId(
            command === "container_logs"
              ? "container-tab-logs"
              : "container-tab-backups",
          ),
        );
      await waitFor(() =>
        expect(useContainerStore.getState().connection).toBeNull(),
      );
      expect(useContainerStore.getState().containers[0].name).toBe(
        "external-web",
      );
      expect(screen.getByTestId("container-error")).toHaveTextContent(
        "Captured session disappeared",
      );
      expect(screen.getByTestId("container-remove")).toBeDisabled();
    },
  );
  it("disables native Restore with its runtime acceptance-gate reason", async () => {
    vi.mocked(invoke).mockResolvedValueOnce({
      available: true,
      supported: true,
      runtimeVersion: "3.0.1",
      reason: null,
      restoreSupported: false,
      restoreUnavailableReason:
        "Native restore needs verified configuration and a real recovery round trip.",
    });
    render(<ContainerWorkspace visible />);
    await connect();
    expect(screen.getByTestId("container-restore")).toBeDisabled();
    expect(
      screen.getByText(
        "Native restore needs verified configuration and a real recovery round trip.",
      ),
    ).toBeVisible();
  });
  it("creates a structured specification with loopback ports and masked environment", async () => {
    render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.click(screen.getByTestId("container-create"));
    fireEvent.click(screen.getByTestId("container-custom-image"));
    fireEvent.change(screen.getByTestId("container-create-name"), {
      target: { value: "my-web" },
    });
    fireEvent.change(screen.getByTestId("container-create-image"), {
      target: { value: "nginx:stable" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add port" }));
    fireEvent.change(screen.getByLabelText("Host port 1"), {
      target: { value: "8080" },
    });
    fireEvent.change(screen.getByLabelText("Container port 1"), {
      target: { value: "80" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
    expect(screen.getByLabelText("Value 1")).toHaveAttribute(
      "type",
      "password",
    );
    fireEvent.click(screen.getByRole("button", { name: "Create container" }));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith("container_create", {
        connection,
        spec: expect.objectContaining({
          name: "my-web",
          image: "nginx:stable",
          ports: [
            {
              hostIp: "127.0.0.1",
              hostPort: 8080,
              containerPort: 80,
              protocol: "tcp",
            },
          ],
        }),
      }),
    );
  });
});

describe("add container gallery", () => {
  it("browses services without creating a container and filters by use case", async () => {
    render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.click(screen.getByTestId("container-create"));
    expect(screen.getByRole("dialog", { name: "Add container" })).toBeVisible();
    expect(screen.getByRole("button", { name: /PostgreSQL/ })).toBeVisible();
    fireEvent.change(screen.getByLabelText("Search developer tools"), {
      target: { value: "email" },
    });
    expect(screen.getByRole("button", { name: /Mailpit/ })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /PostgreSQL/ }),
    ).not.toBeInTheDocument();
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some(([command]) => command === "container_create"),
    ).toBe(false);
  });

  it("requires database credentials and submits the editable recipe with persistent storage", async () => {
    render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.click(screen.getByTestId("container-create"));
    fireEvent.click(screen.getByRole("button", { name: /PostgreSQL/ }));
    expect(screen.getByTestId("container-create-name")).toHaveValue("postgres");
    expect(screen.getByTestId("container-create-image")).toHaveValue(
      "docker.io/library/postgres:18",
    );
    expect(screen.getByLabelText("Database password")).toBeRequired();
    fireEvent.submit(screen.getByTestId("container-create-form"));
    expect(
      vi
        .mocked(invoke)
        .mock.calls.some(([command]) => command === "container_create"),
    ).toBe(false);
    fireEvent.change(screen.getByLabelText("Database password"), {
      target: { value: "literal-$()-password" },
    });
    fireEvent.change(screen.getByTestId("container-create-name"), {
      target: { value: "project-db" },
    });
    fireEvent.submit(screen.getByTestId("container-create-form"));
    await waitFor(() =>
      expect(invoke).toHaveBeenCalledWith(
        "container_create",
        expect.objectContaining({
          spec: expect.objectContaining({
            name: "project-db",
            environment: expect.arrayContaining([
              { key: "POSTGRES_PASSWORD", value: "literal-$()-password" },
            ]),
            ports: [
              expect.objectContaining({
                hostIp: "127.0.0.1",
                hostPort: 5432,
                containerPort: 5432,
              }),
            ],
            mounts: [
              expect.objectContaining({
                kind: "volume",
                target: "/var/lib/postgresql",
                readOnly: false,
              }),
            ],
          }),
        }),
      ),
    );
  });

  it("avoids an existing container name and gives each recipe attempt fresh storage", async () => {
    render(<ContainerWorkspace visible />);
    await connect();
    act(() =>
      useContainerStore.setState({
        containers: [{ ...row, name: "postgres" } as never],
      }),
    );
    fireEvent.click(screen.getByTestId("container-create"));
    fireEvent.click(screen.getByRole("button", { name: /PostgreSQL/ }));
    expect(screen.getByTestId("container-create-name")).toHaveValue(
      "postgres-2",
    );
    const firstVolume = (screen.getByLabelText("Source 1") as HTMLInputElement)
      .value;
    fireEvent.click(screen.getByRole("button", { name: "Back to tools" }));
    fireEvent.click(screen.getByRole("button", { name: /PostgreSQL/ }));
    expect(screen.getByLabelText("Source 1")).not.toHaveValue(firstVolume);
  });

  it("retains the custom-image route without recipe fields", async () => {
    render(<ContainerWorkspace visible />);
    await connect();
    fireEvent.click(screen.getByTestId("container-create"));
    fireEvent.click(screen.getByRole("button", { name: "Custom image" }));
    expect(screen.getByTestId("container-create-image")).toHaveValue("");
    expect(
      screen.queryByLabelText("Database password"),
    ).not.toBeInTheDocument();
  });
});

it("keeps duplicate recipe environment rows editable and rejects them before dispatch", async () => {
  render(<ContainerWorkspace visible />);
  await connect();
  fireEvent.click(screen.getByTestId("container-create"));
  fireEvent.click(screen.getByRole("button", { name: /PostgreSQL/ }));
  fireEvent.change(screen.getByLabelText("Database password"), {
    target: { value: "test-password" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Add variable" }));
  fireEvent.change(screen.getByLabelText("Key 4"), {
    target: { value: "POSTGRES_PASSWORD" },
  });
  expect(screen.getByLabelText("Key 4")).toHaveValue("POSTGRES_PASSWORD");
  fireEvent.submit(screen.getByTestId("container-create-form"));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Environment variable names must be unique",
  );
  expect(
    vi
      .mocked(invoke)
      .mock.calls.some(([command]) => command === "container_create"),
  ).toBe(false);
});
