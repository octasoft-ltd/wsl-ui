//! Stateful CLI boundary used by WSL_MOCK. Service parsing/validation remain real.
use super::{executor::*, types::*};
use serde_json::{json, Value};
use std::{collections::BTreeMap, path::Path, sync::Mutex, time::Duration};
pub struct MockExecutor {
    state: Mutex<MockState>,
}
struct MockState {
    connected: bool,
    containers: BTreeMap<String, Value>,
    images: BTreeMap<String, Value>,
    next: u64,
}
fn image(reference: &str, id: &str) -> Value {
    json!({"Id":id,"RepoTags":[reference],"Config":{"Volumes":if reference.starts_with("postgres"){json!({"/var/lib/postgresql":{}})}else{Value::Null}}})
}
fn container(id: &str, name: &str, running: bool, app: bool) -> Value {
    let labels = if app {
        json!({"org.wsl-ui.created":"true"})
    } else {
        json!({})
    };
    json!({"Id":id,"Name":format!("/{name}"),"Image":format!("sha256:{}","c".repeat(64)),"Created":"2026-10-01T00:00:00Z","State":{"Status":if running{"running"}else{"exited"},"Running":running,"ExitCode":0,"StartedAt":"","FinishedAt":"","Health":null},"HostConfig":{"NetworkMode":"default","Memory":0,"NanoCpus":0,"Ulimits":[]},"Config":{"Image":if name=="database"{"postgres:18"}else{"nginx:stable"},"Env":[],"Cmd":[],"Entrypoint":[],"User":"","WorkingDir":"","StopTimeout":null,"Healthcheck":null,"Labels":labels},"Ports":{},"Mounts":if name=="database"{json!([{"Type":"volume","Name":"database-data","Source":"/volumes/database-data","Destination":"/var/lib/postgresql","ReadWrite":true}])}else{json!([])},"Labels":labels,"NetworkSettings":{"Networks":{}}})
}
impl MockExecutor {
    pub fn new() -> Self {
        let web = "a".repeat(64);
        let db = "b".repeat(64);
        let mut images = BTreeMap::new();
        for (r, c) in [("nginx:stable", "c"), ("postgres:18", "d")] {
            images.insert(r.into(), image(r, &format!("sha256:{}", c.repeat(64))));
        }
        Self {
            state: Mutex::new(MockState {
                connected: false,
                containers: BTreeMap::from([
                    (web.clone(), container(&web, "web", true, true)),
                    (db.clone(), container(&db, "database", false, false)),
                ]),
                images,
                next: 1,
            }),
        }
    }
}
fn output(s: String) -> CommandOutput {
    CommandOutput {
        stdout: s.into_bytes(),
        stderr: vec![],
        success: true,
    }
}
fn fail() -> CommandOutput {
    CommandOutput {
        stdout: vec![],
        stderr: b"Operation failed".to_vec(),
        success: false,
    }
}
fn image_by_ref<'a>(state: &'a MockState, r: &str) -> Option<&'a Value> {
    state
        .images
        .get(r)
        .or_else(|| state.images.values().find(|v| v["Id"].as_str() == Some(r)))
}
impl Executor for MockExecutor {
    fn verified_restore(&self) -> bool {
        true
    }
    fn complete_configuration_model(&self) -> bool {
        true
    }
    fn execute(&self, args: &[String], _: Duration) -> Result<CommandOutput, ContainerError> {
        let mut st = self
            .state
            .lock()
            .map_err(|_| ContainerError::new("runtimeUnavailable", "Mock state lock failed."))?;
        let mut a = args;
        if a.first().map(String::as_str) == Some("--session") {
            if a.get(1).map(String::as_str) != Some("wslc-cli-mock") || !st.connected {
                return Ok(fail());
            }
            a = &a[2..];
        }
        if a == ["--version"] {
            return Ok(output("wslc 3.0.1\n".into()));
        }
        if a.len() < 2 {
            return Ok(fail());
        }
        if a[0] == "system" && a[1] == "info" {
            return Ok(output(json!({"Client":{"Version":"3.0.1"},"Server":{"Sessions":if st.connected{json!([{"ID":1,"Name":"wslc-cli-mock","CreatorPid":1}])}else{json!([])}}}).to_string()));
        }
        if a[0] == "image" {
            match a[1].as_str() {
                "pull" => {
                    let r = a.last().unwrap();
                    if !st.images.contains_key(r) {
                        let id = format!("sha256:{:064x}", 100 + st.next);
                        st.next += 1;
                        st.images.insert(r.clone(), image(r, &id));
                    }
                    return Ok(output("Image ready\n".into()));
                }
                "inspect" => {
                    return Ok(image_by_ref(&st, a.last().unwrap())
                        .map(|v| output(json!([v]).to_string()))
                        .unwrap_or_else(fail))
                }
                "list" => {
                    let mut out = String::new();
                    for (r, v) in &st.images {
                        let (repo, tag) = r.rsplit_once(':').unwrap_or((r, "latest"));
                        out.push_str(&json!({"Repository":repo,"Tag":tag,"ID":v["Id"],"Digest":"<none>","CreatedAt":"2026-10-01","Size":"1MB"}).to_string());
                        out.push('\n');
                    }
                    return Ok(output(out));
                }
                "import" => {
                    let p = a
                        .iter()
                        .position(|s| s == "--no-trunc")
                        .map(|p| p + 1)
                        .unwrap_or(2);
                    let Some((path, r)) = a.get(p).zip(a.get(p + 1)) else {
                        return Ok(fail());
                    };
                    if !std::path::Path::new(path).is_file() {
                        return Ok(fail());
                    }
                    let id = format!("sha256:{:064x}", 100 + st.next);
                    st.next += 1;
                    st.images.insert(r.clone(), image(r, &id));
                    return Ok(output(format!("{id}\n")));
                }
                "rm" => {
                    if st.images.remove(a.last().unwrap()).is_none() {
                        return Ok(fail());
                    }
                    return Ok(output("".into()));
                }
                _ => return Ok(fail()),
            }
        }
        if a[0] != "container" {
            return Ok(fail());
        }
        match a[1].as_str() {
            "list" => {
                if args.first().map(String::as_str) != Some("--session") {
                    st.connected = true;
                }
                if a.iter().any(|s| s == "--quiet") {
                    return Ok(output(
                        st.containers.keys().cloned().collect::<Vec<_>>().join("\n"),
                    ));
                }
                let mut lines = String::new();
                for v in st.containers.values() {
                    lines.push_str(&json!({"ID":v["Id"],"Names":v["Name"].as_str().unwrap().trim_start_matches('/'),"Image":v["Config"]["Image"],"State":v["State"]["Status"],"Status":v["State"]["Status"],"Labels":if v["Labels"]["org.wsl-ui.created"]=="true"{"org.wsl-ui.created=true"}else{""},"Ports":"","Mounts":if v["Mounts"].as_array().unwrap().is_empty(){""}else{"database-data"},"HealthStatus":""}).to_string());
                    lines.push('\n');
                }
                Ok(output(lines))
            }
            "inspect" => Ok(st
                .containers
                .get(a.last().unwrap())
                .map(|v| output(json!([v]).to_string()))
                .unwrap_or_else(fail)),
            "create" => {
                let mut values: BTreeMap<&str, Vec<&str>> = BTreeMap::new();
                let mut i = 2;
                while i < a.len() && a[i].starts_with("--") {
                    let Some(val) = a.get(i + 1) else {
                        return Ok(fail());
                    };
                    values.entry(&a[i]).or_default().push(val);
                    i += 2;
                }
                let Some(img) = a.get(i) else {
                    return Ok(fail());
                };
                let name = values
                    .get("--name")
                    .and_then(|v| v.first())
                    .copied()
                    .unwrap_or("");
                if st
                    .containers
                    .values()
                    .any(|v| v["Name"] == format!("/{name}"))
                {
                    return Ok(fail());
                }
                let Some(im) = image_by_ref(&st, img).cloned() else {
                    return Ok(fail());
                };
                let id = format!("{:064x}", st.next);
                st.next += 1;
                let mut v = container(&id, name, false, true);
                v["State"]["Status"] = json!("created");
                v["Image"] = im["Id"].clone();
                v["Config"]["Image"] = json!(img);
                v["Config"]["Cmd"] = json!(&a[i + 1..]);
                v["Config"]["Env"] = json!(values.get("--env").cloned().unwrap_or_default());
                for (flag, key) in [("--workdir", "WorkingDir"), ("--user", "User")] {
                    if let Some(s) = values.get(flag).and_then(|v| v.first()) {
                        v["Config"][key] = json!(s)
                    }
                }
                if let Some(s) = values.get("--entrypoint").and_then(|v| v.first()) {
                    v["Config"]["Entrypoint"] = json!([s])
                }
                if let Some(s) = values.get("--memory").and_then(|v| v.first()) {
                    v["HostConfig"]["Memory"] =
                        json!(s.trim_end_matches('m').parse::<u64>().unwrap_or(0) * 1024 * 1024)
                }
                if let Some(s) = values.get("--cpus").and_then(|v| v.first()) {
                    v["HostConfig"]["NanoCpus"] =
                        json!((s.parse::<f64>().unwrap_or(0.) * 1e9) as u64)
                }
                for p in values.get("--publish").into_iter().flatten() {
                    let fields: Vec<&str> = p.split(':').collect();
                    v["Ports"][fields[2]] = json!([{"HostIp":fields[0],"HostPort":fields[1]}]);
                }
                for m in values.get("--mount").into_iter().flatten() {
                    let opts: BTreeMap<&str, &str> = m
                        .split(',')
                        .map(|s| s.split_once('=').unwrap_or((s, "")))
                        .collect();
                    let kind = opts.get("type").copied().unwrap_or("");
                    let src = opts.get("source").copied().unwrap_or("");
                    v["Mounts"].as_array_mut().unwrap().push(json!({"Type":kind,"Name":if kind=="volume"{src}else{""},"Source":src,"Destination":opts.get("target").copied().unwrap_or(""),"ReadWrite":!opts.contains_key("readonly")}));
                }
                st.containers.insert(id.clone(), v);
                Ok(output(format!("{id}\n")))
            }
            "start" | "restart" | "stop" | "kill" => {
                let Some(v) = st.containers.get_mut(a.last().unwrap()) else {
                    return Ok(fail());
                };
                if v["Name"] == "/failed-start" && (a[1] == "start" || a[1] == "restart") {
                    return Ok(fail());
                }
                let run = a[1] == "start" || a[1] == "restart";
                v["State"]["Running"] = json!(run);
                v["State"]["Status"] = json!(if run { "running" } else { "exited" });
                Ok(output("".into()))
            }
            "rm" => {
                let id = a.last().unwrap();
                if st
                    .containers
                    .get(id)
                    .map(|v| v["State"]["Running"] == true)
                    .unwrap_or(true)
                {
                    return Ok(fail());
                }
                st.containers.remove(id);
                Ok(output("".into()))
            }
            "stats" => {
                let id = a.last().unwrap();
                if !st.containers.contains_key(id) {
                    return Ok(fail());
                }
                Ok(output(json!({"ID":id,"Name":"web","CPUPerc":"1.00%","MemUsage":"1MiB / 1GiB","MemPerc":"0.10%","NetIO":"1kB / 2kB","BlockIO":"0B / 0B","PIDs":2}).to_string()))
            }
            "logs" => {
                if st.containers.contains_key(a.last().unwrap()) {
                    Ok(output("2026-10-01T00:00:00Z Service ready\n".into()))
                } else {
                    Ok(fail())
                }
            }
            "export" => {
                let Some(pos) = a.iter().position(|s| s == "--output") else {
                    return Ok(fail());
                };
                let Some(p) = a.get(pos + 1) else {
                    return Ok(fail());
                };
                let id = a.last().unwrap();
                if !st.containers.contains_key(id) {
                    return Ok(fail());
                }
                let file = std::fs::File::create(p).map_err(|_| {
                    ContainerError::new("io", "Unable to create mock rootfs archive.")
                })?;
                let mut ar = tar::Builder::new(file);
                let data = b"mock root filesystem\n";
                let mut h = tar::Header::new_gnu();
                h.set_size(data.len() as u64);
                h.set_mode(0o644);
                h.set_cksum();
                ar.append_data(&mut h, "etc/wsl-ui-mock", &data[..])
                    .and_then(|_| ar.finish())
                    .map_err(|_| {
                        ContainerError::new("io", "Unable to write mock rootfs archive.")
                    })?;
                Ok(output("".into()))
            }
            _ => Ok(fail()),
        }
    }
    fn terminal(&self, _: &[String]) -> Result<(), ContainerError> {
        Ok(())
    }
    fn default_session_name(&self) -> Result<String, ContainerError> {
        Ok("wslc-cli-mock".into())
    }
    fn execute_with_file_limit(
        &self,
        a: &[String],
        path: &Path,
        max: u64,
        t: Duration,
    ) -> Result<CommandOutput, ContainerError> {
        let out = self.execute(a, t)?;
        if std::fs::metadata(path)
            .map(|m| m.len() > max)
            .unwrap_or(false)
        {
            return Err(ContainerError::new(
                "fileLimit",
                "Export exceeded the size limit.",
            ));
        }
        Ok(out)
    }
}
