import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CloneDialog } from './CloneDialog';
import { wslService } from '../services/wslService';
import { useDistroStore } from '../store/distroStore';

// Mock the stores
vi.mock('../store/distroStore');

// Mock WSL service
vi.mock('../services/wslService', () => ({
  wslService: {
    getDefaultDistroPath: vi.fn(),
    validateInstallPath: vi.fn(),
    cloneDistribution: vi.fn(),
  },
}));

// Mock Tauri dialog
vi.mock('@tauri-apps/plugin-dialog', () => ({
  open: vi.fn(),
}));

describe('CloneDialog', () => {
  const mockFetchDistros = vi.fn();
  const mockOnClose = vi.fn();

  const defaultProps = {
    isOpen: true,
    sourceName: 'Ubuntu',
    onClose: mockOnClose,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    vi.mocked(useDistroStore).mockReturnValue({
      fetchDistros: mockFetchDistros,
      distributions: [
        { name: 'Ubuntu', id: 'ubuntu-guid', state: 'Stopped', version: 2, isDefault: false },
        { name: 'Debian', id: 'debian-guid', state: 'Stopped', version: 2, isDefault: false },
      ],
    } as any);

    vi.mocked(wslService.getDefaultDistroPath).mockResolvedValue('C:\\WSL\\Ubuntu-clone');
    vi.mocked(wslService.validateInstallPath).mockResolvedValue({ isValid: true });
    vi.mocked(wslService.cloneDistribution).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('visibility', () => {
    it('renders nothing when isOpen is false', () => {
      render(<CloneDialog {...defaultProps} isOpen={false} />);
      expect(screen.queryByTestId('clone-dialog')).not.toBeInTheDocument();
    });

    it('renders dialog when isOpen is true', () => {
      render(<CloneDialog {...defaultProps} />);
      expect(screen.getByTestId('clone-dialog')).toBeInTheDocument();
    });
  });

  describe('content', () => {
    it('displays clone dialog title', () => {
      render(<CloneDialog {...defaultProps} />);
      expect(screen.getByText('Clone Distribution')).toBeInTheDocument();
    });

    it('displays source name in message', () => {
      render(<CloneDialog {...defaultProps} />);
      expect(screen.getByText('Ubuntu')).toBeInTheDocument();
    });

    it('displays default clone name based on source', () => {
      render(<CloneDialog {...defaultProps} />);
      const input = screen.getByTestId('clone-name-input');
      expect(input).toHaveValue('Ubuntu-clone');
    });

    it('displays cancel and clone buttons', () => {
      render(<CloneDialog {...defaultProps} />);
      expect(screen.getByTestId('clone-cancel-button')).toBeInTheDocument();
      expect(screen.getByTestId('clone-confirm-button')).toBeInTheDocument();
    });
  });

  describe('validation', () => {
    it('shows error when name matches source name', () => {
      render(<CloneDialog {...defaultProps} />);

      const input = screen.getByTestId('clone-name-input');
      fireEvent.change(input, { target: { value: 'Ubuntu' } });

      // Validation is synchronous in the component
      expect(screen.getByTestId('clone-validation-error')).toBeInTheDocument();
      expect(screen.getByText(/must be different from the source/i)).toBeInTheDocument();
    });

    it('shows error for invalid characters', () => {
      render(<CloneDialog {...defaultProps} />);

      const input = screen.getByTestId('clone-name-input');
      fireEvent.change(input, { target: { value: 'Ubuntu clone!' } });

      expect(screen.getByTestId('clone-validation-error')).toBeInTheDocument();
      expect(screen.getByText(/can only contain letters/i)).toBeInTheDocument();
    });

    it('shows error for duplicate name', () => {
      render(<CloneDialog {...defaultProps} />);

      const input = screen.getByTestId('clone-name-input');
      fireEvent.change(input, { target: { value: 'Debian' } });

      expect(screen.getByTestId('clone-validation-error')).toBeInTheDocument();
      expect(screen.getByText(/already exists/i)).toBeInTheDocument();
    });

    it('disables clone button when name is empty', () => {
      render(<CloneDialog {...defaultProps} />);

      const input = screen.getByTestId('clone-name-input');
      fireEvent.change(input, { target: { value: '' } });

      expect(screen.getByTestId('clone-confirm-button')).toBeDisabled();
    });

    it('validates path asynchronously', async () => {
      vi.mocked(wslService.validateInstallPath).mockResolvedValue({
        isValid: false,
        error: 'Path already contains a distribution',
      });

      render(<CloneDialog {...defaultProps} />);

      // Advance timers to allow debounced path fetch and validation
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      expect(screen.getByTestId('clone-path-error')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onClose when cancel button clicked', () => {
      render(<CloneDialog {...defaultProps} />);
      fireEvent.click(screen.getByTestId('clone-cancel-button'));
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when backdrop clicked', () => {
      render(<CloneDialog {...defaultProps} />);
      const backdrop = document.querySelector('.backdrop-blur-xs');
      fireEvent.click(backdrop!);
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('calls onClose when Escape pressed', () => {
      render(<CloneDialog {...defaultProps} />);
      const input = screen.getByTestId('clone-name-input');
      fireEvent.keyDown(input, { key: 'Escape' });
      expect(mockOnClose).toHaveBeenCalledTimes(1);
    });

    it('submits on Enter key when valid', async () => {
      render(<CloneDialog {...defaultProps} />);

      // Wait for path validation to complete
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      const input = screen.getByTestId('clone-name-input');
      fireEvent.keyDown(input, { key: 'Enter' });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(wslService.cloneDistribution).toHaveBeenCalled();
    });
  });

  describe('cloning behavior', () => {
    it('calls cloneDistribution with correct parameters', async () => {
      render(<CloneDialog {...defaultProps} />);

      // Wait for path validation
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      fireEvent.click(screen.getByTestId('clone-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(wslService.cloneDistribution).toHaveBeenCalledWith(
        'Ubuntu',
        'Ubuntu-clone',
        undefined // default path
      );
    });

    it('shows progress indicator while cloning', async () => {
      // Make clone hang
      vi.mocked(wslService.cloneDistribution).mockImplementation(
        () => new Promise(() => {})
      );

      render(<CloneDialog {...defaultProps} />);

      // Wait for path validation
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      fireEvent.click(screen.getByTestId('clone-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByTestId('clone-progress')).toBeInTheDocument();
      expect(screen.getByText(/Cloning distribution/i)).toBeInTheDocument();
    });

    it('shows error message on clone failure', async () => {
      vi.mocked(wslService.cloneDistribution).mockRejectedValue('Clone failed: disk full');

      render(<CloneDialog {...defaultProps} />);

      // Wait for path validation
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      fireEvent.click(screen.getByTestId('clone-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(screen.getByTestId('clone-error')).toBeInTheDocument();
      expect(screen.getByText(/Clone failed: disk full/)).toBeInTheDocument();
    });

    it('refreshes distros after successful clone', async () => {
      render(<CloneDialog {...defaultProps} />);

      // Wait for path validation
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      fireEvent.click(screen.getByTestId('clone-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockFetchDistros).toHaveBeenCalled();
    });

    it('closes dialog after successful clone', async () => {
      render(<CloneDialog {...defaultProps} />);

      // Wait for path validation
      await act(async () => {
        await vi.advanceTimersByTimeAsync(500);
      });

      fireEvent.click(screen.getByTestId('clone-confirm-button'));

      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });

      expect(mockOnClose).toHaveBeenCalled();
    });
  });

  describe('install location', () => {
    it('fetches default path on open', async () => {
      render(<CloneDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(wslService.getDefaultDistroPath).toHaveBeenCalledWith('Ubuntu-clone');
    });

    it('updates default path when name changes', async () => {
      render(<CloneDialog {...defaultProps} />);

      const input = screen.getByTestId('clone-name-input');
      fireEvent.change(input, { target: { value: 'MyClone' } });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      expect(wslService.getDefaultDistroPath).toHaveBeenCalledWith('MyClone');
    });

    it('displays the path in location input', async () => {
      render(<CloneDialog {...defaultProps} />);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(200);
      });

      // The path input should display the default path
      const locationInput = screen.getByTestId('clone-location-input');
      expect(locationInput).toHaveValue('C:\\WSL\\Ubuntu-clone');
    });
  });

  describe('state reset', () => {
    it('resets name when source changes', async () => {
      const { rerender } = render(<CloneDialog {...defaultProps} />);

      // Modify the name
      const input = screen.getByTestId('clone-name-input');
      fireEvent.change(input, { target: { value: 'CustomName' } });
      expect(input).toHaveValue('CustomName');

      // Close and reopen with different source
      rerender(<CloneDialog {...defaultProps} isOpen={false} />);
      rerender(<CloneDialog {...defaultProps} isOpen={true} sourceName="Debian" />);

      // Name should be updated for new source
      expect(screen.getByTestId('clone-name-input')).toHaveValue('Debian-clone');
    });
  });

  describe('accessibility', () => {
    it('has dialog role', () => {
      render(<CloneDialog {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-modal attribute', () => {
      render(<CloneDialog {...defaultProps} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('autofocuses the name input', () => {
      render(<CloneDialog {...defaultProps} />);
      expect(screen.getByTestId('clone-name-input')).toHaveFocus();
    });
  });
});
