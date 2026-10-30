import React, { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

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
          backgroundColor: '#080c14',
          color: '#f8fafc',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          fontFamily: 'monospace'
        }}>
          <div style={{
            maxWidth: '680px',
            backgroundColor: '#0f172a',
            border: '1px solid #dc2626',
            borderRadius: '8px',
            padding: '1.5rem',
            width: '100%'
          }}>
            <h2 style={{ color: '#ef4444', fontSize: '18px', fontWeight: 'bold', marginBottom: '12px' }}>
              ⚠️ Ledger System Diagnostic Alert
            </h2>
            <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '16px' }}>
              The workbench encountered an unhandled exception during initialization.
            </p>
            <pre style={{
              backgroundColor: '#05070d',
              padding: '12px',
              borderRadius: '4px',
              fontSize: '12px',
              color: '#fca5a5',
              overflowX: 'auto',
              marginBottom: '16px',
              whiteSpace: 'pre-wrap'
            }}>
              {this.state.error?.message || String(this.state.error)}
            </pre>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={this.handleReset}
                style={{
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  cursor: 'pointer',
                  fontWeight: 600
                }}
              >
                Reset Local Cache & Reload
              </button>
              <button
                onClick={() => window.location.reload()}
                style={{
                  backgroundColor: '#1e293b',
                  color: '#94a3b8',
                  border: '1px solid #334155',
                  borderRadius: '4px',
                  padding: '8px 16px',
                  fontSize: '13px',
                  cursor: 'pointer'
                }}
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
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
