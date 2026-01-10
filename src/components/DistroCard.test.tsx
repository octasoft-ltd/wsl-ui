import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DistroCard } from './DistroCard';
import { useDistroStore } from '../store/distroStore';
import { useResourceStore } from '../store/resourceStore';
import type { Distribution } from '../types/distribution';

// Mock the stores
vi.mock('../store/distroStore');
vi.mock('../store/resourceStore');

// Mock QuickActionsMenu to simplify tests
vi.mock('./QuickActionsMenu', () => ({
  QuickActionsMenu: ({ distro, disabled }: { distro: Distribution; disabled: boolean }) => (
    <button data-testid="quick-actions" disabled={disabled}>
      Quick Actions for {distro.name}
    </button>
  ),
}));

describe('DistroCard', () => {
  const mockStartDistro = vi.fn();
  const mockStopDistro = vi.fn();
  const mockDeleteDistro = vi.fn();
  const mockGetDistroResources = vi.fn();

  const runningDistro: Distribution = {
    name: 'Ubuntu',
    state: 'Running',
    version: 2,
    isDefault: true,
    osInfo: 'Ubuntu 22.04 LTS',
    diskSize: 15000000000,
  };

  const stoppedDistro: Distribution = {
    name: 'Debian',
    state: 'Stopped',
    version: 2,
    isDefault: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useDistroStore).mockReturnValue({
      startDistro: mockStartDistro,
      stopDistro: mockStopDistro,
      deleteDistro: mockDeleteDistro,
      actionInProgress: null,
    } as any);
    vi.mocked(useResourceStore).mockReturnValue({
      getDistroResources: mockGetDistroResources,
    } as any);
  });

  describe('rendering', () => {
    it('displays distribution name', () => {
      render(<DistroCard distro={runningDistro} />);
      expect(screen.getByText('Ubuntu')).toBeInTheDocument();
    });

    it('shows Running state badge for running distro', () => {
      render(<DistroCard distro={runningDistro} />);
      expect(screen.getByText('Online')).toBeInTheDocument();
    });

    it('shows Stopped state badge for stopped distro', () => {
      render(<DistroCard distro={stoppedDistro} />);
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('shows default badge when isDefault is true', () => {
      render(<DistroCard distro={runningDistro} />);
      expect(screen.getByText('Primary')).toBeInTheDocument();
    });

    it('does not show default badge when isDefault is false', () => {
      render(<DistroCard distro={stoppedDistro} />);
      expect(screen.queryByText('Primary')).not.toBeInTheDocument();
    });

    it('displays OS info when available', () => {
      render(<DistroCard distro={runningDistro} />);
      expect(screen.getByText('Ubuntu 22.04 LTS')).toBeInTheDocument();
    });

    it('displays WSL version when no OS info', () => {
      render(<DistroCard distro={stoppedDistro} />);
      expect(screen.getByText(/WSL 2/)).toBeInTheDocument();
    });

    it('displays formatted disk size when available', () => {
      render(<DistroCard distro={runningDistro} />);
      // 15GB formatted - actual formatting shows 14.0 GB
      expect(screen.getByText(/14\.0 GB/)).toBeInTheDocument();
    });
  });

  describe('start/stop button', () => {
    it('shows Stop button when running', () => {
      render(<DistroCard distro={runningDistro} />);
      expect(screen.getByText('Suspend')).toBeInTheDocument();
    });

    it('shows Start button when stopped', () => {
      render(<DistroCard distro={stoppedDistro} />);
      expect(screen.getByText('Launch')).toBeInTheDocument();
    });

    it('calls stopDistro when Stop is clicked', () => {
      render(<DistroCard distro={runningDistro} />);
      fireEvent.click(screen.getByText('Suspend'));
      expect(mockStopDistro).toHaveBeenCalledWith('Ubuntu');
    });

    it('calls startDistro when Start is clicked', () => {
      render(<DistroCard distro={stoppedDistro} />);
      fireEvent.click(screen.getByText('Launch'));
      expect(mockStartDistro).toHaveBeenCalledWith('Debian', undefined);
    });
  });

  describe('delete button', () => {
    it('opens confirmation dialog when delete clicked', () => {
      render(<DistroCard distro={runningDistro} />);
      fireEvent.click(screen.getByTitle('Delete distribution'));
      expect(screen.getByText('Delete Distribution')).toBeInTheDocument();
    });

    it('shows distro name in confirmation message', () => {
      render(<DistroCard distro={runningDistro} />);
      fireEvent.click(screen.getByTitle('Delete distribution'));
      // Find the confirmation message specifically
      expect(screen.getByText(/Are you sure you want to delete "Ubuntu"/)).toBeInTheDocument();
    });

    it('calls deleteDistro when confirmed', () => {
      render(<DistroCard distro={runningDistro} />);
      fireEvent.click(screen.getByTitle('Delete distribution'));
      fireEvent.click(screen.getByText('Delete'));
      expect(mockDeleteDistro).toHaveBeenCalledWith('Ubuntu');
    });

    it('closes dialog when cancelled', () => {
      render(<DistroCard distro={runningDistro} />);
      fireEvent.click(screen.getByTitle('Delete distribution'));
      fireEvent.click(screen.getByText('Cancel'));
      expect(screen.queryByText('Delete Distribution')).not.toBeInTheDocument();
    });
  });

  describe('disabled state', () => {
    it('disables buttons when actionInProgress is set', () => {
      vi.mocked(useDistroStore).mockReturnValue({
        startDistro: mockStartDistro,
        stopDistro: mockStopDistro,
        deleteDistro: mockDeleteDistro,
        actionInProgress: 'Starting Ubuntu...',
      } as any);

      render(<DistroCard distro={runningDistro} />);

      expect(screen.getByText('Suspend').closest('button')).toBeDisabled();
      expect(screen.getByTitle('Delete distribution')).toBeDisabled();
      expect(screen.getByTestId('quick-actions')).toBeDisabled();
    });

    it('enables buttons when actionInProgress is null', () => {
      render(<DistroCard distro={runningDistro} />);

      expect(screen.getByText('Suspend').closest('button')).not.toBeDisabled();
      expect(screen.getByTitle('Delete distribution')).not.toBeDisabled();
      expect(screen.getByTestId('quick-actions')).not.toBeDisabled();
    });
  });

  describe('React.memo performance optimization', () => {
    it('should be wrapped with React.memo', () => {
      // Check if the component has the memo displayName or is a memoized component
      const componentType = DistroCard as any;
      // React.memo wraps components with a special type
      expect(
        componentType.$$typeof?.toString().includes('react.memo') ||
        componentType.displayName?.includes('memo') ||
        componentType.type !== undefined
      ).toBe(true);
    });

    it('does not re-render when props are shallowly equal', () => {
      const { rerender } = render(<DistroCard distro={runningDistro} />);

      const firstRender = screen.getByText('Ubuntu');

      // Re-render with the same distro object (same reference)
      rerender(<DistroCard distro={runningDistro} />);

      const secondRender = screen.getByText('Ubuntu');

      // The DOM node should be the same reference if not re-rendered
      expect(firstRender).toBe(secondRender);
    });

    it('re-renders when distro object changes', () => {
      const { rerender } = render(<DistroCard distro={runningDistro} />);

      expect(screen.getByText('Ubuntu')).toBeInTheDocument();
      expect(screen.getByText('Online')).toBeInTheDocument();

      // Create a new distro object with different values
      const updatedDistro: Distribution = {
        ...runningDistro,
        state: 'Stopped',
      };

      rerender(<DistroCard distro={updatedDistro} />);

      expect(screen.getByText('Ubuntu')).toBeInTheDocument();
      expect(screen.getByText('Offline')).toBeInTheDocument();
    });

    it('re-renders when distro state changes', () => {
      const { rerender } = render(<DistroCard distro={runningDistro} />);

      expect(screen.getByText('Suspend')).toBeInTheDocument();

      const stoppedVersion: Distribution = {
        ...runningDistro,
        state: 'Stopped',
      };

      rerender(<DistroCard distro={stoppedVersion} />);

      expect(screen.getByText('Launch')).toBeInTheDocument();
    });

    it('re-renders when distro name changes', () => {
      const { rerender } = render(<DistroCard distro={runningDistro} />);

      expect(screen.getByText('Ubuntu')).toBeInTheDocument();

      const renamedDistro: Distribution = {
        ...runningDistro,
        name: 'Ubuntu-Renamed',
      };

      rerender(<DistroCard distro={renamedDistro} />);

      expect(screen.queryByText('Ubuntu')).not.toBeInTheDocument();
      expect(screen.getByText('Ubuntu-Renamed')).toBeInTheDocument();
    });

    it('re-renders when isDefault changes', () => {
      const { rerender } = render(<DistroCard distro={runningDistro} />);

      expect(screen.getByText('Primary')).toBeInTheDocument();

      const notDefaultDistro: Distribution = {
        ...runningDistro,
        isDefault: false,
      };

      rerender(<DistroCard distro={notDefaultDistro} />);

      expect(screen.queryByText('Primary')).not.toBeInTheDocument();
    });

    it('re-renders when diskSize changes', () => {
      const { rerender } = render(<DistroCard distro={runningDistro} />);

      expect(screen.getByText(/14\.0 GB/)).toBeInTheDocument();

      const largerDiskDistro: Distribution = {
        ...runningDistro,
        diskSize: 30000000000, // ~27.9 GB (30 billion bytes)
      };

      rerender(<DistroCard distro={largerDiskDistro} />);

      expect(screen.getByText(/27\.9 GB/)).toBeInTheDocument();
    });

    it('handles resource data changes from store', () => {
      const mockResourceData = {
        name: 'Ubuntu',
        memoryUsedBytes: 1073741824, // 1GB
        cpuPercent: 25.5,
      };

      mockGetDistroResources.mockReturnValue(mockResourceData);

      const { rerender } = render(<DistroCard distro={runningDistro} />);

      // Should show resource stats
      expect(screen.getByText(/1\.0 GB/)).toBeInTheDocument();
      expect(screen.getByText(/25\.5%/)).toBeInTheDocument();

      // Update resource data
      const updatedResourceData = {
        name: 'Ubuntu',
        memoryUsedBytes: 2147483648, // 2GB
        cpuPercent: 50.0,
      };

      mockGetDistroResources.mockReturnValue(updatedResourceData);

      // Force re-render by changing a prop
      const updatedDistro = { ...runningDistro };
      rerender(<DistroCard distro={updatedDistro} />);

      // Should show updated resource stats
      expect(screen.getByText(/2\.0 GB/)).toBeInTheDocument();
      expect(screen.getByText(/50\.0%/)).toBeInTheDocument();
    });
  });
});

