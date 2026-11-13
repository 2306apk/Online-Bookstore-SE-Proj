
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiFetch, jsonBody } from '../../api/client.js';
import { useAuth } from '../../app/AuthContext.jsx';
import { useCart } from '../../app/CartContext.jsx';

export function BookDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { addItem } = useCart();

  const [book, setBook] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [ratingSummary, setRatingSummary] = useState({
    average: 0,
    count: 0,
  });

  const [loading, setLoading] = useState(true);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewError, setReviewError] = useState('');
  const [cartError, setCartError] = useState('');
  const [cartAdding, setCartAdding] = useState(false);
  const [added, setAdded] = useState(false);

  const [rating, setRating] = useState('5');
  const [comment, setComment] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewSubmitted, setReviewSubmitted] = useState(false);

  async function loadReviews(signal) {
    setReviewsLoading(true);
    setReviewError('');

    try {
      const response = await apiFetch(
        `/books/${encodeURIComponent(id)}/reviews`,
        { signal }
      );

      setReviews(response.reviews || []);
      setRatingSummary(
        response.rating || { average: 0, count: 0 }
      );
    } catch (err) {
      if (!signal?.aborted) {
        setReviewError(err.message || 'Unable to load reviews.');
      }
    } finally {
      if (!signal?.aborted) {
        setReviewsLoading(false);
      }
    }
  }

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
    loadReviews(controller.signal);

    return () => controller.abort();
  }, [id]);

  async function handleAddToCart() {
    if (!user || user.role !== 'CUSTOMER') {
      navigate('/auth');
      return;
    }

    setCartAdding(true);
    setCartError('');
    setAdded(false);

    try {
      await addItem(book.id || book._id, 1);
      setAdded(true);
    } catch (err) {
      setCartError(err.message || 'Unable to add this book to your cart.');
    } finally {
      setCartAdding(false);
    }
  }

  async function handleSubmitReview(event) {
    event.preventDefault();
    setReviewError('');
    setReviewSubmitted(false);

    if (!user || user.role !== 'CUSTOMER') {
      navigate('/auth');
      return;
    }

    if (comment.trim().length < 10) {
      setReviewError('Your review must contain at least 10 characters.');
      return;
    }

    setSubmittingReview(true);

    try {
      await apiFetch(`/books/${encodeURIComponent(id)}/reviews`, {
        method: 'POST',
        body: jsonBody({
          rating: Number(rating),
          comment: comment.trim(),
        }),
      });

      setComment('');
      setRating('5');
      setReviewSubmitted(true);

      await loadReviews();
    } catch (err) {
      setReviewError(err.message || 'Unable to submit your review.');
    } finally {
      setSubmittingReview(false);
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
        &larr; Back to Catalogue
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
              <strong>Publisher:</strong> {book.publisher || 'Not provided'}
            </p>
          </div>

          <div className="book-details__description">
            <h2>Synopsis</h2>
            <p>{book.description || 'No synopsis available.'}</p>
          </div>

          <div className="book-details__reviews">
            <h2>Reviews and Rating</h2>

            {reviewsLoading ? (
              <p role="status">Loading reviews...</p>
            ) : (
              <>
                <p>
                  <strong>
                    {ratingSummary.count > 0
                      ? `${ratingSummary.average} / 5`
                      : 'No ratings yet'}
                  </strong>
                  {' '}
                  ({ratingSummary.count} reviews)
                </p>

                {reviews.length === 0 ? (
                  <p>No reviews have been submitted yet.</p>
                ) : (
                  <div className="book-review-list">
                    {reviews.map((review) => (
                      <article
                        className="book-review"
                        key={review.id}
                      >
                        <p>
                          <strong>{review.customerName}</strong>
                        </p>
                        <p>
                          Rating: {review.rating} / 5
                        </p>
                        <p>{review.comment}</p>
                        <small>
                          {review.createdAt
                            ? new Date(review.createdAt).toLocaleDateString()
                            : ''}
                        </small>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}

            {user?.role === 'CUSTOMER' && (
              <form
                className="book-review-form"
                onSubmit={handleSubmitReview}
              >
                <h3>Write a Review</h3>

                <label htmlFor="review-rating">Rating</label>
                <select
                  id="review-rating"
                  value={rating}
                  onChange={(event) => setRating(event.target.value)}
                >
                  <option value="5">5 - Excellent</option>
                  <option value="4">4 - Very Good</option>
                  <option value="3">3 - Good</option>
                  <option value="2">2 - Fair</option>
                  <option value="1">1 - Poor</option>
                </select>

                <label htmlFor="review-comment">Your Review</label>
                <textarea
                  id="review-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  minLength={10}
                  maxLength={1000}
                  rows={4}
                  required
                  placeholder="Write at least 10 characters..."
                />

                <button
                  type="submit"
                  className="button button-primary"
                  disabled={submittingReview}
                >
                  {submittingReview ? 'Submitting...' : 'Submit Review'}
                </button>
              </form>
            )}

            {!user && (
              <p>
                <Link to="/auth">Log in as a customer</Link>
                {' '}to submit a review.
              </p>
            )}

            {reviewSubmitted && (
              <p role="status">Your review was submitted successfully.</p>
            )}

            {reviewError && (
              <p className="catalogue-error" role="alert">
                {reviewError}
              </p>
            )}
          </div>

          {user?.role === 'CUSTOMER' && (
            <button
              type="button"
              className="button button-primary"
              disabled={!inStock || cartAdding}
              onClick={handleAddToCart}
            >
              {cartAdding
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
