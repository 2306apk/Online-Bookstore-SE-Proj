import { Component } from 'react';

export class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    if (import.meta.env?.DEV) {
      console.error('React application error caught by ErrorBoundary:', error, errorInfo);
    } else {
      console.error('An unexpected UI error occurred.');
    }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="app-shell" role="alert" aria-live="assertive">
          <main className="site-main" style={{ display: 'grid', placeItems: 'center', minHeight: '60vh' }}>
            <div
              style={{
                maxWidth: '560px',
                width: '100%',
                padding: '36px',
                background: 'var(--card, #fffdf8)',
                border: '1px solid var(--line, #dcded5)',
                borderRadius: '8px',
                boxShadow: 'var(--shadow, 0 18px 45px rgba(20, 38, 33, 0.08))',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '50%',
                  background: 'var(--soft-orange, #f6dfd0)',
                  color: 'var(--orange, #dc704b)',
                  display: 'grid',
                  placeItems: 'center',
                  margin: '0 auto 16px',
                  fontSize: '1.4rem',
                  fontWeight: 700,
                }}
              >
                !
              </div>
              <p className="eyebrow">Something went wrong</p>
              <h1 style={{ fontSize: '1.4rem', margin: '0 0 12px', color: 'var(--ink, #15231f)' }}>
                We encountered an unexpected error
              </h1>
              <p className="muted" style={{ margin: '0 0 24px' }}>
                The page could not be displayed properly. Please try reloading the page or return to the catalogue.
              </p>
              <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                <button
                  className="button button-primary"
                  type="button"
                  onClick={this.handleReset}
                >
                  Try again
                </button>
                <button
                  className="button button-dark"
                  type="button"
                  onClick={this.handleReload}
                >
                  Reload page
                </button>
                <a
                  className="button button-quiet"
                  href="/"
                  style={{ display: 'inline-flex', alignItems: 'center' }}
                >
                  Return to catalogue
                </a>
              </div>
            </div>
          </main>
        </div>
      );
    }

    return this.props.children;
  }
}
