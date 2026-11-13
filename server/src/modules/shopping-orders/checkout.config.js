/**
 * Checkout pricing configuration (OBS-25).
 *
 * BUSINESS DECISIONS PENDING: the SRS (OBS-F-011) does not define a tax rate, shipping options,
 * shipping prices or delivery estimates. The values below are NEUTRAL PLACEHOLDERS (no tax, one
 * standard option at no charge), not business rules. Change them here (or set
 * CHECKOUT_TAX_RATE_PERCENT) once the team confirms the real values. Nothing else in the code
 * hard-codes a rate or a fee.
 */
export const CHECKOUT_PRICING_FINALIZED = false;

function readTaxRatePercent(rawValue) {
  if (rawValue === undefined || rawValue === '') return 0;
  const rate = Number(rawValue);
  if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
    throw new Error('CHECKOUT_TAX_RATE_PERCENT must be a number between 0 and 100.');
  }
  return rate;
}

export const checkoutPricing = Object.freeze({
  currency: 'INR',
  // Percentage applied to the taxable amount, e.g. 5 means 5%.
  taxRatePercent: readTaxRatePercent(process.env.CHECKOUT_TAX_RATE_PERCENT),
  // Whether the shipping fee is part of the taxable amount (undecided; default: books only).
  taxAppliesToShipping: false,
  shippingOptions: Object.freeze([
    Object.freeze({ id: 'STANDARD', label: 'Standard delivery', fee: 0 }),
  ]),
});
