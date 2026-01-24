import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { invoke } from '@tauri-apps/api/core';
import { useReviewPrompt } from './useReviewPrompt';
import { useSettingsStore } from '../store/settingsStore';
import { useDistroStore } from '../store/distroStore';
import { DEFAULT_SETTINGS } from '../types/settings';

// Note: @tauri-apps/api/core is mocked in test/setup.ts

describe('useReviewPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset settings store to defaults with hasLoaded = false
    useSettingsStore.setState({
      settings: DEFAULT_SETTINGS,
      isLoading: false,
      isSaving: false,
      error: null,
      hasLoaded: false,
    });

    // Reset distro store
    useDistroStore.setState({
      distributions: [],
      isLoading: false,
      error: null,
    });
  });

  describe('initial state', () => {
    it('should not show prompt initially when settings not loaded', () => {
      const { result } = renderHook(() => useReviewPrompt());
      expect(result.current.shouldShowPrompt).toBe(false);
    });

    it('should not show prompt when hasLoaded is false', () => {
      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'pending',
        },
        hasLoaded: false,
      });

      const { result } = renderHook(() => useReviewPrompt());
      expect(result.current.shouldShowPrompt).toBe(false);
    });
  });

  describe('prompt display logic', () => {
    it('should show prompt when pending and first install complete', async () => {
      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'pending',
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await waitFor(() => {
        expect(result.current.shouldShowPrompt).toBe(true);
      });
    });

    it('should not show prompt when state is completed', async () => {
      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'completed',
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      // Wait a tick for effect to run
      await waitFor(() => {
        expect(result.current.shouldShowPrompt).toBe(false);
      });
    });

    it('should not show prompt when state is declined', async () => {
      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'declined',
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await waitFor(() => {
        expect(result.current.shouldShowPrompt).toBe(false);
      });
    });

    it('should not show prompt when first install not complete', async () => {
      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: false,
          reviewPromptState: 'pending',
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await waitFor(() => {
        expect(result.current.shouldShowPrompt).toBe(false);
      });
    });
  });

  describe('reminded state', () => {
    it('should show prompt when reminded and launch count >= 3', async () => {
      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'reminded',
          reviewPromptLaunchCount: 3,
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await waitFor(() => {
        expect(result.current.shouldShowPrompt).toBe(true);
      });
    });

    it('should not show prompt when reminded and launch count < 3', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'reminded',
          reviewPromptLaunchCount: 2,
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await waitFor(() => {
        expect(result.current.shouldShowPrompt).toBe(false);
      });
    });

    it('should increment launch count when reminded and count < 3', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'reminded',
          reviewPromptLaunchCount: 1,
        },
        hasLoaded: true,
      });

      renderHook(() => useReviewPrompt());

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('save_settings', expect.objectContaining({
          settings: expect.objectContaining({
            reviewPromptLaunchCount: 2,
          }),
        }));
      });
    });
  });

  describe('existing user detection', () => {
    it('should mark first install complete for existing users with distros', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useDistroStore.setState({
        distributions: [{ name: 'Ubuntu', state: 'Running' }] as any,
      });

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: false,
          reviewPromptState: 'pending',
        },
        hasLoaded: true,
      });

      renderHook(() => useReviewPrompt());

      await waitFor(() => {
        expect(invoke).toHaveBeenCalledWith('save_settings', expect.objectContaining({
          settings: expect.objectContaining({
            hasCompletedFirstInstall: true,
          }),
        }));
      });
    });
  });

  describe('handleReview', () => {
    it('should call open_store_review command', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'pending',
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await act(async () => {
        await result.current.handleReview();
      });

      expect(invoke).toHaveBeenCalledWith('open_store_review');
    });

    it('should set reviewPromptState to completed', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'pending',
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await act(async () => {
        await result.current.handleReview();
      });

      expect(invoke).toHaveBeenCalledWith('save_settings', expect.objectContaining({
        settings: expect.objectContaining({
          reviewPromptState: 'completed',
        }),
      }));
    });

    it('should hide prompt after clicking review', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'pending',
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await waitFor(() => {
        expect(result.current.shouldShowPrompt).toBe(true);
      });

      await act(async () => {
        await result.current.handleReview();
      });

      expect(result.current.shouldShowPrompt).toBe(false);
    });
  });

  describe('handleMaybeLater', () => {
    it('should set reviewPromptState to reminded on first click', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'pending',
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await act(async () => {
        await result.current.handleMaybeLater();
      });

      expect(invoke).toHaveBeenCalledWith('save_settings', expect.objectContaining({
        settings: expect.objectContaining({
          reviewPromptState: 'reminded',
        }),
      }));
    });

    it('should reset launch count to 0 on first click', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'pending',
          reviewPromptLaunchCount: 5,
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await act(async () => {
        await result.current.handleMaybeLater();
      });

      expect(invoke).toHaveBeenCalledWith('save_settings', expect.objectContaining({
        settings: expect.objectContaining({
          reviewPromptLaunchCount: 0,
        }),
      }));
    });

    it('should set reviewPromptState to declined on second click', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'reminded',
          reviewPromptLaunchCount: 3,
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await act(async () => {
        await result.current.handleMaybeLater();
      });

      expect(invoke).toHaveBeenCalledWith('save_settings', expect.objectContaining({
        settings: expect.objectContaining({
          reviewPromptState: 'declined',
        }),
      }));
    });
  });

  describe('handleNoThanks', () => {
    it('should set reviewPromptState to declined', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'pending',
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await act(async () => {
        await result.current.handleNoThanks();
      });

      expect(invoke).toHaveBeenCalledWith('save_settings', expect.objectContaining({
        settings: expect.objectContaining({
          reviewPromptState: 'declined',
        }),
      }));
    });

    it('should hide prompt after clicking no thanks', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
          reviewPromptState: 'pending',
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await waitFor(() => {
        expect(result.current.shouldShowPrompt).toBe(true);
      });

      await act(async () => {
        await result.current.handleNoThanks();
      });

      expect(result.current.shouldShowPrompt).toBe(false);
    });
  });

  describe('markFirstInstallComplete', () => {
    it('should set hasCompletedFirstInstall to true', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: false,
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await act(async () => {
        await result.current.markFirstInstallComplete();
      });

      expect(invoke).toHaveBeenCalledWith('save_settings', expect.objectContaining({
        settings: expect.objectContaining({
          hasCompletedFirstInstall: true,
        }),
      }));
    });

    it('should be idempotent - not call save if already complete', async () => {
      vi.mocked(invoke).mockResolvedValue(undefined);

      useSettingsStore.setState({
        settings: {
          ...DEFAULT_SETTINGS,
          hasCompletedFirstInstall: true,
        },
        hasLoaded: true,
      });

      const { result } = renderHook(() => useReviewPrompt());

      await act(async () => {
        await result.current.markFirstInstallComplete();
      });

      // Should not have called save_settings for hasCompletedFirstInstall
      // (may have been called for other reasons during initialization)
      const saveSettingsCalls = vi.mocked(invoke).mock.calls.filter(
        call => call[0] === 'save_settings' &&
        (call[1] as any)?.settings?.hasCompletedFirstInstall === true
      );
      // The call should not happen if already true
      expect(saveSettingsCalls.length).toBe(0);
    });
  });
});
