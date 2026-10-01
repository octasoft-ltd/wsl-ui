use super::{executor::Executor, types::*};
pub const RESTORE_UNAVAILABLE_REASON: &str = "Native restore is unavailable until complete configuration coverage and a real WSLc recovery round trip have been verified.";

pub struct Service<E: Executor> {
    pub executor: E,
}
impl<E: Executor> Service<E> {
    pub fn new(executor: E) -> Self {
        Self { executor }
    }
    pub fn ensure_restore_supported(&self) -> Result<(), ContainerError> {
        if self.executor.verified_restore() {
            Ok(())
        } else {
            Err(ContainerError::new(
                "restoreUnavailable",
                RESTORE_UNAVAILABLE_REASON,
            ))
        }
    }
    fn restore_unavailable_reason(&self) -> Option<String> {
        (!self.executor.verified_restore()).then(|| RESTORE_UNAVAILABLE_REASON.into())
    }
    fn system_info(&self) -> Result<(String, Vec<(String, String)>), ContainerError> {
        let out = self.executor.execute(
            &args(&["system", "info", "--format", "json"]),
            std::time::Duration::from_secs(15),
        )?;
        success(&out)?;
        super::inventory::parse_system_info(&super::executor::text(&out.stdout))
    }
    pub fn probe(&self) -> Result<ContainerProbe, ContainerError> {
        let out = match self
            .executor
            .execute(&args(&["--version"]), std::time::Duration::from_secs(10))
        {
            Ok(out) => out,
            Err(e) => {
                return Ok(ContainerProbe {
                    restore_supported: self.executor.verified_restore(),
                    restore_unavailable_reason: self.restore_unavailable_reason(),
                    available: false,
                    supported: false,
                    runtime_version: None,
                    reason: Some(e.message),
                })
            }
        };
        if !out.success {
            return Ok(ContainerProbe {
                restore_supported: self.executor.verified_restore(),
                restore_unavailable_reason: self.restore_unavailable_reason(),
                available: true,
                supported: false,
                runtime_version: None,
                reason: Some("WSLc could not report its version.".into()),
            });
        }
        let text = super::executor::text(&out.stdout);
        let version = text
            .split_whitespace()
            .find(|s| {
                s.as_bytes()
                    .first()
                    .map(u8::is_ascii_digit)
                    .unwrap_or(false)
                    && s.contains('.')
            })
            .ok_or_else(super::inventory::malformed)?
            .to_owned();
        let supported = supported_version(&version);
        Ok(ContainerProbe {
            restore_supported: self.executor.verified_restore(),
            restore_unavailable_reason: self.restore_unavailable_reason(),
            available: true,
            supported,
            runtime_version: Some(version),
            reason: if supported {
                None
            } else {
                Some("WSL 3.0.1 or newer is required for containers.".into())
            },
        })
    }
    pub fn connect(&self) -> Result<ContainerConnection, ContainerError> {
        let probe = self.probe()?;
        if !probe.supported {
            return Err(ContainerError::new(
                "unsupportedVersion",
                "WSL 3.0.1 or newer is required for containers.",
            ));
        }
        let name = self.executor.default_session_name()?;
        let out = self.executor.execute(
            &args(&["container", "list", "--all", "--quiet", "--no-trunc"]),
            std::time::Duration::from_secs(120),
        )?;
        success(&out)?;
        let (version, sessions) = self.system_info()?;
        let id = sessions
            .into_iter()
            .find(|(n, _)| n.eq_ignore_ascii_case(&name))
            .map(|(_, id)| id)
            .ok_or_else(lost)?;
        Ok(ContainerConnection {
            session_name: name,
            session_id: id,
            runtime_version: version,
        })
    }
    pub fn validate_connection(&self, c: &ContainerConnection) -> Result<(), ContainerError> {
        if c.session_name.is_empty()
            || c.session_name.len() > 512
            || c.session_name.contains('\0')
            || c.session_id.parse::<u64>().is_err()
        {
            return Err(lost());
        }
        let (version, sessions) = self.system_info()?;
        if !supported_version(&version)
            || version != c.runtime_version
            || !sessions
                .iter()
                .any(|(name, id)| name.eq_ignore_ascii_case(&c.session_name) && id == &c.session_id)
        {
            return Err(lost());
        }
        Ok(())
    }
    pub fn execute_scoped(
        &self,
        c: &ContainerConnection,
        a: &[String],
        timeout: std::time::Duration,
    ) -> Result<super::executor::CommandOutput, ContainerError> {
        self.validate_connection(c)?;
        let mut scoped = args(&["--session", &c.session_name]);
        scoped.extend_from_slice(a);
        let result = self.executor.execute(&scoped, timeout);
        self.validate_after_dispatch(c, a)?;
        result
    }
    pub fn execute_scoped_file(
        &self,
        c: &ContainerConnection,
        a: &[String],
        p: &std::path::Path,
        max: u64,
        timeout: std::time::Duration,
    ) -> Result<super::executor::CommandOutput, ContainerError> {
        self.validate_connection(c)?;
        let mut scoped = args(&["--session", &c.session_name]);
        scoped.extend_from_slice(a);
        let result = self
            .executor
            .execute_with_file_limit(&scoped, p, max, timeout);
        self.validate_after_dispatch(c, a)?;
        result
    }
    fn validate_after_dispatch(
        &self,
        c: &ContainerConnection,
        a: &[String],
    ) -> Result<(), ContainerError> {
        self.validate_connection(c).map_err(|e| {
            if mutates_runtime(a) {
                ContainerError::new("mutationOutcomeUnknown", "The captured container session could not be verified after this command. Work may have occurred. Reconnect and inspect before retrying; no automatic retry or cleanup was performed.")
            } else { e }
        })
    }
    pub fn list(&self, c: &ContainerConnection) -> Result<Vec<ContainerSummary>, ContainerError> {
        let out = self.execute_scoped(
            c,
            &args(&[
                "container",
                "list",
                "--all",
                "--format",
                "json",
                "--no-trunc",
            ]),
            std::time::Duration::from_secs(30),
        )?;
        success(&out)?;
        super::inventory::parse_inventory(&super::executor::text(&out.stdout))
    }
    pub fn inspect(
        &self,
        c: &ContainerConnection,
        id: &str,
    ) -> Result<ContainerInspect, ContainerError> {
        super::inventory::validate_id(id)?;
        let out = self.execute_scoped(
            c,
            &args(&["container", "inspect", id]),
            std::time::Duration::from_secs(30),
        )?;
        success(&out)?;
        let mut row = super::inventory::parse_inspect(&super::executor::text(&out.stdout))?;
        if row.summary.id != id {
            return Err(super::inventory::malformed());
        }
        if self.executor.complete_configuration_model() {
            row.unsupported_fields
                .retain(|f| f != super::inventory::CONFIGURATION_COVERAGE_REASON);
            row.configuration_coverage_reason = None;
            if row.unsupported_fields.is_empty() {
                row.configuration = row.projected_configuration.clone();
            }
        }
        Ok(row)
    }
    pub fn action(
        &self,
        c: &ContainerConnection,
        id: &str,
        action: ContainerAction,
    ) -> Result<ContainerMutationResult, ContainerError> {
        super::inventory::validate_id(id)?;
        // Only the user-confirmed removal flow may stop a running container.
        // Recovery cleanup keeps using Remove, which never stops workloads.
        if matches!(action, ContainerAction::StopAndRemove) {
            let mut row = self.inspect(c, id)?;
            if row.summary.state == ContainerState::Running {
                row = self.action(c, id, ContainerAction::Stop).map_err(|mut e| {
                    e.message = format!("Removal was not attempted because stopping the container failed. {}", e.message);
                    e
                })?.container.ok_or_else(|| ContainerError::new(
                    "containerNotStopped", "The stopped state could not be verified. The container has not been removed. Refresh and try again.",
                ))?;
            }
            if !matches!(
                row.summary.state,
                ContainerState::Created | ContainerState::Exited | ContainerState::Dead
            ) {
                return Err(ContainerError::new(
                    "containerNotStopped", "The container is not stopped and has not been removed. Stop it, then try Remove again.",
                ));
            }
            return self.action(c, id, ContainerAction::Remove);
        }
        let verb = match action {
            ContainerAction::Start => "start",
            ContainerAction::Stop => "stop",
            ContainerAction::Restart => "restart",
            ContainerAction::Kill => "kill",
            ContainerAction::Remove | ContainerAction::StopAndRemove => "rm",
        };
        let mut a = args(&["container", verb]);
        if matches!(action, ContainerAction::Stop | ContainerAction::Restart) {
            let option = if matches!(action, ContainerAction::Restart) {
                "--timeout"
            } else {
                "--time"
            };
            a.extend(args(&[option, "10"]));
        }
        a.push(id.into());
        let out = self.execute_scoped(c, &a, std::time::Duration::from_secs(45))?;
        success(&out)?;
        if matches!(action, ContainerAction::Remove) {
            if self.list(c)?.iter().any(|r| r.id == id) {
                return Err(ContainerError::new(
                    "outcomeUnknown",
                    "Container still exists after removal. Refresh before retrying.",
                ));
            }
            Ok(ContainerMutationResult {
                container: None,
                warning: None,
            })
        } else {
            Ok(ContainerMutationResult {
                container: Some(self.inspect(c, id)?),
                warning: None,
            })
        }
    }
    pub fn create(
        &self,
        c: &ContainerConnection,
        spec: &ContainerCreateSpec,
    ) -> Result<ContainerMutationResult, ContainerError> {
        self.create_inner(c, spec, true)
    }
    pub fn create_existing_image(
        &self,
        c: &ContainerConnection,
        spec: &ContainerCreateSpec,
    ) -> Result<ContainerMutationResult, ContainerError> {
        self.create_inner(c, spec, false)
    }
    fn create_inner(
        &self,
        c: &ContainerConnection,
        spec: &ContainerCreateSpec,
        pull: bool,
    ) -> Result<ContainerMutationResult, ContainerError> {
        validate_spec(spec)?;
        if self.list(c)?.iter().any(|r| r.name == spec.name) {
            return Err(ContainerError::new(
                "nameConflict",
                "A container with this name already exists.",
            ));
        }
        if pull {
            let out = self.execute_scoped(
                c,
                &args(&["image", "pull", &spec.image]),
                std::time::Duration::from_secs(600),
            )?;
            success(&out)?;
        }
        let out = self.execute_scoped(
            c,
            &args(&["image", "inspect", &spec.image]),
            std::time::Duration::from_secs(30),
        )?;
        success(&out)?;
        let image: serde_json::Value =
            serde_json::from_slice(&out.stdout).map_err(|_| super::inventory::malformed())?;
        let a = image
            .as_array()
            .filter(|a| a.len() == 1)
            .ok_or_else(super::inventory::malformed)?;
        let immutable = a[0]
            .get("Id")
            .and_then(serde_json::Value::as_str)
            .ok_or_else(super::inventory::malformed)?;
        validate_image(immutable)?;
        let cfg = a[0]
            .get("Config")
            .filter(|v| v.is_object())
            .ok_or_else(super::inventory::malformed)?;
        if let Some(volumes) = cfg.get("Volumes").filter(|v| !v.is_null()) {
            let volumes = volumes
                .as_object()
                .ok_or_else(super::inventory::malformed)?;
            if volumes
                .keys()
                .any(|target| !spec.mounts.iter().any(|m| &m.target == target))
            {
                return Err(ContainerError::new("dataMappingRequired","This image declares data directories. Add an explicit volume or folder for every declared path."));
            }
        }
        let mut s = spec.clone();
        s.image = immutable.into();
        let out = self.execute_scoped(c, &create_args(&s)?, std::time::Duration::from_secs(120))?;
        success(&out)?;
        let id = super::executor::text(&out.stdout).trim().to_owned();
        super::inventory::validate_id(&id).map_err(|_| {
            ContainerError::new(
                "outcomeUnknown",
                "Create finished without a full container ID. Refresh before retrying.",
            )
        })?;
        let mut warning = None;
        if s.start {
            match self.action(c,&id,ContainerAction::Start){Ok(result)=>return Ok(result),Err(e)if e.code=="sessionLost"||e.code=="mutationOutcomeUnknown"||e.code=="timeout"=>return Err(e),Err(_)=>warning=Some("Created successfully, but starting failed. The container is retained; inspect its logs or retry Start.".into())}
        }
        match self.inspect(c, &id) {
            Ok(container) => Ok(ContainerMutationResult {
                container: Some(container),
                warning,
            }),
            Err(mut e) => {
                if !pull {
                    if e.code == "sessionLost" || e.code == "mutationOutcomeUnknown" {
                        e.message.push_str(&format!(" Newly created container {id} was retained because its session changed."));
                    } else {
                        match self.action(c,&id,ContainerAction::Remove){Ok(_)=>e.message.push_str(" The newly created container was removed."),Err(_)=>e.message.push_str(&format!(" Newly created container {id} could not be removed; inspect it before retrying."))}
                    }
                }
                Err(e)
            }
        }
    }
    pub fn recreate(
        &self,
        c: &ContainerConnection,
        id: &str,
        spec: &ContainerCreateSpec,
    ) -> Result<ContainerMutationResult, ContainerError> {
        validate_spec(spec)?;
        let old = self.inspect(c, id)?;
        if old.configuration.is_none() {
            return Err(ContainerError::new(
                "unsupportedConfiguration",
                "This configuration cannot be recreated without losing unsupported settings.",
            ));
        }
        if old.summary.name == spec.name {
            return Err(ContainerError::new(
                "nameConflict",
                "Choose a new name. The original container will be retained.",
            ));
        }
        if self.list(c)?.iter().any(|r| r.name == spec.name) {
            return Err(ContainerError::new(
                "nameConflict",
                "A container with this name already exists.",
            ));
        }
        if old.summary.state == ContainerState::Running {
            self.action(c, id, ContainerAction::Stop)?;
        }
        self.create(c, spec)
    }
    pub fn stats(
        &self,
        c: &ContainerConnection,
        id: &str,
    ) -> Result<ContainerStats, ContainerError> {
        super::inventory::validate_id(id)?;
        let out = self.execute_scoped(
            c,
            &args(&["container", "stats", "--format", "json", "--no-trunc", id]),
            std::time::Duration::from_secs(15),
        )?;
        success(&out)?;
        let text = super::executor::text(&out.stdout);
        let lines: Vec<_> = text.lines().filter(|l| !l.trim().is_empty()).collect();
        if lines.len() != 1 {
            return Err(super::inventory::malformed());
        }
        let v: serde_json::Value =
            serde_json::from_str(lines[0]).map_err(|_| super::inventory::malformed())?;
        let get = |k: &str| {
            v.get(k)
                .and_then(serde_json::Value::as_str)
                .map(str::to_owned)
                .ok_or_else(super::inventory::malformed)
        };
        if get("ID")? != id {
            return Err(super::inventory::malformed());
        }
        Ok(ContainerStats {
            id: id.into(),
            cpu_percent: get("CPUPerc")?,
            memory_usage: get("MemUsage")?,
            memory_percent: get("MemPerc")?,
            network_io: get("NetIO")?,
            block_io: get("BlockIO")?,
            pids: v
                .get("PIDs")
                .and_then(serde_json::Value::as_u64)
                .ok_or_else(super::inventory::malformed)?,
        })
    }
    pub fn logs(
        &self,
        c: &ContainerConnection,
        id: &str,
        tail: u32,
    ) -> Result<ContainerLogs, ContainerError> {
        super::inventory::validate_id(id)?;
        if tail == 0 || tail > 1000 {
            return Err(ContainerError::new(
                "invalidSpec",
                "Log tail must be between 1 and 1000 lines.",
            ));
        }
        let out = self.execute_scoped(
            c,
            &args(&[
                "container",
                "logs",
                "--tail",
                &tail.to_string(),
                "--timestamps",
                id,
            ]),
            std::time::Duration::from_secs(15),
        )?;
        success(&out)?;
        let mut text = super::executor::text(&out.stdout);
        text.push_str(&super::executor::text(&out.stderr));
        let truncated = text.len() > 256 * 1024;
        if truncated {
            let mut begin = text.len() - 256 * 1024;
            while !text.is_char_boundary(begin) {
                begin += 1;
            }
            text = text[begin..].into();
        }
        Ok(ContainerLogs { text, truncated })
    }
    pub fn terminal(
        &self,
        c: &ContainerConnection,
        id: &str,
        request: &ContainerTerminalRequest,
    ) -> Result<(), ContainerError> {
        super::inventory::validate_id(id)?;
        if !request.executable.starts_with('/')
            || !plain(&request.executable)
            || request.args.len() > 128
            || request.args.iter().any(|a| !plain(a))
        {
            return Err(invalid());
        }
        let row = self.inspect(c, id)?;
        if row.summary.state != ContainerState::Running {
            return Err(ContainerError::new(
                "containerStopped",
                "Start the container before opening its terminal.",
            ));
        }
        self.validate_connection(c)?;
        let mut a = args(&[
            "--session",
            &c.session_name,
            "container",
            "exec",
            "--interactive",
            "--tty",
            id,
            &request.executable,
        ]);
        a.extend(request.args.clone());
        self.executor.terminal(&a)?;
        self.validate_after_dispatch(c, &args(&["container", "exec"]))
    }
}
fn args(a: &[&str]) -> Vec<String> {
    a.iter().map(|s| s.to_string()).collect()
}
fn mutates_runtime(a: &[String]) -> bool {
    // Classify conservatively. Only source-verified read commands are read-only.
    let verb = a.get(1).map(String::as_str).unwrap_or("");
    match a.first().map(String::as_str) {
        Some("container") => !matches!(verb, "list" | "inspect" | "logs" | "stats" | "export"),
        Some("image" | "volume" | "network") => !matches!(verb, "list" | "inspect"),
        _ => true,
    }
}
fn lost() -> ContainerError {
    ContainerError::new(
        "sessionLost",
        "The captured container session ended or changed. Connect again before continuing.",
    )
}
pub fn success(out: &super::executor::CommandOutput) -> Result<(), ContainerError> {
    if out.success {
        Ok(())
    } else {
        Err(ContainerError::new("commandFailed","WSLc could not complete this operation. Refresh and inspect the container for details."))
    }
}
pub fn supported_version(v: &str) -> bool {
    if v.contains('-') {
        return false;
    }
    let numbers: Option<Vec<u64>> = v.split('.').map(|x| x.parse().ok()).collect();
    matches!(numbers,Some(n) if n.len()>=3&&n.len()<=4&&(n[0],n[1],n[2])>=(3,0,1))
}
fn invalid() -> ContainerError {
    ContainerError::new(
        "invalidSpec",
        "Check the name, image, paths, ports and environment settings.",
    )
}
pub fn validate_name(n: &str) -> Result<(), ContainerError> {
    if !n.is_empty()
        && n.len() <= 128
        && n.bytes().next().unwrap().is_ascii_alphanumeric()
        && n.bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
    {
        Ok(())
    } else {
        Err(invalid())
    }
}
pub fn validate_image(image: &str) -> Result<(), ContainerError> {
    if !image.is_empty()
        && image.len() <= 512
        && image.bytes().next().unwrap().is_ascii_alphanumeric()
        && image
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"._/:@-".contains(&b))
    {
        Ok(())
    } else {
        Err(invalid())
    }
}
fn plain(s: &str) -> bool {
    s.len() <= 65536 && !s.contains('\0')
}
fn path(s: &str) -> bool {
    !s.is_empty() && s.len() <= 4096 && !s.contains([',', '\0', '\r', '\n'])
}
pub fn validate_spec(s: &ContainerCreateSpec) -> Result<(), ContainerError> {
    validate_name(&s.name)?;
    validate_image(&s.image)?;
    if s.ports.len() > 128
        || s.mounts.len() > 128
        || s.environment.len() > 256
        || s.command.len() > 256
    {
        return Err(invalid());
    }
    let mut destinations = std::collections::HashSet::new();
    let mut env_keys = std::collections::HashSet::new();
    for p in &s.ports {
        if p.host_port == 0
            || p.container_port == 0
            || !["tcp", "udp"].contains(&p.protocol.as_str())
            || p.host_ip.parse::<std::net::Ipv4Addr>().is_err()
        {
            return Err(invalid());
        }
    }
    for m in &s.mounts {
        if !m.target.starts_with('/') || !path(&m.target) || !destinations.insert(m.target.clone())
        {
            return Err(invalid());
        }
        match m.kind.as_str() {
            "volume" => validate_name(m.name.as_deref().unwrap_or(&m.source))?,
            "bind" => {
                if !path(&m.source) || !std::path::Path::new(&m.source).is_absolute() {
                    return Err(invalid());
                }
            }
            _ => return Err(invalid()),
        }
    }
    for e in &s.environment {
        if e.key.is_empty()
            || e.key.len() > 256
            || !(e.key.as_bytes()[0].is_ascii_alphabetic() || e.key.starts_with('_'))
            || !e
                .key
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'_')
            || !plain(&e.value)
            || !env_keys.insert(&e.key)
        {
            return Err(invalid());
        }
    }
    if s.command.iter().any(|a| !plain(a))
        || s.command
            .first()
            .map(|s| s.is_empty() || s.starts_with('-'))
            .unwrap_or(false)
    {
        return Err(invalid());
    }
    if s.entrypoint
        .as_ref()
        .map(|s| !plain(s) || s.starts_with('-'))
        .unwrap_or(false)
        || s.working_directory
            .as_ref()
            .map(|s| !s.starts_with('/') || !path(s))
            .unwrap_or(false)
        || s.user
            .as_ref()
            .map(|s| {
                s.is_empty()
                    || s.starts_with('-')
                    || !s
                        .bytes()
                        .all(|c| c.is_ascii_alphanumeric() || b"._:-".contains(&c))
            })
            .unwrap_or(false)
    {
        return Err(invalid());
    }
    if s.cpus
        .map(|n| !n.is_finite() || n <= 0.0 || n > 1024.0)
        .unwrap_or(false)
        || s.memory_mb
            .map(|m| m == 0 || m > 1024 * 1024)
            .unwrap_or(false)
    {
        return Err(invalid());
    }
    Ok(())
}
pub fn create_args(s: &ContainerCreateSpec) -> Result<Vec<String>, ContainerError> {
    validate_spec(s)?;
    let mut a = vec![
        "container".into(),
        "create".into(),
        "--name".into(),
        s.name.clone(),
        "--label".into(),
        "org.wsl-ui.created=true".into(),
        "--pull".into(),
        "never".into(),
    ];
    for p in &s.ports {
        a.extend([
            "--publish".into(),
            format!(
                "{}:{}:{}/{}",
                p.host_ip, p.host_port, p.container_port, p.protocol
            ),
        ]);
    }
    for m in &s.mounts {
        let source = if m.kind == "volume" {
            m.name.as_deref().unwrap_or(&m.source)
        } else {
            &m.source
        };
        a.extend([
            "--mount".into(),
            format!(
                "type={},source={},target={}{}",
                m.kind,
                source,
                m.target,
                if m.read_only { ",readonly" } else { "" }
            ),
        ]);
    }
    for e in &s.environment {
        a.extend(["--env".into(), format!("{}={}", e.key, e.value)]);
    }
    for (flag, val) in [
        ("--entrypoint", &s.entrypoint),
        ("--workdir", &s.working_directory),
        ("--user", &s.user),
    ] {
        if let Some(v) = val {
            a.extend([flag.into(), v.clone()]);
        }
    }
    if let Some(c) = s.cpus {
        a.extend(["--cpus".into(), c.to_string()]);
    }
    if let Some(m) = s.memory_mb {
        a.extend(["--memory".into(), format!("{m}m")]);
    }
    a.push(s.image.clone());
    a.extend(s.command.clone());
    Ok(a)
}
