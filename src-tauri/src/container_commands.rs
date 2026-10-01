//! Container commands share one serialized service. Construction never probes/connects.
use crate::containers::{
    self, backup,
    backup_native::NativeRecovery,
    executor::{CommandOutput, Executor, NativeExecutor},
    mock::MockExecutor,
    types::*,
    Service,
};
use std::{
    path::Path,
    sync::{LazyLock, Mutex},
    time::Duration,
};
pub enum RuntimeExecutor {
    Native(NativeExecutor),
    Mock(MockExecutor),
}
impl RuntimeExecutor {
    fn new() -> Self {
        if crate::utils::is_mock_mode() {
            Self::Mock(MockExecutor::new())
        } else {
            Self::Native(NativeExecutor)
        }
    }
}
impl Executor for RuntimeExecutor {
    fn verified_restore(&self) -> bool {
        match self {
            Self::Native(e) => e.verified_restore(),
            Self::Mock(e) => e.verified_restore(),
        }
    }
    fn complete_configuration_model(&self) -> bool {
        match self {
            Self::Native(e) => e.complete_configuration_model(),
            Self::Mock(e) => e.complete_configuration_model(),
        }
    }
    fn execute(&self, args: &[String], timeout: Duration) -> Result<CommandOutput, ContainerError> {
        match self {
            Self::Native(e) => e.execute(args, timeout),
            Self::Mock(e) => e.execute(args, timeout),
        }
    }
    fn execute_with_file_limit(
        &self,
        args: &[String],
        path: &Path,
        max: u64,
        timeout: Duration,
    ) -> Result<CommandOutput, ContainerError> {
        match self {
            Self::Native(e) => e.execute_with_file_limit(args, path, max, timeout),
            Self::Mock(e) => e.execute_with_file_limit(args, path, max, timeout),
        }
    }
    fn terminal(&self, args: &[String]) -> Result<(), ContainerError> {
        match self {
            Self::Native(e) => e.terminal(args),
            Self::Mock(e) => e.terminal(args),
        }
    }
    fn default_session_name(&self) -> Result<String, ContainerError> {
        match self {
            Self::Native(e) => e.default_session_name(),
            Self::Mock(e) => e.default_session_name(),
        }
    }
}
static SERVICE: LazyLock<Mutex<Service<RuntimeExecutor>>> =
    LazyLock::new(|| Mutex::new(Service::new(RuntimeExecutor::new())));
pub fn reset_mock_state() {
    if crate::utils::is_mock_mode() {
        if let Ok(mut s) = SERVICE.lock() {
            *s = Service::new(RuntimeExecutor::Mock(MockExecutor::new()));
        }
    }
}
async fn run<T: Send + 'static>(
    f: impl FnOnce(&Service<RuntimeExecutor>) -> Result<T, ContainerError> + Send + 'static,
) -> Result<T, ContainerError> {
    tauri::async_runtime::spawn_blocking(move || {
        let s = SERVICE.lock().map_err(|_| {
            ContainerError::new("runtimeUnavailable", "Container service lock failed.")
        })?;
        f(&s)
    })
    .await
    .map_err(|_| {
        ContainerError::new(
            "runtimeUnavailable",
            "Container operation could not complete.",
        )
    })?
}
#[tauri::command]
pub async fn container_probe() -> Result<ContainerProbe, ContainerError> {
    run(|s| s.probe()).await
}
#[tauri::command]
pub async fn container_connect() -> Result<ContainerConnection, ContainerError> {
    run(|s| s.connect()).await
}
#[tauri::command]
pub async fn container_list(
    connection: ContainerConnection,
) -> Result<Vec<ContainerSummary>, ContainerError> {
    run(move |s| s.list(&connection)).await
}
#[tauri::command]
pub async fn container_inspect(
    connection: ContainerConnection,
    id: String,
) -> Result<ContainerInspect, ContainerError> {
    run(move |s| s.inspect(&connection, &id)).await
}
#[tauri::command]
pub async fn container_action(
    connection: ContainerConnection,
    id: String,
    action: ContainerAction,
) -> Result<ContainerMutationResult, ContainerError> {
    run(move |s| s.action(&connection, &id, action)).await
}
#[tauri::command]
pub async fn container_create(
    connection: ContainerConnection,
    spec: ContainerCreateSpec,
) -> Result<ContainerMutationResult, ContainerError> {
    run(move |s| s.create(&connection, &spec)).await
}
#[tauri::command]
pub async fn container_recreate(
    connection: ContainerConnection,
    id: String,
    spec: ContainerCreateSpec,
) -> Result<ContainerMutationResult, ContainerError> {
    run(move |s| s.recreate(&connection, &id, &spec)).await
}
#[tauri::command]
pub async fn container_logs(
    connection: ContainerConnection,
    id: String,
    tail: u32,
) -> Result<ContainerLogs, ContainerError> {
    run(move |s| s.logs(&connection, &id, tail)).await
}
#[tauri::command]
pub async fn container_terminal(
    connection: ContainerConnection,
    id: String,
    request: ContainerTerminalRequest,
) -> Result<(), ContainerError> {
    run(move |s| s.terminal(&connection, &id, &request)).await
}
#[tauri::command]
pub async fn container_backup_preflight(
    connection: ContainerConnection,
    id: String,
) -> Result<backup::Coverage, ContainerError> {
    run(move |s| {
        backup::preflight(
            &NativeRecovery {
                service: s,
                connection: &connection,
            },
            &id,
        )
        .map_err(Into::into)
    })
    .await
}
#[tauri::command]
pub async fn container_backup(
    connection: ContainerConnection,
    id: String,
    path: String,
) -> Result<backup::BackupResult, ContainerError> {
    run(move |s| {
        let p = Path::new(&path);
        if !p.is_absolute() {
            return Err(ContainerError::new(
                "invalidPath",
                "Choose an absolute backup destination.",
            ));
        }
        backup::backup(
            &NativeRecovery {
                service: s,
                connection: &connection,
            },
            &id,
            p,
            &connection.runtime_version,
            backup::Limits::default(),
        )
        .map_err(Into::into)
    })
    .await
}
#[tauri::command]
pub async fn container_restore(
    connection: ContainerConnection,
    path: String,
    name: String,
) -> Result<backup::RestoreResult, ContainerError> {
    run(move |s| {
        s.ensure_restore_supported()?;
        containers::lifecycle::validate_name(&name)?;
        let p = Path::new(&path);
        if !p.is_absolute() {
            return Err(ContainerError::new(
                "invalidPath",
                "Choose an absolute backup file path.",
            ));
        }
        backup::restore(
            &NativeRecovery {
                service: s,
                connection: &connection,
            },
            p,
            &name,
            backup::Limits::default(),
        )
        .map_err(Into::into)
    })
    .await
}

#[tauri::command]
pub async fn container_stats(
    connection: ContainerConnection,
    id: String,
) -> Result<ContainerStats, ContainerError> {
    run(move |s| s.stats(&connection, &id)).await
}
