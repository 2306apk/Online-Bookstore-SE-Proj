import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, jsonBody } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';
import { useCart } from './CartContext.jsx';

const emptyWishlist = { items: [], bookIds: [], count: 0 };

export const WishlistContext = createContext(null);

export function WishlistProvider({ children }) {
  const { user } = useAuth();
  const { refreshCart } = useCart();
  const [wishlist, setWishlist] = useState(emptyWishlist);
  const [loading, setLoading] = useState(false);

  const isCustomer = Boolean(user && user.role === 'CUSTOMER');
  const viewer = !user ? 'guest' : isCustomer ? 'customer' : 'other';

  const refreshWishlist = useCallback(async () => {
    if (!isCustomer) {
      setWishlist(emptyWishlist);
      return emptyWishlist;
    }
    setLoading(true);
    try {
      const payload = await apiFetch('/wishlist');
      setWishlist(payload.wishlist);
      return payload.wishlist;
    } finally {
      setLoading(false);
    }
  }, [isCustomer, user?.id]);

  useEffect(() => {
    refreshWishlist().catch(() => setWishlist(emptyWishlist));
  }, [refreshWishlist]);

  const addBook = useCallback(async (bookId) => {
    const payload = await apiFetch('/wishlist', { method: 'POST', body: jsonBody({ bookId }) });
    setWishlist(payload.wishlist);
    return payload.wishlist;
  }, []);

  const removeBook = useCallback(async (bookId) => {
    const payload = await apiFetch(`/wishlist/${bookId}`, { method: 'DELETE' });
    setWishlist(payload.wishlist);
    return payload.wishlist;
  }, []);

  const moveToCart = useCallback(async (bookId) => {
    const payload = await apiFetch(`/wishlist/${bookId}/move-to-cart`, { method: 'POST' });
    setWishlist(payload.wishlist);
    await refreshCart().catch(() => {});
    return payload;
  }, [refreshCart]);

  const isWishlisted = useCallback((bookId) => wishlist.bookIds.includes(String(bookId)), [wishlist]);

  const value = useMemo(
    () => ({ wishlist, loading, viewer, refreshWishlist, addBook, removeBook, moveToCart, isWishlisted }),
    [wishlist, loading, viewer, refreshWishlist, addBook, removeBook, moveToCart, isWishlisted],
  );
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function useWishlist() {
  const context = useContext(WishlistContext);
  if (!context) throw new Error('useWishlist must be used inside WishlistProvider.');
  return context;
}

/** Same as useWishlist, but returns null outside a provider (used by shared components and tests). */
export function useOptionalWishlist() {
  return useContext(WishlistContext);
}
