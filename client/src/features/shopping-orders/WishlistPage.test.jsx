import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../api/client.js';
import { WishlistContext } from '../../app/WishlistContext.jsx';
import { WishlistPage } from './WishlistPage.jsx';

afterEach(cleanup);

const available = { id: 'a', title: 'Reliable Systems', author: 'Ada Lovelace', price: 250, available: true, category: { name: 'Technology' } };
const unavailable = { id: 'u', title: 'Sold Out Book', author: 'Grace Hopper', price: 100, available: false };

function renderPage(overrides = {}, items = [available, unavailable]) {
  const value = {
    wishlist: { items, bookIds: items.map((book) => book.id), count: items.length },
    loading: false,
    viewer: 'customer',
    removeBook: vi.fn().mockResolvedValue({}),
    moveToCart: vi.fn().mockResolvedValue({}),
    ...overrides,
  };
  render(
    <MemoryRouter>
      <WishlistContext.Provider value={value}>
        <WishlistPage />
      </WishlistContext.Provider>
    </MemoryRouter>,
  );
  return value;
}

describe('OBS-22: WishlistPage', () => {
  it('shows saved books with prices and availability', () => {
    renderPage();
    expect(screen.getByText('Reliable Systems')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
    expect(screen.getByText('Sold Out Book')).toBeInTheDocument();
    expect(screen.getByText('Currently unavailable')).toBeInTheDocument();
  });

  it('keeps unavailable books visible but blocks moving them to the cart', () => {
    renderPage();
    const buttons = screen.getAllByRole('button', { name: 'Move to cart' });
    expect(buttons[0]).toBeEnabled();
    expect(buttons[1]).toBeDisabled();
  });

  it('moves an available book to the cart and confirms it', async () => {
    const value = renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Move to cart' })[0]);
    await waitFor(() => expect(value.moveToCart).toHaveBeenCalledWith('a'));
    expect(await screen.findByRole('status')).toHaveTextContent('Moved "Reliable Systems" to your cart.');
  });

  it('shows the server message when moving fails and keeps the book listed', async () => {
    const moveToCart = vi.fn().mockRejectedValue(new ApiError('Only 0 copies are currently available.', 409, 'INSUFFICIENT_STOCK'));
    renderPage({ moveToCart });
    fireEvent.click(screen.getAllByRole('button', { name: 'Move to cart' })[0]);
    expect(await screen.findByRole('alert')).toHaveTextContent('Only 0 copies are currently available.');
    expect(screen.getByText('Reliable Systems')).toBeInTheDocument();
  });

  it('removes a book', async () => {
    const value = renderPage();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[1]);
    await waitFor(() => expect(value.removeBook).toHaveBeenCalledWith('u'));
  });

  it('shows a friendly empty state with a link to the catalogue', () => {
    renderPage({}, []);
    expect(screen.getByText('Your wishlist is empty.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Browse the catalogue' })).toHaveAttribute('href', '/');
  });

  it('shows a loading state before the first load', () => {
    renderPage({ loading: true }, []);
    expect(screen.getByText('Loading your wishlist...')).toBeInTheDocument();
  });
});
