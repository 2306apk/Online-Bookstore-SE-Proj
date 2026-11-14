import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, apiFetch } from '../../api/client.js';
import { OrderCancelButton } from './OrderCancelButton.jsx';
import { OrderTracking } from './OrderTracking.jsx';
import { formatMoney } from './checkout-utils.js';
import './checkout.css';
import './orders.css';

export function OrderConfirmationPage() {
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    apiFetch(`/orders/${orderId}`)
      .then((payload) => active && setOrder(payload.order))
      .catch((requestError) => active && setError(requestError instanceof ApiError ? requestError.message : 'Could not load this order.'));
    return () => { active = false; };
  }, [orderId]);

  if (error) {
    return (
      <section className="checkout-page">
        <div className="alert error" role="alert">{error}</div>
        <Link className="remove-button" to="/">Back to the catalogue</Link>
      </section>
    );
  }
  if (!order) return <div className="page-state">Loading your order...</div>;

  return (
    <section className="checkout-page order-confirmation">
      <div className="section-intro">
        <p className="eyebrow">{order.status === 'CANCELLED' ? 'Order cancelled' : 'Order details'}</p>
        <h1>{order.status === 'CANCELLED' ? 'This order was cancelled' : 'Thank you for your order'}</h1>
        <p>Order number <strong>{order.orderNumber}</strong>. This was a payment simulation, so no money was charged.</p>
      </div>
      <div className="checkout-layout">
        <div>
          <ul className="checkout-items">
            {order.items.map((item) => (
              <li key={item.itemId}>
                <span>{item.title} x {item.quantity}</span>
                <span>{formatMoney(item.lineTotal, order.currency)}</span>
              </li>
            ))}
          </ul>
          <address className="checkout-address">
            {order.address.fullName}<br />{order.address.line1}<br />
            {order.address.line2 && <>{order.address.line2}<br /></>}
            {order.address.city}, {order.address.state} {order.address.postalCode}<br />{order.address.country}
          </address>
        </div>
        <aside className="checkout-summary">
          <div className="summary-line"><span>Status</span><strong>{order.status}</strong></div>
          <div className="summary-line"><span>Subtotal</span><span>{formatMoney(order.subtotal, order.currency)}</span></div>
          <div className="summary-line"><span>Shipping</span><span>{formatMoney(order.shipping.amount, order.currency)}</span></div>
          <div className="summary-line"><span>Tax</span><span>{formatMoney(order.tax.amount, order.currency)}</span></div>
          <div className="summary-line total-line"><span>Total</span><strong>{formatMoney(order.total, order.currency)}</strong></div>
          <div className="summary-line"><span>Payment</span><span>{order.payment.status} ({order.payment.reference})</span></div>
          {order.tracking && <OrderTracking tracking={order.tracking} />}
          <OrderCancelButton order={order} onCancelled={setOrder} />
          <Link className="remove-button" to="/orders">All my orders</Link>
          <Link className="remove-button" to="/">Continue shopping</Link>
        </aside>
      </div>
    </section>
  );
}
