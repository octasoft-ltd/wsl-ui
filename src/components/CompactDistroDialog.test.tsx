import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CompactDistroDialog } from './CompactDistroDialog';
import { wslService } from '../services/wslService';
import { useDistroStore } from '../store/distroStore';
import { useNotificationStore } from '../store/notificationStore';
import type { Distribution } from '../types/distribution';

// Mock the stores
vi.mock('../store/distroStore');
vi.mock('../store/notificationStore');

// Mock WSL service
vi.mock('../services/wslService', () => ({
  wslService: {
    getDistributionVhdSize: vi.fn(),
    compactDistribution: vi.fn(),
  },
}));

describe('CompactDistroDialog', () => {
  const mockFetchDistros = vi.fn();
  const mockSetCompactingDistro = vi.fn();
  const mockAddNotification = vi.fn();
  const mockOnClose = vi.fn();

  const mockDistro: Distribution = {
    name: 'Ubuntu',
    id: 'ubuntu-guid',
    state: 'Stopped',
    version: 2,
    isDefault: false,
  };

  const defaultProps = {
    isOpen: true,
    distro: mockDistro,
    onClose: mockOnClose,
  };

  const mockVhdSize = {
    virtualSize: 274877906944, // 256 GB
    fileSize: 10737418240, // 10 GB
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    vi.mocked(useDistroStore).mockReturnValue({
      fetchDistros: mockFetchDistros,
      setCompactingDistro: mockSetCompactingDistro,
    } as any);

    vi.mocked(useNotificationStore).mockReturnValue({
      addNotification: mockAddNotification,
    } as any);

    vi.mocked(wslService.getDistributionVhdSize).mockResolvedValue(mockVhdSize);
    vi.mocked(wslService.compactDistribution).mockResolvedValue({
      sizeBefore: 10737418240,
      sizeAfter: 8589934592, // 8 GB - saved 2 GB
      fstrimBytes: 5368709120, // 5 GB trimmed
      fstrimMessage: "/: 5 GiB (5368709120 bytes) trimmed on /dev/sdd",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('visibility', () => {
    it('renders nothing when isOpen is false', () => {
      render(<CompactDistroDialog {...defaultProps} isOpen={false} />);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('renders dialog when isOpen is true', () => {
      render(<CompactDistroDialog {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  describe('content', () => {
    it('displays distro name in title', () => {
      render(<CompactDistroDialog {...defaultProps} />);
      expect(screen.getByText(/Compact "Ubuntu" Disk/)).toBeInTheDocument();
    });

    it('displays subtitle about reclaiming space', () => {
      render(<CompactDistroDialog {...defaultProps} />);
      expect(screen.getByText(/Reclaim unused disk space/)).toBeInTheDocument();
    });

    it('displays cancel and compact buttons', () => {
      render(<CompactDistroDialog {...defaultProps} />);
      expect(screen.getByTestId('compact-cancel-button')).toBeInTheDocument();
      expect(screen.getByTestId('compact-confirm-button')).toBeInTheDocument();
    });

    it('displays loading state for sizes initially', () => {
      render(<CompactDistroDialog {...defaultProps} />);
      expect(screen.getByTestId('compact-virtual-size')).toHaveTextContent('Loading...');
      expect(screen.getByTestId('compact-file-size')).toHaveTextContent('Loading...');
    });

    it('displays fetched size information', async () => {
      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByTestId('compact-virtual-size')).toHaveTextContent('256.00 GB');
      expect(screen.getByTestId('compact-file-size')).toHaveTextContent('10.00 GB');
    });

    it('displays warning about administrator privileges', () => {
      render(<CompactDistroDialog {...defaultProps} />);
      expect(screen.getByText(/administrator privileges/)).toBeInTheDocument();
    });

    it('displays warning about WSL shutdown', () => {
      render(<CompactDistroDialog {...defaultProps} />);
      expect(screen.getByText(/WSL will be shut down/)).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onClose when cancel button clicked', async () => {
      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-cancel-button'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop clicked', async () => {
      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const backdrop = document.querySelector('.backdrop-blur-sm');
      fireEvent.click(backdrop!);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('disables compact button until size is loaded', () => {
      render(<CompactDistroDialog {...defaultProps} />);
      expect(screen.getByTestId('compact-confirm-button')).toBeDisabled();
    });

    it('enables compact button after size is loaded', async () => {
      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByTestId('compact-confirm-button')).not.toBeDisabled();
    });
  });

  describe('compacting behavior', () => {
    it('calls compactDistribution with distro name', async () => {
      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(wslService.compactDistribution).toHaveBeenCalledWith('Ubuntu');
    });

    it('sets compacting distro state during operation', async () => {
      vi.mocked(wslService.compactDistribution).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockSetCompactingDistro).toHaveBeenCalledWith('Ubuntu');
    });

    it('shows progress indicator while compacting', async () => {
      vi.mocked(wslService.compactDistribution).mockImplementation(
        () => new Promise(() => {})
      );

      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByTestId('compact-progress')).toBeInTheDocument();
      expect(screen.getByText(/Optimizing disk.../)).toBeInTheDocument();
    });

    it('shows elapsed time counter while compacting', async () => {
      vi.mocked(wslService.compactDistribution).mockImplementation(
        () => new Promise(() => {})
      );

      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByTestId('compact-elapsed-time')).toHaveTextContent('0:00 elapsed');

      // Advance timer by 65 seconds
      await act(async () => {
        await vi.advanceTimersByTimeAsync(65000);
      });

      expect(screen.getByTestId('compact-elapsed-time')).toHaveTextContent('1:05 elapsed');
    });

    it('disables cancel button while compacting', async () => {
      vi.mocked(wslService.compactDistribution).mockImplementation(
        () => new Promise(() => {})
      );

      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByTestId('compact-cancel-button')).toBeDisabled();
    });

    it('prevents backdrop close while compacting', async () => {
      vi.mocked(wslService.compactDistribution).mockImplementation(
        () => new Promise(() => {})
      );

      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      const backdrop = document.querySelector('.backdrop-blur-sm');
      fireEvent.click(backdrop!);
      expect(mockOnClose).not.toHaveBeenCalled();
    });

    it('shows error message on failure', async () => {
      vi.mocked(wslService.compactDistribution).mockRejectedValue('Compact failed: disk full');

      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByTestId('compact-error')).toBeInTheDocument();
      expect(screen.getByText(/Compact failed: disk full/)).toBeInTheDocument();
    });

    it('clears compacting distro state after failure', async () => {
      vi.mocked(wslService.compactDistribution).mockRejectedValue('Failed');

      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockSetCompactingDistro).toHaveBeenLastCalledWith(null);
    });
  });

  describe('successful compaction', () => {
    it('refreshes distros after success', async () => {
      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockFetchDistros).toHaveBeenCalled();
    });

    it('shows success notification with space saved', async () => {
      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockAddNotification).toHaveBeenCalledWith({
        type: 'success',
        title: 'Disk Compacted',
        message: expect.stringContaining('Ubuntu:'),
      });
      expect(mockAddNotification).toHaveBeenCalledWith({
        type: 'success',
        title: 'Disk Compacted',
        message: expect.stringContaining('saved 2.00 GB'),
      });
    });

    it('closes dialog after success', async () => {
      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockOnClose).toHaveBeenCalled();
    });

    it('clears compacting distro state after success', async () => {
      render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockSetCompactingDistro).toHaveBeenLastCalledWith(null);
    });
  });

  describe('state reset', () => {
    it('fetches new size when dialog reopens', async () => {
      const { rerender } = render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(wslService.getDistributionVhdSize).toHaveBeenCalledTimes(1);

      rerender(<CompactDistroDialog {...defaultProps} isOpen={false} />);
      rerender(<CompactDistroDialog {...defaultProps} isOpen={true} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(wslService.getDistributionVhdSize).toHaveBeenCalledTimes(2);
    });

    it('resets error state when dialog reopens', async () => {
      vi.mocked(wslService.compactDistribution).mockRejectedValue('Failed');

      const { rerender } = render(<CompactDistroDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      fireEvent.click(screen.getByTestId('compact-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByTestId('compact-error')).toBeInTheDocument();

      // Close and reopen
      rerender(<CompactDistroDialog {...defaultProps} isOpen={false} />);
      vi.mocked(wslService.compactDistribution).mockResolvedValue({
        sizeBefore: 10737418240,
        sizeAfter: 8589934592,
        fstrimBytes: 5368709120,
        fstrimMessage: "/: 5 GiB (5368709120 bytes) trimmed on /dev/sdd",
      });
      rerender(<CompactDistroDialog {...defaultProps} isOpen={true} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.queryByTestId('compact-error')).not.toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('has dialog role', () => {
      render(<CompactDistroDialog {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-modal attribute', () => {
      render(<CompactDistroDialog {...defaultProps} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });
  });
});
