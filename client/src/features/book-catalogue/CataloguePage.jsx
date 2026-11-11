import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookCard } from './BookCard.jsx';

const EMPTY_SEARCH = {
  q: '',
  author: '',
  keyword: ''
};

const EMPTY_PAGINATION = {
  page: 1,
  pages: 1,
  total: 0
};

export function CataloguePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryString = searchParams.toString();

  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const category = searchParams.get('category') || '';
  const inStock = searchParams.get('inStock') === 'true';

  const [searchInput, setSearchInput] = useState({
    q: searchParams.get('q') || '',
    author: searchParams.get('author') || '',
    keyword: searchParams.get('keyword') || ''
  });

  const [books, setBooks] = useState([]);
  const [pagination, setPagination] = useState(EMPTY_PAGINATION);
  const [categories, setCategories] = useState([]);
  const [priceRange, setPriceRange] = useState({ min: 0, max: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filterError, setFilterError] = useState('');

  const minimumPrice = Number(
    searchParams.get('minPrice') ?? priceRange.min
  );
  const maximumPrice = Number(
    searchParams.get('maxPrice') ?? priceRange.max
  );

  function updateParams(updates, resetPage = true) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);

      Object.entries(updates).forEach(([key, value]) => {
        if (value === null || value === undefined || value === '') {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      });

      if (resetPage) {
        next.delete('page');
      }

      return next;
    });
  }

  useEffect(() => {
    const controller = new AbortController();

    async function loadFilters() {
      try {
        const response = await fetch('/api/books/filters', {
          signal: controller.signal
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Unable to load filters');
        }

        setCategories(data.categories || []);
        setPriceRange(data.priceRange || { min: 0, max: 0 });
      } catch (err) {
        if (err.name !== 'AbortError') {
          setFilterError(err.message || 'Unable to load catalogue filters');
        }
      }
    }

    loadFilters();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadBooks() {
      setLoading(true);
      setError('');

      try {
        const params = new URLSearchParams(queryString);
        params.set('page', String(page));
        params.set('limit', '12');

        const response = await fetch(`/api/books?${params.toString()}`, {
          signal: controller.signal
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.message || 'Unable to load books');
        }

        setBooks(data.books || []);
        setPagination(data.pagination || EMPTY_PAGINATION);
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
  }, [queryString, page]);

  useEffect(() => {
    setSearchInput({
      q: searchParams.get('q') || '',
      author: searchParams.get('author') || '',
      keyword: searchParams.get('keyword') || ''
    });
  }, [queryString]);

  function handleInputChange(event) {
    const { name, value } = event.target;

    setSearchInput((current) => ({
      ...current,
      [name]: value
    }));
  }

  function handleSearch(event) {
    event.preventDefault();

    updateParams({
      q: searchInput.q.trim(),
      author: searchInput.author.trim(),
      keyword: searchInput.keyword.trim()
    });
  }

  function handleClearSearch() {
    setSearchInput(EMPTY_SEARCH);

    updateParams({
      q: null,
      author: null,
      keyword: null
    });
  }

  function handleClearFilters() {
    updateParams({
      category: null,
      minPrice: null,
      maxPrice: null,
      inStock: null
    });
  }

  function handleMinimumPriceChange(event) {
    const value = Number(event.target.value);

    updateParams({
      minPrice: value <= priceRange.min ? null : value,
      maxPrice: value > maximumPrice ? value : (
        searchParams.get('maxPrice') || null
      )
    });
  }

  function handleMaximumPriceChange(event) {
    const value = Number(event.target.value);

    updateParams({
      maxPrice: value >= priceRange.max ? null : value,
      minPrice: value < minimumPrice ? value : (
        searchParams.get('minPrice') || null
      )
    });
  }

  function handleCategoryChange(event) {
    updateParams({ category: event.target.value });
  }

  function handleStockChange(event) {
    updateParams({
      inStock: event.target.checked ? 'true' : null
    });
  }

  function handlePageChange(nextPage) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      return next;
    });
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
          <button
            type="button"
            className="clear-search"
            onClick={handleClearSearch}
          >
            Clear Search
          </button>
        </div>
      </form>

      <section className="catalogue-filters" aria-label="Catalogue filters">
        <div className="search-field">
          <label htmlFor="book-category">Category</label>
          <select
            id="book-category"
            value={category}
            onChange={handleCategoryChange}
          >
            <option value="">All categories</option>
            {categories.map((item) => (
              <option key={item.id || item._id} value={item.id || item._id}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="price-filter">
          <label>Price range</label>

          <div className="price-values">
            <span>Minimum: {minimumPrice.toFixed(2)}</span>
            <span>Maximum: {maximumPrice.toFixed(2)}</span>
          </div>

          <label htmlFor="minimum-price">Minimum price</label>
          <input
            id="minimum-price"
            type="range"
            min={priceRange.min}
            max={maximumPrice}
            step="0.01"
            value={minimumPrice}
            disabled={priceRange.min === priceRange.max}
            onChange={handleMinimumPriceChange}
          />

          <label htmlFor="maximum-price">Maximum price</label>
          <input
            id="maximum-price"
            type="range"
            min={minimumPrice}
            max={priceRange.max}
            step="0.01"
            value={maximumPrice}
            disabled={priceRange.min === priceRange.max}
            onChange={handleMaximumPriceChange}
          />
        </div>

        <label className="stock-filter" htmlFor="in-stock-only">
          <input
            id="in-stock-only"
            type="checkbox"
            checked={inStock}
            onChange={handleStockChange}
          />
          In Stock Only
        </label>

        <button
          type="button"
          className="clear-search"
          onClick={handleClearFilters}
        >
          Clear Filters
        </button>

        {filterError && (
          <p className="catalogue-error" role="alert">{filterError}</p>
        )}
      </section>

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
                No books found. Try changing your search or filters.
              </p>
            ) : (
              <div className="book-grid">
                {books.map((book) => (
                  <BookCard key={book._id || book.id} book={book} />
                ))}
              </div>
            )}

            {pagination.pages > 1 && (
              <nav
                className="catalogue-pagination"
                aria-label="Catalogue pages"
              >
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => handlePageChange(page - 1)}
                >
                  Previous
                </button>

                <span>
                  Page {pagination.page} of {pagination.pages}
                </span>

                <button
                  type="button"
                  disabled={page >= pagination.pages}
                  onClick={() => handlePageChange(page + 1)}
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