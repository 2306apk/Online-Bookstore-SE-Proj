export function BookCard({ book }) {
  return (
    <article className="book-card">
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

      <div className="book-card__content">
        <h2>{book.title}</h2>

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