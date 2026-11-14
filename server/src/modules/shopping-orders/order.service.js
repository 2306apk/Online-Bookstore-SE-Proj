import { randomBytes } from 'node:crypto';
import { AppError } from '../../middleware/errors.js';
import { Book } from '../book-catalogue/models/Book.js';
import { Cart } from './models/Cart.js';
import { Order } from './models/Order.js';
import { PaymentAttempt } from './models/PaymentAttempt.js';
import { buildCheckoutSummary } from './checkout.service.js';
import { assertStrictObjectId } from './object-id.js';
import { PaymentFailure, simulatePayment, simulateReversal } from './payment.gateway.js';

const orderNumber = () => `OBS-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
const gateway = { payment: simulatePayment, reversal: simulateReversal };

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

/* ---------- reserved-stock bookkeeping ----------
 * Every decrement is written down on the attempt record (compare-and-swap on __v, the same
 * technique as ensureCartItem), and every release removes the line from the record BEFORE it
 * adds the stock back. A line is therefore released at most once, even if recovery and a live
 * request overlap, so stock can never be over-credited. If the process dies in the tiny gap
 * between "decrement" and "write down", one line stays under-stocked (safe side) and is visible
 * in the attempt/audit data. */

async function recordReserved(attemptId, line) {
  for (let tries = 0; tries < 10; tries += 1) {
    const attempt = await PaymentAttempt.findById(attemptId).lean();
    const result = await PaymentAttempt.updateOne(
      { _id: attemptId, __v: attempt.__v },
      { $set: { reserved: [...attempt.reserved.map(({ book, quantity }) => ({ book, quantity })), line] }, $inc: { __v: 1 } },
    );
    if (result.matchedCount === 1) return;
  }
  throw new Error('Could not record reserved stock.');
}

async function releaseReserved(attemptId) {
  for (let tries = 0; tries < 50; tries += 1) {
    const attempt = await PaymentAttempt.findById(attemptId).lean();
    if (!attempt || attempt.reserved.length === 0) return;
    const [line, ...rest] = attempt.reserved;
    const claimed = await PaymentAttempt.updateOne(
      { _id: attemptId, __v: attempt.__v },
      { $set: { reserved: rest.map(({ book, quantity }) => ({ book, quantity })) }, $inc: { __v: 1 } },
    );
    if (claimed.matchedCount === 1) await Book.updateOne({ _id: line.book }, { $inc: { stock: line.quantity } });
  }
}

// Atomic per-book decrement: it only succeeds while enough stock remains, so stock can never go negative.
async function reserveStock(attemptId, lines) {
  for (const line of lines) {
    const result = await Book.updateOne(
      { _id: line.book, active: true, stock: { $gte: line.quantity } },
      { $inc: { stock: -line.quantity } },
    );
    if (result.matchedCount !== 1) {
      await releaseReserved(attemptId);
      return false;
    }
    await recordReserved(attemptId, line);
  }
  return true;
}

/* ---------- cart clean-up ----------
 * Removes only the ordered rows (a book added during checkout is kept). Returns true only when the
 * cart is known to be clean; the attempt remembers it, and reconcileCarts() finishes it if it was not. */

async function removeOrderedItems(userId, orderedItemIds) {
  const ordered = new Set(orderedItemIds);
  for (let tries = 0; tries < 10; tries += 1) {
    const cart = await Cart.findOne({ user: userId }).lean();
    if (!cart) return true;
    const remaining = cart.items.filter((item) => !ordered.has(String(item._id)));
    if (remaining.length === cart.items.length) return true;
    const result = await Cart.updateOne({ _id: cart._id, __v: cart.__v }, { $set: { items: remaining }, $inc: { __v: 1 } });
    if (result.matchedCount === 1) return true;
  }
  return false;
}

async function ensureCartCleared(attempt) {
  if (attempt.cartCleared) return true;
  const cleared = await removeOrderedItems(attempt.user, attempt.cartItemIds);
  if (cleared) await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { cartCleared: true } });
  return cleared;
}

/* ---------- money bookkeeping ---------- */

async function reverseCapturedPayment(attempt, reversal) {
  if (attempt.paymentState !== 'CAPTURED') return;
  try {
    await reversal({ reference: attempt.reference, amount: attempt.amount, currency: attempt.currency });
    await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { paymentState: 'REVERSED' } });
  } catch (error) {
    // Charged but no order and no reversal: never hide this. It stays flagged for a person to resolve.
    await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { paymentState: 'REVERSAL_FAILED' } });
    console.error(`[PAYMENT] Reversal failed for attempt ${attempt._id} (${attempt.reference}): ${error.message}`);
  }
}

async function failAttempt(attemptId, code, message) {
  await PaymentAttempt.updateOne(
    { _id: attemptId, status: { $in: ['STARTED', 'RESERVED'] } },
    { $set: { status: 'FAILED', failureCode: code, failureMessage: message } },
  );
}

async function replayFor(attempt) {
  if (attempt.status === 'SUCCEEDED' && attempt.order) {
    const order = await Order.findById(attempt.order);
    if (order) {
      await ensureCartCleared(attempt); // finish an interrupted clean-up on retry
      return { order: serializeOrder(order), replayed: true };
    }
  }
  if (attempt.status === 'FAILED') {
    throw new AppError(attempt.failureCode === 'INSUFFICIENT_STOCK' ? 409 : 402, attempt.failureMessage, attempt.failureCode);
  }
  throw new AppError(409, 'This checkout is already being processed. Please wait a moment.', 'ORDER_IN_PROGRESS');
}

/**
 * Places an order. An order exists only after a successful (simulated) payment.
 *
 * Without database transactions the order of work is: validate -> record attempt -> atomically
 * reserve stock (each line recorded) -> charge (recorded as CAPTURED) -> save order -> mark attempt
 * SUCCEEDED -> clear the cart. Every failure puts things back: stock is released, and a captured
 * payment is reversed through the gateway. A crash anywhere is repaired by recoverIncompleteCheckouts().
 * The same idempotencyKey never creates a second order or takes stock twice.
 */
export async function createOrder(userId, input, { payment = gateway.payment, reversal = gateway.reversal } = {}) {
  const { idempotencyKey, paymentScenario, address, shippingOption } = input;

  const existing = await PaymentAttempt.findOne({ user: userId, idempotencyKey });
  if (existing) return replayFor(existing);

  const summary = await buildCheckoutSummary(userId, { address, shippingOption });

  let attempt;
  try {
    attempt = await PaymentAttempt.create({
      user: userId, idempotencyKey, amount: summary.total, currency: summary.currency,
      cartItemIds: summary.items.map((item) => item.itemId),
    });
  } catch (error) {
    if (error?.code === 11000) return replayFor(await PaymentAttempt.findOne({ user: userId, idempotencyKey }));
    throw error;
  }

  const lines = summary.items.map((item) => ({ book: item.bookId, quantity: item.quantity }));
  if (!(await reserveStock(attempt._id, lines))) {
    const message = 'One of the books in your cart just sold out or has less stock than you requested.';
    await failAttempt(attempt._id, 'INSUFFICIENT_STOCK', message);
    throw new AppError(409, message, 'INSUFFICIENT_STOCK');
  }
  await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { status: 'RESERVED' } });

  let charge;
  try {
    charge = await payment({ amount: summary.total, currency: summary.currency, scenario: paymentScenario });
  } catch (error) {
    await releaseReserved(attempt._id);
    const failure = error instanceof PaymentFailure ? error : new PaymentFailure('PAYMENT_GATEWAY_ERROR', 'The payment could not be completed.');
    await failAttempt(attempt._id, failure.code, failure.message);
    throw new AppError(402, failure.message, failure.code);
  }
  // Write the capture down first: from here on, a crash can be recovered because we know money moved.
  await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { paymentState: 'CAPTURED', reference: charge.reference } });

  let order;
  try {
    order = await Order.create({
      orderNumber: orderNumber(),
      user: userId,
      attempt: attempt._id,
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
    // Payment captured but the order could not be saved: undo both halves, explicitly.
    await releaseReserved(attempt._id);
    await reverseCapturedPayment({ ...attempt.toObject(), paymentState: 'CAPTURED', reference: charge.reference }, reversal);
    await failAttempt(attempt._id, 'ORDER_CREATION_FAILED', 'The order could not be saved. Your payment was reversed.');
    throw error;
  }

  await PaymentAttempt.updateOne(
    { _id: attempt._id },
    { $set: { status: 'SUCCEEDED', order: order._id, reserved: [] } },
  );
  await ensureCartCleared({ ...attempt.toObject(), cartCleared: false });

  return { order: serializeOrder(order), replayed: false };
}

/**
 * Repairs checkouts that were interrupted (crash, restart, lost connection). Safe to run repeatedly
 * and from several processes at once. Call it on start-up and on a timer (see recovery.js).
 *  - stale STARTED/RESERVED attempt with an order  -> finish it (keep the stock, mark SUCCEEDED, clear cart)
 *  - stale STARTED/RESERVED attempt without order  -> reverse a captured payment, release reserved stock, mark FAILED
 *  - SUCCEEDED attempt whose cart was never cleaned -> finish the cart clean-up
 */
export async function recoverIncompleteCheckouts({ olderThanMs = 5 * 60 * 1000, now = new Date(), reversal = gateway.reversal } = {}) {
  const cutoff = new Date(now.getTime() - olderThanMs);
  const summary = { completed: 0, abandoned: 0, cartsCleaned: 0 };

  const stale = await PaymentAttempt.find({ status: { $in: ['STARTED', 'RESERVED'] }, updatedAt: { $lt: cutoff } });
  for (const attempt of stale) {
    const order = await Order.findOne({ attempt: attempt._id });
    if (order) {
      const updated = await PaymentAttempt.updateOne(
        { _id: attempt._id, status: { $in: ['STARTED', 'RESERVED'] } },
        { $set: { status: 'SUCCEEDED', order: order._id, reserved: [] } },
      );
      if (updated.matchedCount === 1) summary.completed += 1;
      await ensureCartCleared(attempt);
      continue;
    }
    await releaseReserved(attempt._id);
    await reverseCapturedPayment(attempt, reversal);
    const message = 'This checkout was interrupted and has been cancelled.';
    await failAttempt(attempt._id, 'CHECKOUT_ABANDONED', message);
    summary.abandoned += 1;
  }

  const unclean = await PaymentAttempt.find({ status: 'SUCCEEDED', cartCleared: false });
  for (const attempt of unclean) {
    if (await ensureCartCleared(attempt)) summary.cartsCleaned += 1;
  }
  return summary;
}

export async function getOwnOrder(userId, orderId) {
  assertStrictObjectId(orderId, 'The order identifier is invalid.', 'INVALID_ORDER_ID');
  // Another customer's order is reported as "not found" so its existence is not revealed.
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new AppError(404, 'The order was not found.', 'ORDER_NOT_FOUND');
  return serializeOrder(order);
}
