import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { SettingsProvider } from './settings/SettingsContext'

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[Workbench ErrorBoundary]', error, errorInfo);
  }

  handleReset = () => {
    try {
      localStorage.clear();
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          backgroundColor: '#07090e',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          fontFamily: 'var(--font-mono, monospace)',
          fontSize: '11px',
        }}>
          <div style={{
            maxWidth: '600px',
            backgroundColor: '#0c0f17',
            border: '1px solid #1e2638',
            borderRadius: '2px',
            padding: '16px',
            width: '100%'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#f43f5e',
              fontSize: '12px',
              fontWeight: 700,
              marginBottom: '10px',
              textTransform: 'uppercase',
              letterSpacing: '0.04em'
            }}>
              <span>[DIAGNOSTIC ALERT]</span>
              <span>Ledger System Exception</span>
            </div>
            <p style={{ color: '#94a3b8', fontSize: '11px', marginBottom: '12px' }}>
              The workbench encountered an unhandled exception during initialization.
            </p>
            <pre style={{
              backgroundColor: '#07090e',
              border: '1px solid #1e2638',
              padding: '10px',
              borderRadius: '2px',
              fontSize: '10px',
              color: '#fb7185',
              overflowX: 'auto',
              marginBottom: '14px',
              whiteSpace: 'pre-wrap'
            }}>
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={this.handleReset}
                className="btn btn-primary"
                style={{ height: '26px', fontSize: '11px' }}
              >
                Reset Local Cache & Reload
              </button>
              <button
                onClick={() => window.location.reload()}
                className="btn btn-secondary"
                style={{ height: '26px', fontSize: '11px' }}
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </ErrorBoundary>
  </StrictMode>,
)
