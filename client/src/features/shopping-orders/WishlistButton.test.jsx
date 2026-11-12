import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { WishlistContext } from '../../app/WishlistContext.jsx';
import { WishlistButton } from './WishlistButton.jsx';

afterEach(cleanup);

function renderButton(value) {
  const tree = (
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<WishlistButton bookId="b1" title="Reliable Systems" />} />
        <Route path="/auth" element={<div>Sign in page</div>} />
      </Routes>
    </MemoryRouter>
  );
  return render(value ? <WishlistContext.Provider value={value}>{tree}</WishlistContext.Provider> : tree);
}

const base = (overrides = {}) => ({
  viewer: 'customer',
  isWishlisted: () => false,
  addBook: vi.fn().mockResolvedValue({}),
  removeBook: vi.fn().mockResolvedValue({}),
  ...overrides,
});

describe('OBS-22: WishlistButton (heart toggle)', () => {
  it('renders nothing outside a WishlistProvider', () => {
    const { container } = renderButton(null);
    expect(container.querySelector('button')).toBeNull();
  });

  it('renders nothing for admin (non-customer) accounts', () => {
    const { container } = renderButton(base({ viewer: 'other' }));
    expect(container.querySelector('button')).toBeNull();
  });

  it('adds a book when the heart is empty', async () => {
    const value = base();
    renderButton(value);
    const button = screen.getByRole('button', { name: 'Add Reliable Systems to wishlist' });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(button);
    await waitFor(() => expect(value.addBook).toHaveBeenCalledWith('b1'));
    expect(value.removeBook).not.toHaveBeenCalled();
  });

  it('removes a book when the heart is filled', async () => {
    const value = base({ isWishlisted: () => true });
    renderButton(value);
    const button = screen.getByRole('button', { name: 'Remove Reliable Systems from wishlist' });
    expect(button).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(button);
    await waitFor(() => expect(value.removeBook).toHaveBeenCalledWith('b1'));
    expect(value.addBook).not.toHaveBeenCalled();
  });

  it('sends guests to sign in instead of calling the API', () => {
    const value = base({ viewer: 'guest' });
    renderButton(value);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByText('Sign in page')).toBeInTheDocument();
    expect(value.addBook).not.toHaveBeenCalled();
  });

  it('does not crash when the request fails', async () => {
    const value = base({ addBook: vi.fn().mockRejectedValue(new Error('nope')) });
    renderButton(value);
    fireEvent.click(screen.getByRole('button'));
    await waitFor(() => expect(value.addBook).toHaveBeenCalled());
    expect(screen.getByRole('button')).not.toBeDisabled();
  });
});
