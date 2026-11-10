import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, jsonBody } from '../api/client.js';
import { useAuth } from './AuthContext.jsx';

const emptyCart = { items: [], itemCount: 0, total: 0 };
const CartContext = createContext(null);

export function CartProvider({ children }) {
  const { user } = useAuth();
  const [cart, setCart] = useState(emptyCart);
  const [loading, setLoading] = useState(false);

  async function refreshCart() {
    if (!user || user.role !== 'CUSTOMER') {
      setCart(emptyCart);
      return emptyCart;
    }

    setLoading(true);
    try {
      const payload = await apiFetch('/cart');
      setCart(payload.cart);
      return payload.cart;
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refreshCart().catch(() => setCart(emptyCart));
  }, [user]);

  async function addItem(bookId, quantity = 1) {
    const payload = await apiFetch('/cart', {
      method: 'POST',
      body: jsonBody({ bookId, quantity }),
    });
    setCart(payload.cart);
    return payload.cart;
  }

  async function updateItem(itemId, quantity) {
    const payload = await apiFetch(`/cart/${itemId}`, {
      method: 'PATCH',
      body: jsonBody({ quantity }),
    });
    setCart(payload.cart);
    return payload.cart;
  }

  async function removeItem(itemId) {
    const payload = await apiFetch(`/cart/${itemId}`, { method: 'DELETE' });
    setCart(payload.cart);
    return payload.cart;
  }

  const value = useMemo(() => ({ cart, loading, refreshCart, addItem, updateItem, removeItem }), [cart, loading, user]);
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);
  if (!context) throw new Error('useCart must be used inside CartProvider.');
  return context;
}
