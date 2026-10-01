/** WSLc 3.0.1 contract. Commands never connect implicitly. */
export interface ContainerError { code: string; message: string }
export interface ContainerConnection { sessionName: string; sessionId: string; runtimeVersion: string }
export interface ContainerProbe { restoreSupported?: boolean; restoreUnavailableReason?: string | null; available: boolean; supported: boolean; runtimeVersion: string | null; reason: string | null }
export type ContainerState = 'created' | 'running' | 'paused' | 'restarting' | 'removing' | 'exited' | 'dead' | 'unknown';
export interface ContainerPort { hostIp: string; hostPort: number; containerPort: number; protocol: 'tcp' | 'udp' }
export interface ContainerMount { kind: string; source: string; target: string; readOnly: boolean; name: string | null }
export interface ContainerEnvironment { key: string; value: string }
export interface ContainerCreateSpec { name: string; image: string; start: boolean; ports: ContainerPort[]; mounts: ContainerMount[]; environment: ContainerEnvironment[]; command: string[]; entrypoint: string | null; workingDirectory: string | null; user: string | null; cpus: number | null; memoryMb: number | null }
export interface ContainerSummary { id: string; name: string; image: string; state: ContainerState; rawState: string; status: string; health: string | null; origin: 'wsl-ui' | 'external'; ports: string; mounts: string }
export interface ContainerInspect extends ContainerSummary { imageId: string; publishedPorts: ContainerPort[]; dataMounts: ContainerMount[]; exitCode: number | null; lastError: string | null; configuration: ContainerCreateSpec | null; projectedConfiguration?: ContainerCreateSpec | null; configurationCoverageReason?: string | null; unsupportedFields: string[] }
export type ContainerAction = 'start' | 'stop' | 'restart' | 'kill' | 'remove';
export interface ContainerMutationResult { container: ContainerInspect | null; warning: string | null }
export interface ContainerLogs { text: string; truncated: boolean }
export interface ContainerTerminalRequest { executable: string; args: string[] }
/** invoke('container_probe') -> ContainerProbe
 * invoke('container_connect') -> ContainerConnection
 * invoke('container_list', {connection}) -> ContainerSummary[]
 * invoke('container_inspect', {connection,id}) -> ContainerInspect
 * invoke('container_action', {connection,id,action}) -> ContainerMutationResult
 * invoke('container_create', {connection,spec}) -> ContainerMutationResult
 * invoke('container_recreate', {connection,id,spec}) -> ContainerMutationResult
 * invoke('container_logs', {connection,id,tail}) -> ContainerLogs
 * invoke('container_terminal', {connection,id,request}) -> void
 * All rejection values are ContainerError. Logs following uses bounded repeated reads.
 */
/** Complete stopped-container recovery coverage. Named-volume helper support is independently gated. */
export interface ContainerBackupCoverage { supported: boolean; rootFilesystem: boolean; configuration: boolean; namedVolumes: string[]; blockers: string[]; warnings: string[] }
export interface ContainerBackupResult { path: string; bytes: number; manifestVersion: number }
export interface ContainerRestoreResult { containerId: string; name: string; volumeNames: string[]; warning: string | null }

/** invoke('container_stats', {connection,id}) -> ContainerStats */
export interface ContainerStats { id: string; cpuPercent: string; memoryUsage: string; memoryPercent: string; networkIo: string; blockIo: string; pids: number }
