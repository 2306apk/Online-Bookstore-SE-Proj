import { useState } from 'react';
import { ApiError } from '../../api/client.js';
import { useAuth } from '../../app/AuthContext.jsx';
import { useCart } from '../../app/CartContext.jsx';

function formatPrice(price) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(price);
}

export function BookCard({ book }) {
  const { user } = useAuth();
  const { addItem } = useCart();
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState('');

  async function addToCart() {
    if (!user) {
      setMessage('Sign in to keep a cart.');
      return;
    }
    setAdding(true);
    setMessage('');
    try {
      await addItem(book.id);
      setMessage('Added to cart.');
    } catch (error) {
      setMessage(error instanceof ApiError ? error.message : 'Could not add this book.');
    } finally {
      setAdding(false);
    }
  }

  return (
    <article className="book-card">
      <div className="book-cover-wrap">
        {book.coverUrl ? (
          <img className="book-cover" src={book.coverUrl} alt={`Cover of ${book.title}`} />
        ) : (
          <div className="book-cover fallback-cover" aria-label="No cover available">NS</div>
        )}
        <span className={book.available ? 'availability available' : 'availability unavailable'}>
          {book.available ? `${book.stock} in stock` : 'Out of stock'}
        </span>
      </div>
      <div className="book-copy">
        <p className="book-category">{book.category?.name || 'Catalogue'}</p>
        <h3>{book.title}</h3>
        <p className="book-author">{book.author}</p>
        <div className="book-footer">
          <strong>{formatPrice(book.price)}</strong>
          <button className="button button-small" type="button" onClick={addToCart} disabled={!book.available || adding}>
            {adding ? 'Adding...' : 'Add to cart'}
          </button>
        </div>
        {message && <small className={message === 'Added to cart.' ? 'inline-success' : 'inline-error'}>{message}</small>}
      </div>
    </article>
  );
}
