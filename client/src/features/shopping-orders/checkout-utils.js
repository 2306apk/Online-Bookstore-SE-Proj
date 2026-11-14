// Quick, friendly checks so customers see problems before a request is sent.
// The server repeats every check and stays the source of truth.
export const EMPTY_ADDRESS = Object.freeze({
  fullName: '', phone: '', line1: '', line2: '', city: '', state: '', postalCode: '', country: '',
});

export const ADDRESS_FIELDS = Object.freeze([
  { name: 'fullName', label: 'Full name', autoComplete: 'name' },
  { name: 'phone', label: 'Phone number', autoComplete: 'tel', type: 'tel' },
  { name: 'line1', label: 'Address line 1', autoComplete: 'address-line1' },
  { name: 'line2', label: 'Address line 2 (optional)', autoComplete: 'address-line2' },
  { name: 'city', label: 'City', autoComplete: 'address-level2' },
  { name: 'state', label: 'State / region', autoComplete: 'address-level1' },
  { name: 'postalCode', label: 'Postal code', autoComplete: 'postal-code' },
  { name: 'country', label: 'Country', autoComplete: 'country-name' },
]);

export function validateAddress(values) {
  const errors = {};
  const text = (key) => String(values[key] ?? '').trim();
  const length = (key, min, max, message) => {
    const size = text(key).length;
    if (size < min || size > max) errors[key] = message;
  };

  length('fullName', 2, 100, 'Enter the recipient\'s full name.');
  const digits = text('phone').replace(/[\s().-]/g, '').replace(/^\+/, '');
  if (!/^\d{7,15}$/.test(digits)) errors.phone = 'Enter a valid phone number (7 to 15 digits).';
  length('line1', 3, 150, 'Enter the street address.');
  if (text('line2').length > 150) errors.line2 = 'Address line 2 is too long.';
  length('city', 2, 80, 'Enter the city.');
  length('state', 2, 80, 'Enter the state or region.');
  if (!/^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/.test(text('postalCode'))) errors.postalCode = 'Enter a valid postal code.';
  length('country', 2, 56, 'Enter the country.');
  return errors;
}

export function formatMoney(amount, currency = 'INR') {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency }).format(amount);
}

// Messages for 409 CHECKOUT_CART_INVALID issues returned by the server.
export function describeCartIssue(issue) {
  if (issue.code === 'INSUFFICIENT_STOCK') {
    return `"${issue.title}": you have ${issue.requested} in your cart but only ${issue.available} left.`;
  }
  return `"${issue.title || 'A book'}" is no longer available.`;
}

export const PAYMENT_SCENARIOS = Object.freeze([
  { value: 'SUCCESS', label: 'Payment succeeds' },
  { value: 'DECLINED', label: 'Payment is declined' },
  { value: 'ERROR', label: 'Payment service error' },
]);

// One reference per checkout attempt; the server uses it to ignore accidental repeats.
export function newCheckoutKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}-${Math.random().toString(36).slice(2, 12)}`;
}
