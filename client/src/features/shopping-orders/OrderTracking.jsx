import { formatDateTime } from './checkout-utils.js';

// Placed -> Shipped -> Delivered (or Placed -> Cancelled).
export function OrderTracking({ tracking }) {
  return (
    <ol className="order-tracking" aria-label="Order progress">
      {tracking.map((step) => (
        <li key={step.status} className={`${step.reached ? 'is-reached' : ''} ${step.status === 'CANCELLED' ? 'is-cancelled' : ''}`.trim()}>
          <span className="tracking-dot" aria-hidden="true" />
          <span className="tracking-label">{step.label}</span>
          {step.reached && step.at && <time className="tracking-time" dateTime={step.at}>{formatDateTime(step.at)}</time>}
        </li>
      ))}
    </ol>
  );
}
