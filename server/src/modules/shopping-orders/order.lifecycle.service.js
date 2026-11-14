import { AppError } from '../../middleware/errors.js';
import { Book } from '../book-catalogue/models/Book.js';
import { Order } from './models/Order.js';
import { orderRules } from './orders.config.js';
import { NEXT_STATUS, canCancelStatus, historyOf } from './order.lifecycle.js';
import { assertStrictObjectId } from './object-id.js';
import { serializeOrder } from './order.service.js';
import { simulateReversal } from './payment.gateway.js';

/* ---------- OBS-27: order history ---------- */

export async function listOwnOrders(userId, { page = '1', limit = '10' } = {}) {
  const pageNumber = Number(page);
  const pageSize = Number(limit);
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50) {
    throw new AppError(400, 'page must be a whole number from 1 and limit a whole number from 1 to 50.', 'INVALID_PAGINATION');
  }
  const filter = { user: userId };
  const [total, orders] = await Promise.all([
    Order.countDocuments(filter),
    Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((pageNumber - 1) * pageSize).limit(pageSize),
  ]);
  return {
    orders: orders.map(serializeOrder),
    pagination: { page: pageNumber, limit: pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

/* ---------- order status progression (Placed -> Shipped -> Delivered) ---------- */

export async function advanceOrderStatus(orderId, targetStatus) {
  assertStrictObjectId(orderId, 'The order identifier is invalid.', 'INVALID_ORDER_ID');
  for (let tries = 0; tries < 5; tries += 1) {
    const order = await Order.findById(orderId).lean();
    if (!order) throw new AppError(404, 'The order was not found.', 'ORDER_NOT_FOUND');
    if (order.status === 'CANCELLED') throw new AppError(409, 'A cancelled order cannot change status.', 'ORDER_CANCELLED');
    if (NEXT_STATUS[order.status] !== targetStatus) {
      const allowed = NEXT_STATUS[order.status];
      throw new AppError(
        409,
        allowed ? `An order that is ${order.status} can only move to ${allowed}.` : 'This order is already delivered.',
        'INVALID_STATUS_TRANSITION',
      );
    }
    const history = [...historyOf(order), { status: targetStatus, at: new Date() }];
    // Compare-and-swap on status and __v: if the customer cancelled at the same moment, exactly one side wins.
    const result = await Order.updateOne(
      { _id: orderId, status: order.status, __v: order.__v },
      { $set: { status: targetStatus, statusHistory: history }, $inc: { __v: 1 } },
    );
    if (result.matchedCount === 1) return serializeOrder(await Order.findById(orderId));
  }
  throw new AppError(409, 'The order was changed at the same time. Please try again.', 'ORDER_CONFLICT');
}

/* ---------- OBS-28: cancellation ---------- */

// One atomic update per book: stock goes up AND the "this order was restored" marker is added together, and
// only if the marker is not there yet. Repeating it, or running it twice at once, changes nothing the second time.
async function restoreStock(orderId) {
  const order = await Order.findById(orderId).lean();
  if (!order || order.stockRestored) return;
  for (const item of order.items) {
    await Book.updateOne(
      { _id: item.book, 'restorations.order': { $ne: order._id } },
      { $inc: { stock: item.quantity }, $push: { restorations: { order: order._id, quantity: item.quantity } } },
    );
  }
  await Order.updateOne({ _id: orderId }, { $set: { stockRestored: true } });
}

async function refundPayment(orderId, reversal) {
  // Claim the refund so it is attempted once, even if two cancel requests overlap.
  const claim = await Order.updateOne({ _id: orderId, 'payment.status': 'SUCCEEDED' }, { $set: { 'payment.status': 'REFUNDING' } });
  if (claim.matchedCount !== 1) return;
  const order = await Order.findById(orderId).lean();
  try {
    await reversal({ reference: order.payment.reference, amount: order.total, currency: order.currency });
    await Order.updateOne({ _id: orderId }, { $set: { 'payment.status': 'REFUNDED' } });
  } catch (error) {
    await Order.updateOne({ _id: orderId }, { $set: { 'payment.status': 'REFUND_FAILED' } });
    console.error(`[PAYMENT] Refund failed for order ${order.orderNumber} (${order.payment.reference}): ${error.message}`);
  }
}

// Finishes whatever a cancellation still owes (stock back, refund). Safe to repeat or run concurrently.
export async function finishCancellation(orderId, { reversal = simulateReversal } = {}) {
  await restoreStock(orderId);
  await refundPayment(orderId, reversal);
}

export async function finishPendingCancellations({ reversal = simulateReversal } = {}) {
  const pending = await Order.find({ status: 'CANCELLED', $or: [{ stockRestored: false }, { 'payment.status': 'REFUNDING' }] }).select('_id');
  for (const { _id } of pending) await finishCancellation(_id, { reversal });
  return { finished: pending.length };
}

export async function cancelOwnOrder(userId, orderId, { reversal = simulateReversal, now = new Date(), windowMinutes = orderRules.cancellationWindowMinutes } = {}) {
  assertStrictObjectId(orderId, 'The order identifier is invalid.', 'INVALID_ORDER_ID');
  let replayed = false;
  for (let tries = 0; tries < 5; tries += 1) {
    const order = await Order.findOne({ _id: orderId, user: userId }).lean();
    // Another customer's order is "not found" so its existence is not revealed.
    if (!order) throw new AppError(404, 'The order was not found.', 'ORDER_NOT_FOUND');

    if (order.status === 'CANCELLED') { replayed = true; break; } // repeating a cancel is harmless and restores nothing twice
    if (!canCancelStatus(order.status)) {
      throw new AppError(
        409,
        order.status === 'SHIPPED'
          ? 'This order has already been shipped and can no longer be cancelled.'
          : 'This order has already been delivered and cannot be cancelled.',
        'ORDER_NOT_CANCELLABLE',
        { status: order.status },
      );
    }
    if (windowMinutes && now.getTime() - new Date(order.createdAt).getTime() > windowMinutes * 60_000) {
      throw new AppError(409, `Orders can only be cancelled within ${windowMinutes} minutes of placing them.`, 'CANCELLATION_WINDOW_EXPIRED');
    }

    const history = [...historyOf(order), { status: 'CANCELLED', at: now }];
    const claimed = await Order.updateOne(
      { _id: orderId, user: userId, status: 'PLACED', __v: order.__v },
      {
        $set: {
          status: 'CANCELLED',
          cancelledAt: now,
          statusHistory: history,
        },
        $inc: { __v: 1 },
      },
    );
    if (claimed.matchedCount === 1) break;
  }

  const current = await Order.findOne({ _id: orderId, user: userId });
  if (current?.status !== 'CANCELLED') {
    throw new AppError(409, 'The order was changed at the same time. Please check its status and try again.', 'ORDER_CONFLICT');
  }
  await finishCancellation(orderId, { reversal });
  return { order: serializeOrder(await Order.findById(orderId)), replayed };
}
