import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, mock, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/modules/authentication-security/models/User.js';
import { hashPassword } from '../src/modules/authentication-security/password.js';
import { Book } from '../src/modules/book-catalogue/models/Book.js';
import { Category } from '../src/modules/book-catalogue/models/Category.js';
import { Cart } from '../src/modules/shopping-orders/models/Cart.js';
import { Wishlist } from '../src/modules/shopping-orders/models/Wishlist.js';
import { ensureCartItem } from '../src/modules/shopping-orders/service.js';

let mongo;
let category;
let book;
let otherBook;
let outOfStockBook;
let inactiveBook;

const password = 'CustomerPass123!';

async function createCustomer(label = 'a') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: 'Wishlist Tester',
    email: `wishlist-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
    password,
  });
  assert.equal(response.status, 201);
  return { agent, user: response.body.user };
}

async function createAdminAgent() {
  const email = `wishlist-admin-${Date.now()}@example.com`;
  await User.create({ name: 'Admin', email, passwordHash: await hashPassword(password), role: 'ADMIN' });
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password });
  assert.equal(response.status, 200);
  return agent;
}

const makeBook = (overrides) => ({
  title: 'Wishlist Book',
  author: 'Test Author',
  description: 'For wishlist tests.',
  keywords: ['test'],
  price: 100,
  stock: 5,
  active: true,
  category: category._id,
  ...overrides,
});

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI);
  } else {
    mongo = await MongoMemoryServer.create();
    await mongoose.connect(mongo.getUri());
  }
});

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Book.deleteMany({}),
    Category.deleteMany({}),
    Cart.deleteMany({}),
    Wishlist.deleteMany({}),
  ]);
  category = await Category.create({ name: 'Wishlist Cat', slug: 'wishlist-cat', description: 'Wishlist tests' });
  [book, otherBook, outOfStockBook, inactiveBook] = await Book.create([
    makeBook({ title: 'Book One', price: 250, stock: 5 }),
    makeBook({ title: 'Book Two', price: 120, stock: 3 }),
    makeBook({ title: 'Sold Out', stock: 0 }),
    makeBook({ title: 'Retired', active: false }),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('OBS-22: wishlist', () => {
  test('requires authentication for every wishlist route', async () => {
    const id = String(book._id);
    const responses = await Promise.all([
      request(app).get('/api/wishlist'),
      request(app).post('/api/wishlist').send({ bookId: id }),
      request(app).delete(`/api/wishlist/${id}`),
      request(app).post(`/api/wishlist/${id}/move-to-cart`),
    ]);
    for (const response of responses) {
      assert.equal(response.status, 401);
      assert.equal(response.body.error.code, 'AUTHENTICATION_REQUIRED');
    }
  });

  test('is only for CUSTOMER accounts (admins are rejected)', async () => {
    const admin = await createAdminAgent();
    const response = await admin.get('/api/wishlist');
    assert.equal(response.status, 403);
    assert.equal(response.body.error.code, 'FORBIDDEN');
    assert.equal((await admin.post('/api/wishlist').send({ bookId: String(book._id) })).status, 403);
  });

  test('starts empty, adds a book (201) and returns server-side book data', async () => {
    const { agent } = await createCustomer();
    const empty = await agent.get('/api/wishlist');
    assert.equal(empty.status, 200);
    assert.deepEqual(empty.body.wishlist, { items: [], bookIds: [], count: 0 });

    const added = await agent.post('/api/wishlist').send({ bookId: String(book._id), price: 1, stock: 999 });
    assert.equal(added.status, 201);
    assert.equal(added.body.wishlist.count, 1);
    assert.deepEqual(added.body.wishlist.bookIds, [String(book._id)]);
    assert.equal(added.body.wishlist.items[0].title, 'Book One');
    assert.equal(added.body.wishlist.items[0].price, 250, 'price comes from the database, not the request');
    assert.equal(added.body.wishlist.items[0].stock, 5);
    assert.equal(added.body.wishlist.items[0].available, true);
  });

  test('adding the same book twice is idempotent (200, still one entry)', async () => {
    const { agent } = await createCustomer();
    assert.equal((await agent.post('/api/wishlist').send({ bookId: String(book._id) })).status, 201);
    const again = await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    assert.equal(again.status, 200);
    assert.equal(again.body.wishlist.count, 1);
    const stored = await Wishlist.findOne({});
    assert.equal(stored.books.length, 1);
  });

  test('simultaneous duplicate adds still leave one entry', async () => {
    const { agent } = await createCustomer();
    await agent.get('/api/wishlist');
    const results = await Promise.all(
      Array.from({ length: 6 }, () => agent.post('/api/wishlist').send({ bookId: String(book._id) })),
    );
    for (const response of results) assert.ok([200, 201].includes(response.status), `status ${response.status}`);
    assert.equal((await Wishlist.findOne({})).books.length, 1);
  });

  test('removes a book, and removing it again is harmless', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    await agent.post('/api/wishlist').send({ bookId: String(otherBook._id) });
    const removed = await agent.delete(`/api/wishlist/${book._id}`);
    assert.equal(removed.status, 200);
    assert.deepEqual(removed.body.wishlist.bookIds, [String(otherBook._id)]);
    const again = await agent.delete(`/api/wishlist/${book._id}`);
    assert.equal(again.status, 200);
    assert.equal(again.body.wishlist.count, 1);
  });

  test('persists across sessions (log out, log in again)', async () => {
    const { agent, user } = await createCustomer();
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    await agent.post('/api/auth/logout');
    const fresh = request.agent(app);
    const login = await fresh.post('/api/auth/login').send({ email: user.email, password });
    assert.equal(login.status, 200);
    const response = await fresh.get('/api/wishlist');
    assert.deepEqual(response.body.wishlist.bookIds, [String(book._id)]);
  });

  test('keeps each customer\'s wishlist private', async () => {
    const first = await createCustomer('first');
    const second = await createCustomer('second');
    await first.agent.post('/api/wishlist').send({ bookId: String(book._id) });
    assert.equal((await second.agent.get('/api/wishlist')).body.wishlist.count, 0);
    // The second customer cannot remove or move the first customer's entry.
    await second.agent.delete(`/api/wishlist/${book._id}`);
    assert.equal((await first.agent.get('/api/wishlist')).body.wishlist.count, 1);
    const move = await second.agent.post(`/api/wishlist/${book._id}/move-to-cart`);
    assert.equal(move.status, 404);
    assert.equal(move.body.error.code, 'WISHLIST_ITEM_NOT_FOUND');
    assert.equal(await Cart.countDocuments({ user: second.user.id }), 0);
  });

  test('rejects invalid book identifiers with strict validation', async () => {
    const { agent } = await createCustomer();
    for (const bad of ['not-an-id', '123456789012', 'abcdefghijkl', 'zzzzzzzzzzzzzzzzzzzzzzzz']) {
      const response = await agent.post('/api/wishlist').send({ bookId: bad });
      assert.equal(response.status, 400, `bookId ${bad}`);
      assert.equal(response.body.error.code, 'INVALID_BOOK_ID');
    }
    assert.equal((await agent.post('/api/wishlist').send({ bookId: 123 })).status, 400);
    assert.equal((await agent.post('/api/wishlist').send({})).status, 400);
    assert.equal((await agent.delete('/api/wishlist/not-an-id')).status, 400);
    assert.equal((await agent.post('/api/wishlist/not-an-id/move-to-cart')).status, 400);
  });

  test('rejects a nonexistent or inactive book', async () => {
    const { agent } = await createCustomer();
    const missing = await agent.post('/api/wishlist').send({ bookId: String(new mongoose.Types.ObjectId()) });
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'BOOK_NOT_AVAILABLE');
    const inactive = await agent.post('/api/wishlist').send({ bookId: String(inactiveBook._id) });
    assert.equal(inactive.status, 404);
    assert.equal((await Wishlist.countDocuments({})), 0);
  });

  test('allows saving an out-of-stock book and shows it as unavailable', async () => {
    const { agent } = await createCustomer();
    const added = await agent.post('/api/wishlist').send({ bookId: String(outOfStockBook._id) });
    assert.equal(added.status, 201);
    assert.equal(added.body.wishlist.items[0].available, false);
  });

  test('a book deactivated after saving stays visible but unavailable', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    await Book.updateOne({ _id: book._id }, { active: false });
    const response = await agent.get('/api/wishlist');
    assert.equal(response.body.wishlist.count, 1);
    assert.equal(response.body.wishlist.items[0].available, false);
  });
});

describe('OBS-22: move to cart', () => {
  test('moves an available book into the cart and out of the wishlist', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    const response = await agent.post(`/api/wishlist/${book._id}/move-to-cart`);
    assert.equal(response.status, 200);
    assert.equal(response.body.cart.itemCount, 1);
    assert.equal(response.body.cart.items[0].quantity, 1);
    assert.equal(response.body.cart.total, 250);
    assert.equal(response.body.wishlist.count, 0);
  });

  test('keeps an existing cart quantity (3 stays 3, never increments)', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(book._id), quantity: 3 });
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    const response = await agent.post(`/api/wishlist/${book._id}/move-to-cart`);
    assert.equal(response.status, 200);
    assert.equal(response.body.cart.items.length, 1);
    assert.equal(response.body.cart.items[0].quantity, 3);
    assert.equal(response.body.wishlist.count, 0);
  });

  test('fails when the existing cart quantity exceeds current stock, leaving cart and wishlist untouched', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(book._id), quantity: 4 });
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    await Book.updateOne({ _id: book._id }, { stock: 2 });

    const response = await agent.post(`/api/wishlist/${book._id}/move-to-cart`);
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'INSUFFICIENT_STOCK');

    const cart = (await agent.get('/api/cart')).body.cart;
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].quantity, 4, 'existing cart quantity is preserved');
    const wishlist = (await agent.get('/api/wishlist')).body.wishlist;
    assert.deepEqual(wishlist.bookIds, [String(book._id)], 'wishlist entry is left untouched');
  });

  test('an existing cart quantity equal to current stock still moves successfully', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(book._id), quantity: 4 });
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    await Book.updateOne({ _id: book._id }, { stock: 4 });
    const response = await agent.post(`/api/wishlist/${book._id}/move-to-cart`);
    assert.equal(response.status, 200);
    assert.equal(response.body.cart.items[0].quantity, 4);
    assert.equal(response.body.wishlist.count, 0);
  });

  test('a repeated move after success is 404 and changes nothing', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    assert.equal((await agent.post(`/api/wishlist/${book._id}/move-to-cart`)).status, 200);
    const again = await agent.post(`/api/wishlist/${book._id}/move-to-cart`);
    assert.equal(again.status, 404);
    assert.equal(again.body.error.code, 'WISHLIST_ITEM_NOT_FOUND');
    const cart = await agent.get('/api/cart');
    assert.equal(cart.body.cart.items[0].quantity, 1);
  });

  test('simultaneous move requests never duplicate the cart quantity or rows', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    const results = await Promise.all(
      Array.from({ length: 8 }, () => agent.post(`/api/wishlist/${book._id}/move-to-cart`)),
    );
    for (const response of results) assert.ok([200, 404].includes(response.status), `status ${response.status}`);
    assert.ok(results.some((response) => response.status === 200));
    const cart = (await agent.get('/api/cart')).body.cart;
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].quantity, 1);
    assert.equal((await agent.get('/api/wishlist')).body.wishlist.count, 0);
  });

  test('simultaneous moves keep an existing quantity of 3', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(book._id), quantity: 3 });
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    await Promise.all(Array.from({ length: 6 }, () => agent.post(`/api/wishlist/${book._id}/move-to-cart`)));
    const cart = (await agent.get('/api/cart')).body.cart;
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].quantity, 3);
  });

  test('simultaneous moves of different books for a brand-new cart keep both books', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    await agent.post('/api/wishlist').send({ bookId: String(otherBook._id) });
    const results = await Promise.all([
      agent.post(`/api/wishlist/${book._id}/move-to-cart`),
      agent.post(`/api/wishlist/${otherBook._id}/move-to-cart`),
    ]);
    for (const response of results) assert.equal(response.status, 200);
    const cart = (await agent.get('/api/cart')).body.cart;
    assert.equal(cart.items.length, 2);
    assert.deepEqual(cart.items.map((item) => item.quantity), [1, 1]);
  });

  test('an out-of-stock book cannot be moved and stays in the wishlist', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/wishlist').send({ bookId: String(outOfStockBook._id) });
    const response = await agent.post(`/api/wishlist/${outOfStockBook._id}/move-to-cart`);
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'INSUFFICIENT_STOCK');
    assert.equal((await agent.get('/api/wishlist')).body.wishlist.count, 1);
    assert.equal((await agent.get('/api/cart')).body.cart.items.length, 0);
  });

  test('a book deactivated after saving cannot be moved and stays in the wishlist', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    await Book.updateOne({ _id: book._id }, { active: false });
    const response = await agent.post(`/api/wishlist/${book._id}/move-to-cart`);
    assert.equal(response.status, 404);
    assert.equal(response.body.error.code, 'BOOK_NOT_AVAILABLE');
    assert.equal((await agent.get('/api/wishlist')).body.wishlist.count, 1);
  });

  test('stock that drops to zero between saving and moving blocks the move', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    await Book.updateOne({ _id: book._id }, { stock: 0 });
    const response = await agent.post(`/api/wishlist/${book._id}/move-to-cart`);
    assert.equal(response.status, 409);
    assert.equal((await agent.get('/api/wishlist')).body.wishlist.count, 1);
  });

  test('partial failure: cart updated but wishlist entry still present, retry does not change quantity', async () => {
    const { agent, user } = await createCustomer();
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    // Simulate "cart step succeeded, wishlist removal failed": call the cart step directly.
    await ensureCartItem(user.id, { bookId: String(book._id), quantity: 1 });
    assert.equal((await agent.get('/api/wishlist')).body.wishlist.count, 1);
    // Retry the whole move twice: quantity must stay 1.
    assert.equal((await agent.post(`/api/wishlist/${book._id}/move-to-cart`)).status, 200);
    const cart = (await agent.get('/api/cart')).body.cart;
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].quantity, 1);
    assert.equal((await agent.get('/api/wishlist')).body.wishlist.count, 0);
  });

  test('ensureCartItem is idempotent and never lowers or increments a quantity', async () => {
    const { agent, user } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(book._id), quantity: 2 });
    for (let i = 0; i < 3; i += 1) {
      const cart = await ensureCartItem(user.id, { bookId: String(book._id), quantity: 1 });
      assert.equal(cart.items[0].quantity, 2);
    }
    const raised = await ensureCartItem(user.id, { bookId: String(book._id), quantity: 4 });
    assert.equal(raised.items[0].quantity, 4);
    const again = await ensureCartItem(user.id, { bookId: String(book._id), quantity: 4 });
    assert.equal(again.items[0].quantity, 4);
  });
});

describe('OBS-22: hardening (concurrency and partial failure)', () => {
  test('ensureCartItem rejects (409) when the cart already holds more than the stock and changes nothing', async () => {
    const { agent, user } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(book._id), quantity: 4 });
    await Book.updateOne({ _id: book._id }, { stock: 1 });
    const before = await Cart.findOne({ user: user.id }).lean();
    await assert.rejects(
      () => ensureCartItem(user.id, { bookId: String(book._id), quantity: 1 }),
      (error) => error.statusCode === 409 && error.code === 'INSUFFICIENT_STOCK',
    );
    const after = await Cart.findOne({ user: user.id }).lean();
    assert.equal(after.__v, before.__v);
    assert.equal(after.items[0].quantity, 4);
  });

  test('simultaneous first-time cart creation: one cart document, one row, quantity 1', async () => {
    const { user } = await createCustomer();
    assert.equal(await Cart.countDocuments({ user: user.id }), 0);
    const results = await Promise.all(
      Array.from({ length: 10 }, () => ensureCartItem(user.id, { bookId: String(book._id), quantity: 1 })),
    );
    for (const cart of results) {
      assert.equal(cart.items.length, 1);
      assert.equal(cart.items[0].quantity, 1);
    }
    assert.equal(await Cart.countDocuments({ user: user.id }), 1);
    const stored = await Cart.findOne({ user: user.id }).lean();
    assert.equal(stored.items.length, 1);
    assert.equal(stored.items[0].quantity, 1);
  });

  test('simultaneous first-time creation with different books keeps every book exactly once', async () => {
    const { user } = await createCustomer();
    const third = await Book.create(makeBook({ title: 'Book Three', stock: 9 }));
    await Promise.all([book, otherBook, third].map((item) => ensureCartItem(user.id, { bookId: String(item._id), quantity: 1 })));
    assert.equal(await Cart.countDocuments({ user: user.id }), 1);
    const stored = await Cart.findOne({ user: user.id }).lean();
    assert.equal(stored.items.length, 3);
    assert.deepEqual(stored.items.map((item) => item.quantity), [1, 1, 1]);
  });

  test('concurrent move requests for the same book never change an existing quantity of 2', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(book._id), quantity: 2 });
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });
    const results = await Promise.all(
      Array.from({ length: 10 }, () => agent.post(`/api/wishlist/${book._id}/move-to-cart`)),
    );
    for (const response of results) assert.ok([200, 404].includes(response.status), `status ${response.status}`);
    const cart = (await agent.get('/api/cart')).body.cart;
    assert.equal(cart.items.length, 1);
    assert.equal(cart.items[0].quantity, 2);
    assert.equal((await agent.get('/api/wishlist')).body.wishlist.count, 0);
  });

  test('wishlist removal fails after the cart update succeeds: retry succeeds without changing the quantity', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });

    const originalUpdateOne = Wishlist.updateOne;
    let failedOnce = false;
    mock.method(Wishlist, 'updateOne', function patched(...args) {
      if (args[1]?.$pull && !failedOnce) {
        failedOnce = true;
        return Promise.reject(new Error('simulated wishlist removal failure'));
      }
      return originalUpdateOne.apply(this, args);
    });

    try {
      const failed = await agent.post(`/api/wishlist/${book._id}/move-to-cart`);
      assert.equal(failed.status, 500);
      assert.equal(failedOnce, true);
      // Cart step already succeeded; wishlist entry is still there.
      assert.equal((await Cart.findOne({}).lean()).items[0].quantity, 1);
      assert.equal((await Wishlist.findOne({}).lean()).books.length, 1);

      // Retry (the mock now passes through): must succeed and must not add another copy.
      const retry = await agent.post(`/api/wishlist/${book._id}/move-to-cart`);
      assert.equal(retry.status, 200);
      assert.equal(retry.body.cart.items.length, 1);
      assert.equal(retry.body.cart.items[0].quantity, 1);
      assert.equal(retry.body.wishlist.count, 0);
    } finally {
      mock.restoreAll();
    }
  });

  test('the same partial failure with an existing quantity of 3 leaves 3 after the retry', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(book._id), quantity: 3 });
    await agent.post('/api/wishlist').send({ bookId: String(book._id) });

    const originalUpdateOne = Wishlist.updateOne;
    let failedOnce = false;
    mock.method(Wishlist, 'updateOne', function patched(...args) {
      if (args[1]?.$pull && !failedOnce) {
        failedOnce = true;
        return Promise.reject(new Error('simulated wishlist removal failure'));
      }
      return originalUpdateOne.apply(this, args);
    });

    try {
      assert.equal((await agent.post(`/api/wishlist/${book._id}/move-to-cart`)).status, 500);
      const retry = await agent.post(`/api/wishlist/${book._id}/move-to-cart`);
      assert.equal(retry.status, 200);
      assert.equal(retry.body.cart.items[0].quantity, 3);
      assert.equal(retry.body.wishlist.count, 0);
    } finally {
      mock.restoreAll();
    }
  });
});
