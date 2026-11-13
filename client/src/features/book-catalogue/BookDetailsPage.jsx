
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch } from '../../api/client.js';
import { useAuth } from '../../app/AuthContext.jsx';
import { useCart } from '../../app/CartContext.jsx';

export function BookDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { addItem } = useCart();

  const [book, setBook] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cartError, setCartError] = useState('');
  const [adding, setAdding] = useState(false);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBook() {
      setLoading(true);
      setError('');
      setBook(null);

      try {
        const response = await apiFetch(
          `/books/${encodeURIComponent(id)}`,
          { signal: controller.signal }
        );

        setBook(response.book);
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(err.message || 'Unable to load book details.');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadBook();

    return () => controller.abort();
  }, [id]);

  async function handleAddToCart() {
    if (!user || user.role !== 'CUSTOMER') {
      navigate('/auth');
      return;
    }

    setAdding(true);
    setCartError('');
    setAdded(false);

    try {
      await addItem(book.id || book._id, 1);
      setAdded(true);
    } catch (err) {
      setCartError(err.message || 'Unable to add this book to your cart.');
    } finally {
      setAdding(false);
    }
  }

  if (loading || authLoading) {
    return (
      <main className="book-details-page">
        <p role="status">Loading book details...</p>
      </main>
    );
  }

  if (error || !book) {
    return (
      <main className="book-details-page">
        <p className="catalogue-error" role="alert">
          {error || 'Book not found.'}
        </p>
        <Link to="/">Back to Catalogue</Link>
      </main>
    );
  }

  const inStock = Number(book.stock) > 0;

  return (
    <main className="book-details-page">
      <Link to="/" className="book-details-back">
        ← Back to Catalogue
      </Link>

      <section className="book-details">
        <div className="book-details__cover">
          {book.coverImage ? (
            <img
              src={book.coverImage}
              alt={`Cover of ${book.title}`}
            />
          ) : (
            <div className="book-card__placeholder">
              No Cover Available
            </div>
          )}
        </div>

        <div className="book-details__content">
          <h1>{book.title}</h1>

          <p>
            <strong>Author:</strong> {book.author}
          </p>

          {book.category?.name && (
            <p>
              <strong>Category:</strong> {book.category.name}
            </p>
          )}

          <p className="book-card__price">
            ₹{Number(book.price).toFixed(2)}
          </p>

          <p className={inStock ? 'book-details__stock' : 'book-details__out'}>
            {inStock ? `In Stock: ${book.stock}` : 'Out of Stock'}
          </p>

          <div className="book-details__metadata">
            <p>
              <strong>ISBN:</strong> {book.isbn || 'Not provided'}
            </p>
            <p>
              <strong>Publisher:</strong> Not available
            </p>
          </div>

          <div className="book-details__description">
            <h2>Synopsis</h2>
            <p>{book.description || 'No synopsis available.'}</p>
          </div>

          <div className="book-details__reviews">
            <h2>Reviews and Rating</h2>
            <p>Reviews and aggregate rating are not available yet.</p>
          </div>

          {user?.role === 'CUSTOMER' && (
            <button
              type="button"
              className="button button-primary"
              disabled={!inStock || adding}
              onClick={handleAddToCart}
            >
              {adding
                ? 'Adding...'
                : inStock
                  ? 'Add to Cart'
                  : 'Out of Stock'}
            </button>
          )}

          {!user && (
            <button
              type="button"
              className="button button-primary"
              disabled={!inStock}
              onClick={handleAddToCart}
            >
              Add to Cart
            </button>
          )}

          {added && (
            <p role="status">Book added to your cart.</p>
          )}

          {cartError && (
            <p className="catalogue-error" role="alert">
              {cartError}
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
