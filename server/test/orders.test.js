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
import { MAX_REVERSAL_ATTEMPTS, createOrder, listPaymentsNeedingReview, recoverIncompleteCheckouts } from '../src/modules/shopping-orders/order.service.js';
import { reconcileReservations, releaseLines, reserveLines } from '../src/modules/shopping-orders/stock-reservations.js';

let mongo;
let category;
let bookOne;
let bookTwo;
const password = 'CustomerPass123!';
const key = () => randomBytes(12).toString('hex');

const body = (overrides = {}) => ({
  fullName: 'Anwitha Potluri', phone: '+91 98765 43210', line1: '12, MG Road', line2: '',
  city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'India',
  shippingOption: 'STANDARD', idempotencyKey: key(), paymentScenario: 'SUCCESS',
  ...overrides,
});

async function createCustomer(label = 'a') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: 'Order Tester',
    email: `order-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
    password,
  });
  assert.equal(response.status, 201);
  return { agent, user: response.body.user };
}

async function addToCart(agent, book, quantity) {
  const response = await agent.post('/api/cart').send({ bookId: String(book._id), quantity });
  assert.equal(response.status, 201);
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

beforeEach(async () => {
  mock.restoreAll();
  await Promise.all([User, Book, Category, Cart, Order, PaymentAttempt].map((model) => model.deleteMany({})));
  await Promise.all([Order.syncIndexes(), PaymentAttempt.syncIndexes()]);
  category = await Category.create({ name: 'Order Cat', slug: 'order-cat', description: 'Order tests' });
  const base = { author: 'Test', description: 'd', keywords: ['t'], active: true, category: category._id };
  [bookOne, bookTwo] = await Book.create([
    { ...base, title: 'Book One', price: 250, stock: 5 },
    { ...base, title: 'Book Two', price: 120, stock: 3 },
  ]);
});

after(async () => {
  mock.restoreAll();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('OBS-26: access and validation', () => {
  test('requires a logged-in customer', async () => {
    assert.equal((await request(app).post('/api/orders').send(body())).status, 401);
    assert.equal((await request(app).get(`/api/orders/${new mongoose.Types.ObjectId()}`)).status, 401);
    const email = `order-admin-${Date.now()}@example.com`;
    await User.create({ name: 'Admin', email, passwordHash: await hashPassword(password), role: 'ADMIN' });
    const admin = request.agent(app);
    await admin.post('/api/auth/login').send({ email, password });
    assert.equal((await admin.post('/api/orders').send(body())).status, 403);
  });

  test('rejects a missing or malformed checkout reference and an unknown payment outcome', async () => {
    const { agent } = await createCustomer();
    await addToCart(agent, bookOne, 1);
    const missing = body();
    delete missing.idempotencyKey;
    const response = await agent.post('/api/orders').send(missing);
    assert.equal(response.status, 400);
    assert.ok(response.body.error.details.idempotencyKey);
    assert.equal((await agent.post('/api/orders').send(body({ idempotencyKey: 'short' }))).status, 400);
    const scenario = await agent.post('/api/orders').send(body({ paymentScenario: 'FREE' }));
    assert.equal(scenario.status, 400);
    assert.ok(scenario.body.error.details.paymentScenario);
    assert.equal(await Order.countDocuments(), 0);
  });

  test('re-validates the delivery address', async () => {
    const { agent } = await createCustomer();
    await addToCart(agent, bookOne, 1);
    const response = await agent.post('/api/orders').send(body({ phone: '123' }));
    assert.equal(response.status, 400);
    assert.ok(response.body.error.details.phone);
    assert.equal(await stockOf(bookOne), 5);
  });

  test('an empty cart cannot be ordered', async () => {
    const { agent } = await createCustomer();
    const response = await agent.post('/api/orders').send(body());
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'CART_EMPTY');
    assert.equal(await PaymentAttempt.countDocuments(), 0);
  });
});

describe('OBS-26: successful order', () => {
  test('creates one order with the server total, takes stock and clears the cart', async () => {
    const { agent, user } = await createCustomer();
    await addToCart(agent, bookOne, 2);
    await addToCart(agent, bookTwo, 1);

    const response = await agent.post('/api/orders').send({
      ...body(), total: 1, subtotal: 1, items: [{ unitPrice: 1 }], cardNumber: '4111111111111111', cvv: '123',
    });
    assert.equal(response.status, 201);
    const { order } = response.body;
    assert.equal(response.body.replayed, false);
    assert.equal(order.status, 'PLACED');
    assert.match(order.orderNumber, /^OBS-/);
    assert.equal(order.subtotal, 620);
    assert.equal(order.total, 620 + order.shipping.amount + order.tax.amount);
    assert.deepEqual(order.items.map((item) => [item.title, item.quantity, item.lineTotal]), [['Book One', 2, 500], ['Book Two', 1, 120]]);
    assert.equal(order.payment.status, 'SUCCEEDED');
    assert.match(order.payment.reference, /^SIM-/);
    assert.equal(order.address.city, 'Bengaluru');

    assert.equal(await stockOf(bookOne), 3);
    assert.equal(await stockOf(bookTwo), 2);
    assert.equal((await Cart.findOne({ user: user.id }).lean()).items.length, 0);
    assert.equal(await Order.countDocuments(), 1);
    const stored = JSON.stringify(await Order.find().lean()) + JSON.stringify(await PaymentAttempt.find().lean());
    assert.ok(!stored.includes('4111') && !stored.includes('cvv'), 'no card data may be stored');
  });

  test('the order keeps the price paid even if the catalogue price changes later', async () => {
    const { agent } = await createCustomer();
    await addToCart(agent, bookOne, 1);
    const { body: created } = await agent.post('/api/orders').send(body());
    await Book.updateOne({ _id: bookOne._id }, { price: 999, title: 'Renamed' });
    const fetched = await agent.get(`/api/orders/${created.order.id}`);
    assert.equal(fetched.status, 200);
    assert.equal(fetched.body.order.items[0].unitPrice, 250);
    assert.equal(fetched.body.order.items[0].title, 'Book One');
  });

  test('a customer can only open their own order', async () => {
    const first = await createCustomer('first');
    const second = await createCustomer('second');
    await addToCart(first.agent, bookOne, 1);
    const { body: created } = await first.agent.post('/api/orders').send(body());
    assert.equal((await second.agent.get(`/api/orders/${created.order.id}`)).status, 404);
    assert.equal((await first.agent.get('/api/orders/not-an-id')).status, 400);
    assert.equal((await first.agent.get(`/api/orders/${new mongoose.Types.ObjectId()}`)).status, 404);
  });

  test('books added to the cart during checkout are kept; only ordered rows are removed', async () => {
    const { agent, user } = await createCustomer();
    await addToCart(agent, bookOne, 1);
    await agent.post('/api/orders').send(body());
    await addToCart(agent, bookTwo, 1);
    const cart = await Cart.findOne({ user: user.id }).lean();
    assert.equal(cart.items.length, 1);
  });
});

describe('OBS-26: idempotency', () => {
  test('repeating the same request returns the same order and takes stock once', async () => {
    const { agent } = await createCustomer();
    await addToCart(agent, bookOne, 2);
    const payload = body();
    const first = await agent.post('/api/orders').send(payload);
    const second = await agent.post('/api/orders').send(payload);
    assert.equal(first.status, 201);
    assert.equal(second.status, 200);
    assert.equal(second.body.replayed, true);
    assert.equal(second.body.order.id, first.body.order.id);
    assert.equal(await Order.countDocuments(), 1);
    assert.equal(await stockOf(bookOne), 3);
  });

  test('simultaneous duplicate submissions create exactly one order', async () => {
    const { agent } = await createCustomer();
    await addToCart(agent, bookOne, 2);
    const payload = body();
    const responses = await Promise.all([1, 2, 3].map(() => agent.post('/api/orders').send(payload)));
    assert.ok(responses.every((response) => [200, 201, 409].includes(response.status)), responses.map((r) => r.status).join());
    assert.equal(responses.filter((response) => response.status === 201).length, 1);
    assert.equal(await Order.countDocuments(), 1);
    assert.equal(await stockOf(bookOne), 3);
  });
});

describe('OBS-26: failed payment', () => {
  for (const [scenario, code] of [['DECLINED', 'PAYMENT_DECLINED'], ['ERROR', 'PAYMENT_GATEWAY_ERROR']]) {
    test(`${scenario}: no order, stock and cart untouched, attempt recorded`, async () => {
      const { agent, user } = await createCustomer();
      await addToCart(agent, bookOne, 2);
      await addToCart(agent, bookTwo, 1);
      const response = await agent.post('/api/orders').send(body({ paymentScenario: scenario }));
      assert.equal(response.status, 402);
      assert.equal(response.body.error.code, code);
      assert.equal(await Order.countDocuments(), 0);
      assert.equal(await stockOf(bookOne), 5);
      assert.equal(await stockOf(bookTwo), 3);
      assert.equal((await Cart.findOne({ user: user.id }).lean()).items.length, 2);
      const attempts = await PaymentAttempt.find().lean();
      assert.equal(attempts.length, 1);
      assert.equal(attempts[0].status, 'FAILED');
      assert.equal(attempts[0].failureCode, code);
    });
  }

  test('after a decline the customer can retry with a new reference and succeed', async () => {
    const { agent } = await createCustomer();
    await addToCart(agent, bookOne, 1);
    assert.equal((await agent.post('/api/orders').send(body({ paymentScenario: 'DECLINED' }))).status, 402);
    const retry = await agent.post('/api/orders').send(body());
    assert.equal(retry.status, 201);
    assert.equal(await stockOf(bookOne), 4);
  });

  test('repeating a declined reference repeats the same failure instead of charging again', async () => {
    const { agent } = await createCustomer();
    await addToCart(agent, bookOne, 1);
    const payload = body({ paymentScenario: 'DECLINED' });
    await agent.post('/api/orders').send(payload);
    const again = await agent.post('/api/orders').send({ ...payload, paymentScenario: 'SUCCESS' });
    assert.equal(again.status, 402);
    assert.equal(await Order.countDocuments(), 0);
  });

  test('a payment service that throws something unexpected is handled as a failed payment', async () => {
    const { user } = await createCustomer();
    const { agent } = await createCustomer('b');
    await addToCart(agent, bookOne, 1);
    const me = (await agent.get('/api/auth/me')).body.user;
    await assert.rejects(
      createOrder(me.id, { address: { fullName: 'A B', phone: '9876543210', line1: '12 MG Road', city: 'Pune', state: 'MH', postalCode: '411001', country: 'India' }, shippingOption: 'STANDARD', idempotencyKey: key(), paymentScenario: 'SUCCESS' }, { payment: async () => { throw new Error('boom'); } }),
      (error) => error.statusCode === 402 && error.code === 'PAYMENT_GATEWAY_ERROR',
    );
    assert.ok(user);
    assert.equal(await stockOf(bookOne), 5);
    assert.equal(await Order.countDocuments(), 0);
  });

  test('if saving the order fails after payment, stock is restored and no order exists', async () => {
    const { agent } = await createCustomer();
    await addToCart(agent, bookOne, 2);
    mock.method(Order, 'create', async () => { throw new Error('database write failed'); });
    const response = await agent.post('/api/orders').send(body());
    assert.equal(response.status, 402);
    assert.equal(response.body.error.code, 'ORDER_CREATION_FAILED');
    mock.restoreAll();
    assert.equal(await stockOf(bookOne), 5);
    assert.equal(await Order.countDocuments(), 0);
    assert.equal((await PaymentAttempt.findOne().lean()).status, 'FAILED');
  });
});

describe('OBS-26: stock safety', () => {
  test('a cart that no longer fits the stock is refused before any payment', async () => {
    const { agent } = await createCustomer();
    await addToCart(agent, bookOne, 4);
    await Book.updateOne({ _id: bookOne._id }, { stock: 2 });
    const response = await agent.post('/api/orders').send(body());
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'CHECKOUT_CART_INVALID');
    assert.equal(await stockOf(bookOne), 2);
    assert.equal(await Order.countDocuments(), 0);
  });

  test('two customers buying the last copy at once: one order, stock never negative', async () => {
    await Book.updateOne({ _id: bookOne._id }, { stock: 1 });
    const customers = [await createCustomer('x'), await createCustomer('y')];
    for (const customer of customers) await addToCart(customer.agent, bookOne, 1);
    const responses = await Promise.all(customers.map((customer) => customer.agent.post('/api/orders').send(body())));
    const statuses = responses.map((response) => response.status).sort();
    assert.deepEqual(statuses, [201, 409]);
    assert.equal(await stockOf(bookOne), 0);
    assert.equal(await Order.countDocuments(), 1);
  });

  test('many simultaneous buyers can never push stock below zero', async () => {
    await Book.updateOne({ _id: bookTwo._id }, { stock: 2 });
    const customers = [];
    for (let i = 0; i < 5; i += 1) {
      const customer = await createCustomer(`m${i}`);
      await addToCart(customer.agent, bookTwo, 1);
      customers.push(customer);
    }
    const responses = await Promise.all(customers.map((customer) => customer.agent.post('/api/orders').send(body())));
    const sold = responses.filter((response) => response.status === 201).length;
    assert.equal(sold, 2);
    assert.equal(await stockOf(bookTwo), 0);
    assert.equal(await Order.countDocuments(), 2);
  });
});

// ---------- review fixes: stock ledger, recovery leases, honest payment reversal ----------

const addressInput = { fullName: 'A B', phone: '9876543210', line1: '12 MG Road', city: 'Pune', state: 'MH', postalCode: '411001', country: 'India' };
const orderInput = () => ({ address: addressInput, shippingOption: 'STANDARD', idempotencyKey: key(), paymentScenario: 'SUCCESS' });
const okReversal = () => mock.fn(async () => ({ status: 'REVERSED' }));
const expire = (attemptId) => PaymentAttempt.collection.updateOne({ _id: attemptId }, { $set: { leaseExpiresAt: new Date(Date.now() - 1000) } });
const reservationsOf = async (book) => (await Book.findById(book._id).select('+reservations').lean()).reservations ?? [];
const attemptOf = (filter) => PaymentAttempt.findOne(filter).lean();

async function customerWithCart(book = bookOne, quantity = 2) {
  const customer = await createCustomer();
  await addToCart(customer.agent, book, quantity);
  return { ...customer, userId: customer.user.id };
}

// An attempt that a crashed process left behind: stock really reserved (through the ledger), lease long expired.
async function crashedAttempt(userId, extra = {}) {
  const attempt = await PaymentAttempt.create({
    user: userId, idempotencyKey: key(), status: 'RESERVED', amount: 500, currency: 'INR',
    lines: [{ book: bookOne._id, quantity: 2 }], leaseOwner: 'dead-process', leaseExpiresAt: new Date(Date.now() - 1000),
    ...extra,
  });
  assert.equal(await reserveLines(attempt._id, attempt.lines), true);
  return attempt;
}

// A payment call that waits until the test lets it finish, so a test can act while a checkout is "in flight".
function slowPayment(reference = 'SIM-SLOW') {
  let open;
  let reached;
  const gate = new Promise((resolve) => { open = resolve; });
  const arrived = new Promise((resolve) => { reached = resolve; });
  return { arrived, open, payment: async () => { reached(); await gate; return { status: 'SUCCEEDED', reference }; } };
}

describe('OBS-26 review fix 1: stock and its record are one write', () => {
  test('reserving takes the stock and records the hold together; repeating it takes nothing more', async () => {
    const { userId } = await customerWithCart();
    const attempt = await crashedAttempt(userId);
    assert.equal(await stockOf(bookOne), 3);
    const held = await reservationsOf(bookOne);
    assert.equal(held.length, 1);
    assert.equal(String(held[0].attempt), String(attempt._id));
    assert.equal(held[0].quantity, 2);
    assert.equal(await reserveLines(attempt._id, attempt.lines), true);
    assert.equal(await stockOf(bookOne), 3, 'a repeated reserve must not take stock twice');
    assert.equal((await reservationsOf(bookOne)).length, 1);
  });

  test('a reserve that cannot be fully met leaves no stock taken and no hold recorded', async () => {
    const { userId } = await customerWithCart();
    const attempt = await PaymentAttempt.create({ user: userId, idempotencyKey: key(), amount: 1, currency: 'INR' });
    const lines = [{ book: bookOne._id, quantity: 2 }, { book: bookTwo._id, quantity: 99 }];
    assert.equal(await reserveLines(attempt._id, lines), false);
    assert.equal(await stockOf(bookOne), 5);
    assert.equal(await stockOf(bookTwo), 3);
    assert.equal((await reservationsOf(bookOne)).length, 0);
  });

  test('releasing is exactly-once, even when repeated and simultaneous', async () => {
    const { userId } = await customerWithCart();
    const attempt = await crashedAttempt(userId);
    await Promise.all([releaseLines(attempt._id, attempt.lines), releaseLines(attempt._id, attempt.lines), releaseLines(attempt._id, attempt.lines)]);
    await releaseLines(attempt._id, attempt.lines);
    assert.equal(await stockOf(bookOne), 5);
    assert.equal((await reservationsOf(bookOne)).length, 0);
  });

  test('a crash after the stock was reserved: recovery returns it, once', async () => {
    const { userId } = await customerWithCart();
    const attempt = await crashedAttempt(userId);
    const first = await recoverIncompleteCheckouts();
    assert.equal(first.abandoned, 1);
    assert.equal(await stockOf(bookOne), 5);
    const stored = await attemptOf({ _id: attempt._id });
    assert.equal(stored.status, 'FAILED');
    assert.equal(stored.failureCode, 'CHECKOUT_ABANDONED');
    await recoverIncompleteCheckouts();
    await Promise.all([recoverIncompleteCheckouts(), recoverIncompleteCheckouts()]);
    assert.equal(await stockOf(bookOne), 5, 'repeated or simultaneous recovery must never add stock twice');
    assert.equal((await reservationsOf(bookOne)).length, 0);
  });

  test('a crash while giving the stock back is repaired by the next run', async () => {
    const { userId } = await customerWithCart();
    const attempt = await crashedAttempt(userId);
    const realUpdate = Book.updateOne.bind(Book);
    let crashed = false;
    mock.method(Book, 'updateOne', (...args) => {
      if (!crashed) { crashed = true; throw new Error('process died'); }
      return realUpdate(...args);
    });
    await assert.rejects(recoverIncompleteCheckouts(), /process died/);
    mock.restoreAll();
    assert.equal((await attemptOf({ _id: attempt._id })).status, 'FAILED', 'the attempt was closed before the stock was touched');
    assert.equal(await stockOf(bookOne), 3, 'the stock is still held, and still recorded as held');
    assert.equal((await reservationsOf(bookOne)).length, 1);
    const repair = await recoverIncompleteCheckouts();
    assert.equal(repair.stock.released, 1);
    assert.equal(await stockOf(bookOne), 5);
    assert.equal((await reservationsOf(bookOne)).length, 0);
  });

  test('a crash after the order was confirmed but before the hold was cleared: the stock stays taken', async () => {
    const { agent, userId } = await customerWithCart();
    const { body: created } = await agent.post('/api/orders').send(body());
    const order = await Order.findById(created.order.id).lean();
    await Book.updateOne({ _id: bookOne._id }, { $push: { reservations: { attempt: order.attempt, quantity: 2 } } });
    assert.equal(await stockOf(bookOne), 3);
    const result = await reconcileReservations();
    assert.deepEqual(result, { committed: 1, released: 0 });
    assert.equal(await stockOf(bookOne), 3, 'stock for a real order must never be returned');
    assert.equal((await reservationsOf(bookOne)).length, 0);
    assert.ok(userId);
  });

  test('a hold whose attempt no longer exists is returned; a hold of a live attempt is left alone', async () => {
    const { userId } = await customerWithCart();
    const live = await crashedAttempt(userId, { leaseOwner: 'live', leaseExpiresAt: new Date(Date.now() + 60_000) });
    const ghost = new mongoose.Types.ObjectId();
    await Book.updateOne({ _id: bookTwo._id }, { $inc: { stock: -1 }, $push: { reservations: { attempt: ghost, quantity: 1 } } });
    const result = await reconcileReservations();
    assert.deepEqual(result, { committed: 0, released: 1 });
    assert.equal(await stockOf(bookTwo), 3);
    assert.equal(await stockOf(bookOne), 3, 'the live attempt keeps its stock');
    assert.equal((await reservationsOf(bookOne)).length, 1);
    assert.ok(live);
  });
});

describe('OBS-26 review fix 2: recovery never races a live checkout or another recovery run', () => {
  test('an attempt whose lease has not expired is not touched', async () => {
    const { userId } = await customerWithCart();
    const attempt = await crashedAttempt(userId, { leaseOwner: 'live', leaseExpiresAt: new Date(Date.now() + 60_000) });
    const result = await recoverIncompleteCheckouts();
    assert.equal(result.abandoned, 0);
    assert.equal(await stockOf(bookOne), 3);
    assert.equal((await attemptOf({ _id: attempt._id })).status, 'RESERVED');
  });

  test('a checkout that is still working keeps its attempt: recovery leaves it alone and the order completes', async () => {
    const { userId } = await customerWithCart();
    const slow = slowPayment();
    const pending = createOrder(userId, orderInput(), { payment: slow.payment });
    await slow.arrived; // stock reserved, payment in flight
    const during = await recoverIncompleteCheckouts();
    assert.equal(during.abandoned, 0);
    assert.equal(await stockOf(bookOne), 3);
    slow.open();
    const { order, replayed } = await pending;
    assert.equal(replayed, false);
    assert.equal(order.itemCount, 2);
    assert.equal(await stockOf(bookOne), 3);
    assert.equal((await reservationsOf(bookOne)).length, 0);
    assert.equal(await Order.countDocuments(), 1);
    assert.equal((await attemptOf({ user: userId })).status, 'SUCCEEDED');
  });

  test('a checkout stalled past its lease is taken over; when it wakes up it reverses its own charge and stops', async () => {
    const { userId } = await customerWithCart();
    const reversal = okReversal();
    const slow = slowPayment('SIM-STALLED');
    const pending = createOrder(userId, orderInput(), { payment: slow.payment, reversal });
    const settled = pending.catch((error) => error);
    await slow.arrived;
    const attempt = await attemptOf({ user: userId });
    await expire(attempt._id); // the checkout froze for longer than its lease
    const takeover = await recoverIncompleteCheckouts({ reversal });
    assert.equal(takeover.abandoned, 1);
    assert.equal(await stockOf(bookOne), 5);
    assert.equal(reversal.mock.callCount(), 0, 'nothing was known to be charged yet');

    slow.open(); // the frozen checkout wakes up, its payment call finally returns
    const error = await settled;
    assert.equal(error.code, 'CHECKOUT_INTERRUPTED');
    assert.equal(await Order.countDocuments(), 0, 'it must not create an order after losing its attempt');
    assert.equal(reversal.mock.callCount(), 1, 'the late charge is reversed exactly once');
    assert.equal(reversal.mock.calls[0].arguments[0].reference, 'SIM-STALLED');
    const stored = await attemptOf({ _id: attempt._id });
    assert.equal(stored.paymentState, 'REVERSED');
    assert.equal(stored.status, 'FAILED');
    assert.equal(stored.failureCode, 'CHECKOUT_ABANDONED');
    assert.equal(await stockOf(bookOne), 5);
    assert.equal((await reservationsOf(bookOne)).length, 0);
  });

  test('recovery closes an attempt just before its order is written: the late order is removed, stock and money are undone', async () => {
    const { userId } = await customerWithCart();
    const reversal = okReversal();
    const realCreate = Order.create.bind(Order);
    mock.method(Order, 'create', async (...args) => {
      const attempt = await attemptOf({ user: userId });
      await expire(attempt._id);
      await recoverIncompleteCheckouts({ reversal }); // takes over, sees no order yet, abandons
      return realCreate(...args); // the stalled checkout now writes its order anyway
    });
    await assert.rejects(createOrder(userId, orderInput(), { reversal }), (error) => error.code === 'CHECKOUT_INTERRUPTED');
    mock.restoreAll();
    assert.equal(await Order.countDocuments(), 0);
    assert.equal(await stockOf(bookOne), 5);
    assert.equal(reversal.mock.callCount(), 1);
    assert.equal((await attemptOf({ user: userId })).paymentState, 'REVERSED');
  });

  test('recovery finishes an attempt whose order was already written: that order is kept', async () => {
    const { userId } = await customerWithCart();
    const realCreate = Order.create.bind(Order);
    mock.method(Order, 'create', async (...args) => {
      const order = await realCreate(...args);
      const attempt = await attemptOf({ user: userId });
      await expire(attempt._id);
      const result = await recoverIncompleteCheckouts({ reversal: okReversal() }); // sees the order, completes the attempt
      assert.equal(result.completed, 1);
      return order;
    });
    const { order, replayed } = await createOrder(userId, orderInput());
    mock.restoreAll();
    assert.equal(replayed, false);
    assert.equal(await Order.countDocuments(), 1);
    assert.equal(await stockOf(bookOne), 3);
    assert.equal((await reservationsOf(bookOne)).length, 0);
    const stored = await attemptOf({ user: userId });
    assert.equal(stored.status, 'SUCCEEDED');
    assert.equal(String(stored.order), order.id);
  });

  test('overlapping recovery runs handle one attempt once (one reversal, one stock return)', async () => {
    const { userId } = await customerWithCart();
    await crashedAttempt(userId, { paymentState: 'CAPTURED', reference: 'SIM-OVERLAP' });
    const reversal = mock.fn(async () => { await new Promise((resolve) => setTimeout(resolve, 30)); return { status: 'REVERSED' }; });
    const runs = await Promise.all([1, 2, 3].map(() => recoverIncompleteCheckouts({ reversal })));
    assert.equal(runs.reduce((total, run) => total + run.abandoned, 0), 1);
    assert.equal(reversal.mock.callCount(), 1);
    assert.equal(await stockOf(bookOne), 5);
    assert.equal((await reservationsOf(bookOne)).length, 0);
    assert.equal((await attemptOf({ user: userId })).paymentState, 'REVERSED');
  });

  test('a crash after the order was saved is completed, not undone (stock stays taken)', async () => {
    const { agent, userId } = await customerWithCart();
    const { body: created } = await agent.post('/api/orders').send(body());
    const order = await Order.findById(created.order.id).lean();
    // Put the attempt back into the half-finished state a crash would leave behind.
    await PaymentAttempt.collection.updateOne(
      { _id: order.attempt },
      { $set: { status: 'RESERVED', order: null, cartCleared: false, leaseOwner: 'dead-process', leaseExpiresAt: new Date(Date.now() - 1000) } },
    );
    await Book.updateOne({ _id: bookOne._id }, { $push: { reservations: { attempt: order.attempt, quantity: 2 } } });
    await addToCart(agent, bookOne, 2); // row ids are not reused: re-add, then point the attempt at the new row
    const cart = await Cart.findOne({ user: userId }).lean();
    await PaymentAttempt.collection.updateOne({ _id: order.attempt }, { $set: { cartItemIds: cart.items.map((item) => String(item._id)) } });

    const result = await recoverIncompleteCheckouts();
    assert.equal(result.completed, 1);
    assert.equal(await stockOf(bookOne), 3, 'stock for a real order must not be released');
    assert.equal((await reservationsOf(bookOne)).length, 0);
    const stored = await attemptOf({ _id: order.attempt });
    assert.equal(stored.status, 'SUCCEEDED');
    assert.equal(String(stored.order), created.order.id);
    assert.equal((await Cart.findOne({ user: userId }).lean()).items.length, 0);
    assert.equal(await Order.countDocuments(), 1);
  });
});

describe('OBS-26 review fix 3: honest payment reversal', () => {
  test('when the order cannot be saved and the reversal works, the customer is told the payment was reversed', async () => {
    const { userId } = await customerWithCart();
    mock.method(Order, 'create', async () => { throw new Error('database write failed'); });
    mock.method(console, 'error', () => {});
    const reversal = okReversal();
    await assert.rejects(
      createOrder(userId, orderInput(), { reversal }),
      (error) => error.statusCode === 402 && error.code === 'ORDER_CREATION_FAILED' && /Your payment was reversed/.test(error.message),
    );
    mock.restoreAll();
    assert.equal(reversal.mock.callCount(), 1);
    const call = reversal.mock.calls[0].arguments[0];
    assert.match(call.reference, /^SIM-/);
    assert.ok(call.amount > 0);
    const attempt = await attemptOf({ user: userId });
    assert.equal(attempt.paymentState, 'REVERSED');
    assert.equal(attempt.status, 'FAILED');
    assert.equal(attempt.failureCode, 'ORDER_CREATION_FAILED');
    assert.equal(await stockOf(bookOne), 5);
    assert.equal(await Order.countDocuments(), 0);
  });

  test('when the reversal itself fails, the message does not claim a reversal; the attempt is flagged and logged', async () => {
    const { userId } = await customerWithCart();
    mock.method(Order, 'create', async () => { throw new Error('database write failed'); });
    const logged = mock.method(console, 'error', () => {});
    const reversal = mock.fn(async () => { throw new Error('gateway offline'); });
    await assert.rejects(createOrder(userId, orderInput(), { reversal }), (error) => {
      assert.equal(error.statusCode, 402);
      assert.equal(error.code, 'PAYMENT_REVERSAL_FAILED');
      assert.doesNotMatch(error.message, /Your payment was reversed/); // the success wording; this message only says it could not be confirmed
      assert.match(error.message, /could not confirm/);
      assert.match(error.message, /do not pay again/);
      return true;
    });
    mock.restoreAll();
    const attempt = await attemptOf({ user: userId });
    assert.equal(attempt.paymentState, 'REVERSAL_FAILED');
    assert.equal(attempt.reversalAttempts, 1);
    assert.equal(attempt.reversalError, 'gateway offline');
    assert.equal(attempt.status, 'FAILED');
    assert.equal(attempt.failureCode, 'PAYMENT_REVERSAL_FAILED');
    assert.ok(logged.mock.calls.some((call) => String(call.arguments[0]).includes('[PAYMENT][ACTION REQUIRED] Reversal failed')));
    assert.equal(await stockOf(bookOne), 5, 'stock is returned even when the money could not be');
    assert.equal(await Order.countDocuments(), 0);
  });

  test('repeating the same request after a failed reversal repeats the honest message and does not charge again', async () => {
    const { userId } = await customerWithCart();
    mock.method(Order, 'create', async () => { throw new Error('database write failed'); });
    mock.method(console, 'error', () => {});
    const reversal = mock.fn(async () => { throw new Error('gateway offline'); });
    const payment = mock.fn(async () => ({ status: 'SUCCEEDED', reference: 'SIM-ONCE' }));
    const input = orderInput();
    const first = await createOrder(userId, input, { payment, reversal }).catch((error) => error);
    const again = await createOrder(userId, input, { payment, reversal }).catch((error) => error);
    mock.restoreAll();
    assert.equal(first.code, 'PAYMENT_REVERSAL_FAILED');
    assert.equal(again.code, first.code);
    assert.equal(again.message, first.message);
    assert.equal(payment.mock.callCount(), 1);
    assert.equal(reversal.mock.callCount(), 1);
  });

  test('recovery retries a failed reversal, then stops retrying and keeps it flagged for a person', async () => {
    const { userId } = await customerWithCart();
    await crashedAttempt(userId, { paymentState: 'CAPTURED', reference: 'SIM-STUCK' });
    mock.method(console, 'error', () => {});
    const failing = mock.fn(async () => { throw new Error('gateway offline'); });

    await recoverIncompleteCheckouts({ reversal: failing }); // abandons the attempt; the reversal fails (try 1)
    assert.equal((await attemptOf({ user: userId })).paymentState, 'REVERSAL_FAILED');
    for (let run = 0; run < MAX_REVERSAL_ATTEMPTS + 2; run += 1) await recoverIncompleteCheckouts({ reversal: failing });
    assert.equal(failing.mock.callCount(), MAX_REVERSAL_ATTEMPTS, 'bounded: it must not retry forever');

    const stuck = await attemptOf({ user: userId });
    assert.equal(stuck.paymentState, 'REVERSAL_FAILED');
    assert.equal(stuck.reversalAttempts, MAX_REVERSAL_ATTEMPTS);
    const flagged = await listPaymentsNeedingReview();
    assert.equal(flagged.length, 1);
    assert.equal(flagged[0].reference, 'SIM-STUCK');
    const result = await recoverIncompleteCheckouts({ reversal: failing });
    assert.equal(result.needsReview, 1);
    mock.restoreAll();
  });

  test('a failed reversal that works on a later try is marked REVERSED and not flagged', async () => {
    const { userId } = await customerWithCart();
    await crashedAttempt(userId, { paymentState: 'CAPTURED', reference: 'SIM-LATER' });
    mock.method(console, 'error', () => {});
    await recoverIncompleteCheckouts({ reversal: async () => { throw new Error('gateway offline'); } });
    mock.restoreAll();
    const working = okReversal();
    const result = await recoverIncompleteCheckouts({ reversal: working });
    assert.equal(result.reversalsRetried, 1);
    assert.equal(working.mock.callCount(), 1);
    const stored = await attemptOf({ user: userId });
    assert.equal(stored.paymentState, 'REVERSED');
    assert.equal((await listPaymentsNeedingReview()).length, 0);
    await recoverIncompleteCheckouts({ reversal: working });
    assert.equal(working.mock.callCount(), 1, 'a reversed payment is never reversed again');
  });

  test('a failed (declined) payment is never reversed because nothing was captured', async () => {
    const { userId } = await customerWithCart();
    const reversal = okReversal();
    await assert.rejects(createOrder(userId, { ...orderInput(), paymentScenario: 'DECLINED' }, { reversal }), (error) => error.code === 'PAYMENT_DECLINED');
    assert.equal(reversal.mock.callCount(), 0);
    assert.equal((await attemptOf({ user: userId })).paymentState, 'NONE');
    assert.equal(await stockOf(bookOne), 5);
  });

  test('one checkout attempt can never produce two orders', async () => {
    const { agent } = await customerWithCart();
    await agent.post('/api/orders').send(body());
    const order = await Order.findOne().lean();
    await assert.rejects(Order.create({ ...order, _id: new mongoose.Types.ObjectId(), orderNumber: 'OBS-DUPLICATE' }), (error) => error.code === 11000);
  });
});

describe('OBS-26 review fix: cart reconciliation', () => {
  test('if cart clean-up cannot finish, the order still succeeds and the cart is cleaned later', async () => {
    const { agent, userId } = await customerWithCart();
    mock.method(Cart, 'updateOne', async () => ({ matchedCount: 0, modifiedCount: 0 })); // every attempt loses the race
    const response = await agent.post('/api/orders').send(body());
    mock.restoreAll();
    assert.equal(response.status, 201);
    const attempt = await attemptOf({ user: userId });
    assert.equal(attempt.status, 'SUCCEEDED');
    assert.equal(attempt.cartCleared, false, 'the unfinished clean-up must be recorded, not forgotten');
    assert.equal((await Cart.findOne({ user: userId }).lean()).items.length, 1);

    const result = await recoverIncompleteCheckouts();
    assert.equal(result.cartsCleaned, 1);
    assert.equal((await Cart.findOne({ user: userId }).lean()).items.length, 0);
    assert.equal((await attemptOf({ user: userId })).cartCleared, true);
    assert.equal(await Order.countDocuments(), 1);
  });

  test('repeating the request also finishes an interrupted clean-up', async () => {
    const { agent, userId } = await customerWithCart();
    mock.method(Cart, 'updateOne', async () => ({ matchedCount: 0, modifiedCount: 0 }));
    const payload = body();
    await agent.post('/api/orders').send(payload);
    mock.restoreAll();
    const again = await agent.post('/api/orders').send(payload);
    assert.equal(again.status, 200);
    assert.equal((await Cart.findOne({ user: userId }).lean()).items.length, 0);
    assert.equal(await stockOf(bookOne), 3);
  });
});
