import { randomBytes } from 'node:crypto';
import { AppError } from '../../middleware/errors.js';
import { Book } from '../book-catalogue/models/Book.js';
import { Cart } from './models/Cart.js';
import { Order } from './models/Order.js';
import { PaymentAttempt } from './models/PaymentAttempt.js';
import { buildCheckoutSummary } from './checkout.service.js';
import { assertStrictObjectId } from './object-id.js';
import { PaymentFailure, simulatePayment } from './payment.gateway.js';

const orderNumber = () => `OBS-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;

export function serializeOrder(order) {
  return {
    id: String(order._id),
    orderNumber: order.orderNumber,
    status: order.status,
    currency: order.currency,
    items: order.items.map((item) => ({
      itemId: String(item._id), bookId: String(item.book), title: item.title, author: item.author,
      coverImage: item.coverImage, unitPrice: item.unitPrice, quantity: item.quantity, lineTotal: item.lineTotal,
    })),
    itemCount: order.itemCount,
    subtotal: order.subtotal,
    shipping: order.shipping,
    tax: order.tax,
    total: order.total,
    address: order.address,
    payment: { method: order.payment.method, status: order.payment.status, reference: order.payment.reference },
    createdAt: order.createdAt,
  };
}

// Atomic per-book decrement: it only succeeds while enough stock remains, so stock can never go negative
// even when many customers buy the last copies at once. Already-reserved lines are put back if a later line fails.
async function reserveStock(lines) {
  const reserved = [];
  for (const line of lines) {
    const result = await Book.updateOne(
      { _id: line.book, active: true, stock: { $gte: line.quantity } },
      { $inc: { stock: -line.quantity } },
    );
    if (result.matchedCount !== 1) {
      await releaseStock(reserved);
      return { ok: false, failed: line };
    }
    reserved.push(line);
  }
  return { ok: true, reserved };
}

async function releaseStock(lines) {
  for (const line of lines) {
    await Book.updateOne({ _id: line.book }, { $inc: { stock: line.quantity } });
  }
}

// Removes only the ordered rows, so a book added to the cart during checkout is not lost.
// Compare-and-swap on __v (as in ensureCartItem) keeps this safe against simultaneous cart edits.
async function removeOrderedItems(userId, orderedItemIds) {
  for (let tries = 0; tries < 5; tries += 1) {
    const cart = await Cart.findOne({ user: userId }).lean();
    if (!cart) return;
    const remaining = cart.items.filter((item) => !orderedItemIds.has(String(item._id)));
    if (remaining.length === cart.items.length) return;
    const result = await Cart.updateOne({ _id: cart._id, __v: cart.__v }, { $set: { items: remaining }, $inc: { __v: 1 } });
    if (result.matchedCount === 1) return;
  }
}

async function replayFor(attempt) {
  if (attempt.status === 'SUCCEEDED' && attempt.order) {
    const order = await Order.findById(attempt.order);
    if (order) return { order: serializeOrder(order), replayed: true };
  }
  if (attempt.status === 'FAILED') {
    throw new AppError(attempt.failureCode === 'INSUFFICIENT_STOCK' ? 409 : 402, attempt.failureMessage, attempt.failureCode);
  }
  throw new AppError(409, 'This checkout is already being processed. Please wait a moment.', 'ORDER_IN_PROGRESS');
}

async function failAttempt(attempt, code, message) {
  await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { status: 'FAILED', failureCode: code, failureMessage: message, reserved: [] } });
}

/**
 * Places an order. Nothing is charged or reserved until the cart has been re-validated, and an
 * order exists only after a successful (simulated) payment.
 *
 * Without database transactions the safe order of work is: validate -> atomically reserve stock ->
 * charge -> create order -> clear cart. Every failure after the reservation puts the stock back.
 * The attempt record keeps interrupted or failed payments auditable and makes retries idempotent:
 * the same idempotencyKey never creates a second order or takes stock twice.
 */
export async function createOrder(userId, input, { payment = simulatePayment } = {}) {
  const { idempotencyKey, paymentScenario, address, shippingOption } = input;

  const existing = await PaymentAttempt.findOne({ user: userId, idempotencyKey });
  if (existing) return replayFor(existing);

  const summary = await buildCheckoutSummary(userId, { address, shippingOption });

  let attempt;
  try {
    attempt = await PaymentAttempt.create({ user: userId, idempotencyKey, amount: summary.total, currency: summary.currency });
  } catch (error) {
    if (error?.code === 11000) return replayFor(await PaymentAttempt.findOne({ user: userId, idempotencyKey }));
    throw error;
  }

  const lines = summary.items.map((item) => ({ book: item.bookId, quantity: item.quantity }));
  const reservation = await reserveStock(lines);
  if (!reservation.ok) {
    const message = 'One of the books in your cart just sold out or has less stock than you requested.';
    await failAttempt(attempt, 'INSUFFICIENT_STOCK', message);
    throw new AppError(409, message, 'INSUFFICIENT_STOCK');
  }
  await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { status: 'RESERVED', reserved: lines } });

  let charge;
  try {
    charge = await payment({ amount: summary.total, currency: summary.currency, scenario: paymentScenario });
  } catch (error) {
    await releaseStock(lines);
    const failure = error instanceof PaymentFailure ? error : new PaymentFailure('PAYMENT_GATEWAY_ERROR', 'The payment could not be completed.');
    await failAttempt(attempt, failure.code, failure.message);
    throw new AppError(402, failure.message, failure.code);
  }

  let order;
  try {
    order = await Order.create({
      orderNumber: orderNumber(),
      user: userId,
      currency: summary.currency,
      items: summary.items.map((item) => ({
        book: item.bookId, title: item.title, author: item.author, coverImage: item.coverImage,
        unitPrice: item.unitPrice, quantity: item.quantity, lineTotal: item.lineTotal,
      })),
      itemCount: summary.itemCount,
      subtotal: summary.subtotal,
      shipping: summary.shipping,
      tax: summary.tax,
      total: summary.total,
      address: summary.address,
      payment: { method: 'SANDBOX', status: 'SUCCEEDED', reference: charge.reference },
    });
  } catch (error) {
    await releaseStock(lines);
    await failAttempt(attempt, 'ORDER_CREATION_FAILED', 'The order could not be saved. Your payment was not kept.');
    throw error;
  }

  await PaymentAttempt.updateOne(
    { _id: attempt._id },
    { $set: { status: 'SUCCEEDED', reference: charge.reference, order: order._id, reserved: [] } },
  );
  await removeOrderedItems(userId, new Set(summary.items.map((item) => item.itemId)));

  return { order: serializeOrder(order), replayed: false };
}

export async function getOwnOrder(userId, orderId) {
  assertStrictObjectId(orderId, 'The order identifier is invalid.', 'INVALID_ORDER_ID');
  // Another customer's order is reported as "not found" so its existence is not revealed.
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new AppError(404, 'The order was not found.', 'ORDER_NOT_FOUND');
  return serializeOrder(order);
}
