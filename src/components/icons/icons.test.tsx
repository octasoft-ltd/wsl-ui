import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import {
  SettingsIcon,
  RefreshIcon,
  TerminalIcon,
  FolderIcon,
  TrashIcon,
  CloseIcon,
  PlayIcon,
  StopIcon,
  StarIcon,
  ChevronRightIcon,
  ChevronLeftIcon,
  PlusIcon,
  DownloadIcon,
  UploadIcon,
  CodeIcon,
  MenuIcon,
  WarningIcon,
  ServerIcon,
  GridIcon,
  MonitorIcon,
} from './index';

describe('Icon Components', () => {
  // Test that all icons render without crashing
  const icons = [
    { name: 'SettingsIcon', Component: SettingsIcon },
    { name: 'RefreshIcon', Component: RefreshIcon },
    { name: 'TerminalIcon', Component: TerminalIcon },
    { name: 'FolderIcon', Component: FolderIcon },
    { name: 'TrashIcon', Component: TrashIcon },
    { name: 'CloseIcon', Component: CloseIcon },
    { name: 'PlayIcon', Component: PlayIcon },
    { name: 'StopIcon', Component: StopIcon },
    { name: 'StarIcon', Component: StarIcon },
    { name: 'ChevronRightIcon', Component: ChevronRightIcon },
    { name: 'ChevronLeftIcon', Component: ChevronLeftIcon },
    { name: 'PlusIcon', Component: PlusIcon },
    { name: 'DownloadIcon', Component: DownloadIcon },
    { name: 'UploadIcon', Component: UploadIcon },
    { name: 'CodeIcon', Component: CodeIcon },
    { name: 'MenuIcon', Component: MenuIcon },
    { name: 'WarningIcon', Component: WarningIcon },
    { name: 'ServerIcon', Component: ServerIcon },
    { name: 'GridIcon', Component: GridIcon },
    { name: 'MonitorIcon', Component: MonitorIcon },
  ];

  icons.forEach(({ name, Component }) => {
    it(`${name} renders without crashing`, () => {
      const { container } = render(<Component />);
      expect(container.querySelector('svg')).toBeInTheDocument();
    });
  });

  describe('Size prop', () => {
    it('applies sm size class', () => {
      const { container } = render(<SettingsIcon size="sm" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('w-4', 'h-4');
    });

    it('applies md size class (default)', () => {
      const { container } = render(<SettingsIcon />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('w-5', 'h-5');
    });

    it('applies lg size class', () => {
      const { container } = render(<SettingsIcon size="lg" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('w-6', 'h-6');
    });

    it('applies xl size class', () => {
      const { container } = render(<SettingsIcon size="xl" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('w-8', 'h-8');
    });
  });

  describe('className prop', () => {
    it('merges custom className with size classes', () => {
      const { container } = render(<SettingsIcon className="text-red-500" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveClass('text-red-500');
      expect(svg).toHaveClass('w-5', 'h-5'); // default size
    });
  });

  describe('SVG attributes', () => {
    it('has correct default SVG attributes', () => {
      const { container } = render(<SettingsIcon />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('fill', 'none');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    });

    it('passes through aria-label', () => {
      const { container } = render(<SettingsIcon aria-label="Settings" />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('aria-label', 'Settings');
    });
  });

  describe('StarIcon fill variant', () => {
    it('renders with stroke by default', () => {
      const { container } = render(<StarIcon />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('fill', 'none');
    });

    it('renders filled when filled prop is true', () => {
      const { container } = render(<StarIcon filled />);
      const svg = container.querySelector('svg');
      expect(svg).toHaveAttribute('fill', 'currentColor');
    });
  });
});

