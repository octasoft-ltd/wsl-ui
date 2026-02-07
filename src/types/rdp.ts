/**
 * RDP detection result from backend
 */
export type RdpDetectionResult = {
  /** Type of RDP server detected */
  type: "xrdp" | "port_conflict" | "none";
  /** Port number (for xrdp or port_conflict) */
  port?: number;
};

/**
 * WSL config timeout status from backend
 */
export type WslConfigStatus = {
  /** Whether both timeout settings are configured for RDP use */
  timeoutsConfigured: boolean;
};

/**
 * WSL config pending restart status from backend
 */
export type WslConfigPendingStatus = {
  /** Whether .wslconfig has changes that require WSL restart */
  pendingRestart: boolean;
  /** When the config was last modified (ISO 8601 format) */
  configModified?: string;
  /** When WSL was started (ISO 8601 format) */
  wslStarted?: string;
};
