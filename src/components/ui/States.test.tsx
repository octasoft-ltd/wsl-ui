import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LoadingSpinner, LoadingOverlay, ErrorMessage, EmptyState, ProgressBar } from './States';

describe('LoadingSpinner', () => {
  it('renders spinner', () => {
    const { container } = render(<LoadingSpinner />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('applies size classes', () => {
    const { container } = render(<LoadingSpinner size="lg" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveClass('w-8', 'h-8');
  });

  it('renders with label', () => {
    render(<LoadingSpinner label="Loading..." />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});

describe('LoadingOverlay', () => {
  it('renders overlay with spinner', () => {
    const { container } = render(<LoadingOverlay />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('renders with custom message', () => {
    render(<LoadingOverlay message="Please wait..." />);
    expect(screen.getByText('Please wait...')).toBeInTheDocument();
  });

  it('renders as inline when specified', () => {
    const { container } = render(<LoadingOverlay inline />);
    expect(container.firstChild).not.toHaveClass('fixed');
  });

  it('renders as full screen by default', () => {
    const { container } = render(<LoadingOverlay />);
    expect(container.firstChild).toHaveClass('absolute');
  });
});

describe('ErrorMessage', () => {
  it('renders error text', () => {
    render(<ErrorMessage message="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('renders with title', () => {
    render(<ErrorMessage title="Error" message="Details here" />);
    expect(screen.getByText('Error')).toBeInTheDocument();
    expect(screen.getByText('Details here')).toBeInTheDocument();
  });

  it('renders retry button when onRetry is provided', () => {
    const handleRetry = vi.fn();
    render(<ErrorMessage message="Error" onRetry={handleRetry} />);
    const retryButton = screen.getByRole('button', { name: /retry/i });
    expect(retryButton).toBeInTheDocument();
  });

  it('calls onRetry when retry button is clicked', () => {
    const handleRetry = vi.fn();
    render(<ErrorMessage message="Error" onRetry={handleRetry} />);
    fireEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(handleRetry).toHaveBeenCalledTimes(1);
  });

  it('renders dismiss button when onDismiss is provided', () => {
    const handleDismiss = vi.fn();
    render(<ErrorMessage message="Error" onDismiss={handleDismiss} />);
    const dismissButton = screen.getByRole('button', { name: /dismiss/i });
    expect(dismissButton).toBeInTheDocument();
  });

  it('applies different variants', () => {
    const { container } = render(<ErrorMessage message="Warning" variant="warning" />);
    expect(container.firstChild).toHaveClass('border');
  });
});

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(<EmptyState title="No items" description="Add your first item" />);
    expect(screen.getByText('No items')).toBeInTheDocument();
    expect(screen.getByText('Add your first item')).toBeInTheDocument();
  });

  it('renders icon when provided', () => {
    render(<EmptyState title="Empty" icon={<span data-testid="icon">📦</span>} />);
    expect(screen.getByTestId('icon')).toBeInTheDocument();
  });

  it('renders action button when provided', () => {
    const handleAction = vi.fn();
    render(
      <EmptyState
        title="Empty"
        action={{ label: 'Create', onClick: handleAction }}
      />
    );
    const button = screen.getByRole('button', { name: 'Create' });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(handleAction).toHaveBeenCalledTimes(1);
  });
});

describe('ProgressBar', () => {
  it('renders with correct percentage', () => {
    const { container } = render(<ProgressBar value={50} />);
    const bar = container.querySelector('[style*="width"]');
    expect(bar).toHaveStyle({ width: '50%' });
  });

  it('clamps value between 0 and 100', () => {
    const { container: c1 } = render(<ProgressBar value={-10} />);
    expect(c1.querySelector('[style*="width"]')).toHaveStyle({ width: '0%' });

    const { container: c2 } = render(<ProgressBar value={150} />);
    expect(c2.querySelector('[style*="width"]')).toHaveStyle({ width: '100%' });
  });

  it('shows label when showLabel is true', () => {
    render(<ProgressBar value={75} showLabel />);
    expect(screen.getByText('75%')).toBeInTheDocument();
  });

  it('applies size classes', () => {
    const { container } = render(<ProgressBar value={50} size="lg" />);
    const track = container.querySelector('.h-3');
    expect(track).toBeInTheDocument();
  });

  it('applies variant colors', () => {
    const { container } = render(<ProgressBar value={50} variant="success" />);
    const bar = container.querySelector('.bg-theme-status-running');
    expect(bar).toBeInTheDocument();
  });
});





