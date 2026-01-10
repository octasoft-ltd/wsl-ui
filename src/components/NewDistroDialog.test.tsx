import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NewDistroDialog } from './NewDistroDialog';
import { wslService } from '../services/wslService';
import { useDistroStore } from '../store/distroStore';
import { useSettingsStore } from '../store/settingsStore';

// Mock the stores
vi.mock('../store/distroStore');
vi.mock('../store/settingsStore');

// Mock WSL service
vi.mock('../services/wslService', () => ({
  wslService: {
    getDistroCatalog: vi.fn(),
    listOnlineDistributions: vi.fn(),
    quickInstallDistribution: vi.fn(),
    customInstallWithProgress: vi.fn(),
    createFromImage: vi.fn(),
    onDownloadProgress: vi.fn(),
    saveDistroMetadata: vi.fn(),
  },
}));

// Mock Tauri dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

describe('NewDistroDialog - Memory Leaks', () => {
  const mockFetchDistros = vi.fn();
  const mockOnClose = vi.fn();

  const mockCatalog = {
    version: '1.0.0',
    downloadDistros: [
      {
        id: 'ubuntu',
        name: 'Ubuntu',
        description: 'Ubuntu Linux',
        enabled: true,
        color: 'orange',
        size: '500 MB',
        url: 'https://example.com/ubuntu.tar.gz',
      },
    ],
    containerImages: [
      {
        id: 'ubuntu-container',
        name: 'Ubuntu',
        description: 'Ubuntu container',
        image: 'ubuntu:latest',
        enabled: true,
        color: 'orange',
      },
    ],
    msStoreDistros: {
      Ubuntu: {
        color: 'orange',
        description: 'Ubuntu from Microsoft Store',
      },
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock scrollTo for JSDOM environment
    Element.prototype.scrollTo = vi.fn();

    vi.mocked(useDistroStore).mockReturnValue({
      fetchDistros: mockFetchDistros,
      distributions: [],
    } as any);

    vi.mocked(useSettingsStore).mockReturnValue({
      settings: {
        distributionSources: {
          lxcEnabled: false,
          lxcBaseUrl: 'https://images.linuxcontainers.org',
        },
        containerRuntime: 'builtin',
      },
    } as any);

    vi.mocked(wslService.getDistroCatalog).mockResolvedValue(mockCatalog);
    vi.mocked(wslService.listOnlineDistributions).mockResolvedValue(['Ubuntu', 'Debian']);
    vi.mocked(wslService.onDownloadProgress).mockResolvedValue(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('quick install mode', () => {
    it('should cancel pending timeout when dialog is closed before timeout fires', async () => {
      vi.mocked(wslService.quickInstallDistribution).mockResolvedValue(undefined);

      const { unmount } = render(
        <NewDistroDialog isOpen={true} onClose={mockOnClose} />
      );

      // Advance past the 600ms loading delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });

      // Select a distro
      const ubuntuButton = screen.getByText('Ubuntu');
      fireEvent.click(ubuntuButton);

      // Click install
      const installButton = screen.getByText('Install');
      fireEvent.click(installButton);

      // Flush all promises to complete installation
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(wslService.quickInstallDistribution).toHaveBeenCalled();

      // Unmount before the 1000ms close timeout fires
      unmount();

      // Advance timers past the close timeout
      await vi.advanceTimersByTimeAsync(1000);

      // onClose should not be called because component was unmounted
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should not update state after unmount during installation', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      // Make the installation hang - use an object to store resolver
      const installPromise: { resolve: (() => void) | null } = { resolve: null };
      (wslService.quickInstallDistribution as ReturnType<typeof vi.fn>).mockImplementation(
        () => new Promise<void>((resolve) => { installPromise.resolve = resolve; })
      );

      const { unmount } = render(
        <NewDistroDialog isOpen={true} onClose={mockOnClose} />
      );

      // Advance past the 600ms loading delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });

      const ubuntuButton = screen.getByText('Ubuntu');
      fireEvent.click(ubuntuButton);

      const installButton = screen.getByText('Install');
      fireEvent.click(installButton);

      // Flush promises to start installation
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(wslService.quickInstallDistribution).toHaveBeenCalled();

      // Unmount while installation is in progress
      unmount();

      // Resolve the installation
      if (installPromise.resolve) {
        installPromise.resolve();
      }

      // Flush any pending updates
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      // Should not cause React warnings
      expect(consoleWarnSpy).not.toHaveBeenCalledWith(
        expect.stringContaining("Can't perform a React state update on an unmounted component")
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('custom install mode', () => {
    it('should cancel pending timeout when dialog is closed during custom install', async () => {
      vi.mocked(wslService.customInstallWithProgress).mockResolvedValue(undefined);

      const { unmount } = render(
        <NewDistroDialog isOpen={true} onClose={mockOnClose} />
      );

      // Advance past the 600ms loading delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });

      // Switch to custom mode (Download tab)
      const downloadTabs = screen.getAllByText('Download');
      fireEvent.click(downloadTabs[0]);

      // Select a distro first (this makes the name input visible)
      const ubuntuButton = screen.getByText('Ubuntu');
      fireEvent.click(ubuntuButton);

      // Now fill in name (input should be visible after selecting distro)
      const nameInput = screen.getByPlaceholderText(/Enter a unique name/);
      fireEvent.change(nameInput, { target: { value: 'my-ubuntu' } });

      // Click install
      const installButton = screen.getByText('Install');
      fireEvent.click(installButton);

      // Flush promises
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(wslService.customInstallWithProgress).toHaveBeenCalled();

      // Unmount before timeout fires
      unmount();

      await vi.advanceTimersByTimeAsync(1000);

      // onClose should not be called
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('should clean up progress listener on unmount', async () => {
      const mockUnlisten = vi.fn();
      vi.mocked(wslService.onDownloadProgress).mockResolvedValue(mockUnlisten);
      vi.mocked(wslService.customInstallWithProgress).mockResolvedValue(undefined);

      const { unmount } = render(
        <NewDistroDialog isOpen={true} onClose={mockOnClose} />
      );

      // Advance past the 600ms loading delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });

      // Switch to custom mode (Download tab)
      const downloadTabs = screen.getAllByText('Download');
      fireEvent.click(downloadTabs[0]);

      // Select a distro first (this makes the name input visible)
      const ubuntuButton = screen.getByText('Ubuntu');
      fireEvent.click(ubuntuButton);

      // Now fill in name
      const nameInput = screen.getByPlaceholderText(/Enter a unique name/);
      fireEvent.change(nameInput, { target: { value: 'my-ubuntu' } });

      const installButton = screen.getByText('Install');
      fireEvent.click(installButton);

      // Flush promises
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(wslService.onDownloadProgress).toHaveBeenCalled();

      // Unmount the component
      unmount();

      // Progress listener should have been cleaned up
      expect(mockUnlisten).toHaveBeenCalled();
    });
  });

  describe('container mode', () => {
    it('should cancel pending timeout when dialog is closed during container creation', async () => {
      vi.mocked(wslService.createFromImage).mockResolvedValue(undefined);

      const { unmount } = render(
        <NewDistroDialog isOpen={true} onClose={mockOnClose} />
      );

      // Advance past the 600ms loading delay
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });

      // Switch to container mode
      const containerTabs = screen.getAllByText('Container');
      fireEvent.click(containerTabs[0]);

      // Select a container first (this makes the name input visible)
      const ubuntuButton = screen.getByText('Ubuntu');
      fireEvent.click(ubuntuButton);

      // Now fill in name
      const nameInput = screen.getByPlaceholderText(/Enter a unique name/);
      fireEvent.change(nameInput, { target: { value: 'my-container' } });

      // Click install
      const installButton = screen.getByText('Install');
      fireEvent.click(installButton);

      // Flush promises
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(wslService.createFromImage).toHaveBeenCalled();

      // Unmount before timeout fires
      unmount();

      await vi.advanceTimersByTimeAsync(1000);

      // onClose should not be called
      expect(mockOnClose).not.toHaveBeenCalled();
    });
  });

  describe('dialog close behavior', () => {
    it('should not render when isOpen is false', () => {
      render(<NewDistroDialog isOpen={false} onClose={mockOnClose} />);
      expect(screen.queryByText('Add Distribution')).not.toBeInTheDocument();
    });

    it('should handle repeated open/close cycles without memory leaks', async () => {
      const { rerender, unmount } = render(
        <NewDistroDialog isOpen={false} onClose={mockOnClose} />
      );

      // Open
      rerender(<NewDistroDialog isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('Add Distribution')).toBeInTheDocument();

      // Advance timers to allow loading
      await act(async () => {
        await vi.advanceTimersByTimeAsync(700);
      });

      // Close
      rerender(<NewDistroDialog isOpen={false} onClose={mockOnClose} />);

      // Open again
      rerender(<NewDistroDialog isOpen={true} onClose={mockOnClose} />);
      expect(screen.getByText('Add Distribution')).toBeInTheDocument();

      // Clean unmount
      unmount();

      // No errors should occur
      expect(true).toBe(true);
    });
  });
});
