import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { WishlistProvider, useWishlist } from './WishlistContext.jsx';

const apiFetch = vi.fn();
const refreshCart = vi.fn();
let mockUser = { id: 'u1', role: 'CUSTOMER' };

vi.mock('../api/client.js', () => ({
  apiFetch: (...args) => apiFetch(...args),
  jsonBody: (value) => JSON.stringify(value),
}));
vi.mock('./AuthContext.jsx', () => ({ useAuth: () => ({ user: mockUser }) }));
vi.mock('./CartContext.jsx', () => ({ useCart: () => ({ refreshCart }) }));

const book = (id) => ({ id, title: `Book ${id}`, available: true });
const list = (...ids) => ({ items: ids.map(book), bookIds: ids, count: ids.length });

let api;
function Probe() {
  api = useWishlist();
  return null;
}

function mount() {
  return render(
    <WishlistProvider>
      <Probe />
    </WishlistProvider>,
  );
}

beforeEach(() => {
  apiFetch.mockReset();
  refreshCart.mockReset().mockResolvedValue({});
  mockUser = { id: 'u1', role: 'CUSTOMER' };
});
afterEach(cleanup);

describe('OBS-22: WishlistProvider', () => {
  it('loads the saved wishlist for a customer (persistence after refresh)', async () => {
    apiFetch.mockResolvedValueOnce({ wishlist: list('a', 'b') });
    mount();
    await waitFor(() => expect(api.wishlist.count).toBe(2));
    expect(apiFetch).toHaveBeenCalledWith('/wishlist');
    expect(api.viewer).toBe('customer');
    expect(api.isWishlisted('a')).toBe(true);
    expect(api.isWishlisted('zzz')).toBe(false);
  });

  it('does not call the API for guests or admins', async () => {
    mockUser = null;
    mount();
    await waitFor(() => expect(api.viewer).toBe('guest'));
    mockUser = { id: 'admin', role: 'ADMIN' };
    cleanup();
    mount();
    await waitFor(() => expect(api.viewer).toBe('other'));
    expect(apiFetch).not.toHaveBeenCalled();
  });

  it('adds and removes books using the server response', async () => {
    apiFetch.mockResolvedValueOnce({ wishlist: list() });
    mount();
    await waitFor(() => expect(api.viewer).toBe('customer'));

    apiFetch.mockResolvedValueOnce({ wishlist: list('a') });
    await act(async () => { await api.addBook('a'); });
    expect(apiFetch).toHaveBeenLastCalledWith('/wishlist', { method: 'POST', body: JSON.stringify({ bookId: 'a' }) });
    expect(api.isWishlisted('a')).toBe(true);

    apiFetch.mockResolvedValueOnce({ wishlist: list() });
    await act(async () => { await api.removeBook('a'); });
    expect(apiFetch).toHaveBeenLastCalledWith('/wishlist/a', { method: 'DELETE' });
    expect(api.wishlist.count).toBe(0);
  });

  it('move to cart updates the wishlist and refreshes the cart', async () => {
    apiFetch.mockResolvedValueOnce({ wishlist: list('a') });
    mount();
    await waitFor(() => expect(api.wishlist.count).toBe(1));

    apiFetch.mockResolvedValueOnce({ cart: { itemCount: 1 }, wishlist: list() });
    await act(async () => { await api.moveToCart('a'); });
    expect(apiFetch).toHaveBeenLastCalledWith('/wishlist/a/move-to-cart', { method: 'POST' });
    expect(api.wishlist.count).toBe(0);
    expect(refreshCart).toHaveBeenCalledTimes(1);
  });

  it('keeps the wishlist unchanged when move to cart fails', async () => {
    apiFetch.mockResolvedValueOnce({ wishlist: list('a') });
    mount();
    await waitFor(() => expect(api.wishlist.count).toBe(1));

    apiFetch.mockRejectedValueOnce(new Error('Only 0 copies are currently available.'));
    await expect(api.moveToCart('a')).rejects.toThrow('Only 0 copies');
    expect(api.wishlist.count).toBe(1);
    expect(refreshCart).not.toHaveBeenCalled();
  });
});
