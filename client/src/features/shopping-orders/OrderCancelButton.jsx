import { useState } from 'react';
import { ApiError, apiFetch } from '../../api/client.js';

// Two clicks on purpose: "Cancel order", then "Yes, cancel it", so a stray click cannot cancel an order.
export function OrderCancelButton({ order, onCancelled }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!order.canCancel) return null;

  async function cancel() {
    setBusy(true);
    setError('');
    try {
      const { order: updated } = await apiFetch(`/orders/${order.id}/cancel`, { method: 'POST', body: JSON.stringify({}) });
      setConfirming(false);
      onCancelled(updated);
    } catch (requestError) {
      setError(requestError instanceof ApiError ? requestError.message : 'Could not cancel the order. Please try again.');
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="order-cancel">
      {error && <p className="field-error" role="alert">{error}</p>}
      {confirming ? (
        <>
          <span>Cancel order {order.orderNumber}?</span>
          <button className="button button-dark" type="button" onClick={cancel} disabled={busy}>{busy ? 'Cancelling...' : 'Yes, cancel it'}</button>
          <button className="button button-quiet" type="button" onClick={() => setConfirming(false)} disabled={busy}>Keep order</button>
        </>
      ) : (
        <button className="button button-quiet" type="button" onClick={() => setConfirming(true)}>Cancel order</button>
      )}
    </div>
  );
}
