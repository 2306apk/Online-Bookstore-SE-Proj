import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError } from '../../api/client.js';
import { useWishlist } from '../../app/WishlistContext.jsx';
import './wishlist.css';

function formatPrice(price) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(price);
}

export function WishlistPage() {
  const { wishlist, loading, removeBook, moveToCart } = useWishlist();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState('');

  async function run(bookId, action, successMessage, fallbackMessage) {
    setPending(bookId);
    setError('');
    setNotice('');
    try {
      await action(bookId);
      if (successMessage) setNotice(successMessage);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : fallbackMessage);
    } finally {
      setPending('');
    }
  }

  if (loading && wishlist.items.length === 0) return <div className="page-state">Loading your wishlist...</div>;

  return (
    <section className="wishlist-page cart-page">
      <div className="section-intro">
        <p className="eyebrow">Saved for later</p>
        <h1>Wishlist</h1>
        <p>Keep books you want to come back to. Move one to your cart when you are ready.</p>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      {notice && <div className="alert success" role="status">{notice}</div>}
      {wishlist.items.length === 0 ? (
        <div className="empty-state cart-empty">
          <span className="empty-mark">♡</span>
          <h3>Your wishlist is empty.</h3>
          <p>Tap the heart on any book in the catalogue to save it here.</p>
          <Link className="button button-dark" to="/">Browse the catalogue</Link>
        </div>
      ) : (
        <div className="wishlist-list">
          {wishlist.items.map((book) => (
            <article className={`wishlist-item${book.available ? '' : ' is-unavailable'}`} key={book.id}>
              <div className="cart-thumbnail">
                {book.coverImage ? <img src={book.coverImage} alt="" /> : <span>NS</span>}
              </div>
              <div>
                <p className="book-category">{book.category?.name || 'Catalogue'}</p>
                <h2>{book.title}</h2>
                <p className="book-author">{book.author}</p>
                <span className={`availability-badge ${book.available ? 'in-stock' : 'unavailable'}`}>
                  {book.available ? 'Available' : 'Currently unavailable'}
                </span>
              </div>
              <div className="wishlist-item-actions">
                <strong>{formatPrice(book.price)}</strong>
                <button
                  className="button button-dark"
                  type="button"
                  disabled={!book.available || pending === book.id}
                  onClick={() => run(book.id, moveToCart, `Moved "${book.title}" to your cart.`, 'Could not move the book to your cart.')}
                >
                  Move to cart
                </button>
                <button
                  className="remove-button"
                  type="button"
                  disabled={pending === book.id}
                  onClick={() => run(book.id, removeBook, '', 'Could not remove the book from your wishlist.')}
                >
                  Remove
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
