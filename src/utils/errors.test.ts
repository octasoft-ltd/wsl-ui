import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Tauri plugin-log module
vi.mock('@tauri-apps/plugin-log', () => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { parseError, logError, formatError, ErrorCode } from './errors';
import * as pluginLog from '@tauri-apps/plugin-log';

describe('errors', () => {
  describe('parseError', () => {
    it('parses Error instance to AppError', () => {
      const error = new Error('Something went wrong');
      const result = parseError(error);

      expect(result).toEqual({
        code: ErrorCode.UNKNOWN,
        message: 'Something went wrong',
      });
    });

    it('parses string to AppError', () => {
      const result = parseError('Simple error');

      expect(result).toEqual({
        code: ErrorCode.UNKNOWN,
        message: 'Simple error',
      });
    });

    it('parses unknown type to AppError', () => {
      const result = parseError(42);

      expect(result).toEqual({
        code: ErrorCode.UNKNOWN,
        message: '42',
      });
    });

    it('detects distribution not found error', () => {
      const error = new Error('Distribution not found: Ubuntu');
      const result = parseError(error);

      expect(result.code).toBe(ErrorCode.DISTRO_NOT_FOUND);
      expect(result.hint).toBeDefined();
    });

    it('detects WSL not installed error', () => {
      const error = new Error('wsl is not recognized or WSL not installed');
      const result = parseError(error);

      expect(result.code).toBe(ErrorCode.WSL_NOT_INSTALLED);
      expect(result.hint).toContain('wsl --install');
    });

    it('detects container runtime not found error', () => {
      const error = new Error('podman command not found');
      const result = parseError(error);

      expect(result.code).toBe(ErrorCode.CONTAINER_RUNTIME_NOT_FOUND);
      expect(result.hint).toContain('Podman');
    });

    it('detects docker runtime not found error', () => {
      const error = new Error('docker: command not found');
      const result = parseError(error);

      expect(result.code).toBe(ErrorCode.CONTAINER_RUNTIME_NOT_FOUND);
    });

    it('detects permission denied error', () => {
      const error = new Error('Access denied: permission denied');
      const result = parseError(error);

      expect(result.code).toBe(ErrorCode.PERMISSION_DENIED);
      expect(result.hint).toContain('administrator');
    });

    it('detects file not found error', () => {
      const error = new Error('file not found: /path/to/file');
      const result = parseError(error);

      expect(result.code).toBe(ErrorCode.FILE_NOT_FOUND);
    });

    it('detects disk full error', () => {
      const error = new Error('No space left on device');
      const result = parseError(error);

      expect(result.code).toBe(ErrorCode.DISK_FULL);
      expect(result.hint).toContain('space');
    });

    it('detects distribution already exists error', () => {
      const error = new Error('distribution already exists: Ubuntu');
      const result = parseError(error);

      expect(result.code).toBe(ErrorCode.DISTRO_ALREADY_EXISTS);
    });

    it('detects distribution running error', () => {
      const error = new Error("can't delete: distribution is running");
      const result = parseError(error);

      expect(result.code).toBe(ErrorCode.DISTRO_RUNNING);
    });

    it('preserves original message in details', () => {
      const error = new Error('Distribution not found: Ubuntu');
      const result = parseError(error);

      expect(result.details).toBe('Distribution not found: Ubuntu');
    });
  });

  describe('formatError', () => {
    it('formats error without hint', () => {
      const error = { code: ErrorCode.UNKNOWN, message: 'Something failed' };
      const result = formatError(error);

      expect(result).toBe('Something failed');
    });

    it('formats error with hint', () => {
      const error = {
        code: ErrorCode.WSL_NOT_INSTALLED,
        message: 'WSL not installed',
        hint: 'Run "wsl --install"',
      };
      const result = formatError(error);

      expect(result).toBe('WSL not installed. Run "wsl --install"');
    });
  });

  describe('logError', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('logs error to console', async () => {
      const error = { code: ErrorCode.UNKNOWN, message: 'Test error' };
      logError(error);

      await vi.waitFor(() => {
        expect(pluginLog.error).toHaveBeenCalled();
      });
    });

    it('includes context in log', async () => {
      const error = { code: ErrorCode.UNKNOWN, message: 'Test error' };
      logError(error, 'TestContext');

      await vi.waitFor(() => {
        expect(pluginLog.error).toHaveBeenCalled();
        const call = vi.mocked(pluginLog.error).mock.calls[0][0];
        expect(call).toContain('TestContext');
      });
    });

    it('includes error details in log object', async () => {
      const error = {
        code: ErrorCode.FILE_NOT_FOUND,
        message: 'File not found',
        details: '/path/to/file',
      };
      logError(error);

      await vi.waitFor(() => {
        expect(pluginLog.error).toHaveBeenCalled();
        const call = vi.mocked(pluginLog.error).mock.calls[0][0];
        expect(call).toContain('FILE_NOT_FOUND');
      });
    });

    it('uses default context when not provided', async () => {
      const error = { code: ErrorCode.UNKNOWN, message: 'Test' };
      logError(error);

      await vi.waitFor(() => {
        expect(pluginLog.error).toHaveBeenCalled();
        const call = vi.mocked(pluginLog.error).mock.calls[0][0];
        expect(call).toContain('App');
      });
    });
  });

  describe('ErrorCode', () => {
    it('has all expected error codes', () => {
      expect(ErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
      expect(ErrorCode.TIMEOUT).toBe('TIMEOUT');
      expect(ErrorCode.WSL_NOT_INSTALLED).toBe('WSL_NOT_INSTALLED');
      expect(ErrorCode.DISTRO_NOT_FOUND).toBe('DISTRO_NOT_FOUND');
      expect(ErrorCode.DISTRO_ALREADY_EXISTS).toBe('DISTRO_ALREADY_EXISTS');
      expect(ErrorCode.DISTRO_RUNNING).toBe('DISTRO_RUNNING');
      expect(ErrorCode.CONTAINER_RUNTIME_NOT_FOUND).toBe('CONTAINER_RUNTIME_NOT_FOUND');
      expect(ErrorCode.FILE_NOT_FOUND).toBe('FILE_NOT_FOUND');
      expect(ErrorCode.PERMISSION_DENIED).toBe('PERMISSION_DENIED');
      expect(ErrorCode.DISK_FULL).toBe('DISK_FULL');
      expect(ErrorCode.UNKNOWN).toBe('UNKNOWN');
    });
  });
});


