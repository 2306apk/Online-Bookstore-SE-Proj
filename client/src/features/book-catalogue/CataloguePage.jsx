import { useEffect, useState } from 'react';
import { ApiError, apiFetch } from '../../api/client.js';
import { BookCard } from './BookCard.jsx';

export function CataloguePage() {
  const [searchInput, setSearchInput] = useState('');
  const [query, setQuery] = useState('');
  const [books, setBooks] = useState([]);
  const [pagination, setPagination] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    const search = query ? `?q=${encodeURIComponent(query)}` : '';
    apiFetch(`/books${search}`)
      .then((payload) => {
        if (!mounted) return;
        setBooks(payload.books);
        setPagination(payload.pagination);
        setError('');
      })
      .catch((requestError) => {
        if (!mounted) return;
        setError(requestError instanceof ApiError ? requestError.message : 'The catalogue is unavailable right now.');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [query]);

  function submitSearch(event) {
    event.preventDefault();
    setQuery(searchInput.trim());
  }

  function clearSearch() {
    setSearchInput('');
    setQuery('');
  }

  return (
    <>
      <section className="catalogue-hero">
        <div className="hero-copy">
          <p className="eyebrow">The Northstar shelf</p>
          <h1>Books for your <span>next chapter.</span></h1>
          <p className="hero-description">A small, well-loved catalogue for curious minds. Search by title, author or idea.</p>
        </div>
        <div className="hero-note">
          <span className="note-number">01</span>
          <p>Browse as a guest.<br />Sign in when you find your keepers.</p>
        </div>
      </section>
      <section className="catalogue-toolbar" aria-label="Catalogue search">
        <form className="search-form" onSubmit={submitSearch}>
          <label className="sr-only" htmlFor="catalogue-search">Search the catalogue</label>
          <span className="search-icon" aria-hidden="true">/</span>
          <input id="catalogue-search" value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Search title, author or keyword" />
          <button className="button button-dark" type="submit">Search</button>
        </form>
        {query && <button type="button" className="clear-search" onClick={clearSearch}>Clear “{query}”</button>}
      </section>
      <section className="catalogue-heading">
        <div>
          <p className="eyebrow">{query ? 'Search results' : 'Currently reading'}</p>
          <h2>{query ? `Matches for “${query}”` : 'A considered selection'}</h2>
        </div>
        {pagination && <span className="result-count">{pagination.total} {pagination.total === 1 ? 'title' : 'titles'}</span>}
      </section>
      {loading && <div className="page-state">Opening the catalogue...</div>}
      {!loading && error && <div className="alert error">{error}</div>}
      {!loading && !error && books.length === 0 && (
        <div className="empty-state">
          <span className="empty-mark">?</span>
          <h3>No books found</h3>
          <p>Try a different title, author or keyword.</p>
          {query && <button className="button button-dark" type="button" onClick={clearSearch}>Show all books</button>}
        </div>
      )}
      {!loading && !error && books.length > 0 && (
        <div className="book-grid">{books.map((book) => <BookCard key={book.id} book={book} />)}</div>
      )}
    </>
  );
}
