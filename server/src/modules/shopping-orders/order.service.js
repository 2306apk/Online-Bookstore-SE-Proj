import { randomBytes } from 'node:crypto';
import { AppError } from '../../middleware/errors.js';
import { Cart } from './models/Cart.js';
import { Order } from './models/Order.js';
import { PaymentAttempt } from './models/PaymentAttempt.js';
import { buildCheckoutSummary } from './checkout.service.js';
import { assertStrictObjectId } from './object-id.js';
import { commitLines, releaseLines, reserveLines, reconcileReservations } from './stock-reservations.js';
import { buildTracking, canCancelStatus } from './order.lifecycle.js';
import { PaymentFailure, simulatePayment, simulateReversal } from './payment.gateway.js';

const orderNumber = () => `OBS-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`;
const gateway = { payment: simulatePayment, reversal: simulateReversal };

// How long a checkout (or a recovery run) may own an attempt without renewing. A live checkout renews
// before every step, so this only has to cover ONE step (the payment call is the longest).
export const LEASE_MS = 2 * 60 * 1000;
// A failed reversal is retried this many times in total (including the first try) before it is left for a person.
export const MAX_REVERSAL_ATTEMPTS = 5;

class LeaseLost extends Error {}

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
    cancelledAt: order.cancelledAt ?? null,
    tracking: buildTracking(order),
    canCancel: canCancelStatus(order.status),
  };
}

/* ---------- lease ----------
 * An attempt can only be moved forward by the holder of its lease (leaseOwner). Taking the lease over,
 * renewing it and finishing the attempt are all single-document compare-and-swap updates, so a live
 * checkout and a recovery run (or two recovery runs) can never both act on the same attempt:
 *   - a live checkout renews with { leaseOwner: itsToken }, which fails once recovery has taken over;
 *   - recovery takes over only with { leaseExpiresAt < now }, which fails while a live checkout keeps renewing. */

const OPEN = ['STARTED', 'RESERVED'];

async function renewLease(attemptId, token, leaseMs, extraSet = {}) {
  const result = await PaymentAttempt.updateOne(
    { _id: attemptId, leaseOwner: token, status: { $in: OPEN } },
    { $set: { ...extraSet, leaseExpiresAt: new Date(Date.now() + leaseMs) } },
  );
  if (result.matchedCount !== 1) throw new LeaseLost('The checkout lease was lost.');
}

// Moves an attempt we own to FAILED. Returns false when we no longer own it (someone else is handling it).
async function closeAttempt(attemptId, token, code, message) {
  const result = await PaymentAttempt.updateOne(
    { _id: attemptId, leaseOwner: token, status: { $in: OPEN } },
    { $set: { status: 'FAILED', failureCode: code, failureMessage: message } },
  );
  return result.matchedCount === 1;
}

const interrupted = () => new AppError(409, 'This checkout was interrupted. Please check your orders, then try again.', 'CHECKOUT_INTERRUPTED');

/* ---------- cart clean-up ----------
 * Removes only the ordered rows (a book added during checkout is kept). Returns true only when the
 * cart is known to be clean; the attempt remembers it, and recovery finishes it if it was not.
 * Removing rows that are already gone is a no-op, so concurrent runs are harmless. */

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

/**
 * Reverses a captured payment and returns what really happened: 'REVERSED', 'REVERSAL_FAILED',
 * or the attempt's current state when someone else is already handling it ('REVERSING') or nothing was charged ('NONE').
 * The claim (CAPTURED -> REVERSING) is atomic, so the gateway is asked at most once at a time per attempt.
 */
async function reversePayment(attemptId, reversal, claimFilter = { paymentState: 'CAPTURED' }) {
  const attempt = await PaymentAttempt.findOneAndUpdate(
    { _id: attemptId, ...claimFilter },
    { $set: { paymentState: 'REVERSING' }, $inc: { reversalAttempts: 1 } },
    { new: true },
  );
  if (!attempt) return (await PaymentAttempt.findById(attemptId).select('paymentState').lean())?.paymentState ?? 'NONE';
  try {
    await reversal({ reference: attempt.reference, amount: attempt.amount, currency: attempt.currency });
    await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { paymentState: 'REVERSED', reversalError: '' } });
    return 'REVERSED';
  } catch (error) {
    // Charged, no order, and the reversal did not work: never hide this. It stays flagged until a person
    // (or a later retry by recovery) resolves it.
    await PaymentAttempt.updateOne({ _id: attempt._id }, { $set: { paymentState: 'REVERSAL_FAILED', reversalError: String(error.message).slice(0, 500) } });
    console.error(`[PAYMENT][ACTION REQUIRED] Reversal failed for attempt ${attempt._id} (${attempt.reference}), try ${attempt.reversalAttempts}: ${error.message}`);
    return 'REVERSAL_FAILED';
  }
}

// What the customer is told must match what really happened to their money.
function orderFailure(outcome) {
  if (outcome === 'REVERSED') {
    return { code: 'ORDER_CREATION_FAILED', message: 'The order could not be saved. Your payment was reversed.' };
  }
  return {
    code: 'PAYMENT_REVERSAL_FAILED',
    message: 'The order could not be saved, and we could not confirm that your payment was reversed. Our team has been notified and will refund you if you were charged. Please do not pay again.',
  };
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
    const conflict = ['INSUFFICIENT_STOCK', 'CHECKOUT_ABANDONED'].includes(attempt.failureCode);
    throw new AppError(conflict ? 409 : 402, attempt.failureMessage, attempt.failureCode);
  }
  throw new AppError(409, 'This checkout is already being processed. Please wait a moment.', 'ORDER_IN_PROGRESS');
}

/**
 * Places an order. An order exists only after a successful (simulated) payment.
 *
 * Without database transactions the order of work is: validate -> record attempt (holding its lease) ->
 * reserve stock (atomic, recorded in the same write) -> charge (recorded as CAPTURED) -> save order ->
 * mark attempt SUCCEEDED -> confirm the stock -> clear the cart. The lease is renewed before every step;
 * if it is lost, recovery has taken over and this request stops. Every failure puts things back: stock is
 * released, and a captured payment is reversed through the gateway, with the real outcome reported.
 * The same idempotencyKey never creates a second order or takes stock twice.
 */
export async function createOrder(userId, input, { payment = gateway.payment, reversal = gateway.reversal, leaseMs = LEASE_MS } = {}) {
  const { idempotencyKey, paymentScenario, address, shippingOption } = input;

  const existing = await PaymentAttempt.findOne({ user: userId, idempotencyKey });
  if (existing) return replayFor(existing);

  const summary = await buildCheckoutSummary(userId, { address, shippingOption });
  const lines = summary.items.map((item) => ({ book: item.bookId, quantity: item.quantity }));
  const token = randomBytes(12).toString('hex');

  let attempt;
  try {
    attempt = await PaymentAttempt.create({
      user: userId, idempotencyKey, amount: summary.total, currency: summary.currency,
      cartItemIds: summary.items.map((item) => item.itemId), lines,
      leaseOwner: token, leaseExpiresAt: new Date(Date.now() + leaseMs),
    });
  } catch (error) {
    if (error?.code === 11000) return replayFor(await PaymentAttempt.findOne({ user: userId, idempotencyKey }));
    throw error;
  }
  const hold = (extraSet) => renewLease(attempt._id, token, leaseMs, extraSet);

  try {
    // 1. Reserve stock.
    await hold();
    if (!(await reserveLines(attempt._id, lines))) {
      const message = 'One of the books in your cart just sold out or has less stock than you requested.';
      await closeAttempt(attempt._id, token, 'INSUFFICIENT_STOCK', message);
      throw new AppError(409, message, 'INSUFFICIENT_STOCK');
    }
    // 2. Charge. Renewing the lease right before the payment call means a lost lease is caught while
    // nothing is charged yet (recovery then releases the stock).
    await hold({ status: 'RESERVED' });
    let charge;
    try {
      charge = await payment({ amount: summary.total, currency: summary.currency, scenario: paymentScenario });
    } catch (error) {
      await releaseLines(attempt._id, lines);
      const failure = error instanceof PaymentFailure ? error : new PaymentFailure('PAYMENT_GATEWAY_ERROR', 'The payment could not be completed.');
      await closeAttempt(attempt._id, token, failure.code, failure.message);
      throw new AppError(402, failure.message, failure.code);
    }
    // Write the capture down first (this needs no lease: it is a fact about the money). From here on,
    // whoever ends up cleaning this attempt knows a reversal is owed.
    await PaymentAttempt.updateOne({ _id: attempt._id, paymentState: 'NONE' }, { $set: { paymentState: 'CAPTURED', reference: charge.reference } });

    // 3. Save the order.
    let order;
    try {
      await hold(); // fence: if recovery took over while we were charging, we must not create an order
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
        statusHistory: [{ status: 'PLACED', at: new Date() }],
      });
    } catch (error) {
      // Payment captured but no order: undo both halves, and tell the customer what really happened.
      await releaseLines(attempt._id, lines);
      const outcome = await reversePayment(attempt._id, reversal);
      const { code, message } = orderFailure(outcome);
      await closeAttempt(attempt._id, token, code, message);
      if (error instanceof LeaseLost) throw new AppError(409, message, 'CHECKOUT_INTERRUPTED');
      console.error(`[ORDER] Order could not be saved for attempt ${attempt._id}: ${error.message}`);
      // 402, like the replay of this attempt: the error handler hides the text of 5xx errors, and the customer must see it.
      throw new AppError(402, message, code);
    }

    // 4. Finish. Only the lease holder may mark the attempt SUCCEEDED.
    const finished = await PaymentAttempt.updateOne(
      { _id: attempt._id, leaseOwner: token, status: { $in: OPEN } },
      { $set: { status: 'SUCCEEDED', order: order._id } },
    );
    if (finished.matchedCount !== 1) {
      const current = await PaymentAttempt.findById(attempt._id).lean();
      const completedWithOurOrder = current?.status === 'SUCCEEDED' && String(current.order) === String(order._id);
      if (!completedWithOurOrder) {
        // Recovery closed this attempt while the order was being saved: it already released the stock and
        // reversed the payment, so this order must not exist.
        await Order.deleteOne({ _id: order._id, attempt: attempt._id });
        throw interrupted();
      }
    }
    await commitLines(attempt._id, lines);
    await ensureCartCleared({ ...attempt.toObject(), cartCleared: false });
    return { order: serializeOrder(order), replayed: false };
  } catch (error) {
    if (error instanceof LeaseLost) {
      // Recovery has taken this attempt over (it was stalled for longer than the lease). It finishes the cleanup.
      throw interrupted();
    }
    throw error;
  }
}

/**
 * Repairs checkouts that were interrupted (crash, restart, lost connection). Safe to run repeatedly and
 * from several processes at once: every attempt is first claimed with an atomic lease take-over, which
 * fails while a live checkout is still renewing its lease or while another recovery run holds it.
 *  - expired attempt with an order     -> finish it (keep the stock, mark SUCCEEDED, clear the cart)
 *  - expired attempt without an order  -> close it, release the stock, reverse a captured payment
 *  - SUCCEEDED attempt, cart not clean -> finish the cart clean-up
 *  - closed attempt that still owes a reversal, or a failed reversal -> (re)try it, bounded
 *  - stock reservations of finished attempts -> commit or release them
 */
export async function recoverIncompleteCheckouts({ now = new Date(), leaseMs = LEASE_MS, reversal = gateway.reversal } = {}) {
  const summary = { completed: 0, abandoned: 0, cartsCleaned: 0, reversalsRetried: 0, needsReview: 0, stock: { committed: 0, released: 0 } };
  const token = `recovery-${randomBytes(8).toString('hex')}`;

  // Money still owed back: closed without a reversal, a reversal that failed (retried a few times), or one that was
  // interrupted mid-call. Looked up BEFORE this run abandons anything, so a reversal that fails below is not retried
  // straight away in the same run.
  const stuckBefore = new Date(now.getTime() - leaseMs);
  const owing = await PaymentAttempt.find({
    $or: [
      { status: 'FAILED', paymentState: 'CAPTURED' },
      { paymentState: 'REVERSAL_FAILED', reversalAttempts: { $lt: MAX_REVERSAL_ATTEMPTS } },
      { paymentState: 'REVERSING', updatedAt: { $lt: stuckBefore } },
    ],
  }).select('paymentState').lean();

  const expired = await PaymentAttempt.find({ status: { $in: OPEN }, leaseExpiresAt: { $lt: now } }).select('_id').lean();
  for (const { _id } of expired) {
    const attempt = await PaymentAttempt.findOneAndUpdate(
      { _id, status: { $in: OPEN }, leaseExpiresAt: { $lt: now } },
      { $set: { leaseOwner: token, leaseExpiresAt: new Date(Date.now() + leaseMs) } },
      { new: true },
    );
    if (!attempt) continue; // a live checkout renewed it, or another recovery run owns it now

    const order = await Order.findOne({ attempt: attempt._id });
    if (order) {
      const done = await PaymentAttempt.updateOne(
        { _id: attempt._id, leaseOwner: token, status: { $in: OPEN } },
        { $set: { status: 'SUCCEEDED', order: order._id } },
      );
      if (done.matchedCount === 1) summary.completed += 1;
      await commitLines(attempt._id, attempt.lines);
      await ensureCartCleared(attempt);
      continue;
    }
    // No order. Close the attempt FIRST: from then on a stalled checkout cannot finish it, and the
    // undo steps below are idempotent, so a crash between them is repaired by the sweeps further down.
    const message = 'This checkout was interrupted and has been cancelled.';
    if (!(await closeAttempt(attempt._id, token, 'CHECKOUT_ABANDONED', message))) continue;
    await releaseLines(attempt._id, attempt.lines);
    await reversePayment(attempt._id, reversal);
    summary.abandoned += 1;
  }

  const unclean = await PaymentAttempt.find({ status: 'SUCCEEDED', cartCleared: false });
  for (const attempt of unclean) {
    if (await ensureCartCleared(attempt)) summary.cartsCleaned += 1;
  }

  for (const { _id, paymentState } of owing) {
    const claimFilter = paymentState === 'REVERSING'
      ? { paymentState: 'REVERSING', updatedAt: { $lt: stuckBefore } }
      : { paymentState, ...(paymentState === 'REVERSAL_FAILED' ? { reversalAttempts: { $lt: MAX_REVERSAL_ATTEMPTS } } : {}) };
    if ((await reversePayment(_id, reversal, claimFilter)) === 'REVERSED') summary.reversalsRetried += 1;
  }

  // Reversals that have used up their retries stay flagged and are reported on every run until a person resolves them.
  const needReview = await listPaymentsNeedingReview();
  summary.needsReview = needReview.length;
  for (const attempt of needReview) {
    console.error(`[PAYMENT][ACTION REQUIRED] Attempt ${attempt._id} (${attempt.reference}, ${attempt.amount} ${attempt.currency}) was charged, has no order, and could not be reversed: ${attempt.reversalError}`);
  }

  summary.stock = await reconcileReservations();
  return summary;
}

/** Payments that were captured, produced no order and could not be reversed automatically. For the admin/ops follow-up. */
export function listPaymentsNeedingReview() {
  return PaymentAttempt.find({ paymentState: 'REVERSAL_FAILED', reversalAttempts: { $gte: MAX_REVERSAL_ATTEMPTS } }).lean();
}

export async function getOwnOrder(userId, orderId) {
  assertStrictObjectId(orderId, 'The order identifier is invalid.', 'INVALID_ORDER_ID');
  // Another customer's order is reported as "not found" so its existence is not revealed.
  const order = await Order.findOne({ _id: orderId, user: userId });
  if (!order) throw new AppError(404, 'The order was not found.', 'ORDER_NOT_FOUND');
  return serializeOrder(order);
}
