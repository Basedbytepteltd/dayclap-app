import React from 'react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // Log to console (or remote logging service)
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const boxStyle = {
      maxWidth: '800px',
      margin: '2rem auto',
      background: 'var(--secondary-bg)',
      color: 'var(--primary-text)',
      border: '1px solid var(--border-color)',
      borderRadius: '12px',
      boxShadow: '0 10px 30px rgba(0,0,0,0.1)',
      overflow: 'hidden',
    };

    const headerStyle = {
      padding: '1rem 1.25rem',
      borderBottom: '1px solid var(--border-color)',
      background: 'var(--primary-bg)',
    };

    const bodyStyle = { padding: '1.25rem' };
    const btnStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      gap: '.5rem',
      padding: '.6rem 1rem',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      cursor: 'pointer',
      background: 'var(--primary-bg)',
      color: 'var(--primary-text)',
    };
    const primaryBtnStyle = {
      ...btnStyle,
      background: 'var(--accent-color)',
      color: '#fff',
      borderColor: 'var(--accent-color)',
    };
    const actionsStyle = { display: 'flex', gap: '.5rem', marginTop: '1rem', flexWrap: 'wrap' };
    const preStyle = {
      background: 'var(--primary-bg)',
      color: 'var(--primary-text)',
      border: '1px solid var(--border-color)',
      borderRadius: '8px',
      padding: '.75rem',
      overflowX: 'auto',
      fontSize: '.85rem',
      lineHeight: 1.4,
      maxHeight: '260px',
    };

    return (
      <div style={{ padding: '1rem' }}>
        <div style={boxStyle}>
          <div style={headerStyle}>
            <h2 style={{ margin: 0 }}>Something went wrong</h2>
          </div>
          <div style={bodyStyle}>
            <p>
              The app encountered a runtime error and stopped rendering this view. You can try reloading the page or
              reviewing the error details below.
            </p>

            {this.state.error && (
              <details style={{ marginTop: '1rem' }} open>
                <summary style={{ cursor: 'pointer', marginBottom: '.5rem' }}>Error details</summary>
                <pre style={preStyle}>
{String(this.state.error?.toString() || 'Unknown error')}
{'\n'}
{this.state.errorInfo?.componentStack || ''}
                </pre>
              </details>
            )}

            <div style={actionsStyle}>
              <button style={primaryBtnStyle} onClick={this.handleReload}>Reload Page</button>
              <button style={btnStyle} onClick={this.handleReset}>Try to Continue</button>
            </div>

            <p style={{ marginTop: '1rem', color: 'var(--secondary-text)', fontSize: '.9rem' }}>
              Tip: Open DevTools Console for more details (View → Developer → JavaScript Console).
            </p>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
