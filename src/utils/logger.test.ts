import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the Tauri plugin-log module
vi.mock('@tauri-apps/plugin-log', () => ({
  trace: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));

import { logger } from './logger';
import * as pluginLog from '@tauri-apps/plugin-log';

describe('logger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('debug', () => {
    it('formats message with context', async () => {
      logger.debug('Test message', 'TestContext');
      // Wait for async logging
      await vi.waitFor(() => {
        expect(pluginLog.debug).toHaveBeenCalledWith('[TestContext] Test message');
      });
    });

    it('formats message without context', async () => {
      logger.debug('Test message');
      await vi.waitFor(() => {
        expect(pluginLog.debug).toHaveBeenCalledWith('[App] Test message');
      });
    });

    it('handles multiple arguments', async () => {
      logger.debug('Test', 'Context', { key: 'value' }, 123);
      await vi.waitFor(() => {
        expect(pluginLog.debug).toHaveBeenCalledWith('[Context] Test {"key":"value"} 123');
      });
    });

    it('handles empty context', async () => {
      logger.debug('Test', '', 'data');
      await vi.waitFor(() => {
        expect(pluginLog.debug).toHaveBeenCalledWith('[App] Test "data"');
      });
    });
  });

  describe('info', () => {
    it('formats message with context', async () => {
      logger.info('Info message', 'InfoContext');
      await vi.waitFor(() => {
        expect(pluginLog.info).toHaveBeenCalledWith('[InfoContext] Info message');
      });
    });

    it('formats message without context', async () => {
      logger.info('Info message');
      await vi.waitFor(() => {
        expect(pluginLog.info).toHaveBeenCalledWith('[App] Info message');
      });
    });

    it('handles multiple arguments', async () => {
      logger.info('Info', 'Context', { data: 'test' });
      await vi.waitFor(() => {
        expect(pluginLog.info).toHaveBeenCalledWith('[Context] Info {"data":"test"}');
      });
    });
  });

  describe('warn', () => {
    it('formats warning with context', async () => {
      logger.warn('Warning message', 'WarnContext');
      await vi.waitFor(() => {
        expect(pluginLog.warn).toHaveBeenCalledWith('[WarnContext] Warning message');
      });
    });

    it('formats warning without context', async () => {
      logger.warn('Warning message');
      await vi.waitFor(() => {
        expect(pluginLog.warn).toHaveBeenCalledWith('[App] Warning message');
      });
    });

    it('always outputs warnings regardless of environment', async () => {
      logger.warn('Important warning');
      await vi.waitFor(() => {
        expect(pluginLog.warn).toHaveBeenCalled();
      });
    });
  });

  describe('error', () => {
    it('formats error with context', async () => {
      logger.error('Error message', 'ErrorContext');
      await vi.waitFor(() => {
        expect(pluginLog.error).toHaveBeenCalledWith('[ErrorContext] Error message');
      });
    });

    it('formats error without context', async () => {
      logger.error('Error message');
      await vi.waitFor(() => {
        expect(pluginLog.error).toHaveBeenCalledWith('[App] Error message');
      });
    });

    it('handles Error objects', async () => {
      const error = new Error('Test error');
      logger.error('Failed', 'Context', error);
      await vi.waitFor(() => {
        // Error objects get JSON stringified
        expect(pluginLog.error).toHaveBeenCalled();
        const call = vi.mocked(pluginLog.error).mock.calls[0][0];
        expect(call).toContain('[Context] Failed');
      });
    });

    it('handles multiple arguments', async () => {
      logger.error('Error', 'Context', { code: 500 }, 'details');
      await vi.waitFor(() => {
        expect(pluginLog.error).toHaveBeenCalledWith('[Context] Error {"code":500} "details"');
      });
    });

    it('always outputs errors regardless of environment', async () => {
      logger.error('Critical error');
      await vi.waitFor(() => {
        expect(pluginLog.error).toHaveBeenCalled();
      });
    });
  });

  describe('formatting', () => {
    it('handles null and undefined', async () => {
      logger.info('Test', 'Context', null, undefined);
      await vi.waitFor(() => {
        // JSON.stringify(null) = "null", JSON.stringify(undefined) = undefined (empty when joined)
        expect(pluginLog.info).toHaveBeenCalledWith('[Context] Test null ');
      });
    });

    it('handles arrays', async () => {
      logger.info('Test', 'Context', [1, 2, 3]);
      await vi.waitFor(() => {
        expect(pluginLog.info).toHaveBeenCalledWith('[Context] Test [1,2,3]');
      });
    });

    it('handles nested objects', async () => {
      const obj = { a: { b: { c: 'deep' } } };
      logger.info('Test', 'Context', obj);
      await vi.waitFor(() => {
        expect(pluginLog.info).toHaveBeenCalledWith('[Context] Test {"a":{"b":{"c":"deep"}}}');
      });
    });
  });

  describe('fallback to console', () => {
    it('falls back to console when plugin throws', async () => {
      const consoleDebugSpy = vi.spyOn(console, 'debug').mockImplementation(() => {});
      vi.mocked(pluginLog.debug).mockRejectedValueOnce(new Error('Plugin unavailable'));

      logger.debug('Fallback test', 'Context');

      await vi.waitFor(() => {
        expect(consoleDebugSpy).toHaveBeenCalledWith('[Context] Fallback test');
      });

      consoleDebugSpy.mockRestore();
    });
  });

  describe('trace', () => {
    it('formats trace message with context', async () => {
      logger.trace('Trace message', 'TraceContext');
      await vi.waitFor(() => {
        expect(pluginLog.trace).toHaveBeenCalledWith('[TraceContext] Trace message');
      });
    });
  });
});
