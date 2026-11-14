import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiFetch, jsonBody } from '../../api/client.js';
import { useCart } from '../../app/CartContext.jsx';
import { ADDRESS_FIELDS, EMPTY_ADDRESS, PAYMENT_SCENARIOS, describeCartIssue, formatMoney, newCheckoutKey, validateAddress } from './checkout-utils.js';
import './checkout.css';

export function CheckoutPage() {
  const { cart, loading, refreshCart } = useCart();
  const navigate = useNavigate();
  const checkoutKey = useRef(newCheckoutKey());
  const [paymentScenario, setPaymentScenario] = useState('SUCCESS');
  const [paying, setPaying] = useState(false);
  const [options, setOptions] = useState(null);
  const [address, setAddress] = useState({ ...EMPTY_ADDRESS });
  const [shippingOption, setShippingOption] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [issues, setIssues] = useState([]);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    apiFetch('/checkout/options')
      .then(({ options: loaded }) => {
        if (!active) return;
        setOptions(loaded);
        setShippingOption((current) => current || loaded.shippingOptions[0]?.id || '');
      })
      .catch(() => active && setError('Could not load delivery options. Please try again.'));
    return () => { active = false; };
  }, []);

  function change(name, value) {
    setAddress((current) => ({ ...current, [name]: value }));
    setSummary(null); // an old preview no longer matches what was typed
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    setIssues([]);
    const errors = validateAddress(address);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const { summary: loaded } = await apiFetch('/checkout/summary', {
        method: 'POST',
        body: jsonBody({ ...address, shippingOption }),
      });
      setSummary(loaded);
    } catch (requestError) {
      setSummary(null);
      if (!(requestError instanceof ApiError)) {
        setError('Could not prepare your order summary.');
      } else if (requestError.code === 'VALIDATION_ERROR' && requestError.details) {
        setFieldErrors(Object.fromEntries(Object.entries(requestError.details).map(([key, value]) => [key, [].concat(value)[0]])));
      } else if (requestError.code === 'CHECKOUT_CART_INVALID') {
        setIssues(requestError.details?.issues ?? []);
        setError(requestError.message);
        refreshCart?.();
      } else {
        setError(requestError.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function pay() {
    if (!summary || paying) return;
    setPaying(true);
    setError('');
    setIssues([]);
    try {
      // The same key is reused if the request is repeated (for example after a network drop),
      // so the server can never create two orders for one click.
      const { order } = await apiFetch('/orders', {
        method: 'POST',
        body: jsonBody({ ...address, shippingOption, idempotencyKey: checkoutKey.current, paymentScenario }),
      });
      await refreshCart?.();
      navigate(`/orders/${order.id}`, { replace: true });
    } catch (requestError) {
      if (requestError instanceof ApiError && requestError.status && requestError.status < 500 && requestError.code !== 'ORDER_IN_PROGRESS') {
        checkoutKey.current = newCheckoutKey(); // a definite answer: the next attempt is a new checkout
      }
      if (requestError instanceof ApiError && requestError.code === 'CHECKOUT_CART_INVALID') {
        setIssues(requestError.details?.issues ?? []);
        refreshCart?.();
      }
      setError(requestError instanceof ApiError ? requestError.message : 'Could not place your order. Please try again.');
    } finally {
      setPaying(false);
    }
  }

  if (loading) return <div className="page-state">Loading your cart...</div>;

  if (cart.items.length === 0) {
    return (
      <section className="checkout-page">
        <div className="empty-state cart-empty">
          <h3>Your cart is empty.</h3>
          <p>Add books to your cart before checking out.</p>
          <Link className="button-link" to="/">Browse the catalogue</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="checkout-page">
      <div className="section-intro">
        <p className="eyebrow">Checkout</p>
        <h1>Delivery details</h1>
        <p>Review your order before payment. Nothing is charged or reserved at this step.</p>
      </div>
      {error && <div className="alert error" role="alert">{error}</div>}
      {issues.length > 0 && (
        <ul className="checkout-issues" aria-label="Cart problems">
          {issues.map((issue) => <li key={`${issue.bookId}-${issue.code}`}>{describeCartIssue(issue)}</li>)}
        </ul>
      )}
      <div className="checkout-layout">
        <form className="checkout-form" onSubmit={submit} noValidate>
          {ADDRESS_FIELDS.map((field) => (
            <label key={field.name} className="checkout-field">
              <span>{field.label}</span>
              <input
                name={field.name}
                type={field.type || 'text'}
                autoComplete={field.autoComplete}
                value={address[field.name]}
                onChange={(event) => change(field.name, event.target.value)}
                aria-invalid={fieldErrors[field.name] ? 'true' : undefined}
              />
              {fieldErrors[field.name] && <small className="field-error" role="alert">{fieldErrors[field.name]}</small>}
            </label>
          ))}
          <fieldset className="checkout-shipping">
            <legend>Shipping</legend>
            {(options?.shippingOptions ?? []).map((option) => (
              <label key={option.id}>
                <input type="radio" name="shippingOption" value={option.id} checked={shippingOption === option.id} onChange={() => { setShippingOption(option.id); setSummary(null); }} />
                {option.label} - {formatMoney(option.amount, options.currency)}
              </label>
            ))}
          </fieldset>
          <button className="primary-button" type="submit" disabled={submitting || !options}>
            {submitting ? 'Preparing...' : 'Review order'}
          </button>
        </form>

        <aside className="checkout-summary" aria-live="polite">
          <p className="eyebrow">Order summary</p>
          {summary ? (
            <>
              <ul className="checkout-items">
                {summary.items.map((item) => (
                  <li key={item.itemId}>
                    <span>{item.title} x {item.quantity}</span>
                    <span>{formatMoney(item.lineTotal, summary.currency)}</span>
                  </li>
                ))}
              </ul>
              <div className="summary-line"><span>Subtotal</span><span>{formatMoney(summary.subtotal, summary.currency)}</span></div>
              <div className="summary-line"><span>Shipping ({summary.shipping.label})</span><span>{formatMoney(summary.shipping.amount, summary.currency)}</span></div>
              <div className="summary-line"><span>Tax ({summary.tax.ratePercent}%)</span><span>{formatMoney(summary.tax.amount, summary.currency)}</span></div>
              <div className="summary-line total-line"><span>Total</span><strong>{formatMoney(summary.total, summary.currency)}</strong></div>
              <address className="checkout-address">
                {summary.address.fullName}<br />{summary.address.line1}<br />
                {summary.address.line2 && <>{summary.address.line2}<br /></>}
                {summary.address.city}, {summary.address.state} {summary.address.postalCode}<br />{summary.address.country}
              </address>
              <label className="checkout-field">
                <span>Payment (simulation, no real money or card details)</span>
                <select value={paymentScenario} onChange={(event) => setPaymentScenario(event.target.value)} disabled={paying}>
                  {PAYMENT_SCENARIOS.map((scenario) => <option key={scenario.value} value={scenario.value}>{scenario.label}</option>)}
                </select>
              </label>
              <button className="primary-button" type="button" onClick={pay} disabled={paying}>
                {paying ? 'Processing payment...' : `Pay ${formatMoney(summary.total, summary.currency)} (simulated)`}
              </button>
            </>
          ) : (
            <p className="summary-note">Fill in your delivery details and choose "Review order" to see your total.</p>
          )}
          <Link className="remove-button" to="/cart">Back to cart</Link>
        </aside>
      </div>
    </section>
  );
}
