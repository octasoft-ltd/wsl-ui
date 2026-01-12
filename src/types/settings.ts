import type { PollingIntervals } from "./polling";
import { DEFAULT_POLLING_INTERVALS } from "./polling";
import type { DistributionSourceSettings } from "./lxcCatalog";
import { DEFAULT_DISTRIBUTION_SOURCE_SETTINGS } from "./lxcCatalog";

/**
 * Information about an installed Windows Store terminal
 */
export interface InstalledTerminal {
  /** Terminal variant identifier (e.g., "wt", "wt-preview") */
  id: string;
  /** Display name for the terminal */
  name: string;
  /** Windows Store PackageFamilyName */
  packageFamilyName: string;
  /** Whether this terminal is installed */
  installed: boolean;
}

/**
 * WSL command timeout configuration (in seconds)
 */
export interface WslTimeoutConfig {
  /** Quick operations: list, version, status (default: 10s) */
  quickSecs: number;
  /** Default operations: most commands (default: 30s) */
  defaultSecs: number;
  /** Long operations: install, import, export, move, update (default: 600s / 10min) */
  longSecs: number;
  /** Shell command execution (default: 30s) */
  shellSecs: number;
  /** Shell commands with sudo (default: 120s) */
  sudoShellSecs: number;
}

export const DEFAULT_WSL_TIMEOUTS: WslTimeoutConfig = {
  quickSecs: 10,
  defaultSecs: 30,
  longSecs: 600,
  shellSecs: 30,
  sudoShellSecs: 120,
};

/**
 * Executable paths configuration
 * Allows users to override default paths for system commands
 */
export interface ExecutablePaths {
  /** WSL CLI executable (default: "wsl") */
  wsl: string;
  /** PowerShell executable (default: "powershell") */
  powershell: string;
  /** Command Prompt executable (default: "cmd") */
  cmd: string;
  /** Windows Explorer executable (default: "explorer") */
  explorer: string;
  /** Windows Terminal executable (default: "wt") */
  windowsTerminal: string;
  /** WSL UNC path prefix for accessing distro filesystems (default: "\\\\wsl$") */
  wslUncPrefix: string;
}

export const DEFAULT_EXECUTABLE_PATHS: ExecutablePaths = {
  wsl: "wsl",
  powershell: "powershell",
  cmd: "cmd",
  explorer: "explorer",
  windowsTerminal: "wt",
  wslUncPrefix: "\\\\wsl$",
};

/**
 * Container runtime for pulling OCI images
 * - "builtin": Use built-in OCI implementation (no external dependencies)
 * - "docker": Use Docker CLI
 * - "podman": Use Podman CLI
 * - { custom: "command" }: Use custom command
 */
export type ContainerRuntime =
  | "builtin"
  | "docker"
  | "podman"
  | { custom: string };

const DEFAULT_CONTAINER_RUNTIME: ContainerRuntime = "builtin";

/**
 * Close action preference for window close button
 * - 'ask': Show dialog to choose between minimize and quit
 * - 'minimize': Always minimize to system tray
 * - 'quit': Always quit the application
 */
export type CloseAction = 'ask' | 'minimize' | 'quit';

export interface AppSettings {
  ideCommand: string;
  terminalCommand: string;
  /** What to do when the user clicks the window close button */
  closeAction: CloseAction;
  /** Whether anonymous usage telemetry is enabled */
  telemetryEnabled: boolean;
  /** Whether the user has seen the telemetry opt-in prompt */
  telemetryPromptSeen: boolean;
  /** Saved custom IDE command (persisted even when a preset is active) */
  savedCustomIdeCommand: string;
  /** Saved custom terminal command (persisted even when a preset is active) */
  savedCustomTerminalCommand: string;
  usePreReleaseUpdates: boolean;
  // Polling settings
  pollingEnabled: boolean;
  pollingIntervals: PollingIntervals;
  // WSL timeout settings
  wslTimeouts: WslTimeoutConfig;
  // Executable paths
  executablePaths: ExecutablePaths;
  // Distribution source settings (LXC catalog)
  distributionSources: DistributionSourceSettings;
  // Container runtime for OCI image pulling
  containerRuntime: ContainerRuntime;
  // Default base path for new WSL installations (supports %ENV_VAR% expansion)
  // Empty string means use system default (%LOCALAPPDATA%\wsl)
  defaultInstallBasePath: string;
  // Enable debug logging (more verbose logs for troubleshooting)
  debugLogging: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  ideCommand: "code",
  terminalCommand: "auto",
  closeAction: "ask",
  telemetryEnabled: false,
  telemetryPromptSeen: false,
  savedCustomIdeCommand: "",
  savedCustomTerminalCommand: "",
  usePreReleaseUpdates: false,
  pollingEnabled: true,
  pollingIntervals: DEFAULT_POLLING_INTERVALS,
  wslTimeouts: DEFAULT_WSL_TIMEOUTS,
  executablePaths: DEFAULT_EXECUTABLE_PATHS,
  distributionSources: DEFAULT_DISTRIBUTION_SOURCE_SETTINGS,
  containerRuntime: DEFAULT_CONTAINER_RUNTIME,
  defaultInstallBasePath: "",
  debugLogging: false,
};

// WSL2 Global Configuration (.wslconfig)
export interface WslConfig {
  memory?: string;           // e.g., "8GB"
  processors?: number;       // Number of processors
  swap?: string;             // e.g., "4GB"
  swapFile?: string;         // Path to swap file
  localhostForwarding?: boolean;
  kernelCommandLine?: string;
  nestedVirtualization?: boolean;
  vmIdleTimeout?: number;    // milliseconds
  guiApplications?: boolean;
  debugConsole?: boolean;
  pageReporting?: boolean;
  safeMode?: boolean;
  autoMemoryReclaim?: string; // "disabled" | "dropcache" | "gradual"
  networkingMode?: string;    // "NAT" | "mirrored"
}

export const DEFAULT_WSL_CONFIG: WslConfig = {
  memory: "4GB",
  processors: 2,
  swap: "2GB",
  localhostForwarding: true,
  nestedVirtualization: false,
  guiApplications: true,
};

// Per-distribution configuration (wsl.conf)
export interface WslConf {
  // [automount]
  automountEnabled?: boolean;
  automountMountFsTab?: boolean;
  automountRoot?: string;      // e.g., "/mnt/"
  automountOptions?: string;   // e.g., "metadata,uid=1000,gid=1000"

  // [network]
  networkGenerateHosts?: boolean;
  networkGenerateResolvConf?: boolean;
  networkHostname?: string;

  // [interop]
  interopEnabled?: boolean;
  interopAppendWindowsPath?: boolean;

  // [user]
  userDefault?: string;

  // [boot]
  bootSystemd?: boolean;
  bootCommand?: string;
}

export const DEFAULT_WSL_CONF: WslConf = {
  automountEnabled: true,
  automountMountFsTab: true,
  automountRoot: "/mnt/",
  networkGenerateHosts: true,
  networkGenerateResolvConf: true,
  interopEnabled: true,
  interopAppendWindowsPath: true,
  bootSystemd: true,
};
