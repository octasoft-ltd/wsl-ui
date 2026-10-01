//! Microsoft WSL 3.0.1 ContainerTasks::ListContainers NDJSON and wslc_schema.h.
use super::types::*;
use serde_json::Value;
pub const MAX_OUTPUT: usize = 4 * 1024 * 1024;
// WSL 3.0.1 wslc_schema.h omits fields supported by ContainerCreateCommand.
// ImageConfig exposes StopSignal, but ContainerConfig does not expose the
// container's effective value. Origin labels cannot repair this projection.
pub const CONFIGURATION_COVERAGE_REASON: &str = "WSLc 3.0.1 inspect does not expose effective StopSignal, Hostname, Domainname, DNS, ShmSize, TTY, Interactive, GPU or AutoRemove settings. Complete configuration reconstruction cannot be verified.";
pub fn malformed() -> ContainerError {
    ContainerError::new(
        "malformedOutput",
        "WSLc returned incomplete or unsupported output. Refresh before continuing.",
    )
}
pub fn validate_id(id: &str) -> Result<(), ContainerError> {
    if id.len() == 64 && id.bytes().all(|c| c.is_ascii_hexdigit()) {
        Ok(())
    } else {
        Err(ContainerError::new(
            "invalidId",
            "A full container ID is required.",
        ))
    }
}
fn string<'a>(v: &'a Value, key: &str) -> Result<&'a str, ContainerError> {
    v.get(key).and_then(Value::as_str).ok_or_else(malformed)
}
pub fn state(raw: &str) -> ContainerState {
    match raw.to_ascii_lowercase().as_str() {
        "created" => ContainerState::Created,
        "running" => ContainerState::Running,
        "paused" => ContainerState::Paused,
        "restarting" => ContainerState::Restarting,
        "removing" => ContainerState::Removing,
        "exited" | "stopped" => ContainerState::Exited,
        "dead" => ContainerState::Dead,
        _ => ContainerState::Unknown,
    }
}
fn json(text: &str) -> Result<Value, ContainerError> {
    if text.len() > MAX_OUTPUT {
        return Err(malformed());
    }
    serde_json::from_str(text.trim_start_matches('\u{feff}')).map_err(|_| malformed())
}
pub fn parse_inventory(text: &str) -> Result<Vec<ContainerSummary>, ContainerError> {
    if text.len() > MAX_OUTPUT {
        return Err(malformed());
    }
    let mut rows = Vec::new();
    let mut ids = std::collections::HashSet::new();
    for line in text
        .trim_start_matches('\u{feff}')
        .lines()
        .filter(|l| !l.trim().is_empty())
    {
        if line.len() > 65536 || rows.len() >= 5000 {
            return Err(malformed());
        }
        let v = json(line)?;
        let id = string(&v, "ID")?;
        validate_id(id).map_err(|_| malformed())?;
        if !ids.insert(id.to_owned()) {
            return Err(malformed());
        }
        let raw = string(&v, "State")?;
        let labels = string(&v, "Labels")?;
        rows.push(ContainerSummary {
            id: id.into(),
            name: string(&v, "Names")?.into(),
            image: string(&v, "Image")?.into(),
            state: state(raw),
            raw_state: raw.into(),
            status: string(&v, "Status")?.into(),
            health: v
                .get("HealthStatus")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(str::to_owned),
            origin: if labels
                .split(',')
                .any(|s| s.trim() == "org.wsl-ui.created=true")
            {
                "wsl-ui"
            } else {
                "external"
            }
            .into(),
            ports: string(&v, "Ports")?.into(),
            mounts: string(&v, "Mounts")?.into(),
        });
    }
    Ok(rows)
}
pub fn parse_system_info(text: &str) -> Result<(String, Vec<(String, String)>), ContainerError> {
    let v = json(text)?;
    let version = string(v.get("Client").ok_or_else(malformed)?, "Version")?.to_owned();
    let a = v
        .pointer("/Server/Sessions")
        .and_then(Value::as_array)
        .ok_or_else(malformed)?;
    if a.len() > 1024 {
        return Err(malformed());
    }
    let mut out = Vec::new();
    for s in a {
        out.push((
            string(s, "Name")?.into(),
            s.get("ID")
                .and_then(Value::as_u64)
                .ok_or_else(malformed)?
                .to_string(),
        ));
    }
    Ok((version, out))
}
fn meaningful(v: &Value) -> bool {
    match v {
        Value::Null => false,
        Value::Bool(b) => *b,
        Value::String(s) => !s.is_empty(),
        Value::Number(n) => n.as_f64() != Some(0.0),
        Value::Array(a) => !a.is_empty(),
        Value::Object(o) => !o.is_empty(),
    }
}
fn unknown(v: &Value, known: &[&str], prefix: &str, out: &mut Vec<String>) {
    if let Some(obj) = v.as_object() {
        for (k, val) in obj {
            if !known.contains(&k.as_str()) && meaningful(val) {
                out.push(format!("{prefix}{k}"));
            }
        }
    }
}
fn strings(v: Option<&Value>) -> Result<Vec<String>, ContainerError> {
    match v {
        None | Some(Value::Null) => Ok(vec![]),
        Some(Value::Array(a)) => a
            .iter()
            .map(|v| v.as_str().map(str::to_owned).ok_or_else(malformed))
            .collect(),
        _ => Err(malformed()),
    }
}
pub fn parse_inspect(text: &str) -> Result<ContainerInspect, ContainerError> {
    let root = json(text)?;
    let a = root.as_array().ok_or_else(malformed)?;
    if a.len() != 1 {
        return Err(malformed());
    }
    let v = &a[0];
    let id = string(v, "Id")?;
    validate_id(id).map_err(|_| malformed())?;
    let cfg = v
        .get("Config")
        .filter(|v| v.is_object())
        .ok_or_else(malformed)?;
    let host = v
        .get("HostConfig")
        .filter(|v| v.is_object())
        .ok_or_else(malformed)?;
    let st = v.get("State").ok_or_else(malformed)?;
    let raw = string(st, "Status")?;
    let mut unsupported = vec![];
    unknown(
        v,
        &[
            "Id",
            "Name",
            "Created",
            "Image",
            "State",
            "HostConfig",
            "Config",
            "Ports",
            "Mounts",
            "Labels",
            "NetworkSettings",
            "SizeRw",
            "SizeRootFs",
        ],
        "",
        &mut unsupported,
    );
    unknown(
        cfg,
        &[
            "Image",
            "Env",
            "Cmd",
            "Entrypoint",
            "User",
            "WorkingDir",
            "StopTimeout",
            "Healthcheck",
            "Labels",
        ],
        "Config.",
        &mut unsupported,
    );
    unknown(
        host,
        &["NetworkMode", "Memory", "NanoCpus", "Ulimits"],
        "HostConfig.",
        &mut unsupported,
    );
    if meaningful(&cfg["Healthcheck"]) {
        unsupported.push("Config.Healthcheck".into());
    }
    if meaningful(&cfg["StopTimeout"]) {
        unsupported.push("Config.StopTimeout".into());
    }
    if meaningful(&host["Ulimits"]) {
        unsupported.push("HostConfig.Ulimits".into());
    }
    if !["", "default", "bridge"].contains(&string(host, "NetworkMode")?) {
        unsupported.push("HostConfig.NetworkMode".into());
    }
    for labels in [&cfg["Labels"], &v["Labels"]] {
        if let Some(o) = labels.as_object() {
            if o.keys().any(|s| s != "org.wsl-ui.created") {
                unsupported.push("Labels".into());
            }
        } else {
            return Err(malformed());
        }
    }
    if let Some(networks) = v
        .pointer("/NetworkSettings/Networks")
        .and_then(Value::as_object)
    {
        for (name, net) in networks {
            if !["default", "bridge"].contains(&name.as_str()) {
                unsupported.push(format!("NetworkSettings.Networks.{name}"));
            }
            for k in ["Aliases", "Links", "DriverOpts", "IPAMConfig"] {
                if meaningful(&net[k]) {
                    unsupported.push(format!("NetworkSettings.Networks.{name}.{k}"));
                }
            }
        }
    }
    let mut ports = vec![];
    for (key, bindings) in v
        .get("Ports")
        .and_then(Value::as_object)
        .ok_or_else(malformed)?
    {
        let (p, proto) = key.split_once('/').ok_or_else(malformed)?;
        let cp = p
            .parse::<u16>()
            .ok()
            .filter(|n| *n > 0)
            .ok_or_else(malformed)?;
        if !["tcp", "udp"].contains(&proto) {
            unsupported.push(format!("Ports.{key}"));
            continue;
        }
        if bindings.is_null() {
            continue;
        }
        for b in bindings.as_array().ok_or_else(malformed)? {
            ports.push(ContainerPort {
                container_port: cp,
                protocol: proto.into(),
                host_ip: string(b, "HostIp")?.into(),
                host_port: string(b, "HostPort")?
                    .parse::<u16>()
                    .ok()
                    .filter(|n| *n > 0)
                    .ok_or_else(malformed)?,
            });
        }
    }
    let mut mounts = vec![];
    for m in v
        .get("Mounts")
        .and_then(Value::as_array)
        .ok_or_else(malformed)?
    {
        let kind = string(m, "Type")?;
        unknown(
            m,
            &["Type", "Name", "Source", "Destination", "ReadWrite"],
            "Mounts.",
            &mut unsupported,
        );
        if !["volume", "bind"].contains(&kind) {
            unsupported.push(format!("Mounts.{kind}"));
        }
        mounts.push(ContainerMount {
            kind: kind.into(),
            name: m
                .get("Name")
                .and_then(Value::as_str)
                .filter(|s| !s.is_empty())
                .map(str::to_owned),
            source: string(m, "Source")?.into(),
            target: string(m, "Destination")?.into(),
            read_only: !m
                .get("ReadWrite")
                .and_then(Value::as_bool)
                .ok_or_else(malformed)?,
        });
    }
    let mut environment = vec![];
    for e in strings(cfg.get("Env"))? {
        let (key, value) = e.split_once('=').ok_or_else(malformed)?;
        environment.push(ContainerEnvironment {
            key: key.into(),
            value: value.into(),
        });
    }
    let entry = strings(cfg.get("Entrypoint"))?;
    if entry.len() > 1 {
        unsupported.push("Config.Entrypoint".into());
    }
    let memory = host
        .get("Memory")
        .and_then(Value::as_u64)
        .ok_or_else(malformed)?;
    if memory % (1024 * 1024) != 0 {
        unsupported.push("HostConfig.Memory".into());
    }
    let nano = host
        .get("NanoCpus")
        .and_then(Value::as_u64)
        .ok_or_else(malformed)?;
    let summary = ContainerSummary {
        id: id.into(),
        name: string(v, "Name")?.trim_start_matches('/').into(),
        image: string(cfg, "Image")?.into(),
        state: state(raw),
        raw_state: raw.into(),
        status: raw.into(),
        health: st
            .pointer("/Health/Status")
            .and_then(Value::as_str)
            .map(str::to_owned),
        origin: if v
            .pointer("/Labels/org.wsl-ui.created")
            .and_then(Value::as_str)
            == Some("true")
        {
            "wsl-ui"
        } else {
            "external"
        }
        .into(),
        ports: ports
            .iter()
            .map(|p| {
                format!(
                    "{}:{}->{}/{}",
                    p.host_ip, p.host_port, p.container_port, p.protocol
                )
            })
            .collect::<Vec<_>>()
            .join(", "),
        mounts: mounts
            .iter()
            .map(|m| m.target.clone())
            .collect::<Vec<_>>()
            .join(", "),
    };
    unsupported.sort();
    unsupported.dedup();
    let spec = ContainerCreateSpec {
        name: summary.name.clone(),
        image: summary.image.clone(),
        start: summary.state == ContainerState::Running,
        ports: ports.clone(),
        mounts: mounts.clone(),
        environment,
        command: strings(cfg.get("Cmd"))?,
        entrypoint: entry.first().cloned(),
        working_directory: Some(string(cfg, "WorkingDir")?.to_owned()).filter(|s| !s.is_empty()),
        user: Some(string(cfg, "User")?.to_owned()).filter(|s| !s.is_empty()),
        cpus: if nano == 0 {
            None
        } else {
            Some(nano as f64 / 1e9)
        },
        memory_mb: if memory == 0 {
            None
        } else {
            Some(memory / (1024 * 1024))
        },
    };
    Ok(ContainerInspect {
        summary,
        image_id: string(v, "Image")?.into(),
        published_ports: ports,
        data_mounts: mounts,
        exit_code: st.get("ExitCode").and_then(Value::as_i64),
        last_error: st
            .get("Error")
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_owned),
        configuration: None,
        projected_configuration: Some(spec),
        configuration_coverage_reason: Some(CONFIGURATION_COVERAGE_REASON.into()),
        unsupported_fields: {
            unsupported.push(CONFIGURATION_COVERAGE_REASON.into());
            unsupported
        },
    })
}
