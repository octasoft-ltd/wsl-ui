/**
 * Error handling utilities for consistent error management
 */

import { logger } from "./logger";

export enum ErrorCode {
  // Network
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',

  // WSL
  WSL_NOT_INSTALLED = 'WSL_NOT_INSTALLED',
  DISTRO_NOT_FOUND = 'DISTRO_NOT_FOUND',
  DISTRO_ALREADY_EXISTS = 'DISTRO_ALREADY_EXISTS',
  DISTRO_RUNNING = 'DISTRO_RUNNING',

  // Container
  CONTAINER_RUNTIME_NOT_FOUND = 'CONTAINER_RUNTIME_NOT_FOUND',

  // File
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  DISK_FULL = 'DISK_FULL',

  // General
  UNKNOWN = 'UNKNOWN',
}

export interface AppError {
  code: ErrorCode;
  message: string;
  details?: string;
  hint?: string;
}

const ERROR_HINTS: Record<string, string> = {
  [ErrorCode.WSL_NOT_INSTALLED]:
    'Run "wsl --install" in PowerShell as administrator.',
  [ErrorCode.CONTAINER_RUNTIME_NOT_FOUND]:
    'Install Podman Desktop or Docker Desktop.',
  [ErrorCode.PERMISSION_DENIED]: 'Try running as administrator.',
  [ErrorCode.DISK_FULL]: 'Free up disk space and try again.',
  [ErrorCode.DISTRO_NOT_FOUND]:
    'The distribution may have been deleted or renamed.',
  [ErrorCode.DISTRO_ALREADY_EXISTS]:
    'Choose a different name or delete the existing distribution.',
  [ErrorCode.DISTRO_RUNNING]: 'Stop the distribution first, then try again.',
  [ErrorCode.FILE_NOT_FOUND]: 'Check that the file path is correct.',
};

/** Parse error into AppError with detected error type */
export function parseError(error: unknown): AppError {
  // Handle Error instances
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Detect specific error types
    if (message.includes('not found') && message.includes('distribution')) {
      return {
        code: ErrorCode.DISTRO_NOT_FOUND,
        message: 'Distribution not found',
        details: error.message,
        hint: ERROR_HINTS[ErrorCode.DISTRO_NOT_FOUND],
      };
    }

    if (
      message.includes('wsl not installed') ||
      message.includes('wsl is not recognized')
    ) {
      return {
        code: ErrorCode.WSL_NOT_INSTALLED,
        message: 'WSL is not installed',
        details: error.message,
        hint: ERROR_HINTS[ErrorCode.WSL_NOT_INSTALLED],
      };
    }

    if (message.includes('podman') || message.includes('docker')) {
      return {
        code: ErrorCode.CONTAINER_RUNTIME_NOT_FOUND,
        message: 'Container runtime not available',
        details: error.message,
        hint: ERROR_HINTS[ErrorCode.CONTAINER_RUNTIME_NOT_FOUND],
      };
    }

    if (
      message.includes('permission denied') ||
      message.includes('access denied')
    ) {
      return {
        code: ErrorCode.PERMISSION_DENIED,
        message: 'Permission denied',
        details: error.message,
        hint: ERROR_HINTS[ErrorCode.PERMISSION_DENIED],
      };
    }

    if (
      message.includes('file not found') ||
      message.includes('no such file')
    ) {
      return {
        code: ErrorCode.FILE_NOT_FOUND,
        message: 'File not found',
        details: error.message,
        hint: ERROR_HINTS[ErrorCode.FILE_NOT_FOUND],
      };
    }

    if (
      message.includes('no space left') ||
      message.includes('disk full') ||
      message.includes('out of space')
    ) {
      return {
        code: ErrorCode.DISK_FULL,
        message: 'Disk is full',
        details: error.message,
        hint: ERROR_HINTS[ErrorCode.DISK_FULL],
      };
    }

    if (message.includes('already exists')) {
      return {
        code: ErrorCode.DISTRO_ALREADY_EXISTS,
        message: 'Distribution already exists',
        details: error.message,
        hint: ERROR_HINTS[ErrorCode.DISTRO_ALREADY_EXISTS],
      };
    }

    if (message.includes('is running') || message.includes('still running')) {
      return {
        code: ErrorCode.DISTRO_RUNNING,
        message: 'Distribution is running',
        details: error.message,
        hint: ERROR_HINTS[ErrorCode.DISTRO_RUNNING],
      };
    }

    // Unknown error with Error instance
    return {
      code: ErrorCode.UNKNOWN,
      message: error.message,
    };
  }

  // Handle non-Error types
  return {
    code: ErrorCode.UNKNOWN,
    message: String(error),
  };
}

/** Log error for debugging */
export function logError(error: AppError, context?: string): void {
  logger.error("Error:", context ?? "App", {
    code: error.code,
    message: error.message,
    details: error.details,
  });
}

/** Format error for display to user */
export function formatError(error: AppError): string {
  if (error.hint) {
    return `${error.message}. ${error.hint}`;
  }
  return error.message;
}





