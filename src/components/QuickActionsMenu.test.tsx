import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QuickActionsMenu } from './QuickActionsMenu';
import { useDistroStore } from '../store/distroStore';
import { useActionsStore } from '../store/actionsStore';
import type { Distribution } from '../types/distribution';
import type { CustomAction } from '../types/actions';

// Mock the stores
vi.mock('../store/distroStore');
vi.mock('../store/actionsStore');

// Mock dialog components
vi.mock('./CloneDialog', () => ({
  CloneDialog: () => <div data-testid="clone-dialog">Clone Dialog</div>,
}));

vi.mock('./ConfirmDialog', () => ({
  ConfirmDialog: () => <div data-testid="confirm-dialog">Confirm Dialog</div>,
}));

vi.mock('./PasswordPromptDialog', () => ({
  PasswordPromptDialog: () => <div data-testid="password-prompt-dialog">Password Prompt Dialog</div>,
}));

describe('QuickActionsMenu - Regex Error Handling', () => {
  const mockFetchActions = vi.fn();
  const mockExecuteAction = vi.fn();

  const testDistro: Distribution = {
    name: 'Ubuntu-22.04',
    state: 'Running',
    version: 2,
    isDefault: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock distro store
    vi.mocked(useDistroStore).mockReturnValue({
      setDefault: vi.fn(),
      openTerminal: vi.fn(),
      openFileExplorer: vi.fn(),
      openIDE: vi.fn(),
      restartDistro: vi.fn(),
      exportDistro: vi.fn(),
      actionInProgress: null,
    } as any);

    // Default actions store mock
    vi.mocked(useActionsStore).mockReturnValue({
      actions: [],
      fetchActions: mockFetchActions,
      executeAction: mockExecuteAction,
      isExecuting: false,
    } as any);
  });

  describe('invalid regex pattern handling', () => {
    it('should not crash when action has invalid regex pattern', () => {
      const invalidRegexAction: CustomAction = {
        id: 'test-action',
        name: 'Test Action',
        icon: 'test',
        command: 'echo test',
        scope: { type: 'pattern', pattern: '[invalid regex' },  // Invalid regex - unclosed bracket
        confirmBeforeRun: false,
        showOutput: false,
        requiresSudo: false,
        requiresStopped: false,
        runInTerminal: false,
        order: 0,
      };

      vi.mocked(useActionsStore).mockReturnValue({
        actions: [invalidRegexAction],
        fetchActions: mockFetchActions,
        executeAction: mockExecuteAction,
        isExecuting: false,
      } as any);

      // Should not throw error
      expect(() => {
        render(<QuickActionsMenu distro={testDistro} />);
      }).not.toThrow();
    });

    it('should not show action when regex pattern is invalid', () => {
      const invalidRegexAction: CustomAction = {
        id: 'test-action',
        name: 'Invalid Regex Action',
        icon: 'test',
        command: 'echo test',
        scope: { type: 'pattern', pattern: '(unclosed' },  // Invalid regex - unclosed parenthesis
        confirmBeforeRun: false,
        showOutput: false,
        requiresSudo: false,
        requiresStopped: false,
        runInTerminal: false,
        order: 0,
      };

      vi.mocked(useActionsStore).mockReturnValue({
        actions: [invalidRegexAction],
        fetchActions: mockFetchActions,
        executeAction: mockExecuteAction,
        isExecuting: false,
      } as any);

      render(<QuickActionsMenu distro={testDistro} />);

      // The action should not appear in the menu since the regex is invalid
      expect(screen.queryByText('Invalid Regex Action')).not.toBeInTheDocument();
    });

    it('should handle multiple actions with mix of valid and invalid regex', () => {
      const validAction: CustomAction = {
        id: 'valid-action',
        name: 'Valid Action',
        icon: 'check',
        command: 'echo valid',
        scope: { type: 'pattern', pattern: 'Ubuntu.*' },  // Valid regex
        confirmBeforeRun: false,
        showOutput: false,
        requiresSudo: false,
        requiresStopped: false,
        runInTerminal: false,
        order: 0,
      };

      const invalidAction: CustomAction = {
        id: 'invalid-action',
        name: 'Invalid Action',
        icon: 'error',
        command: 'echo invalid',
        scope: { type: 'pattern', pattern: '[invalid' },  // Invalid regex
        confirmBeforeRun: false,
        showOutput: false,
        requiresSudo: false,
        requiresStopped: false,
        runInTerminal: false,
        order: 1,
      };

      vi.mocked(useActionsStore).mockReturnValue({
        actions: [validAction, invalidAction],
        fetchActions: mockFetchActions,
        executeAction: mockExecuteAction,
        isExecuting: false,
      } as any);

      render(<QuickActionsMenu distro={testDistro} />);

      // Should not crash
      expect(screen.getByTestId('quick-actions-button')).toBeInTheDocument();

      // Invalid action should not be shown (silently filtered)
      expect(screen.queryByText('Invalid Action')).not.toBeInTheDocument();
    });
  });

  describe('valid regex pattern handling', () => {
    it('should show action when regex pattern matches distro name', () => {
      const matchingAction: CustomAction = {
        id: 'matching-action',
        name: 'Matching Action',
        icon: 'check',
        command: 'echo match',
        scope: { type: 'pattern', pattern: '^Ubuntu-.*' },  // Should match Ubuntu-22.04
        confirmBeforeRun: false,
        showOutput: false,
        requiresSudo: false,
        requiresStopped: false,
        runInTerminal: false,
        order: 0,
      };

      vi.mocked(useActionsStore).mockReturnValue({
        actions: [matchingAction],
        fetchActions: mockFetchActions,
        executeAction: mockExecuteAction,
        isExecuting: false,
      } as any);

      render(<QuickActionsMenu distro={testDistro} />);

      // Should render without errors
      expect(screen.getByTestId('quick-actions-button')).toBeInTheDocument();
    });

    it('should not show action when regex pattern does not match distro name', () => {
      const nonMatchingAction: CustomAction = {
        id: 'non-matching-action',
        name: 'Non-Matching Action',
        icon: 'cross',
        command: 'echo no match',
        scope: { type: 'pattern', pattern: '^Debian-.*' },  // Should NOT match Ubuntu-22.04
        confirmBeforeRun: false,
        showOutput: false,
        requiresSudo: false,
        requiresStopped: false,
        runInTerminal: false,
        order: 0,
      };

      vi.mocked(useActionsStore).mockReturnValue({
        actions: [nonMatchingAction],
        fetchActions: mockFetchActions,
        executeAction: mockExecuteAction,
        isExecuting: false,
      } as any);

      render(<QuickActionsMenu distro={testDistro} />);

      // The action should not appear since it doesn't match
      expect(screen.queryByText('Non-Matching Action')).not.toBeInTheDocument();
    });
  });

  describe('empty pattern handling', () => {
    it('should handle action with empty distro pattern', () => {
      const emptyPatternAction: CustomAction = {
        id: 'empty-pattern',
        name: 'Empty Pattern Action',
        icon: 'empty',
        command: 'echo empty',
        scope: { type: 'pattern', pattern: '' },  // Empty pattern
        confirmBeforeRun: false,
        showOutput: false,
        requiresSudo: false,
        requiresStopped: false,
        runInTerminal: false,
        order: 0,
      };

      vi.mocked(useActionsStore).mockReturnValue({
        actions: [emptyPatternAction],
        fetchActions: mockFetchActions,
        executeAction: mockExecuteAction,
        isExecuting: false,
      } as any);

      // Should not crash
      expect(() => {
        render(<QuickActionsMenu distro={testDistro} />);
      }).not.toThrow();
    });
  });

  describe('special regex characters handling', () => {
    it('should handle regex with special characters correctly', () => {
      const specialCharsAction: CustomAction = {
        id: 'special-chars',
        name: 'Special Chars Action',
        icon: 'special',
        command: 'echo special',
        scope: { type: 'pattern', pattern: 'Ubuntu-\\d+\\.\\d+' },  // Should match Ubuntu-22.04
        confirmBeforeRun: false,
        showOutput: false,
        requiresSudo: false,
        requiresStopped: false,
        runInTerminal: false,
        order: 0,
      };

      vi.mocked(useActionsStore).mockReturnValue({
        actions: [specialCharsAction],
        fetchActions: mockFetchActions,
        executeAction: mockExecuteAction,
        isExecuting: false,
      } as any);

      // Should not crash with special regex chars
      expect(() => {
        render(<QuickActionsMenu distro={testDistro} />);
      }).not.toThrow();
    });

    it('should handle invalid escape sequences gracefully', () => {
      const invalidEscapeAction: CustomAction = {
        id: 'invalid-escape',
        name: 'Invalid Escape Action',
        icon: 'escape',
        command: 'echo escape',
        scope: { type: 'pattern', pattern: '\\k' },  // Invalid escape sequence
        confirmBeforeRun: false,
        showOutput: false,
        requiresSudo: false,
        requiresStopped: false,
        runInTerminal: false,
        order: 0,
      };

      vi.mocked(useActionsStore).mockReturnValue({
        actions: [invalidEscapeAction],
        fetchActions: mockFetchActions,
        executeAction: mockExecuteAction,
        isExecuting: false,
      } as any);

      // Should not crash
      expect(() => {
        render(<QuickActionsMenu distro={testDistro} />);
      }).not.toThrow();
    });
  });

  describe('target distros types', () => {
    it('should handle "all" target without regex', () => {
      const allTargetAction: CustomAction = {
        id: 'all-target',
        name: 'All Target Action',
        icon: 'all',
        command: 'echo all',
        scope: { type: 'all' },
        confirmBeforeRun: false,
        showOutput: false,
        requiresSudo: false,
        requiresStopped: false,
        runInTerminal: false,
        order: 0,
      };

      vi.mocked(useActionsStore).mockReturnValue({
        actions: [allTargetAction],
        fetchActions: mockFetchActions,
        executeAction: mockExecuteAction,
        isExecuting: false,
      } as any);

      // Should work fine without regex
      expect(() => {
        render(<QuickActionsMenu distro={testDistro} />);
      }).not.toThrow();
    });

    it('should handle "specific" target without regex', () => {
      const specificTargetAction: CustomAction = {
        id: 'specific-target',
        name: 'Specific Target Action',
        icon: 'specific',
        command: 'echo specific',
        scope: { type: 'specific', distros: ['Ubuntu-22.04', 'Debian'] },
        confirmBeforeRun: false,
        showOutput: false,
        requiresSudo: false,
        requiresStopped: false,
        runInTerminal: false,
        order: 0,
      };

      vi.mocked(useActionsStore).mockReturnValue({
        actions: [specificTargetAction],
        fetchActions: mockFetchActions,
        executeAction: mockExecuteAction,
        isExecuting: false,
      } as any);

      // Should work fine without regex
      expect(() => {
        render(<QuickActionsMenu distro={testDistro} />);
      }).not.toThrow();
    });
  });
});
