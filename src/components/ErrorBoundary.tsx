import { Component, ErrorInfo, ReactNode } from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';
import { Button } from './ui/Button';
import { logger } from '../utils/logger';

interface ErrorBoundaryProps extends WithTranslation {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, resetError: () => void) => ReactNode);
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundaryClass extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console for debugging
    logger.error('ErrorBoundary caught an error:', 'ErrorBoundary', error, errorInfo);
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      const { error } = this.state;

      // If custom fallback is provided
      if (fallback) {
        if (typeof fallback === 'function') {
          return fallback(error!, this.resetError);
        }
        return fallback;
      }

      // Default fallback UI
      return (
        <div className="flex flex-col items-center justify-center min-h-screen p-6 bg-stone-950">
          <div className="max-w-md w-full bg-stone-900 border border-stone-800 rounded-lg p-8 text-center">
            <div className="mb-6">
              <svg
                className="w-16 h-16 mx-auto text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>

            <h1 className="text-2xl font-bold text-white mb-2">
              {this.props.t('boundary.title')}
            </h1>

            {error?.message && (
              <p className="text-stone-400 mb-6 text-sm">
                {error.message}
              </p>
            )}

            <p className="text-stone-400 mb-6">
              {this.props.t('boundary.message')}
            </p>

            <Button
              onClick={this.resetError}
              variant="primary"
              fullWidth
            >
              {this.props.t('boundary.tryAgain')}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const ErrorBoundary = withTranslation("errors")(ErrorBoundaryClass);
