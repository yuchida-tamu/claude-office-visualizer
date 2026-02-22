import { Component } from 'react';
import type { ReactNode, ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div
          style={{
            position: 'fixed',
            top: 16,
            left: 16,
            padding: '12px 16px',
            background: 'rgba(239, 68, 68, 0.9)',
            color: '#fff',
            borderRadius: 8,
            fontSize: 12,
            fontFamily: 'monospace',
            maxWidth: 400,
            zIndex: 9999,
            pointerEvents: 'auto',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Overlay Error</div>
          <div style={{ opacity: 0.9 }}>{this.state.error.message}</div>
        </div>
      );
    }
    return this.props.children;
  }
}
