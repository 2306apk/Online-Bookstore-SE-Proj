import { AppError } from '../../middleware/errors.js';
import { Cart } from './models/Cart.js';
import { checkoutPricing } from './checkout.config.js';

// Money is calculated in minor units (paise) so rounding is exact, then returned in major units.
const toMinor = (amount) => Math.round(Number(amount) * 100);
const fromMinor = (minor) => minor / 100;

export function getCheckoutOptions(pricing = checkoutPricing) {
  return {
    currency: pricing.currency,
    taxRatePercent: pricing.taxRatePercent,
    shippingOptions: pricing.shippingOptions.map((option) => ({
      id: option.id,
      label: option.label,
      amount: option.fee,
    })),
  };
}

/**
 * Builds a server-calculated checkout PREVIEW from the customer's cart.
 *
 * It is read-only: it never creates an order, never reserves or decrements stock and never
 * modifies the cart. Prices, stock and totals always come from the database, never from the
 * request. Order creation and the final stock validation belong to OBS-26.
 */
export async function buildCheckoutSummary(userId, { address, shippingOption }, pricing = checkoutPricing) {
  const option = pricing.shippingOptions.find((candidate) => candidate.id === shippingOption);
  if (!option) {
    throw new AppError(400, 'Please choose a valid shipping option.', 'INVALID_SHIPPING_OPTION');
  }

  const cart = await Cart.findOne({ user: userId }).populate({ path: 'items.book', populate: { path: 'category' } });
  if (!cart || cart.items.length === 0) {
    throw new AppError(409, 'Your cart is empty. Add books before checking out.', 'CART_EMPTY');
  }

  const issues = [];
  const items = [];
  for (const item of cart.items) {
    const book = item.book;
    if (!book || !book.active) {
      issues.push({
        itemId: String(item._id),
        bookId: book ? String(book._id) : null,
        title: book?.title ?? null,
        code: 'BOOK_NOT_AVAILABLE',
        message: 'This book is no longer available.',
      });
      continue;
    }
    if (book.stock < item.quantity) {
      issues.push({
        itemId: String(item._id),
        bookId: String(book._id),
        title: book.title,
        code: 'INSUFFICIENT_STOCK',
        requested: item.quantity,
        available: book.stock,
        message: `Only ${book.stock} cop${book.stock === 1 ? 'y is' : 'ies are'} currently available.`,
      });
      continue;
    }
    const unitMinor = toMinor(book.price);
    items.push({
      itemId: String(item._id),
      bookId: String(book._id),
      title: book.title,
      author: book.author,
      coverImage: book.coverImage || '',
      unitPrice: fromMinor(unitMinor),
      quantity: item.quantity,
      lineTotal: fromMinor(unitMinor * item.quantity),
    });
  }

  if (issues.length > 0) {
    throw new AppError(
      409,
      'Some items in your cart are no longer available in the requested quantity.',
      'CHECKOUT_CART_INVALID',
      { issues },
    );
  }

  const subtotalMinor = items.reduce((sum, item) => sum + toMinor(item.unitPrice) * item.quantity, 0);
  const shippingMinor = toMinor(option.fee);
  const taxableMinor = subtotalMinor + (pricing.taxAppliesToShipping ? shippingMinor : 0);
  const taxMinor = Math.round((taxableMinor * pricing.taxRatePercent) / 100);

  return {
    isPreview: true,
    currency: pricing.currency,
    items,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    subtotal: fromMinor(subtotalMinor),
    shipping: { id: option.id, label: option.label, amount: fromMinor(shippingMinor) },
    tax: { ratePercent: pricing.taxRatePercent, amount: fromMinor(taxMinor) },
    total: fromMinor(subtotalMinor + shippingMinor + taxMinor),
    address: { ...address, line2: address.line2 ?? '' },
  };
}
