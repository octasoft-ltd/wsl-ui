// Distro scope type definition - matches Rust enum
export type DistroScope =
  | { type: "all" }
  | { type: "specific"; distros: string[] }
  | { type: "pattern"; pattern: string };

// Custom action definition
export interface CustomAction {
  id: string;
  name: string;
  icon: string;       // Icon identifier from predefined set
  command: string;    // Command to execute, supports variables like ${DISTRO_NAME}
  scope: DistroScope;
  confirmBeforeRun: boolean;
  showOutput: boolean;
  requiresSudo: boolean;    // Prompt for sudo password when executing
  requiresStopped: boolean; // Requires distribution to be stopped before running
  runInTerminal: boolean;   // Run command in user's terminal instead of background
  order: number;      // Sort order for display
}

// Available icons for custom actions
export const ACTION_ICONS = [
  { id: "terminal", label: "Terminal", emoji: "💻" },
  { id: "folder", label: "Folder", emoji: "📁" },
  { id: "gear", label: "Settings", emoji: "⚙️" },
  { id: "rocket", label: "Rocket", emoji: "🚀" },
  { id: "wrench", label: "Tool", emoji: "🔧" },
  { id: "box", label: "Package", emoji: "📦" },
  { id: "lightning", label: "Lightning", emoji: "⚡" },
  { id: "refresh", label: "Refresh", emoji: "🔄" },
  { id: "database", label: "Database", emoji: "🗄️" },
  { id: "cloud", label: "Cloud", emoji: "☁️" },
  { id: "lock", label: "Lock", emoji: "🔒" },
  { id: "code", label: "Code", emoji: "💾" },
] as const;

// Available variables for command substitution
export const ACTION_VARIABLES = [
  { name: "${DISTRO_NAME}", description: "Name of the WSL distribution" },
  { name: "${HOME}", description: "Home directory path in WSL" },
  { name: "${USER}", description: "Default user in the distribution" },
  { name: "${WINDOWS_HOME}", description: "Windows user home path (in WSL format)" },
] as const;

// Default custom action for new actions
export const DEFAULT_CUSTOM_ACTION: Omit<CustomAction, "id"> = {
  name: "New Action",
  icon: "terminal",
  command: "",
  scope: { type: "all" },
  confirmBeforeRun: false,
  showOutput: true,  // Show output by default so users see feedback
  requiresSudo: false,
  requiresStopped: false,
  runInTerminal: false,
  order: 0,
};

// Startup action configuration per distribution
export interface StartupAction {
  id: string;
  actionId: string;      // Reference to a custom action, or inline command
  command?: string;      // Inline command if actionId is empty
  continueOnError: boolean;
  timeout: number;       // Timeout in seconds
}

export interface StartupConfig {
  distroName: string;
  actions: StartupAction[];
  runOnAppStart: boolean;
  enabled: boolean;
}

export const DEFAULT_STARTUP_ACTION: Omit<StartupAction, "id"> = {
  actionId: "",
  command: "",
  continueOnError: true,
  timeout: 60,
};

