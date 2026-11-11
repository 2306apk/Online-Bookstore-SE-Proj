import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { AuthProvider, useAuth } from '../app/AuthContext.jsx';
import { CartProvider, useCart } from '../app/CartContext.jsx';

afterEach(() => {
  cleanup();
});

function ProblemChild({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error('Simulated frontend rendering crash');
  }
  return <div>Application content rendered normally.</div>;
}

function ConsumerChild() {
  const { user } = useAuth();
  const { cart } = useCart();
  return (
    <div data-testid="app-instance">
      <span>App mounted once: {user ? 'authenticated' : 'guest'}</span>
      <span>Cart items: {cart?.itemCount ?? 0}</span>
    </div>
  );
}

describe('OBS-31: Frontend ErrorBoundary Component', () => {
  it('renders children when no rendering error occurs', () => {
    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Application content rendered normally.')).toBeInTheDocument();
  });

  it('catches rendering errors and displays a user-friendly fallback screen with neutral recovery message', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <ErrorBoundary>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('We encountered an unexpected error')).toBeInTheDocument();
    expect(
      screen.getByText('The page could not be displayed properly. Please try reloading the page or return to the catalogue.')
    ).toBeInTheDocument();
    expect(screen.getByText('Try again')).toBeInTheDocument();
    expect(screen.getByText('Reload page')).toBeInTheDocument();
    expect(screen.getByText('Return to catalogue')).toBeInTheDocument();

    consoleSpy.mockRestore();
  });

  it('calls onReset when Try Again is clicked', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const resetSpy = vi.fn();

    render(
      <ErrorBoundary onReset={resetSpy}>
        <ProblemChild shouldThrow={true} />
      </ErrorBoundary>
    );

    const tryAgainButton = screen.getByText('Try again');
    fireEvent.click(tryAgainButton);

    expect(resetSpy).toHaveBeenCalledTimes(1);
    consoleSpy.mockRestore();
  });

  it('mounts exactly one application instance and preserves Auth and Cart providers', () => {
    render(
      <MemoryRouter>
        <ErrorBoundary>
          <AuthProvider>
            <CartProvider>
              <ConsumerChild />
            </CartProvider>
          </AuthProvider>
        </ErrorBoundary>
      </MemoryRouter>
    );

    const instances = screen.getAllByTestId('app-instance');
    expect(instances).toHaveLength(1);
    expect(screen.getByText(/App mounted once:/)).toBeInTheDocument();
  });
});
