use serde::{Deserialize, Serialize};
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContainerError {
    pub code: String,
    pub message: String,
}
impl ContainerError {
    pub fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContainerConnection {
    pub session_name: String,
    pub session_id: String,
    pub runtime_version: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerProbe {
    pub restore_supported: bool,
    pub restore_unavailable_reason: Option<String>,
    pub available: bool,
    pub supported: bool,
    pub runtime_version: Option<String>,
    pub reason: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ContainerState {
    Created,
    Running,
    Paused,
    Restarting,
    Removing,
    Exited,
    Dead,
    Unknown,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContainerPort {
    pub host_ip: String,
    pub host_port: u16,
    pub container_port: u16,
    pub protocol: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContainerMount {
    pub kind: String,
    pub source: String,
    pub target: String,
    pub read_only: bool,
    pub name: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ContainerEnvironment {
    pub key: String,
    pub value: String,
}
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContainerCreateSpec {
    pub name: String,
    pub image: String,
    pub start: bool,
    pub ports: Vec<ContainerPort>,
    pub mounts: Vec<ContainerMount>,
    pub environment: Vec<ContainerEnvironment>,
    pub command: Vec<String>,
    pub entrypoint: Option<String>,
    pub working_directory: Option<String>,
    pub user: Option<String>,
    pub cpus: Option<f64>,
    pub memory_mb: Option<u64>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerSummary {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: ContainerState,
    pub raw_state: String,
    pub status: String,
    pub health: Option<String>,
    pub origin: String,
    pub ports: String,
    pub mounts: String,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerInspect {
    #[serde(flatten)]
    pub summary: ContainerSummary,
    pub image_id: String,
    pub published_ports: Vec<ContainerPort>,
    pub data_mounts: Vec<ContainerMount>,
    pub exit_code: Option<i64>,
    pub last_error: Option<String>,
    pub configuration: Option<ContainerCreateSpec>,
    pub projected_configuration: Option<ContainerCreateSpec>,
    pub configuration_coverage_reason: Option<String>,
    pub unsupported_fields: Vec<String>,
}
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ContainerAction {
    Start,
    Stop,
    Restart,
    Kill,
    Remove,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerMutationResult {
    pub container: Option<ContainerInspect>,
    pub warning: Option<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerLogs {
    pub text: String,
    pub truncated: bool,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ContainerTerminalRequest {
    pub executable: String,
    pub args: Vec<String>,
}
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContainerStats {
    pub id: String,
    pub cpu_percent: String,
    pub memory_usage: String,
    pub memory_percent: String,
    pub network_io: String,
    pub block_io: String,
    pub pids: u64,
}
