import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReviewPromptDialog } from './ReviewPromptDialog';

describe('ReviewPromptDialog', () => {
  const defaultProps = {
    isOpen: true,
    onReview: vi.fn(),
    onMaybeLater: vi.fn(),
    onNoThanks: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('visibility', () => {
    it('renders nothing when isOpen is false', () => {
      render(<ReviewPromptDialog {...defaultProps} isOpen={false} />);
      expect(screen.queryByText('Finding WSL UI useful?')).not.toBeInTheDocument();
    });

    it('renders dialog when isOpen is true', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(screen.getByText('Finding WSL UI useful?')).toBeInTheDocument();
    });
  });

  describe('content', () => {
    it('displays the title', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(screen.getByText('Finding WSL UI useful?')).toBeInTheDocument();
    });

    it('displays the description message', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(screen.getByText(/A quick review helps others discover/)).toBeInTheDocument();
    });

    it('displays Leave a Review button', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(screen.getByText('Leave a Review')).toBeInTheDocument();
    });

    it('displays Maybe Later button', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(screen.getByText('Maybe Later')).toBeInTheDocument();
    });

    it('displays No Thanks button', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(screen.getByText('No Thanks')).toBeInTheDocument();
    });

    it('displays the app logo', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      const svg = document.querySelector('svg');
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute('viewBox', '0 0 512 512');
    });
  });

  describe('interactions', () => {
    it('calls onReview when Leave a Review button clicked', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Leave a Review'));
      expect(defaultProps.onReview).toHaveBeenCalledTimes(1);
    });

    it('calls onMaybeLater when Maybe Later button clicked', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('Maybe Later'));
      expect(defaultProps.onMaybeLater).toHaveBeenCalledTimes(1);
    });

    it('calls onNoThanks when No Thanks button clicked', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      fireEvent.click(screen.getByText('No Thanks'));
      expect(defaultProps.onNoThanks).toHaveBeenCalledTimes(1);
    });

    it('does not call callbacks when not clicked', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(defaultProps.onReview).not.toHaveBeenCalled();
      expect(defaultProps.onMaybeLater).not.toHaveBeenCalled();
      expect(defaultProps.onNoThanks).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('has role="dialog"', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('has aria-modal="true"', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
    });

    it('has semantic heading for title', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toHaveTextContent('Finding WSL UI useful?');
    });
  });

  describe('test ids', () => {
    it('has data-testid on dialog', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(screen.getByTestId('review-prompt-dialog')).toBeInTheDocument();
    });

    it('has data-testid on Leave a Review button', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(screen.getByTestId('review-leave-review-button')).toBeInTheDocument();
    });

    it('has data-testid on Maybe Later button', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(screen.getByTestId('review-maybe-later-button')).toBeInTheDocument();
    });

    it('has data-testid on No Thanks button', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      expect(screen.getByTestId('review-no-thanks-button')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('has backdrop blur effect', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      const backdrop = document.querySelector('.backdrop-blur-xs');
      expect(backdrop).toBeInTheDocument();
    });

    it('is centered on screen', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      const container = document.querySelector('.fixed.inset-0');
      expect(container).toHaveClass('flex', 'items-center', 'justify-center');
    });

    it('has max-width constraint', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      const content = document.querySelector('.max-w-md');
      expect(content).toBeInTheDocument();
    });

    it('Leave a Review button has primary styling', () => {
      render(<ReviewPromptDialog {...defaultProps} />);
      const button = screen.getByTestId('review-leave-review-button');
      expect(button).toHaveClass('bg-theme-accent-primary');
    });
  });
});
