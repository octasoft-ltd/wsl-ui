import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary';

// Component that throws an error
const ThrowError = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test error');
  }
  return <div>No error</div>;
};

describe('ErrorBoundary', () => {
  // Suppress console.error for cleaner test output
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  describe('rendering', () => {
    it('renders children when there is no error', () => {
      render(
        <ErrorBoundary>
          <div>Test content</div>
        </ErrorBoundary>
      );
      expect(screen.getByText('Test content')).toBeInTheDocument();
    });

    it('renders multiple children when there is no error', () => {
      render(
        <ErrorBoundary>
          <div>First child</div>
          <div>Second child</div>
        </ErrorBoundary>
      );
      expect(screen.getByText('First child')).toBeInTheDocument();
      expect(screen.getByText('Second child')).toBeInTheDocument();
    });
  });

  describe('error handling', () => {
    it('catches errors and displays fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // Should show error UI
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
      expect(screen.queryByText('No error')).not.toBeInTheDocument();
    });

    it('displays error message in fallback UI', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Test error')).toBeInTheDocument();
    });

    it('logs error to console', () => {
      const consoleErrorSpy = vi.spyOn(console, 'error');

      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('does not show children when error occurs', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
          <div>Should not be visible</div>
        </ErrorBoundary>
      );

      expect(screen.queryByText('Should not be visible')).not.toBeInTheDocument();
    });
  });

  describe('reset functionality', () => {
    it('provides a "Try Again" button in error state', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Try Again')).toBeInTheDocument();
    });

    it('resets error state when "Try Again" is clicked', () => {
      // Component that throws initially, then doesn't throw on re-render
      let throwError = true;
      const TestComponent = () => <ThrowError shouldThrow={throwError} />;

      render(
        <ErrorBoundary>
          <TestComponent />
        </ErrorBoundary>
      );

      // Error state is shown
      expect(screen.getByText('Something went wrong')).toBeInTheDocument();

      // Change the error condition before clicking Try Again
      throwError = false;

      // Click Try Again to reset error boundary
      fireEvent.click(screen.getByText('Try Again'));

      // After clicking Try Again, the error boundary will re-render children
      // Since throwError is now false, it should render successfully
      expect(screen.getByText('No error')).toBeInTheDocument();
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });
  });

  describe('custom fallback', () => {
    it('accepts custom fallback component', () => {
      const customFallback = (
        <div>
          <h1>Custom Error UI</h1>
          <p>Please contact support</p>
        </div>
      );

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Custom Error UI')).toBeInTheDocument();
      expect(screen.getByText('Please contact support')).toBeInTheDocument();
      expect(screen.queryByText('Something went wrong')).not.toBeInTheDocument();
    });

    it('accepts custom fallback as function with error and reset', () => {
      const customFallback = (error: Error, resetError: () => void) => (
        <div>
          <h1>Error: {error.message}</h1>
          <button onClick={resetError}>Reset</button>
        </div>
      );

      render(
        <ErrorBoundary fallback={customFallback}>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      expect(screen.getByText('Error: Test error')).toBeInTheDocument();
      expect(screen.getByText('Reset')).toBeInTheDocument();
    });
  });

  describe('styling', () => {
    it('applies appropriate styling to error container', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      // The outer container has the flex classes, check parentElement.parentElement
      const outerContainer = screen.getByText('Something went wrong').parentElement?.parentElement;
      expect(outerContainer).toHaveClass('flex', 'flex-col', 'items-center', 'justify-center');
    });

    it('styles the Try Again button correctly', () => {
      render(
        <ErrorBoundary>
          <ThrowError shouldThrow={true} />
        </ErrorBoundary>
      );

      const button = screen.getByText('Try Again');
      expect(button).toHaveClass('bg-theme-button-primary');
    });
  });

  describe('edge cases', () => {
    it('handles errors in nested components', () => {
      const NestedComponent = () => {
        return (
          <div>
            <ThrowError shouldThrow={true} />
          </div>
        );
      };

      render(
        <ErrorBoundary>
          <NestedComponent />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('handles errors with no message', () => {
      const ThrowEmptyError = () => {
        throw new Error();
      };

      render(
        <ErrorBoundary>
          <ThrowEmptyError />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });

    it('handles non-Error objects thrown', () => {
      const ThrowString = () => {
        throw 'String error';
      };

      render(
        <ErrorBoundary>
          <ThrowString />
        </ErrorBoundary>
      );

      expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    });
  });
});
