import { useEffect, useState } from 'react';
import { BookCard } from './BookCard.jsx';

const EMPTY_SEARCH = {
  q: '',
  author: '',
  keyword: ''
};

export function CataloguePage() {
  const [searchInput, setSearchInput] = useState(EMPTY_SEARCH);
  const [search, setSearch] = useState(EMPTY_SEARCH);
  const [page, setPage] = useState(1);
  const [books, setBooks] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    pages: 1,
    total: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadBooks() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams({
          page: String(page),
          limit: '12'
        });

        Object.entries(search).forEach(([key, value]) => {
          if (value.trim()) {
            params.set(key, value.trim());
          }
        });

        const response = await fetch(`/api/books?${params.toString()}`, {
          signal: controller.signal
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Unable to load books');
        }

        setBooks(data.books || []);
        setPagination(data.pagination || {
          page: 1,
          pages: 1,
          total: 0
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          setError(err.message || 'Something went wrong');
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    loadBooks();

    return () => controller.abort();
  }, [search, page]);

  function handleInputChange(event) {
    const { name, value } = event.target;

    setSearchInput((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleSearch(event) {
    event.preventDefault();
    setPage(1);

    setSearch({
      q: searchInput.q.trim(),
      author: searchInput.author.trim(),
      keyword: searchInput.keyword.trim()
    });
  }

  function handleClear() {
    setSearchInput(EMPTY_SEARCH);
    setSearch(EMPTY_SEARCH);
    setPage(1);
  }

  return (
    <main className="catalogue-page">
      <header className="catalogue-header">
        <h1>Book Catalogue</h1>
        <p>Browse and search our collection of books.</p>
      </header>

      <form className="catalogue-search" onSubmit={handleSearch}>
        <div className="search-field">
          <label htmlFor="book-title">Book title</label>
          <input
            id="book-title"
            name="q"
            type="search"
            placeholder="Search by title"
            value={searchInput.q}
            onChange={handleInputChange}
          />
        </div>

        <div className="search-field">
          <label htmlFor="book-author">Author</label>
          <input
            id="book-author"
            name="author"
            type="search"
            placeholder="Search by author"
            value={searchInput.author}
            onChange={handleInputChange}
          />
        </div>

        <div className="search-field">
          <label htmlFor="book-keyword">Keyword</label>
          <input
            id="book-keyword"
            name="keyword"
            type="search"
            placeholder="Search by keyword"
            value={searchInput.keyword}
            onChange={handleInputChange}
          />
        </div>

        <div className="search-actions">
          <button type="submit">Search Books</button>
          <button type="button" className="clear-search" onClick={handleClear}>
            Clear
          </button>
        </div>
      </form>

      <section aria-live="polite">
        {loading && <p>Loading books...</p>}

        {!loading && error && (
          <p className="catalogue-error" role="alert">{error}</p>
        )}

        {!loading && !error && (
          <>
            <p className="catalogue-result-count">
              {pagination.total} book(s) found
            </p>

            {books.length === 0 ? (
              <p className="catalogue-empty">
                No books found. Try changing your search.
              </p>
            ) : (
              <div className="book-grid">
                {books.map((book) => (
                  <BookCard key={book._id || book.id} book={book} />
                ))}
              </div>
            )}

            {pagination.pages > 1 && (
              <nav className="catalogue-pagination" aria-label="Catalogue pages">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous
                </button>

                <span>
                  Page {pagination.page} of {pagination.pages}
                </span>

                <button
                  type="button"
                  disabled={page >= pagination.pages}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next
                </button>
              </nav>
            )}
          </>
        )}
      </section>
    </main>
  );
}