import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import { randomBytes } from 'node:crypto';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/modules/authentication-security/models/User.js';
import { hashPassword } from '../src/modules/authentication-security/password.js';
import { Book } from '../src/modules/book-catalogue/models/Book.js';
import { Category } from '../src/modules/book-catalogue/models/Category.js';
import { Cart } from '../src/modules/shopping-orders/models/Cart.js';
import { Order } from '../src/modules/shopping-orders/models/Order.js';
import { PaymentAttempt } from '../src/modules/shopping-orders/models/PaymentAttempt.js';
import { buildTracking } from '../src/modules/shopping-orders/order.lifecycle.js';
import { cancelOwnOrder, finishPendingCancellations } from '../src/modules/shopping-orders/order.lifecycle.service.js';

let mongo;
let category;
let bookOne;
let bookTwo;
let adminAgent;
const password = 'CustomerPass123!';
const key = () => randomBytes(12).toString('hex');

const body = (overrides = {}) => ({
  fullName: 'Anwitha Potluri', phone: '+91 98765 43210', line1: '12, MG Road', line2: '',
  city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'India',
  shippingOption: 'STANDARD', idempotencyKey: key(), paymentScenario: 'SUCCESS', ...overrides,
});

async function createCustomer(label = 'a') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: 'History Tester', email: `hist-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`, password,
  });
  assert.equal(response.status, 201);
  return { agent, user: response.body.user };
}

// Places a real order through the API: returns the customer and the order.
async function placeOrder(book = bookOne, quantity = 2, customer) {
  const owner = customer ?? (await createCustomer());
  const added = await owner.agent.post('/api/cart').send({ bookId: String(book._id), quantity });
  assert.equal(added.status, 201);
  const response = await owner.agent.post('/api/orders').send(body());
  assert.equal(response.status, 201);
  return { ...owner, order: response.body.order };
}

const stockOf = async (book) => (await Book.findById(book._id).lean()).stock;

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
  } else {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }
});

before(async () => {
  // One admin for the whole file: sign-ins are rate limited (50 per 15 minutes), so do not log in for every test.
  await User.deleteMany({});
  const email = `hist-admin-${Date.now()}@example.com`;
  await User.create({ name: 'Admin', email, passwordHash: await hashPassword(password), role: 'ADMIN' });
  adminAgent = request.agent(app);
  assert.equal((await adminAgent.post('/api/auth/login').send({ email, password })).status, 200);
});

beforeEach(async () => {
  mock.restoreAll();
  await Promise.all([Book, Category, Cart, Order, PaymentAttempt].map((model) => model.deleteMany({})));
  await User.deleteMany({ role: 'CUSTOMER' });
  await Promise.all([Order.syncIndexes(), PaymentAttempt.syncIndexes()]);
  category = await Category.create({ name: 'History Cat', slug: 'history-cat', description: 'History tests' });
  const base = { author: 'Test', description: 'd', keywords: ['t'], active: true, category: category._id };
  [bookOne, bookTwo] = await Book.create([
    { ...base, title: 'Book One', price: 250, stock: 10 },
    { ...base, title: 'Book Two', price: 120, stock: 6 },
  ]);
});

after(async () => {
  mock.restoreAll();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('OBS-27: order history', () => {
  test('requires a logged-in customer', async () => {
    assert.equal((await request(app).get('/api/orders/my-orders')).status, 401);
    assert.equal((await adminAgent.get('/api/orders/my-orders')).status, 403);
  });

  test('a new customer has an empty history', async () => {
    const { agent } = await createCustomer();
    const response = await agent.get('/api/orders/my-orders');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.orders, []);
    assert.equal(response.body.pagination.total, 0);
  });

  test('shows date, items, total and status, newest first', async () => {
    const customer = await createCustomer();
    const first = await placeOrder(bookOne, 1, customer);
    await new Promise((resolve) => setTimeout(resolve, 15));
    const second = await placeOrder(bookTwo, 2, customer);
    const response = await customer.agent.get('/api/orders/my-orders');
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.orders.map((order) => order.id), [second.order.id, first.order.id]);
    const [latest] = response.body.orders;
    assert.equal(latest.status, 'PLACED');
    assert.ok(latest.createdAt);
    assert.deepEqual(latest.items.map((item) => [item.title, item.quantity]), [['Book Two', 2]]);
    assert.equal(latest.total, second.order.total);
    assert.equal(latest.tracking.find((step) => step.status === 'PLACED').reached, true);
    assert.equal(latest.tracking.find((step) => step.status === 'SHIPPED').reached, false);
  });

  test('a customer never sees another customer\'s orders', async () => {
    const first = await placeOrder(bookOne, 1);
    const second = await placeOrder(bookTwo, 1);
    const mine = await first.agent.get('/api/orders/my-orders');
    assert.deepEqual(mine.body.orders.map((order) => order.id), [first.order.id]);
    const theirs = await second.agent.get('/api/orders/my-orders');
    assert.deepEqual(theirs.body.orders.map((order) => order.id), [second.order.id]);
    assert.equal((await second.agent.get(`/api/orders/${first.order.id}`)).status, 404);
  });

  test('is paginated and rejects bad paging values', async () => {
    const customer = await createCustomer();
    for (let i = 0; i < 3; i += 1) await placeOrder(bookOne, 1, customer);
    const page = await customer.agent.get('/api/orders/my-orders?page=2&limit=2');
    assert.equal(page.body.orders.length, 1);
    assert.deepEqual(page.body.pagination, { page: 2, limit: 2, total: 3, totalPages: 2 });
    for (const query of ['page=0', 'limit=500', 'page=abc', 'limit=1.5']) {
      const bad = await customer.agent.get(`/api/orders/my-orders?${query}`);
      assert.equal(bad.status, 400, query);
      assert.equal(bad.body.error.code, 'INVALID_PAGINATION');
    }
  });

  test('"my-orders" is not mistaken for an order id', async () => {
    const { agent } = await createCustomer();
    const response = await agent.get('/api/orders/my-orders');
    assert.equal(response.status, 200);
    assert.ok(Array.isArray(response.body.orders));
  });
});

describe('OBS-27: status progression and tracking', () => {
  test('a new order starts as PLACED with a timeline', async () => {
    const { order } = await placeOrder();
    assert.equal(order.status, 'PLACED');
    assert.deepEqual(order.tracking.map((step) => [step.status, step.reached]), [['PLACED', true], ['SHIPPED', false], ['DELIVERED', false]]);
    assert.ok(order.tracking[0].at);
  });

  test('staff can move an order Placed -> Shipped -> Delivered, and the customer sees it', async () => {
    const { agent, order } = await placeOrder();
    const shipped = await adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'SHIPPED' });
    assert.equal(shipped.status, 200);
    assert.equal(shipped.body.order.status, 'SHIPPED');
    assert.equal(shipped.body.order.canCancel, false);
    const delivered = await adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'DELIVERED' });
    assert.equal(delivered.body.order.status, 'DELIVERED');
    const seen = (await agent.get(`/api/orders/${order.id}`)).body.order;
    assert.equal(seen.status, 'DELIVERED');
    assert.deepEqual(seen.tracking.map((step) => step.reached), [true, true, true]);
    assert.ok(seen.tracking.every((step) => step.at));
  });

  test('steps cannot be skipped, repeated or reversed', async () => {
    const { order } = await placeOrder();
    const skip = await adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'DELIVERED' });
    assert.equal(skip.status, 409);
    assert.equal(skip.body.error.code, 'INVALID_STATUS_TRANSITION');
    await adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'SHIPPED' });
    assert.equal((await adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'SHIPPED' })).status, 409);
    assert.equal((await adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'PLACED' })).status, 400);
    await adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'DELIVERED' });
    assert.equal((await adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'DELIVERED' })).status, 409);
  });

  test('only staff can change status, and bad values or ids are rejected', async () => {
    const { agent, order } = await placeOrder();
    assert.equal((await agent.patch(`/api/orders/${order.id}/status`).send({ status: 'SHIPPED' })).status, 403);
    assert.equal((await request(app).patch(`/api/orders/${order.id}/status`).send({ status: 'SHIPPED' })).status, 401);
    assert.equal((await adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'LOST' })).status, 400);
    assert.equal((await adminAgent.patch('/api/orders/not-an-id/status').send({ status: 'SHIPPED' })).status, 400);
    assert.equal((await adminAgent.patch(`/api/orders/${new mongoose.Types.ObjectId()}/status`).send({ status: 'SHIPPED' })).status, 404);
  });

  test('an order saved before status history existed keeps its PLACED time when it ships', async () => {
    const { agent, order } = await placeOrder();
    await Order.collection.updateOne({ _id: new mongoose.Types.ObjectId(order.id) }, { $set: { statusHistory: [] } });
    await adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'SHIPPED' });
    const seen = (await agent.get(`/api/orders/${order.id}`)).body.order;
    assert.ok(seen.tracking[0].at && seen.tracking[1].at);
  });

  test('tracking tolerates orders saved before status history existed', () => {
    const steps = buildTracking({ status: 'PLACED', createdAt: new Date('2026-01-01'), statusHistory: [] });
    assert.equal(steps[0].reached, true);
    assert.equal(steps[0].at.toISOString(), new Date('2026-01-01').toISOString());
  });
});

describe('OBS-28: cancellation', () => {
  test('cancels a placed order, restores stock, shows the cancelled status and refunds the simulated payment', async () => {
    const { agent, order } = await placeOrder(bookOne, 3);
    assert.equal(await stockOf(bookOne), 7);
    const response = await agent.post(`/api/orders/${order.id}/cancel`).send({});
    assert.equal(response.status, 200);
    assert.equal(response.body.replayed, false);
    assert.equal(response.body.order.status, 'CANCELLED');
    assert.ok(response.body.order.cancelledAt);
    assert.equal(response.body.order.canCancel, false);
    assert.deepEqual(response.body.order.tracking.map((step) => step.status), ['PLACED', 'CANCELLED']);
    assert.equal(response.body.order.payment.status, 'REFUNDED');
    assert.equal(await stockOf(bookOne), 10);
    const stored = await Order.findById(order.id).lean();
    assert.equal(stored.stockRestored, true);
    const history = (await agent.get('/api/orders/my-orders')).body.orders;
    assert.equal(history[0].status, 'CANCELLED');
  });

  test('restores every book in a multi-book order', async () => {
    const customer = await createCustomer();
    await customer.agent.post('/api/cart').send({ bookId: String(bookOne._id), quantity: 2 });
    await customer.agent.post('/api/cart').send({ bookId: String(bookTwo._id), quantity: 4 });
    const placed = await customer.agent.post('/api/orders').send(body());
    assert.deepEqual([await stockOf(bookOne), await stockOf(bookTwo)], [8, 2]);
    await customer.agent.post(`/api/orders/${placed.body.order.id}/cancel`).send({});
    assert.deepEqual([await stockOf(bookOne), await stockOf(bookTwo)], [10, 6]);
  });

  test('a shipped or delivered order cannot be cancelled and stock is untouched', async () => {
    const { agent, order } = await placeOrder(bookOne, 2);
    await adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'SHIPPED' });
    const shipped = await agent.post(`/api/orders/${order.id}/cancel`).send({});
    assert.equal(shipped.status, 409);
    assert.equal(shipped.body.error.code, 'ORDER_NOT_CANCELLABLE');
    assert.match(shipped.body.error.message, /shipped/);
    await adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'DELIVERED' });
    const delivered = await agent.post(`/api/orders/${order.id}/cancel`).send({});
    assert.equal(delivered.status, 409);
    assert.match(delivered.body.error.message, /delivered/);
    assert.equal(await stockOf(bookOne), 8);
    assert.equal((await Order.findById(order.id).lean()).status, 'DELIVERED');
  });

  test('retrying a cancellation never restores stock twice', async () => {
    const { agent, order } = await placeOrder(bookOne, 2);
    const first = await agent.post(`/api/orders/${order.id}/cancel`).send({});
    const second = await agent.post(`/api/orders/${order.id}/cancel`).send({});
    assert.equal(first.body.replayed, false);
    assert.equal(second.status, 200);
    assert.equal(second.body.replayed, true);
    assert.equal(await stockOf(bookOne), 10);
  });

  test('simultaneous cancellations restore stock exactly once', async () => {
    const { agent, order } = await placeOrder(bookOne, 4);
    const responses = await Promise.all([1, 2, 3, 4].map(() => agent.post(`/api/orders/${order.id}/cancel`).send({})));
    assert.ok(responses.every((response) => response.status === 200), responses.map((r) => r.status).join());
    assert.equal(await stockOf(bookOne), 10);
    assert.equal((await Order.findById(order.id).lean()).payment.status, 'REFUNDED');
  });

  test('a customer cannot cancel someone else\'s order', async () => {
    const owner = await placeOrder(bookOne, 2);
    const other = await createCustomer('other');
    assert.equal((await other.agent.post(`/api/orders/${owner.order.id}/cancel`).send({})).status, 404);
    assert.equal((await owner.agent.post('/api/orders/not-an-id/cancel').send({})).status, 400);
    assert.equal((await adminAgent.post(`/api/orders/${owner.order.id}/cancel`).send({})).status, 403);
    assert.equal((await request(app).post(`/api/orders/${owner.order.id}/cancel`).send({})).status, 401);
    assert.equal((await Order.findById(owner.order.id).lean()).status, 'PLACED');
    assert.equal(await stockOf(bookOne), 8);
  });

  test('cancelling and shipping at the same moment: exactly one wins and stock stays consistent', async () => {
    const { agent, order } = await placeOrder(bookOne, 2);
    const [cancel, ship] = await Promise.all([
      agent.post(`/api/orders/${order.id}/cancel`).send({}),
      adminAgent.patch(`/api/orders/${order.id}/status`).send({ status: 'SHIPPED' }),
    ]);
    const final = await Order.findById(order.id).lean();
    if (final.status === 'CANCELLED') {
      assert.equal(cancel.status, 200);
      assert.equal(ship.status, 409);
      assert.equal(await stockOf(bookOne), 10);
    } else {
      assert.equal(final.status, 'SHIPPED');
      assert.equal(ship.status, 200);
      assert.equal(cancel.status, 409);
      assert.equal(await stockOf(bookOne), 8);
    }
  });

  test('an interrupted cancellation is finished later, without double-restoring', async () => {
    const { agent, order } = await placeOrder(bookOne, 2);
    // The crash happened after the order was marked cancelled but before stock went back.
    await Order.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(order.id) },
      { $set: { status: 'CANCELLED', cancelledAt: new Date(), stockRestored: false } },
    );
    assert.equal(await stockOf(bookOne), 8);
    const first = await finishPendingCancellations();
    assert.equal(first.finished, 1);
    assert.equal(await stockOf(bookOne), 10);
    await Promise.all([finishPendingCancellations(), finishPendingCancellations()]);
    await agent.post(`/api/orders/${order.id}/cancel`).send({});
    assert.equal(await stockOf(bookOne), 10, 'finishing again, or retrying the cancel, must not add stock again');
  });

  test('a failed refund is flagged and logged, but the cancellation and stock restore still happen', async () => {
    const { user, order } = await placeOrder(bookOne, 2);
    const logged = mock.method(console, 'error', () => {});
    const reversal = mock.fn(async () => { throw new Error('gateway offline'); });
    const result = await cancelOwnOrder(user.id, order.id, { reversal });
    mock.restoreAll();
    assert.equal(result.order.status, 'CANCELLED');
    assert.equal(result.order.payment.status, 'REFUND_FAILED');
    assert.equal(await stockOf(bookOne), 10);
    assert.ok(logged.mock.calls.some((call) => String(call.arguments[0]).includes('[PAYMENT] Refund failed')));
  });

  test('the refund is requested once even if the cancel is repeated', async () => {
    const { user, order } = await placeOrder(bookOne, 1);
    const reversal = mock.fn(async () => ({ status: 'REVERSED' }));
    await cancelOwnOrder(user.id, order.id, { reversal });
    await cancelOwnOrder(user.id, order.id, { reversal });
    assert.equal(reversal.mock.callCount(), 1);
    assert.equal(reversal.mock.calls[0].arguments[0].reference, order.payment.reference);
  });

  test('a configured cancellation window is enforced', async () => {
    const { user, order } = await placeOrder(bookOne, 2);
    const late = new Date(Date.now() + 31 * 60_000);
    await assert.rejects(cancelOwnOrder(user.id, order.id, { now: late, windowMinutes: 30 }), (error) => error.code === 'CANCELLATION_WINDOW_EXPIRED');
    assert.equal(await stockOf(bookOne), 8);
    const inTime = await cancelOwnOrder(user.id, order.id, { now: new Date(Date.now() + 5 * 60_000), windowMinutes: 30 });
    assert.equal(inTime.order.status, 'CANCELLED');
    assert.equal(await stockOf(bookOne), 10);
  });
});

// ---------- review fix: interrupted and failed refunds ----------

// A stand-in for a real gateway: it remembers every refund by idempotency key and never refunds a key twice.
function fakeGateway({ failFirst = 0, crashAfterRefundOnce = false } = {}) {
  const refunds = new Map();
  const keys = [];
  let calls = 0;
  let crashed = false;
  const reversal = async ({ idempotencyKey, reference }) => {
    calls += 1;
    keys.push(idempotencyKey);
    if (calls <= failFirst) throw new Error('gateway offline');
    if (!refunds.has(idempotencyKey)) refunds.set(idempotencyKey, { reference, status: 'REVERSED' }); // money moves here
    if (crashAfterRefundOnce && !crashed) { crashed = true; throw new Error('connection lost after refund'); }
    return refunds.get(idempotencyKey);
  };
  return { reversal, refunds, keys, calls: () => calls };
}

const longAgoDate = () => new Date(Date.now() - 3600_000);
const paymentOf = async (orderId) => (await Order.findById(orderId).lean()).payment;

describe('OBS-28 review fix: interrupted and failed refunds', () => {
  test('a refund interrupted mid-way (stuck REFUNDING, lease expired) is finished by recovery, once', async () => {
    const { user, order } = await placeOrder(bookOne, 2);
    await cancelOwnOrder(user.id, order.id); // cancels and refunds normally first
    // Put the order back into the state a crash during the refund leaves behind.
    await Order.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(order.id) },
      { $set: { 'payment.status': 'REFUNDING', 'payment.refundClaimedAt': longAgoDate(), 'payment.refundAttempts': 1 } },
    );
    const gateway = fakeGateway();
    const result = await finishPendingCancellations({ reversal: gateway.reversal });
    assert.equal(result.finished, 1);
    const payment = await paymentOf(order.id);
    assert.equal(payment.status, 'REFUNDED');
    assert.equal(payment.needsReview, false);
    assert.equal(gateway.refunds.size, 1);
    await finishPendingCancellations({ reversal: gateway.reversal });
    assert.equal(gateway.calls(), 1, 'a finished refund is never requested again');
  });

  test('a refund that is still within its lease is left alone (another worker is on it)', async () => {
    const { user, order } = await placeOrder(bookOne, 1);
    await cancelOwnOrder(user.id, order.id);
    await Order.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(order.id) },
      { $set: { 'payment.status': 'REFUNDING', 'payment.refundClaimedAt': new Date(), 'payment.refundAttempts': 1 } },
    );
    const gateway = fakeGateway();
    await finishPendingCancellations({ reversal: gateway.reversal });
    assert.equal(gateway.calls(), 0);
    assert.equal((await paymentOf(order.id)).status, 'REFUNDING');
  });

  test('crash AFTER the money moved: the retry reuses the same key, so the customer is refunded exactly once', async () => {
    const { user, order } = await placeOrder(bookOne, 2);
    const gateway = fakeGateway({ crashAfterRefundOnce: true });
    const logged = mock.method(console, 'error', () => {});
    const first = await cancelOwnOrder(user.id, order.id, { reversal: gateway.reversal });
    mock.restoreAll();
    assert.equal(first.order.payment.status, 'REFUND_FAILED');
    const flagged = await paymentOf(order.id);
    assert.equal(flagged.needsReview, true);
    assert.equal(flagged.refundAttempts, 1);
    assert.ok(logged.mock.calls.some((call) => String(call.arguments[0]).includes('[PAYMENT] Refund failed')));

    await finishPendingCancellations({ reversal: gateway.reversal });
    const done = await paymentOf(order.id);
    assert.equal(done.status, 'REFUNDED');
    assert.equal(done.needsReview, false);
    assert.equal(gateway.refunds.size, 1, 'one refund, not two');
    assert.equal(gateway.keys.length, 2);
    assert.equal(gateway.keys[0], gateway.keys[1], 'both attempts carry the same idempotency key');
    assert.equal(await stockOf(bookOne), 10);
  });

  test('a failing gateway is retried a few times, then stays REFUND_FAILED and flagged for manual follow-up', async () => {
    const { user, order } = await placeOrder(bookOne, 1);
    const gateway = fakeGateway({ failFirst: 100 });
    const logged = mock.method(console, 'error', () => {});
    await cancelOwnOrder(user.id, order.id, { reversal: gateway.reversal });
    for (let run = 0; run < 5; run += 1) await finishPendingCancellations({ reversal: gateway.reversal });
    mock.restoreAll();
    const payment = await paymentOf(order.id);
    assert.equal(payment.status, 'REFUND_FAILED');
    assert.equal(payment.needsReview, true);
    assert.equal(payment.refundAttempts, 3);
    assert.equal(payment.refundError, 'gateway offline');
    assert.equal(gateway.calls(), 3, 'it stops retrying after the limit');
    assert.ok(logged.mock.calls.some((call) => String(call.arguments[0]).includes('needs manual follow-up')));
    // The cancellation itself is unaffected: stock is back and the order is cancelled.
    assert.equal(await stockOf(bookOne), 10);
    assert.equal((await Order.findById(order.id).lean()).status, 'CANCELLED');
  });

  test('a failed refund that works on a later try ends REFUNDED and unflagged', async () => {
    const { user, order } = await placeOrder(bookOne, 1);
    const gateway = fakeGateway({ failFirst: 1 });
    mock.method(console, 'error', () => {});
    await cancelOwnOrder(user.id, order.id, { reversal: gateway.reversal });
    mock.restoreAll();
    assert.equal((await paymentOf(order.id)).status, 'REFUND_FAILED');
    await finishPendingCancellations({ reversal: gateway.reversal });
    const payment = await paymentOf(order.id);
    assert.equal(payment.status, 'REFUNDED');
    assert.equal(payment.needsReview, false);
    assert.equal(payment.refundError, undefined);
    assert.equal(gateway.refunds.size, 1);
  });

  test('overlapping recovery runs request an interrupted refund once', async () => {
    const { user, order } = await placeOrder(bookOne, 1);
    await cancelOwnOrder(user.id, order.id);
    await Order.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(order.id) },
      { $set: { 'payment.status': 'REFUNDING', 'payment.refundClaimedAt': longAgoDate(), 'payment.refundAttempts': 1 } },
    );
    const gateway = fakeGateway();
    await Promise.all([1, 2, 3].map(() => finishPendingCancellations({ reversal: gateway.reversal })));
    assert.equal(gateway.refunds.size, 1);
    assert.equal((await paymentOf(order.id)).status, 'REFUNDED');
  });

  test('the default simulated gateway also refuses to refund the same key twice', async () => {
    const { simulateReversal } = await import('../src/modules/shopping-orders/payment.gateway.js');
    const first = await simulateReversal({ reference: 'SIM-X', idempotencyKey: 'refund-test-1' });
    const second = await simulateReversal({ reference: 'SIM-X', idempotencyKey: 'refund-test-1' });
    assert.equal(first, second);
  });
});

