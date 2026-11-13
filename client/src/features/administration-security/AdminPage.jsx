
import { useEffect, useState } from 'react';
import { ApiError, apiFetch, jsonBody } from '../../api/client.js';

const emptyBook = {
  title: '',
  author: '',
  publisher: '',
  description: '',
  keywords: '',
  price: '',
  stock: 0,
  coverUrl: '',
  category: '',
  active: true,
};

export function AdminPage() {
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bookForm, setBookForm] = useState(emptyBook);
  const [categoryName, setCategoryName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadData() {
    setLoading(true);

    try {
      const [bookPayload, categoryPayload] = await Promise.all([
        apiFetch('/admin/books'),
        apiFetch('/admin/categories'),
      ]);

      setBooks(bookPayload.books);
      setCategories(categoryPayload.categories);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'The admin catalogue could not be loaded.'
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  function updateBookField(event) {
    const { name, value, type, checked } = event.target;

    setBookForm((current) => ({
      ...current,
      [name]: type === 'checkbox' ? checked : value,
    }));
  }

  function editBook(book) {
    setEditingId(book.id);

    setBookForm({
      title: book.title,
      author: book.author,
      publisher: book.publisher || '',
      description: book.description || '',
      keywords: book.keywords.join(', '),
      price: book.price,
      stock: book.stock,
      coverUrl: book.coverUrl || '',
      category: book.category?.id || '',
      active: book.active,
    });

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetBookForm() {
    setEditingId('');

    setBookForm({
      ...emptyBook,
      category: categories[0]?.id || '',
    });
  }

  async function saveBook(event) {
    event.preventDefault();

    setSaving(true);
    setError('');
    setNotice('');

    const payload = {
      title: bookForm.title,
      author: bookForm.author,
      publisher: bookForm.publisher,
      description: bookForm.description,
      keywords: bookForm.keywords
        .split(',')
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      price: Number(bookForm.price),
      stock: Number(bookForm.stock),
      coverUrl: bookForm.coverUrl,
      category: bookForm.category,
      active: bookForm.active,
    };

    try {
      await apiFetch(
        editingId ? `/admin/books/${editingId}` : '/admin/books',
        {
          method: editingId ? 'PATCH' : 'POST',
          body: jsonBody(payload),
        }
      );

      setNotice(editingId ? 'Book updated.' : 'Book created.');

      resetBookForm();
      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'The book could not be saved.'
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(bookId) {
    setError('');

    try {
      await apiFetch(`/admin/books/${bookId}`, {
        method: 'DELETE',
      });

      setNotice('Book deactivated and removed from the public catalogue.');

      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'The book could not be deactivated.'
      );
    }
  }

  async function createCategory(event) {
    event.preventDefault();

    if (!categoryName.trim()) return;

    setError('');

    try {
      await apiFetch('/admin/categories', {
        method: 'POST',
        body: jsonBody({
          name: categoryName.trim(),
        }),
      });

      setCategoryName('');
      setNotice('Category created.');

      await loadData();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'The category could not be created.'
      );
    }
  }

  return (
    <section className="admin-page">
      <div className="section-intro admin-intro">
        <div>
          <p className="eyebrow">Administration / catalogue</p>
          <h1>Admin desk</h1>
          <p>
            Manage the shared catalogue. Every change is validated and
            persisted by the API.
          </p>
        </div>

        <span className="admin-badge">ADMIN ACCESS</span>
      </div>

      {error && (
        <div className="alert error" role="alert">
          {error}
        </div>
      )}

      {notice && (
        <div className="alert success" role="status">
          {notice}
        </div>
      )}

      <div className="admin-grid">
        <form className="panel admin-form" onSubmit={saveBook}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">
                {editingId ? 'Edit record' : 'New record'}
              </p>

              <h2>
                {editingId ? 'Update a book' : 'Add a book'}
              </h2>
            </div>

            {editingId && (
              <button
                type="button"
                className="text-button"
                onClick={resetBookForm}
              >
                Cancel edit
              </button>
            )}
          </div>

          <div className="form-grid">
            <label>
              Title
              <input
                name="title"
                value={bookForm.title}
                onChange={updateBookField}
                required
              />
            </label>

            <label>
              Author
              <input
                name="author"
                value={bookForm.author}
                onChange={updateBookField}
                required
              />
            </label>

            <label>
              Publisher
              <input
                name="publisher"
                value={bookForm.publisher}
                onChange={updateBookField}
              />
            </label>

            <label>
              Price (INR)
              <input
                name="price"
                type="number"
                min="0.01"
                step="0.01"
                value={bookForm.price}
                onChange={updateBookField}
                required
              />
            </label>

            <label>
              Stock
              <input
                name="stock"
                type="number"
                min="0"
                step="1"
                value={bookForm.stock}
                onChange={updateBookField}
                required
              />
            </label>

            <label>
              Category
              <select
                name="category"
                value={bookForm.category}
                onChange={updateBookField}
                required
              >
                <option value="">Choose a category</option>

                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Cover URL
              <input
                name="coverUrl"
                type="url"
                value={bookForm.coverUrl}
                onChange={updateBookField}
                placeholder="https://..."
              />
            </label>
          </div>

          <label>
            Description
            <textarea
              name="description"
              value={bookForm.description}
              onChange={updateBookField}
              rows="3"
            />
          </label>

          <label>
            Keywords <span className="muted">comma separated</span>
            <input
              name="keywords"
              value={bookForm.keywords}
              onChange={updateBookField}
            />
          </label>

          <label className="checkbox-label">
            <input
              name="active"
              type="checkbox"
              checked={bookForm.active}
              onChange={updateBookField}
            />
            Visible in public catalogue
          </label>

          <button
            className="button button-primary"
            type="submit"
            disabled={saving}
          >
            {saving
              ? 'Saving...'
              : editingId
                ? 'Save changes'
                : 'Create book'}
          </button>
        </form>

        <form className="panel category-form" onSubmit={createCategory}>
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Taxonomy</p>
              <h2>Categories</h2>
            </div>

            <span className="count-pill">{categories.length}</span>
          </div>

          <p className="muted">
            Categories connect admin records to the public catalogue.
          </p>

          <div className="inline-form">
            <input
              aria-label="New category name"
              value={categoryName}
              onChange={(event) => setCategoryName(event.target.value)}
              placeholder="e.g. History"
            />

            <button className="button button-dark" type="submit">
              Add
            </button>
          </div>

          <ul className="category-list">
            {categories.map((category) => (
              <li key={category.id}>
                <span>{category.name}</span>

                <span
                  className={
                    category.active ? 'dot active-dot' : 'dot'
                  }
                />
              </li>
            ))}
          </ul>
        </form>
      </div>

      <section className="panel catalogue-table-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">All records</p>
            <h2>Catalogue inventory</h2>
          </div>
        </div>

        {loading ? (
          <div className="page-state">Loading records...</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Book</th>
                  <th>Category</th>
                  <th>Price</th>
                  <th>Stock</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {books.map((book) => (
                  <tr key={book.id}>
                    <td>
                      <strong>{book.title}</strong>
                      <small>{book.author}</small>
                    </td>

                    <td>{book.category?.name || '-'}</td>

                    <td>{formatPrice(book.price)}</td>

                    <td>{book.stock}</td>

                    <td>
                      <span
                        className={
                          book.active
                            ? 'status-chip live'
                            : 'status-chip'
                        }
                      >
                        {book.active ? 'Live' : 'Hidden'}
                      </span>
                    </td>

                    <td>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => editBook(book)}
                      >
                        Edit
                      </button>

                      {book.active && (
                        <button
                          className="text-button danger-text"
                          type="button"
                          onClick={() => deactivate(book.id)}
                        >
                          Hide
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </section>
  );
}

function formatPrice(price) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(price);
}
