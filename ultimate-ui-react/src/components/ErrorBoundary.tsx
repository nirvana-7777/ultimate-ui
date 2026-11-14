import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg-primary)',
          color: 'var(--text-primary)',
          padding: 32,
        }}
      >
        <div
          style={{
            maxWidth: 560,
            padding: 32,
            background: 'var(--surface-1)',
            border: '1px solid var(--surface-1-border)',
            borderRadius: 'var(--radius)',
            boxShadow: 'var(--shadow-md)',
          }}
        >
          <h1 style={{ fontSize: 'var(--text-2xl)', marginBottom: 12 }}>
            Etwas ist schiefgelaufen
          </h1>
          <p
            style={{
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-sm)',
              marginBottom: 20,
            }}
          >
            Die Anwendung ist auf einen Fehler gestoßen. Die Details stehen in
            der Browser-Konsole.
          </p>
          {this.state.error && (
            <pre
              style={{
                background: 'var(--bg-primary)',
                padding: 12,
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-xs)',
                overflow: 'auto',
                maxHeight: 200,
                marginBottom: 20,
              }}
            >
              {this.state.error.message}
            </pre>
          )}
          <button
            className="btn-play"
            onClick={() => window.location.reload()}
          >
            ↻ Seite neu laden
          </button>
        </div>
      </div>
    );
  }
}
