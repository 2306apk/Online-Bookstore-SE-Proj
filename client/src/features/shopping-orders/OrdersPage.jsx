import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, apiFetch } from '../../api/client.js';
import { OrderCancelButton } from './OrderCancelButton.jsx';
import { OrderTracking } from './OrderTracking.jsx';
import { formatDateTime, formatMoney } from './checkout-utils.js';
import './orders.css';

const PAGE_SIZE = 10;

export function OrdersPage() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async (targetPage) => {
    setError('');
    try {
      setData(await apiFetch(`/orders/my-orders?page=${targetPage}&limit=${PAGE_SIZE}`));
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not load your orders.');
    }
  }, []);

  useEffect(() => { load(page); }, [load, page]);

  function replaceOrder(updated) {
    setData((current) => ({ ...current, orders: current.orders.map((order) => (order.id === updated.id ? updated : order)) }));
  }

  if (error) return <section className="orders-page"><div className="alert error" role="alert">{error}</div></section>;
  if (!data) return <div className="page-state">Loading your orders...</div>;

  return (
    <section className="orders-page">
      <div className="section-intro">
        <p className="eyebrow">Your orders</p>
        <h1>Order history</h1>
        <p>Follow each order from placed to delivered. Orders that have not shipped can be cancelled.</p>
      </div>
      {data.orders.length === 0 ? (
        <div className="empty-state cart-empty">
          <h3>No orders yet.</h3>
          <p>When you place an order it will appear here.</p>
          <Link className="button button-dark" to="/">Browse the catalogue</Link>
        </div>
      ) : (
        <>
          <div className="orders-list">
            {data.orders.map((order) => (
              <article className="order-card" key={order.id}>
                <header className="order-card-head">
                  <div>
                    <h2>{order.orderNumber}</h2>
                    <time dateTime={order.createdAt}>{formatDateTime(order.createdAt)}</time>
                  </div>
                  <span className={`order-status status-${order.status.toLowerCase()}`}>{order.status}</span>
                </header>
                <ul className="order-items">
                  {order.items.map((item) => (
                    <li key={item.itemId}>
                      <span>{item.title} x {item.quantity}</span>
                      <span>{formatMoney(item.lineTotal, order.currency)}</span>
                    </li>
                  ))}
                </ul>
                <OrderTracking tracking={order.tracking} />
                <footer className="order-card-foot">
                  <strong>Total {formatMoney(order.total, order.currency)}</strong>
                  <Link to={`/orders/${order.id}`}>View details</Link>
                  <OrderCancelButton order={order} onCancelled={replaceOrder} />
                </footer>
              </article>
            ))}
          </div>
          {data.pagination.totalPages > 1 && (
            <nav className="orders-pager" aria-label="Order pages">
              <button className="button button-quiet" type="button" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span>Page {data.pagination.page} of {data.pagination.totalPages}</span>
              <button className="button button-quiet" type="button" disabled={page >= data.pagination.totalPages} onClick={() => setPage(page + 1)}>Next</button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
