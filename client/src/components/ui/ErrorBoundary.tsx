import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
  onReset?: () => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('[ErrorBoundary caught error]:', error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="w-full h-full min-h-[350px] flex flex-col items-center justify-center p-8 bg-white dark:bg-[#0c0e14] border border-neutral-200 dark:border-white/[0.08] rounded-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 flex items-center justify-center text-rose-500 mb-4 shadow-sm">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-white uppercase tracking-wider mb-2">
            {this.props.fallbackTitle || 'Component Render Error'}
          </h3>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 font-mono max-w-md mb-4 break-words">
            {this.state.error?.message || 'An unexpected runtime error occurred.'}
          </p>
          <button
            onClick={this.handleReset}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 font-mono text-xs transition-colors shadow-sm"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Reload Component</span>
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
