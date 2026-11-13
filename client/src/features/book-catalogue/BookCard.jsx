
import { Link } from 'react-router-dom';
import { WishlistButton } from '../shopping-orders/WishlistButton.jsx';

export function BookCard({ book }) {
  const bookId = book.id || book._id;

  return (
    <article className="book-card">
      <WishlistButton bookId={bookId} title={book.title} />

      <Link
        to={`/books/${encodeURIComponent(bookId)}`}
        className="book-card__details-link"
        aria-label={`View details for ${book.title}`}
      >
        {book.coverImage ? (
          <img
            src={book.coverImage}
            alt={`Cover of ${book.title}`}
            className="book-card__image"
          />
        ) : (
          <div className="book-card__placeholder">
            No Cover Available
          </div>
        )}
      </Link>

      <div className="book-card__content">
        <h2>
          <Link
            to={`/books/${encodeURIComponent(bookId)}`}
            className="book-card__details-link"
          >
            {book.title}
          </Link>
        </h2>

        <p>
          <strong>Author:</strong> {book.author}
        </p>

        {book.category?.name && (
          <p>
            <strong>Category:</strong> {book.category.name}
          </p>
        )}

        <p>{book.description}</p>

        <p className="book-card__price">
          ₹{Number(book.price).toFixed(2)}
        </p>

        <p>
          {book.stock > 0
            ? `In Stock: ${book.stock}`
            : 'Out of Stock'}
        </p>
      </div>
    </article>
  );
}
