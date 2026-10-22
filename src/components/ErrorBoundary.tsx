import { Component, type ErrorInfo, type ReactNode } from 'react';
import { diagnosticsReport, logDiag } from '../lib/diagnostics';

interface Props {
  children: ReactNode;
  /** Compact boundaries (e.g. around the viewer) call this instead of showing a page. */
  onReset?: () => void;
  label?: string;
}

interface State {
  error: Error | null;
}

/**
 * Catches render errors so a bug shows a recoverable screen instead of an empty black
 * page (React unmounts the whole tree on an uncaught render error).
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    logDiag('error', `${this.props.label || 'App'} crashed: ${error.message}`, `${error.stack || ''}\n${info.componentStack || ''}`);
    if (this.props.onReset) {
      // Viewer-level boundary: drop back to the grid immediately.
      setTimeout(() => {
        this.props.onReset?.();
        this.setState({ error: null });
      }, 0);
    }
  }

  private copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticsReport({ error: this.state.error?.message }));
    } catch {
      /* clipboard unavailable */
    }
  };

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.onReset) return null;
    return (
      <div className="ps-crash" role="alert">
        <h1>Something went wrong</h1>
        <p>{this.state.error.message}</p>
        <div className="ps-crash-actions">
          <button onClick={() => this.setState({ error: null })}>Try again</button>
          <button onClick={() => window.location.reload()}>Reload app</button>
          <button onClick={this.copy}>Copy diagnostics</button>
        </div>
      </div>
    );
  }
}
