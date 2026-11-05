import { useEffect, useState } from 'react';
import { BookCard } from './BookCard.jsx';

export function CataloguePage() {
  const [books, setBooks] = useState([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    limit: 20,
    total: 0,
    pages: 0,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function fetchBooks() {
      try {
        setLoading(true);
        setError('');

        const response = await fetch(
          `/api/books?page=${page}&limit=${pagination.limit}`,
          { signal: controller.signal }
        );

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to load books');
        }

        setBooks(data.books || []);

        setPagination((previous) => ({
          ...previous,
          ...(data.pagination || {}),
        }));
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message);
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchBooks();

    return () => controller.abort();
  }, [page, pagination.limit]);

  return (
    <main className="catalogue-page">
      <header className="catalogue-header">
        <h1>Online Bookstore</h1>
        <p>Discover and explore our collection of books.</p>
      </header>

      {loading && (
        <p role="status">Loading books...</p>
      )}

      {error && (
        <p role="alert">{error}</p>
      )}

      {!loading && !error && books.length === 0 && (
        <p>No books are currently available.</p>
      )}

      {!loading && !error && books.length > 0 && (
        <>
          <section
            className="book-grid"
            aria-label="Available books"
          >
            {books.map((book) => (
              <BookCard
                key={book.id || book._id}
                book={book}
              />
            ))}
          </section>

          <nav
            className="catalogue-pagination"
            aria-label="Catalogue pagination"
          >
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((current) => current - 1)}
            >
              Previous
            </button>

            <span>
              Page {page} of {Math.max(pagination.pages, 1)}
            </span>

            <button
              type="button"
              disabled={
                pagination.pages === 0 ||
                page >= pagination.pages
              }
              onClick={() => setPage((current) => current + 1)}
            >
              Next
            </button>
          </nav>
        </>
      )}
    </main>
  );
}