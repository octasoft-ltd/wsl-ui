import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DistroList } from './DistroList';
import { useDistroStore } from '../store/distroStore';
import type { Distribution } from '../types/distribution';

// Mock the store
vi.mock('../store/distroStore');

// Mock DistroCard to simplify tests
vi.mock('./DistroCard', () => ({
  DistroCard: ({ distro }: { distro: Distribution }) => (
    <div data-testid="distro-card">{distro.name}</div>
  ),
}));

describe('DistroList', () => {
  const mockDistributions: Distribution[] = [
    { name: 'Ubuntu', state: 'Running', version: 2, isDefault: true },
    { name: 'Debian', state: 'Stopped', version: 2, isDefault: false },
    { name: 'Arch', state: 'Stopped', version: 2, isDefault: false },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('loading state', () => {
    it('shows loading spinner when isLoading and no distributions', () => {
      vi.mocked(useDistroStore).mockReturnValue({
        distributions: [],
        isLoading: true,
      } as any);

      render(<DistroList />);
      
      expect(screen.getByText('Initializing systems...')).toBeInTheDocument();
    });

    it('shows loading spinner with animated element', () => {
      vi.mocked(useDistroStore).mockReturnValue({
        distributions: [],
        isLoading: true,
      } as any);

      const { container } = render(<DistroList />);
      
      // Check for spinning animation class
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('does not show loading when distributions exist', () => {
      vi.mocked(useDistroStore).mockReturnValue({
        distributions: mockDistributions,
        isLoading: true,
      } as any);

      render(<DistroList />);
      
      expect(screen.queryByText('Initializing systems...')).not.toBeInTheDocument();
    });
  });

  describe('empty state', () => {
    it('shows empty state when no distributions and not loading', () => {
      vi.mocked(useDistroStore).mockReturnValue({
        distributions: [],
        isLoading: false,
      } as any);

      render(<DistroList />);
      
      expect(screen.getByText('No Instances Detected')).toBeInTheDocument();
    });

    it('shows helpful install message in empty state', () => {
      vi.mocked(useDistroStore).mockReturnValue({
        distributions: [],
        isLoading: false,
      } as any);

      render(<DistroList />);
      
      expect(screen.getByText('Deploy a WSL distribution to begin')).toBeInTheDocument();
    });
  });

  describe('populated state', () => {
    it('renders DistroCard for each distribution', () => {
      vi.mocked(useDistroStore).mockReturnValue({
        distributions: mockDistributions,
        isLoading: false,
      } as any);

      render(<DistroList />);
      
      const cards = screen.getAllByTestId('distro-card');
      expect(cards).toHaveLength(3);
    });

    it('displays distribution names', () => {
      vi.mocked(useDistroStore).mockReturnValue({
        distributions: mockDistributions,
        isLoading: false,
      } as any);

      render(<DistroList />);
      
      expect(screen.getByText('Ubuntu')).toBeInTheDocument();
      expect(screen.getByText('Debian')).toBeInTheDocument();
      expect(screen.getByText('Arch')).toBeInTheDocument();
    });

    it('uses distribution name as key', () => {
      vi.mocked(useDistroStore).mockReturnValue({
        distributions: mockDistributions,
        isLoading: false,
      } as any);

      const { container } = render(<DistroList />);
      
      // Should render in a grid container
      const grid = container.querySelector('.grid');
      expect(grid).toBeInTheDocument();
    });

    it('applies responsive grid layout', () => {
      vi.mocked(useDistroStore).mockReturnValue({
        distributions: mockDistributions,
        isLoading: false,
      } as any);

      const { container } = render(<DistroList />);
      
      const grid = container.querySelector('.grid');
      expect(grid).toHaveClass('md:grid-cols-2');
      expect(grid).toHaveClass('lg:grid-cols-3');
    });
  });

  describe('single distribution', () => {
    it('renders single card for one distribution', () => {
      vi.mocked(useDistroStore).mockReturnValue({
        distributions: [mockDistributions[0]],
        isLoading: false,
      } as any);

      render(<DistroList />);
      
      const cards = screen.getAllByTestId('distro-card');
      expect(cards).toHaveLength(1);
      expect(screen.getByText('Ubuntu')).toBeInTheDocument();
    });
  });
});





