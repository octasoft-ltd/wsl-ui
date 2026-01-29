/**
 * RDP detection result from backend
 */
export type RdpDetectionResult = {
  /** Type of RDP server detected */
  type: "xrdp" | "none";
  /** Port number (only for xrdp) */
  port?: number;
};

/**
 * WSL config timeout status from backend
 */
export type WslConfigStatus = {
  /** Whether both timeout settings are configured for RDP use */
  timeoutsConfigured: boolean;
};
