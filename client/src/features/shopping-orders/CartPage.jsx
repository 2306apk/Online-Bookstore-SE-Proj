import { useState } from 'react';
import { ApiError } from '../../api/client.js';
import { useCart } from '../../app/CartContext.jsx';

function formatPrice(price) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(price);
}

export function CartPage() {
  const { cart, loading, updateItem, removeItem } = useCart();
  const [error, setError] = useState('');
  const [pending, setPending] = useState('');

  async function changeQuantity(item, quantity) {
    if (quantity < 1 || quantity > item.book.stock) return;
    setPending(item.itemId);
    setError('');
    try {
      await updateItem(item.itemId, quantity);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not update the cart.');
    } finally {
      setPending('');
    }
  }

  async function remove(itemId) {
    setPending(itemId);
    setError('');
    try {
      await removeItem(itemId);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not remove the item.');
    } finally {
      setPending('');
    }
  }

  if (loading) return <div className="page-state">Loading your cart...</div>;

  return (
    <section className="cart-page">
      <div className="section-intro">
        <p className="eyebrow">Your saved shelf</p>
        <h1>Cart</h1>
        <p>Keep the books you are considering close. Checkout is intentionally coming in a later sprint.</p>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      {cart.items.length === 0 ? (
        <div className="empty-state cart-empty">
          <span className="empty-mark">+</span>
          <h3>Your cart is waiting.</h3>
          <p>Return to the catalogue and add a book when one catches your eye.</p>
        </div>
      ) : (
        <div className="cart-layout">
          <div className="cart-items">
            {cart.items.map((item) => (
              <article className="cart-item" key={item.itemId}>
                <div className="cart-thumbnail">
                  {item.book.coverUrl ? <img src={item.book.coverUrl} alt="" /> : <span>NS</span>}
                </div>
                <div className="cart-item-copy">
                  <p className="book-category">{item.book.category?.name || 'Catalogue'}</p>
                  <h2>{item.book.title}</h2>
                  <p className="book-author">{item.book.author}</p>
                  <button className="remove-button" type="button" onClick={() => remove(item.itemId)} disabled={pending === item.itemId}>Remove</button>
                </div>
                <div className="cart-item-controls">
                  <div className="quantity-control" aria-label={`Quantity for ${item.book.title}`}>
                    <button type="button" onClick={() => changeQuantity(item, item.quantity - 1)} disabled={pending === item.itemId || item.quantity <= 1}>-</button>
                    <span>{item.quantity}</span>
                    <button type="button" onClick={() => changeQuantity(item, item.quantity + 1)} disabled={pending === item.itemId || item.quantity >= item.book.stock}>+</button>
                  </div>
                  <strong>{formatPrice(item.lineTotal)}</strong>
                </div>
              </article>
            ))}
          </div>
          <aside className="cart-summary">
            <p className="eyebrow">Summary</p>
            <div className="summary-line"><span>Items</span><span>{cart.itemCount}</span></div>
            <div className="summary-line total-line"><span>Total</span><strong>{formatPrice(cart.total)}</strong></div>
            <p className="summary-note">Prices are recalculated from the catalogue on every cart change.</p>
          </aside>
        </div>
      )}
    </section>
  );
}
