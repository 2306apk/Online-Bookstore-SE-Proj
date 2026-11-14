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
  const [activeTab, setActiveTab] = useState('catalogue');

  // Catalogue State
  const [books, setBooks] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bookForm, setBookForm] = useState(emptyBook);
  const [categoryName, setCategoryName] = useState('');
  const [editingId, setEditingId] = useState('');
  const [restockInputs, setRestockInputs] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Orders State
  const [orders, setOrders] = useState([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderStatusFilter, setOrderStatusFilter] = useState('ALL');
  const [orderSummary, setOrderSummary] = useState({
    totalOrders: 0,
    totalRevenue: 0,
    statusCounts: { PLACED: 0, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 },
  });

  // Reviews State
  const [reviews, setReviews] = useState([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [reviewStatusFilter, setReviewStatusFilter] = useState('ALL');

  // Feedback State
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadCatalogue() {
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

  async function loadOrders(status = orderStatusFilter) {
    setOrdersLoading(true);
    try {
      const query = status && status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : '';
      const [ordersPayload, summaryPayload] = await Promise.all([
        apiFetch(`/admin/orders${query}`),
        apiFetch('/admin/orders/summary'),
      ]);
      setOrders(ordersPayload.orders || []);
      if (summaryPayload.summary) {
        setOrderSummary(summaryPayload.summary);
      }
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Customer orders could not be loaded.'
      );
    } finally {
      setOrdersLoading(false);
    }
  }

  async function loadReviews(status = reviewStatusFilter) {
    setReviewsLoading(true);
    try {
      const query = status && status !== 'ALL' ? `?status=${encodeURIComponent(status)}` : '';
      const reviewsPayload = await apiFetch(`/admin/reviews${query}`);
      setReviews(reviewsPayload.reviews || []);
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Customer reviews could not be loaded.'
      );
    } finally {
      setReviewsLoading(false);
    }
  }

  useEffect(() => {
    loadCatalogue();
  }, []);

  useEffect(() => {
    if (activeTab === 'orders') {
      loadOrders(orderStatusFilter);
    } else if (activeTab === 'reviews') {
      loadReviews(reviewStatusFilter);
    }
  }, [activeTab, orderStatusFilter, reviewStatusFilter]);

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
      await loadCatalogue();
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
      await loadCatalogue();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'The book could not be deactivated.'
      );
    }
  }

  async function handleRestock(bookId) {
    const qty = parseInt(restockInputs[bookId], 10);
    if (!qty || qty <= 0) {
      setError('Please enter a positive whole number for restocking.');
      return;
    }

    setError('');
    setNotice('');
    try {
      const response = await apiFetch(`/admin/books/${bookId}/restock`, {
        method: 'POST',
        body: jsonBody({ quantity: qty }),
      });
      setNotice(`Restocked ${response.book.title}. Current stock: ${response.book.stock}.`);
      setRestockInputs((prev) => ({ ...prev, [bookId]: '' }));
      await loadCatalogue();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Unable to restock book.'
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
      await loadCatalogue();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'The category could not be created.'
      );
    }
  }

  async function handleAdvanceOrderStatus(orderId, targetStatus) {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        body: jsonBody({ status: targetStatus }),
      });
      setNotice(`Order status advanced to ${targetStatus}.`);
      await loadOrders();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Could not update order fulfillment status.'
      );
    }
  }

  async function handleModerateReview(reviewId, status) {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/admin/reviews/${reviewId}/status`, {
        method: 'PATCH',
        body: jsonBody({ status }),
      });
      setNotice(`Review moderation status updated to ${status}.`);
      await loadReviews();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Could not update review status.'
      );
    }
  }

  async function handleDeleteReview(reviewId) {
    setError('');
    setNotice('');
    try {
      await apiFetch(`/admin/reviews/${reviewId}`, {
        method: 'DELETE',
      });
      setNotice('Review permanently deleted.');
      await loadReviews();
    } catch (requestError) {
      setError(
        requestError instanceof ApiError
          ? requestError.message
          : 'Could not delete review.'
      );
    }
  }

  return (
    <section className="admin-page">
      <div className="section-intro admin-intro">
        <div>
          <p className="eyebrow">Administration & Operations</p>
          <h1>Admin Desk</h1>
          <p>
            Manage the bookstore catalogue, inventory restocking, order fulfillment, and customer review moderation.
          </p>
        </div>

        <span className="admin-badge">ADMIN ACCESS</span>
      </div>

      <nav className="admin-tabs" role="tablist" style={{ display: 'flex', gap: '8px', margin: '20px 0', borderBottom: '1px solid var(--border-color, #e2e8f0)', paddingBottom: '8px' }}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'catalogue'}
          className={activeTab === 'catalogue' ? 'button button-primary' : 'button button-outline'}
          onClick={() => setActiveTab('catalogue')}
        >
          Catalogue & Inventory
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'orders'}
          className={activeTab === 'orders' ? 'button button-primary' : 'button button-outline'}
          onClick={() => setActiveTab('orders')}
        >
          Order Fulfillment
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'reviews'}
          className={activeTab === 'reviews' ? 'button button-primary' : 'button button-outline'}
          onClick={() => setActiveTab('reviews')}
        >
          Review Moderation
        </button>
      </nav>

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

      {activeTab === 'catalogue' && (
        <>
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
                <h2>Catalogue inventory & Restocking</h2>
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
                      <th>Restock Inventory</th>
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

                        <td>
                          <strong style={{ color: book.stock < 5 ? '#e53e3e' : 'inherit' }}>
                            {book.stock}
                          </strong>
                        </td>

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
                          <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            <input
                              type="number"
                              min="1"
                              step="1"
                              placeholder="+Qty"
                              aria-label={`Restock quantity for ${book.title}`}
                              value={restockInputs[book.id] || ''}
                              onChange={(e) =>
                                setRestockInputs({
                                  ...restockInputs,
                                  [book.id]: e.target.value,
                                })
                              }
                              style={{ width: '70px', padding: '4px 6px', fontSize: '0.85rem' }}
                            />
                            <button
                              type="button"
                              className="button button-dark"
                              style={{ padding: '4px 8px', fontSize: '0.78rem' }}
                              onClick={() => handleRestock(book.id)}
                            >
                              Restock
                            </button>
                          </div>
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
        </>
      )}

      {activeTab === 'orders' && (
        <section className="panel admin-orders-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Order Management</p>
              <h2>Customer Order Fulfillment</h2>
            </div>
          </div>

          <div className="order-metrics" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px', margin: '16px 0' }}>
            <div className="panel" style={{ padding: '12px', textAlign: 'center' }}>
              <p className="eyebrow">Total Orders</p>
              <h3 style={{ margin: '4px 0', fontSize: '1.4rem' }}>{orderSummary.totalOrders}</h3>
            </div>
            <div className="panel" style={{ padding: '12px', textAlign: 'center' }}>
              <p className="eyebrow">Total Revenue</p>
              <h3 style={{ margin: '4px 0', fontSize: '1.4rem' }}>{formatPrice(orderSummary.totalRevenue)}</h3>
            </div>
            <div className="panel" style={{ padding: '12px', textAlign: 'center' }}>
              <p className="eyebrow">Placed (Pending)</p>
              <h3 style={{ margin: '4px 0', fontSize: '1.4rem', color: '#dd6b20' }}>{orderSummary.statusCounts.PLACED}</h3>
            </div>
            <div className="panel" style={{ padding: '12px', textAlign: 'center' }}>
              <p className="eyebrow">Shipped</p>
              <h3 style={{ margin: '4px 0', fontSize: '1.4rem', color: '#3182ce' }}>{orderSummary.statusCounts.SHIPPED}</h3>
            </div>
            <div className="panel" style={{ padding: '12px', textAlign: 'center' }}>
              <p className="eyebrow">Delivered</p>
              <h3 style={{ margin: '4px 0', fontSize: '1.4rem', color: '#38a169' }}>{orderSummary.statusCounts.DELIVERED}</h3>
            </div>
            <div className="panel" style={{ padding: '12px', textAlign: 'center' }}>
              <p className="eyebrow">Cancelled</p>
              <h3 style={{ margin: '4px 0', fontSize: '1.4rem', color: '#e53e3e' }}>{orderSummary.statusCounts.CANCELLED}</h3>
            </div>
          </div>

          <div className="status-filters" style={{ display: 'flex', gap: '8px', margin: '16px 0', flexWrap: 'wrap' }}>
            {['ALL', 'PLACED', 'SHIPPED', 'DELIVERED', 'CANCELLED'].map((status) => (
              <button
                key={status}
                type="button"
                className={orderStatusFilter === status ? 'button button-dark' : 'button button-outline'}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={() => setOrderStatusFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>

          {ordersLoading ? (
            <div className="page-state">Loading customer orders...</div>
          ) : orders.length === 0 ? (
            <p>No orders found for the selected status.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Order #</th>
                    <th>Customer</th>
                    <th>Date</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Fulfillment Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td><strong>{order.orderNumber}</strong></td>
                      <td>
                        {order.customer?.name || order.address?.fullName}
                        <br />
                        <small className="muted">{order.customer?.email}</small>
                      </td>
                      <td>{new Date(order.createdAt).toLocaleDateString()}</td>
                      <td>{order.itemCount} items</td>
                      <td>{formatPrice(order.total)}</td>
                      <td>
                        <span className={`status-chip ${order.status.toLowerCase()}`}>
                          {order.status}
                        </span>
                      </td>
                      <td>
                        {order.status === 'PLACED' && (
                          <button
                            type="button"
                            className="button button-dark"
                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            onClick={() => handleAdvanceOrderStatus(order.id, 'SHIPPED')}
                          >
                            Mark as Shipped
                          </button>
                        )}
                        {order.status === 'SHIPPED' && (
                          <button
                            type="button"
                            className="button button-primary"
                            style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                            onClick={() => handleAdvanceOrderStatus(order.id, 'DELIVERED')}
                          >
                            Mark as Delivered
                          </button>
                        )}
                        {order.status === 'DELIVERED' && (
                          <span className="muted" style={{ fontSize: '0.85rem' }}>Completed</span>
                        )}
                        {order.status === 'CANCELLED' && (
                          <span className="muted" style={{ fontSize: '0.85rem' }}>Cancelled</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {activeTab === 'reviews' && (
        <section className="panel admin-reviews-panel">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Review Moderation</p>
              <h2>Customer Review & Rating Moderation</h2>
            </div>
          </div>

          <div className="status-filters" style={{ display: 'flex', gap: '8px', margin: '16px 0', flexWrap: 'wrap' }}>
            {['ALL', 'APPROVED', 'FLAGGED', 'REJECTED', 'DELETED'].map((status) => (
              <button
                key={status}
                type="button"
                className={reviewStatusFilter === status ? 'button button-dark' : 'button button-outline'}
                style={{ padding: '4px 10px', fontSize: '0.8rem' }}
                onClick={() => setReviewStatusFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>

          {reviewsLoading ? (
            <div className="page-state">Loading reviews for moderation...</div>
          ) : reviews.length === 0 ? (
            <p>No customer reviews match the selected filter.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Book</th>
                    <th>Customer</th>
                    <th>Rating</th>
                    <th>Comment</th>
                    <th>Verified</th>
                    <th>Status</th>
                    <th>Moderation Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {reviews.map((review) => (
                    <tr key={review.id}>
                      <td>
                        <strong>{review.bookTitle}</strong>
                        <br />
                        <small className="muted">{review.bookAuthor}</small>
                      </td>
                      <td>
                        {review.customerName}
                        <br />
                        <small className="muted">{review.customerEmail}</small>
                      </td>
                      <td>★ {review.rating} / 5</td>
                      <td style={{ maxWidth: '300px', fontSize: '0.9rem' }}>{review.comment}</td>
                      <td>
                        {review.isVerifiedPurchase ? (
                          <span className="status-chip live" style={{ fontSize: '0.72rem', padding: '2px 6px' }}>
                            Verified
                          </span>
                        ) : (
                          <span className="muted" style={{ fontSize: '0.75rem' }}>Unverified</span>
                        )}
                      </td>
                      <td>
                        <span className={`status-chip ${review.status.toLowerCase()}`}>
                          {review.status}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                          {review.status !== 'APPROVED' && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => handleModerateReview(review.id, 'APPROVED')}
                            >
                              Approve
                            </button>
                          )}
                          {review.status !== 'FLAGGED' && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() => handleModerateReview(review.id, 'FLAGGED')}
                            >
                              Flag
                            </button>
                          )}
                          {review.status !== 'REJECTED' && (
                            <button
                              type="button"
                              className="text-button danger-text"
                              onClick={() => handleModerateReview(review.id, 'REJECTED')}
                            >
                              Reject
                            </button>
                          )}
                          <button
                            type="button"
                            className="text-button danger-text"
                            onClick={() => handleDeleteReview(review.id)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </section>
  );
}

function formatPrice(price) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(price || 0);
}
