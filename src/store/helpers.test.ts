import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createAsyncAction } from './helpers';

describe('createAsyncAction', () => {
  let mockSet: ReturnType<typeof vi.fn>;
  let mockGet: ReturnType<typeof vi.fn>;
  let state: Record<string, unknown>;

  beforeEach(() => {
    state = {
      actionInProgress: null,
      error: null,
    };

    mockSet = vi.fn((partial) => {
      if (typeof partial === 'function') {
        Object.assign(state, partial(state));
      } else {
        Object.assign(state, partial);
      }
    });

    mockGet = vi.fn(() => state);
  });

  describe('progress message', () => {
    it('sets actionInProgress with string message', async () => {
      const action = createAsyncAction(mockGet, mockSet, {
        progressMessage: 'Loading...',
        action: async () => {},
        errorMessage: 'Failed',
      });

      await action(undefined);

      expect(mockSet).toHaveBeenCalledWith({ actionInProgress: 'Loading...' });
    });

    it('sets actionInProgress with function message', async () => {
      const action = createAsyncAction<unknown, string>(mockGet, mockSet, {
        progressMessage: (name) => `Starting ${name}...`,
        action: async () => {},
        errorMessage: 'Failed',
      });

      await action('Ubuntu');

      expect(mockSet).toHaveBeenCalledWith({
        actionInProgress: 'Starting Ubuntu...',
      });
    });

    it('clears actionInProgress in finally', async () => {
      const action = createAsyncAction(mockGet, mockSet, {
        progressMessage: 'Loading...',
        action: async () => {},
        errorMessage: 'Failed',
      });

      await action(undefined);

      expect(mockSet).toHaveBeenLastCalledWith({ actionInProgress: null });
    });

    it('clears actionInProgress even on error', async () => {
      const action = createAsyncAction(mockGet, mockSet, {
        progressMessage: 'Loading...',
        action: async () => {
          throw new Error('Test error');
        },
        errorMessage: 'Failed',
      });

      await action(undefined);

      expect(mockSet).toHaveBeenLastCalledWith({ actionInProgress: null });
    });
  });

  describe('action execution', () => {
    it('calls the action with provided args', async () => {
      const mockAction = vi.fn().mockResolvedValue('result');

      const action = createAsyncAction<unknown, string>(mockGet, mockSet, {
        progressMessage: 'Working...',
        action: mockAction,
        errorMessage: 'Failed',
      });

      await action('test-arg');

      expect(mockAction).toHaveBeenCalledWith('test-arg');
    });

    it('returns result from action', async () => {
      const action = createAsyncAction<unknown, string, string>(
        mockGet,
        mockSet,
        {
          progressMessage: 'Working...',
          action: async (name) => `Hello ${name}`,
          errorMessage: 'Failed',
        }
      );

      const result = await action('World');

      expect(result).toBe('Hello World');
    });

    it('returns null on error', async () => {
      const action = createAsyncAction(mockGet, mockSet, {
        progressMessage: 'Working...',
        action: async () => {
          throw new Error('Test');
        },
        errorMessage: 'Failed',
      });

      const result = await action(undefined);

      expect(result).toBeNull();
    });
  });

  describe('onSuccess callback', () => {
    it('calls onSuccess after successful action', async () => {
      const mockOnSuccess = vi.fn();

      const action = createAsyncAction(mockGet, mockSet, {
        progressMessage: 'Working...',
        action: async () => 'result',
        onSuccess: mockOnSuccess,
        errorMessage: 'Failed',
      });

      await action(undefined);

      expect(mockOnSuccess).toHaveBeenCalledWith('result', mockGet, mockSet);
    });

    it('does not call onSuccess on error', async () => {
      const mockOnSuccess = vi.fn();

      const action = createAsyncAction(mockGet, mockSet, {
        progressMessage: 'Working...',
        action: async () => {
          throw new Error('Test');
        },
        onSuccess: mockOnSuccess,
        errorMessage: 'Failed',
      });

      await action(undefined);

      expect(mockOnSuccess).not.toHaveBeenCalled();
    });

    it('awaits async onSuccess', async () => {
      const order: string[] = [];

      const action = createAsyncAction(mockGet, mockSet, {
        progressMessage: 'Working...',
        action: async () => {
          order.push('action');
        },
        onSuccess: async () => {
          await new Promise((r) => setTimeout(r, 10));
          order.push('onSuccess');
        },
        errorMessage: 'Failed',
      });

      await action(undefined);
      order.push('done');

      expect(order).toEqual(['action', 'onSuccess', 'done']);
    });
  });

  describe('error handling', () => {
    it('sets error with string message', async () => {
      const action = createAsyncAction(mockGet, mockSet, {
        progressMessage: 'Working...',
        action: async () => {
          throw new Error('Test');
        },
        errorMessage: 'Operation failed',
      });

      await action(undefined);

      expect(mockSet).toHaveBeenCalledWith({ error: 'Operation failed' });
    });

    it('sets error with function message', async () => {
      const action = createAsyncAction<unknown, string>(mockGet, mockSet, {
        progressMessage: 'Working...',
        action: async () => {
          throw new Error('Test');
        },
        errorMessage: (name, error) => `Failed to process ${name}: ${error.message}`,
      });

      await action('Ubuntu');

      expect(mockSet).toHaveBeenCalledWith({
        error: 'Failed to process Ubuntu: Test',
      });
    });

    it('handles non-Error throws', async () => {
      const action = createAsyncAction(mockGet, mockSet, {
        progressMessage: 'Working...',
        action: async () => {
          throw 'string error';
        },
        errorMessage: 'Failed',
      });

      await action(undefined);

      expect(mockSet).toHaveBeenCalledWith({ error: 'Failed' });
    });
  });

  describe('type safety', () => {
    it('properly types void return', async () => {
      const action = createAsyncAction<unknown, undefined, void>(
        mockGet,
        mockSet,
        {
          progressMessage: 'Working...',
          action: async () => {},
          errorMessage: 'Failed',
        }
      );

      const result = await action(undefined);
      // Result should be undefined on success, null on error
      expect(result === undefined || result === null).toBe(true);
    });

    it('properly types return value', async () => {
      const action = createAsyncAction<unknown, number, number>(
        mockGet,
        mockSet,
        {
          progressMessage: 'Working...',
          action: async (n) => n * 2,
          errorMessage: 'Failed',
        }
      );

      const result = await action(5);
      expect(result).toBe(10);
    });
  });
});





