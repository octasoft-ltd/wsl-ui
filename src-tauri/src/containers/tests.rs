use super::*;
use serde_json::json;
const ID: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
fn inspect_fixture() -> String {
    json!([{"Id":ID,"Name":"/web","Image":"sha256:abc","Created":"2026-10-01T00:00:00Z","State":{"Status":"running","Running":true,"ExitCode":0,"StartedAt":"","FinishedAt":"","Health":null},"HostConfig":{"NetworkMode":"default","Memory":0,"NanoCpus":0,"Ulimits":[]},"Config":{"Image":"nginx:stable","Env":["TOKEN=secret"],"Cmd":["nginx"],"Entrypoint":[],"User":"","WorkingDir":"","StopTimeout":null,"Healthcheck":null,"Labels":{}},"Ports":{"80/tcp":[{"HostIp":"127.0.0.1","HostPort":"8080"}]},"Mounts":[{"Type":"volume","Name":"web-data","Source":"/data","Destination":"/var/www","ReadWrite":true}],"Labels":{},"NetworkSettings":{"Networks":{}}}]).to_string()
}
#[test]
fn parses_microsoft_ndjson_including_external_containers() {
    let line=json!({"ID":ID,"Names":"web","Image":"nginx:stable","State":"running","Status":"Up","Labels":"","Ports":"127.0.0.1:8080->80/tcp","Mounts":"web-data","HealthStatus":""}).to_string();
    let rows = inventory::parse_inventory(&line).unwrap();
    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].origin, "external");
    assert_eq!(rows[0].id, ID);
}
#[test]
fn rejects_partial_or_truncated_inventory() {
    assert!(inventory::parse_inventory("{\"ID\":\"aaaa\"}\n{broken}").is_err());
}
#[test]
fn parses_inspect_ports_mounts_and_environment() {
    let row = inventory::parse_inspect(&inspect_fixture()).unwrap();
    assert_eq!(row.published_ports[0].host_port, 8080);
    assert_eq!(row.data_mounts[0].name.as_deref(), Some("web-data"));
    assert_eq!(
        row.projected_configuration.unwrap().environment[0].value,
        "secret"
    );
}
#[test]
fn unknown_configuration_cannot_be_recreated() {
    let mut v: serde_json::Value = serde_json::from_str(&inspect_fixture()).unwrap();
    v[0]["HostConfig"]["Privileged"] = json!(true);
    let row = inventory::parse_inspect(&v.to_string()).unwrap();
    assert!(row.configuration.is_none());
    assert!(row
        .unsupported_fields
        .contains(&"HostConfig.Privileged".into()));
}
#[test]
fn parses_stable_system_info_and_preserves_large_session_identity() {
    let (version,sessions)=inventory::parse_system_info(r#"{"Client":{"Version":"3.0.1"},"Server":{"Sessions":[{"ID":4294967295,"Name":"wslc-cli-alice","CreatorPid":23}]}}"#).unwrap();
    assert_eq!(version, "3.0.1");
    assert_eq!(sessions[0], ("wslc-cli-alice".into(), "4294967295".into()));
}
fn basic_spec() -> types::ContainerCreateSpec {
    serde_json::from_value(json!({"name":"web","image":"nginx:stable","start":true,"ports":[],"mounts":[],"environment":[],"command":[],"entrypoint":null,"workingDirectory":null,"user":null,"cpus":null,"memoryMb":null})).unwrap()
}
#[test]
fn stable_version_gate_rejects_older_and_prerelease() {
    assert!(lifecycle::supported_version("3.0.1"));
    assert!(!lifecycle::supported_version("2.9.9.0"));
    assert!(!lifecycle::supported_version("3.0.1-pre.1"));
}
#[test]
fn create_builds_literal_arguments_and_never_shell_evaluates_environment() {
    let mut s = basic_spec();
    s.environment.push(types::ContainerEnvironment {
        key: "TOKEN".into(),
        value: "$(danger);& café".into(),
    });
    s.ports.push(types::ContainerPort {
        host_ip: "127.0.0.1".into(),
        host_port: 8080,
        container_port: 80,
        protocol: "tcp".into(),
    });
    assert_eq!(
        lifecycle::create_args(&s).unwrap(),
        vec![
            "container",
            "create",
            "--name",
            "web",
            "--label",
            "org.wsl-ui.created=true",
            "--pull",
            "never",
            "--publish",
            "127.0.0.1:8080:80/tcp",
            "--env",
            "TOKEN=$(danger);& café",
            "nginx:stable"
        ]
    );
}
#[test]
fn validation_rejects_option_images_names_and_invalid_mounts() {
    for image in ["--help", "bad image", "abc;whoami"] {
        let mut s = basic_spec();
        s.image = image.into();
        assert!(lifecycle::create_args(&s).is_err());
    }
    let mut s = basic_spec();
    s.name = "-force".into();
    assert!(lifecycle::create_args(&s).is_err());
    let mut s = basic_spec();
    s.mounts.push(types::ContainerMount {
        kind: "bind".into(),
        source: "D:\\Data,evil=x".into(),
        target: "/data".into(),
        read_only: true,
        name: None,
    });
    assert!(lifecycle::create_args(&s).is_err());
}
#[test]
#[ignore]
fn executor_child_fixture() {
    use std::io::Write;
    if std::env::var("WSLC_CHILD_SLEEP").is_ok() {
        std::thread::sleep(std::time::Duration::from_secs(3));
    } else {
        let bytes = vec![b'a'; 100000];
        std::io::stdout().write_all(&bytes).unwrap();
        std::io::stderr().write_all(&bytes).unwrap();
    }
}
#[test]
fn bounded_executor_rejects_excess_output_without_deadlock() {
    let mut cmd = std::process::Command::new(std::env::current_exe().unwrap());
    cmd.args([
        "--exact",
        "containers::tests::executor_child_fixture",
        "--ignored",
        "--nocapture",
    ]);
    assert_eq!(
        executor::run_bounded(cmd, std::time::Duration::from_secs(5), 1024, None)
            .err()
            .unwrap()
            .code,
        "outputLimit"
    );
}
#[test]
fn bounded_executor_kills_only_owned_child_on_timeout() {
    let mut cmd = std::process::Command::new(std::env::current_exe().unwrap());
    cmd.args([
        "--exact",
        "containers::tests::executor_child_fixture",
        "--ignored",
        "--nocapture",
    ])
    .env("WSLC_CHILD_SLEEP", "1");
    assert_eq!(
        executor::run_bounded(cmd, std::time::Duration::from_millis(100), 1024, None)
            .err()
            .unwrap()
            .code,
        "timeout"
    );
}
struct ScriptExecutor {
    responses: std::sync::Mutex<std::collections::VecDeque<String>>,
    calls: std::sync::Mutex<Vec<Vec<String>>>,
}
impl ScriptExecutor {
    fn new(rows: &[&str]) -> Self {
        Self {
            responses: std::sync::Mutex::new(rows.iter().map(|s| s.to_string()).collect()),
            calls: std::sync::Mutex::new(vec![]),
        }
    }
}
impl executor::Executor for ScriptExecutor {
    fn execute(
        &self,
        a: &[String],
        _t: std::time::Duration,
    ) -> Result<executor::CommandOutput, types::ContainerError> {
        self.calls.lock().unwrap().push(a.to_vec());
        Ok(executor::CommandOutput {
            success: true,
            stderr: vec![],
            stdout: self
                .responses
                .lock()
                .unwrap()
                .pop_front()
                .expect("Unexpected additional runtime operation")
                .into_bytes(),
        })
    }
    fn terminal(&self, _: &[String]) -> Result<(), types::ContainerError> {
        Ok(())
    }
    fn default_session_name(&self) -> Result<String, types::ContainerError> {
        Ok("wslc-cli-alice".into())
    }
    fn execute_with_file_limit(
        &self,
        a: &[String],
        _: &std::path::Path,
        _: u64,
        t: std::time::Duration,
    ) -> Result<executor::CommandOutput, types::ContainerError> {
        self.execute(a, t)
    }
}
fn info(id: u64) -> String {
    json!({"Client":{"Version":"3.0.1"},"Server":{"Sessions":[{"ID":id,"Name":"wslc-cli-alice"}]}})
        .to_string()
}
fn connection() -> types::ContainerConnection {
    types::ContainerConnection {
        session_name: "wslc-cli-alice".into(),
        session_id: "1".into(),
        runtime_version: "3.0.1".into(),
    }
}
#[test]
fn probe_never_creates_or_lists_sessions() {
    let s = Service::new(ScriptExecutor::new(&["WSLc version: 3.0.1"]));
    assert!(s.probe().unwrap().supported);
    assert_eq!(*s.executor.calls.lock().unwrap(), vec![vec!["--version"]]);
}
#[test]
fn explicit_connect_captures_only_current_token_default_session() {
    let info = info(1);
    let s = Service::new(ScriptExecutor::new(&["WSLc version: 3.0.1", "", &info]));
    assert_eq!(s.connect().unwrap().session_id, "1");
    assert_eq!(
        s.executor.calls.lock().unwrap()[1],
        vec!["container", "list", "--all", "--quiet", "--no-trunc"]
    );
}
#[test]
fn replaced_session_prevents_inventory_command() {
    let info = info(2);
    let s = Service::new(ScriptExecutor::new(&[&info]));
    assert_eq!(s.list(&connection()).err().unwrap().code, "sessionLost");
    assert_eq!(s.executor.calls.lock().unwrap().len(), 1);
}
#[test]
fn replacement_after_read_discards_inventory() {
    let before = info(1);
    let after = info(2);
    let s = Service::new(ScriptExecutor::new(&[&before, "", &after]));
    assert_eq!(s.list(&connection()).err().unwrap().code, "sessionLost");
    assert_eq!(
        s.executor.calls.lock().unwrap()[1],
        vec![
            "--session",
            "wslc-cli-alice",
            "container",
            "list",
            "--all",
            "--format",
            "json",
            "--no-trunc"
        ]
    );
}
#[test]
fn stateful_runtime_keeps_external_inventory_and_lifecycle() {
    let s = Service::new(mock::MockExecutor::new());
    let c = s.connect().unwrap();
    let rows = s.list(&c).unwrap();
    assert!(rows
        .iter()
        .any(|r| r.name == "database" && r.origin == "external"));
    let web = rows.iter().find(|r| r.name == "web").unwrap();
    assert_eq!(
        s.action(&c, &web.id, types::ContainerAction::Stop)
            .unwrap()
            .container
            .unwrap()
            .summary
            .state,
        types::ContainerState::Exited
    );
    assert_eq!(
        s.action(&c, &web.id, types::ContainerAction::Start)
            .unwrap()
            .container
            .unwrap()
            .summary
            .state,
        types::ContainerState::Running
    );
    assert!(s.logs(&c, &web.id, 100).unwrap().text.contains("ready"));
    s.action(&c, &web.id, types::ContainerAction::Remove)
        .err()
        .expect("running removal should be rejected");
}
#[test]
fn create_start_failure_retains_created_container() {
    let s = Service::new(mock::MockExecutor::new());
    let c = s.connect().unwrap();
    let mut spec = basic_spec();
    spec.name = "failed-start".into();
    let result = s.create(&c, &spec).unwrap();
    assert!(result.warning.is_some());
    let created = result.container.unwrap();
    assert_eq!(created.summary.state, types::ContainerState::Created);
    assert!(s
        .list(&c)
        .unwrap()
        .iter()
        .any(|r| r.id == created.summary.id));
}
#[test]
fn image_declared_data_paths_block_anonymous_volume_creation() {
    let s = Service::new(mock::MockExecutor::new());
    let c = s.connect().unwrap();
    let mut spec = basic_spec();
    spec.name = "db-new".into();
    spec.image = "postgres:18".into();
    assert_eq!(
        s.create(&c, &spec).err().unwrap().code,
        "dataMappingRequired"
    );
    assert!(!s.list(&c).unwrap().iter().any(|r| r.name == "db-new"));
}
#[test]
fn recreation_retains_stopped_original() {
    let s = Service::new(mock::MockExecutor::new());
    let c = s.connect().unwrap();
    let original = s
        .list(&c)
        .unwrap()
        .into_iter()
        .find(|r| r.name == "web")
        .unwrap();
    let mut spec = basic_spec();
    spec.name = "web-updated".into();
    let result = s.recreate(&c, &original.id, &spec).unwrap();
    assert_eq!(result.container.unwrap().summary.name, "web-updated");
    assert_eq!(
        s.inspect(&c, &original.id).unwrap().summary.state,
        types::ContainerState::Exited
    );
}
#[test]
fn terminal_requires_running_container_and_preserves_args() {
    let s = Service::new(mock::MockExecutor::new());
    let c = s.connect().unwrap();
    let rows = s.list(&c).unwrap();
    let db = rows.iter().find(|r| r.name == "database").unwrap();
    let request = types::ContainerTerminalRequest {
        executable: "/bin/sh".into(),
        args: vec!["-l".into()],
    };
    assert_eq!(
        s.terminal(&c, &db.id, &request).err().unwrap().code,
        "containerStopped"
    );
    let web = rows.iter().find(|r| r.name == "web").unwrap();
    s.terminal(&c, &web.id, &request).unwrap();
}
struct FailedInspectExecutor {
    inner: mock::MockExecutor,
    fail: std::sync::atomic::AtomicBool,
}
impl executor::Executor for FailedInspectExecutor {
    fn complete_configuration_model(&self) -> bool {
        self.inner.complete_configuration_model()
    }
    fn execute(
        &self,
        a: &[String],
        t: std::time::Duration,
    ) -> Result<executor::CommandOutput, types::ContainerError> {
        if a.iter().any(|s| s == "inspect")
            && a.iter().any(|s| s == "container")
            && self.fail.swap(false, std::sync::atomic::Ordering::SeqCst)
        {
            return Ok(executor::CommandOutput {
                success: false,
                stdout: vec![],
                stderr: vec![],
            });
        }
        self.inner.execute(a, t)
    }
    fn terminal(&self, a: &[String]) -> Result<(), types::ContainerError> {
        self.inner.terminal(a)
    }
    fn default_session_name(&self) -> Result<String, types::ContainerError> {
        self.inner.default_session_name()
    }
    fn execute_with_file_limit(
        &self,
        a: &[String],
        p: &std::path::Path,
        m: u64,
        t: std::time::Duration,
    ) -> Result<executor::CommandOutput, types::ContainerError> {
        self.inner.execute_with_file_limit(a, p, m, t)
    }
}
#[test]
fn restore_creation_inspect_failure_cleans_only_new_container() {
    let s = Service::new(FailedInspectExecutor {
        inner: mock::MockExecutor::new(),
        fail: std::sync::atomic::AtomicBool::new(true),
    });
    let c = s.connect().unwrap();
    let mut spec = basic_spec();
    spec.name = "restore-new".into();
    spec.start = false;
    assert!(s.create_existing_image(&c, &spec).is_err());
    let rows = s.list(&c).unwrap();
    assert!(!rows.iter().any(|r| r.name == "restore-new"));
    assert!(rows.iter().any(|r| r.name == "database"));
}
#[test]
fn malformed_inspect_ids_never_dispatch_commands() {
    let s = Service::new(ScriptExecutor::new(&[]));
    assert_eq!(
        s.inspect(&connection(), "aaaa").err().unwrap().code,
        "invalidId"
    );
    assert!(s.executor.calls.lock().unwrap().is_empty());
}
#[test]
fn unknown_state_is_preserved_and_never_labeled_stopped() {
    let mut v: serde_json::Value = serde_json::from_str(&inspect_fixture()).unwrap();
    v[0]["State"]["Status"] = json!("future-state");
    let row = inventory::parse_inspect(&v.to_string()).unwrap();
    assert_eq!(row.summary.state, types::ContainerState::Unknown);
    assert_eq!(row.summary.raw_state, "future-state");
}
#[test]
fn stats_snapshot_uses_verified_single_sample_command() {
    let before = info(1);
    let sample=json!({"ID":ID,"Name":"web","CPUPerc":"1.00%","MemUsage":"1MiB / 1GiB","MemPerc":"0.10%","NetIO":"1kB / 2kB","BlockIO":"0B / 0B","PIDs":2}).to_string();
    let s = Service::new(ScriptExecutor::new(&[&before, &sample, &before]));
    let r = s.stats(&connection(), ID).unwrap();
    assert_eq!(r.cpu_percent, "1.00%");
    assert_eq!(r.pids, 2);
    assert_eq!(
        s.executor.calls.lock().unwrap()[1],
        vec![
            "--session",
            "wslc-cli-alice",
            "container",
            "stats",
            "--format",
            "json",
            "--no-trunc",
            ID
        ]
    );
}
// Pinned ContainerConfig/InspectHostConfig omit --stop-signal entirely. Both ordinary
// and SIGUSR1-created containers yield this same fixture; an origin label adds no proof.
#[test]
fn projected_inspect_cannot_prove_external_or_app_created_stop_signal_coverage() {
    for app_origin in [false, true] {
        let mut v: serde_json::Value = serde_json::from_str(&inspect_fixture()).unwrap();
        if app_origin {
            v[0]["Labels"] = json!({"org.wsl-ui.created":"true"});
            v[0]["Config"]["Labels"] = v[0]["Labels"].clone();
        }
        let row = inventory::parse_inspect(&v.to_string()).unwrap();
        assert!(
            row.configuration.is_none(),
            "CLI inspect cannot distinguish a custom --stop-signal SIGUSR1"
        );
        assert!(row
            .unsupported_fields
            .iter()
            .any(|s| s.contains("StopSignal")));
    }
}
struct ReplacementDuringDispatch {
    epoch: std::sync::atomic::AtomicU64,
    mutations: std::sync::atomic::AtomicUsize,
    calls: std::sync::Mutex<Vec<Vec<String>>>,
}
impl executor::Executor for ReplacementDuringDispatch {
    fn execute(
        &self,
        a: &[String],
        _: std::time::Duration,
    ) -> Result<executor::CommandOutput, types::ContainerError> {
        use std::sync::atomic::Ordering;
        self.calls.lock().unwrap().push(a.to_vec());
        let out = if a.iter().any(|s| s == "info") {
            info(self.epoch.load(Ordering::SeqCst))
        } else {
            // The session ended after the caller's precheck; CLI opens its replacement by name.
            self.epoch.store(2, Ordering::SeqCst);
            self.mutations.fetch_add(1, Ordering::SeqCst);
            format!("{ID}\n")
        };
        Ok(executor::CommandOutput {
            success: true,
            stdout: out.into_bytes(),
            stderr: vec![],
        })
    }
    fn terminal(&self, _: &[String]) -> Result<(), types::ContainerError> {
        Ok(())
    }
    fn default_session_name(&self) -> Result<String, types::ContainerError> {
        Ok("wslc-cli-alice".into())
    }
    fn execute_with_file_limit(
        &self,
        a: &[String],
        _: &std::path::Path,
        _: u64,
        t: std::time::Duration,
    ) -> Result<executor::CommandOutput, types::ContainerError> {
        self.execute(a, t)
    }
}
#[test]
fn replacement_during_mutation_reports_unknown_outcome_without_retry_or_cleanup() {
    let s = Service::new(ReplacementDuringDispatch {
        epoch: std::sync::atomic::AtomicU64::new(1),
        mutations: std::sync::atomic::AtomicUsize::new(0),
        calls: std::sync::Mutex::new(vec![]),
    });
    let err = s
        .execute_scoped(
            &connection(),
            &["container".into(), "create".into(), "nginx:stable".into()],
            std::time::Duration::from_secs(1),
        )
        .err()
        .unwrap();
    assert_eq!(err.code, "mutationOutcomeUnknown");
    assert!(err.message.contains("may have occurred"));
    assert_eq!(
        s.executor
            .mutations
            .load(std::sync::atomic::Ordering::SeqCst),
        1
    );
    assert_eq!(s.executor.calls.lock().unwrap().len(), 3);
}
#[test]
fn native_projection_blocks_recreation_before_stopping_original() {
    let system = info(1);
    let inspect = inspect_fixture();
    let s = Service::new(ScriptExecutor::new(&[&system, &inspect, &system]));
    let mut spec = basic_spec();
    spec.name = "web-updated".into();
    assert_eq!(
        s.recreate(&connection(), ID, &spec).err().unwrap().code,
        "unsupportedConfiguration"
    );
    assert_eq!(s.executor.calls.lock().unwrap().len(), 3);
}
#[test]
fn native_projection_blocks_complete_backup_for_no_mount_container() {
    let system = info(1);
    let mut fixture: serde_json::Value = serde_json::from_str(&inspect_fixture()).unwrap();
    fixture[0]["State"]["Status"] = json!("exited");
    fixture[0]["State"]["Running"] = json!(false);
    fixture[0]["Mounts"] = json!([]);
    let inspect = fixture.to_string();
    let s = Service::new(ScriptExecutor::new(&[&system, &inspect, &system]));
    let conn = connection();
    let runtime = backup_native::NativeRecovery {
        service: &s,
        connection: &conn,
    };
    let coverage = backup::preflight(&runtime, ID).unwrap();
    assert!(!coverage.supported);
    assert!(!coverage.configuration);
    assert!(coverage.blockers.iter().any(|b| b.contains("StopSignal")));
    assert_eq!(s.executor.calls.lock().unwrap().len(), 3);
}
struct FailedPostcheck {
    failure: &'static str,
    checks: std::sync::atomic::AtomicUsize,
    dispatches: std::sync::atomic::AtomicUsize,
}
impl executor::Executor for FailedPostcheck {
    fn execute(
        &self,
        a: &[String],
        _: std::time::Duration,
    ) -> Result<executor::CommandOutput, types::ContainerError> {
        use std::sync::atomic::Ordering;
        if a.iter().any(|s| s == "info") {
            if self.checks.fetch_add(1, Ordering::SeqCst) == 0 {
                return Ok(executor::CommandOutput {
                    success: true,
                    stdout: info(1).into_bytes(),
                    stderr: vec![],
                });
            }
            return match self.failure {
                "timeout" => Err(types::ContainerError::new(
                    "timeout",
                    "Verification timed out",
                )),
                "commandFailed" => Ok(executor::CommandOutput {
                    success: false,
                    stdout: vec![],
                    stderr: b"secret diagnostic must never be replayed".to_vec(),
                }),
                "malformedOutput" => Ok(executor::CommandOutput {
                    success: true,
                    stdout: b"{malformed".to_vec(),
                    stderr: vec![],
                }),
                _ => panic!("Unsupported failure fixture"),
            };
        }
        self.dispatches.fetch_add(1, Ordering::SeqCst);
        Ok(executor::CommandOutput {
            success: true,
            stdout: vec![],
            stderr: vec![],
        })
    }
    fn terminal(&self, _: &[String]) -> Result<(), types::ContainerError> {
        Ok(())
    }
    fn default_session_name(&self) -> Result<String, types::ContainerError> {
        Ok("wslc-cli-alice".into())
    }
    fn execute_with_file_limit(
        &self,
        a: &[String],
        _: &std::path::Path,
        _: u64,
        t: std::time::Duration,
    ) -> Result<executor::CommandOutput, types::ContainerError> {
        self.execute(a, t)
    }
}
fn failed_postcheck(failure: &'static str) -> Service<FailedPostcheck> {
    Service::new(FailedPostcheck {
        failure,
        checks: std::sync::atomic::AtomicUsize::new(0),
        dispatches: std::sync::atomic::AtomicUsize::new(0),
    })
}
#[test]
fn any_failed_verification_after_mutation_reports_unknown_outcome() {
    for failure in ["commandFailed", "timeout", "malformedOutput"] {
        let s = failed_postcheck(failure);
        let error = s
            .execute_scoped(
                &connection(),
                &["image".into(), "pull".into(), "nginx:stable".into()],
                std::time::Duration::from_secs(1),
            )
            .err()
            .unwrap();
        assert_eq!(error.code, "mutationOutcomeUnknown", "{failure}");
        assert!(error.message.contains("could not be verified"));
        assert!(!error.message.contains("secret diagnostic"));
        assert_eq!(
            s.executor
                .dispatches
                .load(std::sync::atomic::Ordering::SeqCst),
            1
        );
        assert_eq!(
            s.executor.checks.load(std::sync::atomic::Ordering::SeqCst),
            2
        );
    }
}
#[test]
fn failed_verification_after_read_preserves_original_failure_code() {
    for failure in ["commandFailed", "timeout", "malformedOutput"] {
        let s = failed_postcheck(failure);
        assert_eq!(s.list(&connection()).err().unwrap().code, failure);
        assert_eq!(
            s.executor
                .dispatches
                .load(std::sync::atomic::Ordering::SeqCst),
            1
        );
    }
}
#[test]
fn native_restore_gate_rejects_before_any_runtime_call() {
    let s = Service::new(ScriptExecutor::new(&[]));
    let error = s.ensure_restore_supported().err().unwrap();
    assert_eq!(error.code, "restoreUnavailable");
    assert!(s.executor.calls.lock().unwrap().is_empty());
}
#[test]
fn mock_restore_remains_available_and_reports_capability() {
    let s = Service::new(mock::MockExecutor::new());
    s.ensure_restore_supported().unwrap();
    let probe = s.probe().unwrap();
    assert!(probe.restore_supported);
    assert!(probe.restore_unavailable_reason.is_none());
}

#[test]
fn lifecycle_uses_each_native_commands_grace_period_option() {
    for (action, verb, option) in [
        (types::ContainerAction::Stop, "stop", "--time"),
        (types::ContainerAction::Restart, "restart", "--timeout"),
    ] {
        let session = info(1);
        let detail = inspect_fixture();
        let service = Service::new(ScriptExecutor::new(&[
            &session, "", &session, &session, &detail, &session,
        ]));
        service.action(&connection(), ID, action).unwrap();
        assert_eq!(
            service.executor.calls.lock().unwrap()[1],
            vec![
                "--session",
                "wslc-cli-alice",
                "container",
                verb,
                option,
                "10",
                ID,
            ]
        );
    }
}

#[test]
fn confirmed_removal_stops_a_running_container_and_preserves_other_containers() {
    let s = Service::new(mock::MockExecutor::new());
    let c = s.connect().unwrap();
    let before = s.list(&c).unwrap();
    let web = before.iter().find(|r| r.name == "web").unwrap();
    assert_eq!(web.state, types::ContainerState::Running);
    let action = serde_json::from_value(json!("stopAndRemove")).unwrap();
    assert!(s.action(&c, &web.id, action).unwrap().container.is_none());
    let after = s.list(&c).unwrap();
    assert!(!after.iter().any(|r| r.id == web.id));
    assert_eq!(after.len(), before.len() - 1);
}

#[test]
fn confirmed_removal_does_not_remove_if_stop_leaves_container_running() {
    let session = info(1);
    let detail = inspect_fixture();
    let s = Service::new(ScriptExecutor::new(&[
        &session, &detail, &session, // inspect before stop
        &session, "", &session, // stop dispatch
        &session, &detail, &session, // still running afterwards
    ]));
    let action = serde_json::from_value(json!("stopAndRemove")).unwrap();
    let error = s.action(&connection(), ID, action).err().unwrap();
    assert_eq!(error.code, "containerNotStopped");
    assert!(error.message.contains("not been removed"));
    let calls = s.executor.calls.lock().unwrap();
    assert!(calls
        .iter()
        .any(|a| a.get(3).map(String::as_str) == Some("stop")));
    assert!(!calls
        .iter()
        .any(|a| a.iter().any(|v| v == "rm" || v == "kill" || v == "--force")));
}

#[test]
fn confirmed_removal_of_stopped_container_does_not_send_stop() {
    let session = info(1);
    let mut detail: serde_json::Value = serde_json::from_str(&inspect_fixture()).unwrap();
    detail[0]["State"]["Status"] = json!("exited");
    detail[0]["State"]["Running"] = json!(false);
    let detail = detail.to_string();
    let s = Service::new(ScriptExecutor::new(&[
        &session, &detail, &session, // inspect
        &session, "", &session, // rm
        &session, "", &session, // inventory after removal
    ]));
    let action = serde_json::from_value(json!("stopAndRemove")).unwrap();
    assert!(s
        .action(&connection(), ID, action)
        .unwrap()
        .container
        .is_none());
    let calls = s.executor.calls.lock().unwrap();
    assert!(!calls.iter().any(|a| a
        .iter()
        .any(|v| v == "stop" || v == "kill" || v == "--force" || v == "--volumes")));
    assert!(calls
        .iter()
        .any(|a| a.get(3).map(String::as_str) == Some("rm")));
}

#[test]
fn confirmed_removal_does_not_delete_after_session_changes_during_stop() {
    let session = info(1);
    let replacement = info(2);
    let detail = inspect_fixture();
    let s = Service::new(ScriptExecutor::new(&[
        &session,
        &detail,
        &session,
        &session,
        "",
        &replacement,
    ]));
    let action = serde_json::from_value(json!("stopAndRemove")).unwrap();
    let error = s.action(&connection(), ID, action).err().unwrap();
    assert_eq!(error.code, "mutationOutcomeUnknown");
    assert!(error.message.contains("Removal was not attempted"));
    assert!(!s
        .executor
        .calls
        .lock()
        .unwrap()
        .iter()
        .any(|a| a.iter().any(|v| v == "rm")));
}
