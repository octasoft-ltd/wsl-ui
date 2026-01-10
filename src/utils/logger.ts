/**
 * Logging utility using tauri-plugin-log.
 *
 * Features:
 * - Unified logging with Rust backend (same log file)
 * - Log levels: trace, debug, info, warn, error
 * - Automatic context prefixes
 * - Logs to file in production, console in development
 */

import {
  trace as pluginTrace,
  debug as pluginDebug,
  info as pluginInfo,
  warn as pluginWarn,
  error as pluginError,
} from '@tauri-apps/plugin-log';

type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * Format message with context prefix
 */
function formatMessage(message: string, context?: string): string {
  const prefix = context && context.trim() ? context : 'App';
  return `[${prefix}] ${message}`;
}

/**
 * Internal log function that handles the actual logging
 */
async function log(level: LogLevel, message: string, ...args: unknown[]): Promise<void> {
  // Extract context if second argument is a string
  let context = 'App';
  let extraArgs = args;

  if (args.length > 0 && typeof args[0] === 'string') {
    context = args[0] || 'App';
    extraArgs = args.slice(1);
  }

  // Format extra arguments as JSON if present
  let formattedMessage = formatMessage(message, context);
  if (extraArgs.length > 0) {
    const argsStr = extraArgs.map(arg => {
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    }).join(' ');
    formattedMessage = `${formattedMessage} ${argsStr}`;
  }

  // Log via Tauri plugin (goes to file and console)
  try {
    switch (level) {
      case 'trace':
        await pluginTrace(formattedMessage);
        break;
      case 'debug':
        await pluginDebug(formattedMessage);
        break;
      case 'info':
        await pluginInfo(formattedMessage);
        break;
      case 'warn':
        await pluginWarn(formattedMessage);
        break;
      case 'error':
        await pluginError(formattedMessage);
        break;
    }
  } catch (e) {
    // Fallback to console if plugin not available
    console[level === 'trace' ? 'debug' : level](formattedMessage);
  }
}

/**
 * Logger utility with different log levels
 * All logs go to both console and the unified log file
 */
export const logger = {
  /**
   * Trace level logging (most verbose)
   * @param message - The message to log
   * @param args - Optional context (string) followed by additional arguments
   */
  trace: (message: string, ...args: unknown[]) => {
    void log('trace', message, ...args);
  },

  /**
   * Debug level logging
   * @param message - The message to log
   * @param args - Optional context (string) followed by additional arguments
   */
  debug: (message: string, ...args: unknown[]) => {
    void log('debug', message, ...args);
  },

  /**
   * Info level logging
   * @param message - The message to log
   * @param args - Optional context (string) followed by additional arguments
   */
  info: (message: string, ...args: unknown[]) => {
    void log('info', message, ...args);
  },

  /**
   * Warning level logging
   * @param message - The message to log
   * @param args - Optional context (string) followed by additional arguments
   */
  warn: (message: string, ...args: unknown[]) => {
    void log('warn', message, ...args);
  },

  /**
   * Error level logging
   * @param message - The message to log
   * @param args - Optional context (string) followed by additional arguments
   */
  error: (message: string, ...args: unknown[]) => {
    void log('error', message, ...args);
  },
};

// Convenience exports for simpler imports
export const { trace, debug, info, warn, error } = logger;
