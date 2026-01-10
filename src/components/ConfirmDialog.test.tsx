import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  const defaultProps = {
    isOpen: true,
    title: 'Confirm Action',
    message: 'Are you sure you want to proceed?',
    confirmLabel: 'Confirm',
    onConfirm: vi.fn(),
    onCancel: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('visibility', () => {
    it('renders nothing when isOpen is false', () => {
      render(<ConfirmDialog {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('Confirm Action')).not.toBeInTheDocument();
    });

    it('renders dialog when isOpen is true', () => {
      render(<ConfirmDialog {...defaultProps} />);
      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    });
  });

  describe('content', () => {
    it('displays title', () => {
      render(<ConfirmDialog {...defaultProps} />);
      expect(screen.getByText('Confirm Action')).toBeInTheDocument();
    });

    it('displays message', () => {
      render(<ConfirmDialog {...defaultProps} />);
      expect(screen.getByText('Are you sure you want to proceed?')).toBeInTheDocument();
    });

    it('displays custom confirm label', () => {
      render(<ConfirmDialog {...defaultProps} confirmLabel="Delete Now" />);
      expect(screen.getByText('Delete Now')).toBeInTheDocument();
    });

    it('displays Cancel button', () => {
      render(<ConfirmDialog {...defaultProps} />);
      expect(screen.getByText('Cancel')).toBeInTheDocument();
    });
  });

  describe('interactions', () => {
    it('calls onConfirm when confirm button clicked', () => {
      render(<ConfirmDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Confirm'));
      expect(defaultProps.onConfirm).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when cancel button clicked', () => {
      render(<ConfirmDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Cancel'));
      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when backdrop clicked', () => {
      render(<ConfirmDialog {...defaultProps} />);
      // Find the backdrop by class - uses Portal so query document
      const backdrop = document.querySelector('.backdrop-blur-xs');
      fireEvent.click(backdrop!);
      expect(defaultProps.onCancel).toHaveBeenCalledTimes(1);
    });

    it('does not call callbacks when not clicked', () => {
      render(<ConfirmDialog {...defaultProps} />);
      expect(defaultProps.onConfirm).not.toHaveBeenCalled();
      expect(defaultProps.onCancel).not.toHaveBeenCalled();
    });
  });

  describe('danger mode', () => {
    it('applies danger styling when danger prop is true', () => {
      render(<ConfirmDialog {...defaultProps} danger />);
      const confirmButton = screen.getByText('Confirm');
      expect(confirmButton).toHaveClass('bg-theme-status-error');
    });

    it('applies orange styling when danger is false', () => {
      render(<ConfirmDialog {...defaultProps} danger={false} />);
      const confirmButton = screen.getByText('Confirm');
      expect(confirmButton).toHaveClass('bg-theme-status-warning');
    });

    it('applies danger icon styling when danger is true', () => {
      render(<ConfirmDialog {...defaultProps} danger />);
      // Icon container uses theme CSS variable classes
      const iconContainer = document.querySelector('.text-theme-status-error');
      expect(iconContainer).toBeInTheDocument();
    });

    it('applies orange icon styling when danger is false', () => {
      render(<ConfirmDialog {...defaultProps} danger={false} />);
      // Icon container uses theme CSS variable classes
      const iconContainer = document.querySelector('.text-theme-status-warning');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe('accessibility', () => {
    it('contains warning icon', () => {
      render(<ConfirmDialog {...defaultProps} />);
      // Portal renders outside container, query document
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
    });

    it('has semantic heading for title', () => {
      render(<ConfirmDialog {...defaultProps} />);
      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toHaveTextContent('Confirm Action');
    });
  });

  describe('styling', () => {
    it('has backdrop blur-sm effect', () => {
      render(<ConfirmDialog {...defaultProps} />);
      // Portal renders outside container, query document
      const backdrop = document.querySelector('.backdrop-blur-xs');
      expect(backdrop).toBeInTheDocument();
    });

    it('is centered on screen', () => {
      render(<ConfirmDialog {...defaultProps} />);
      // Portal renders outside container, query document
      const dialog = document.querySelector('.fixed.inset-0');
      expect(dialog).toHaveClass('flex', 'items-center', 'justify-center');
    });

    it('has max-width constraint', () => {
      render(<ConfirmDialog {...defaultProps} />);
      // Portal renders outside container, query document
      const content = document.querySelector('.max-w-md');
      expect(content).toBeInTheDocument();
    });
  });
});


