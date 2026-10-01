import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen, fireEvent } from '@testing-library/react';
import App from './App';
import { useDistroStore } from './store/distroStore';
import { usePollingStore } from './store/pollingStore';
import { useMountStore } from './store/mountStore';
import { useActionsStore } from './store/actionsStore';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

// Mock the stores used by polling
vi.mock('./store/distroStore');

// Mock preflight store to prevent it from calling distroStore
const mockPreflightState = {
  status: null,
  isChecking: false,
  hasChecked: true,
  isReady: true,
  title: '',
  message: '',
  helpUrl: null,
  checkPreflight: vi.fn().mockResolvedValue(undefined),
  reset: vi.fn(),
};

vi.mock('./store/preflightStore', () => ({
  usePreflightStore: Object.assign(
    vi.fn((selector?: any) => {
      if (selector) return selector(mockPreflightState);
      return mockPreflightState;
    }),
    {
      getState: () => mockPreflightState,
      setState: vi.fn(),
    }
  ),
}));

// Mock resource and health stores - Zustand stores are functions that can be called with selectors
// and also have a getState() method
const mockResourceState = {
  error: null,
  fetchStats: vi.fn().mockResolvedValue(undefined),
  clearStats: vi.fn(),
  stats: null,
  isLoading: false,
  getDistroResources: vi.fn(),
};

const mockHealthState = {
  error: null,
  fetchHealth: vi.fn().mockResolvedValue(true),
  fetchVersion: vi.fn().mockResolvedValue(true),
  health: null,
  versionInfo: null,
  isLoading: false,
  clearError: vi.fn(),
};

vi.mock('./store/resourceStore', () => ({
  useResourceStore: Object.assign(
    vi.fn((selector?: any) => {
      if (selector) return selector(mockResourceState);
      return mockResourceState;
    }),
    {
      getState: () => mockResourceState,
      setState: vi.fn(),
    }
  ),
}));

vi.mock('./store/healthStore', () => ({
  useHealthStore: Object.assign(
    vi.fn((selector?: any) => {
      if (selector) return selector(mockHealthState);
      return mockHealthState;
    }),
    {
      getState: () => mockHealthState,
      setState: vi.fn(),
    }
  ),
}));

// Mock Tauri event listener
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(),
}));

// Mock child components to simplify tests
vi.mock('./components/Header', () => ({
  Header: ({ onOpenSettings }: { onOpenSettings: () => void }) => <div data-testid="header">Header<button onClick={onOpenSettings}>Open settings</button></div>,
}));

vi.mock('./components/DistroList', () => ({
  DistroList: () => <div data-testid="distro-list">Distro List</div>,
}));

vi.mock('./components/StatusBar', () => ({
  StatusBar: () => <div data-testid="status-bar">Status Bar</div>,
}));

vi.mock('./components/SettingsPage', () => ({
  SettingsPage: () => <div data-testid="settings-page">Settings Page</div>,
}));

async function renderApp() {
  let view!: ReturnType<typeof render>;
  await act(async () => {
    view = render(<App />);
  });
  return view;
}

describe('App', () => {
  const mockFetchDistros = vi.fn();
  const mockUnlisten = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    useActionsStore.setState({ startupActionOutput: null });
    vi.useFakeTimers();
    useMountStore.setState({ mountedDisks: [], trackedMounts: [] });

    // Node's optional localStorage implementation may not expose the complete
    // browser Storage API in the Vitest environment.
    const localStorageValues = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      clear: vi.fn(() => localStorageValues.clear()),
      getItem: vi.fn((key: string) => localStorageValues.get(key) ?? null),
      key: vi.fn(),
      length: 0,
      removeItem: vi.fn((key: string) => localStorageValues.delete(key)),
      setItem: vi.fn((key: string, value: string) => localStorageValues.set(key, value)),
    });

    // Mock scrollTo for JSDOM environment
    Element.prototype.scrollTo = vi.fn();

    vi.mocked(useDistroStore).mockReturnValue({
      fetchDistros: mockFetchDistros,
      error: null,
      distributions: [],
    } as any);

    // Mock listen to return a promise that resolves to unlisten function
    vi.mocked(listen).mockResolvedValue(mockUnlisten);
  });

  afterEach(async () => {
    // Unmount before restoring the clock so effects cannot restart polling during cleanup.
    // Await React's async work, including the promised event listener cleanup.
    await act(async () => cleanup());
    expect(usePollingStore.getState().isRunning).toBe(false);
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('offers an independent container workspace and returns to distributions', async () => {
    await renderApp();
    expect(vi.mocked(invoke).mock.calls.some(([command]) => command.startsWith('container_'))).toBe(false);
    expect(screen.getByRole('button', { name: 'Distributions' })).toHaveAttribute('aria-pressed', 'true');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Containers' })));
    expect(screen.getByTestId('container-workspace')).toBeVisible();
    expect(screen.getByTestId('distro-list')).not.toBeVisible();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Distributions' })));
    expect(screen.getByTestId('distro-list')).toBeVisible();
  });

  it('shows startup action output when Settings is open', async () => {
    await renderApp(); await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Open settings' })));
    await act(async () => useActionsStore.setState({ startupActionOutput: { actionName: 'Startup script', distro: 'Ubuntu', output: 'late startup result', error: undefined } }));
    expect(screen.getByText('late startup result')).toBeVisible();
    useActionsStore.setState({ startupActionOutput: null });
  });
  describe('event listener cleanup', () => {
    it.each([true, false])('clears disk attachments only after confirmed tray shutdown: %s', async (shutdown) => {
      await renderApp();
      const attachment = {
        diskPath: 'D:\\data.vhdx', mountPoint: null, filesystem: null,
        isVhd: true, mountedAt: 1,
      };
      const filesystem = { path: '/dev/sdc', mountPoint: '/mnt/wsl/data', filesystem: 'ext4', isVhd: true };
      act(() => useMountStore.setState({ trackedMounts: [attachment], mountedDisks: [filesystem] }));
      const eventHandler = vi.mocked(listen).mock.calls.find(([name]) => name === 'distro-state-changed')![1];

      act(() => eventHandler({ payload: shutdown ? { shutdown: true } : null } as any));

      expect(useMountStore.getState().trackedMounts).toEqual(shutdown ? [] : [attachment]);
      expect(useMountStore.getState().mountedDisks).toEqual(shutdown ? [] : [filesystem]);
    });

    it('should clean up event listener on unmount', async () => {
      const { unmount } = await renderApp();

      // Rendering has settled the event listener setup
      expect(listen).toHaveBeenCalledWith('distro-state-changed', expect.any(Function));

      // Unmount the component
      await act(async () => unmount());

      // Verify unlisten was called
      expect(mockUnlisten).toHaveBeenCalled();
    });

    it('should cancel pending setTimeout on unmount', async () => {
      const { unmount } = await renderApp();

      // Rendering has settled the event listener setup
      expect(listen).toHaveBeenCalled();

      // Get the event handler that was registered
      const eventHandler = vi.mocked(listen).mock.calls[0][1];

      // Trigger the event (which schedules a setTimeout)
      eventHandler({ payload: null } as any);

      // Unmount before timeout fires
      await act(async () => unmount());

      // Advance timers - if timeout wasn't cleaned up, fetchDistros would be called
      await act(async () => vi.advanceTimersByTimeAsync(1000));

      // fetchDistros should not be called after unmount (timeout was cleaned up)
      // Note: initial loading is now handled by usePolling, not direct call
      expect(mockFetchDistros).not.toHaveBeenCalled();
    });

    it('should not update state after unmount', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { unmount } = await renderApp();

      // Rendering has settled the event listener setup
      expect(listen).toHaveBeenCalled();

      // Get the event handler
      const eventHandler = vi.mocked(listen).mock.calls[0][1];

      // Unmount the component
      await act(async () => unmount());

      // Trigger the event after unmount
      eventHandler({ payload: null } as any);

      // Advance timers
      await act(async () => vi.advanceTimersByTimeAsync(1000));

      // Should not cause React warnings about state updates on unmounted component
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Can't perform a React state update on an unmounted component")
      );

      consoleWarnSpy.mockRestore();
    });

    it('should allow multiple event triggers before unmount', async () => {
      const { unmount } = await renderApp();

      expect(listen).toHaveBeenCalled();

      const eventHandler = vi.mocked(listen).mock.calls[0][1];

      // Trigger event multiple times
      eventHandler({ payload: null } as any);
      eventHandler({ payload: null } as any);
      eventHandler({ payload: null } as any);

      // Advance time to fire first timeout
      await act(async () => vi.advanceTimersByTimeAsync(1000));

      // Only the last timeout should have been executed (debouncing behavior)
      // Initial fetch + 3 timeouts = 4 total, but if properly implemented with cleanup,
      // should be initial + 1 (the last one)
      // Note: Current implementation doesn't cancel previous timeouts, so this will fail
      // This test documents the EXPECTED behavior after the fix

      await act(async () => unmount());
    });
  });

  describe('initial render', () => {
    it('should initialize polling on mount via usePolling hook', async () => {
      // The App component now uses usePolling() hook to handle fetching
      // This test verifies the app renders without errors
      await renderApp();
      // The polling is handled by usePolling hook, not direct fetchDistros call
      expect(screen.getByTestId('header')).toBeInTheDocument();
    });

    it('should set up event listener on mount', async () => {
      await renderApp();

      expect(listen).toHaveBeenCalledWith('distro-state-changed', expect.any(Function));
    });

    it('should render main page by default', async () => {
      await renderApp();

      expect(screen.getByTestId('header')).toBeInTheDocument();
      expect(screen.getByTestId('distro-list')).toBeInTheDocument();
      expect(screen.getByTestId('status-bar')).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('should display error message when error is present', async () => {
      vi.mocked(useDistroStore).mockReturnValue({
        fetchDistros: mockFetchDistros,
        error: 'Failed to fetch distributions',
        distributions: [],
      } as any);

      await renderApp();

      expect(screen.getByText('System Error')).toBeInTheDocument();
      expect(screen.getByText('Failed to fetch distributions')).toBeInTheDocument();
    });
  });
});
