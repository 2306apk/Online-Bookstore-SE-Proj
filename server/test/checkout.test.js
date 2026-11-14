import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app.js';
import { User } from '../src/modules/authentication-security/models/User.js';
import { hashPassword } from '../src/modules/authentication-security/password.js';
import { Book } from '../src/modules/book-catalogue/models/Book.js';
import { Category } from '../src/modules/book-catalogue/models/Category.js';
import { Cart } from '../src/modules/shopping-orders/models/Cart.js';
import { checkoutPricing } from '../src/modules/shopping-orders/checkout.config.js';
import { buildCheckoutSummary } from '../src/modules/shopping-orders/checkout.service.js';

let mongo;
let category;
let bookOne;
let bookTwo;

const password = 'CustomerPass123!';

const validBody = (overrides = {}) => ({
  fullName: 'Anwitha Potluri',
  phone: '+91 98765 43210',
  line1: '12, MG Road, Flat 4/B',
  line2: 'Near City Mall',
  city: 'Bengaluru',
  state: 'Karnataka',
  postalCode: '560001',
  country: 'India',
  shippingOption: 'STANDARD',
  ...overrides,
});

async function createCustomer(label = 'a') {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: 'Checkout Tester',
    email: `checkout-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
    password,
  });
  assert.equal(response.status, 201);
  return { agent, user: response.body.user };
}

async function createAdminAgent() {
  const email = `checkout-admin-${Date.now()}@example.com`;
  await User.create({ name: 'Admin', email, passwordHash: await hashPassword(password), role: 'ADMIN' });
  const agent = request.agent(app);
  assert.equal((await agent.post('/api/auth/login').send({ email, password })).status, 200);
  return agent;
}

const makeBook = (overrides) => ({
  title: 'Checkout Book',
  author: 'Test Author',
  description: 'For checkout tests.',
  keywords: ['test'],
  price: 100,
  stock: 10,
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
  await Promise.all([User.deleteMany({}), Book.deleteMany({}), Category.deleteMany({}), Cart.deleteMany({})]);
  category = await Category.create({ name: 'Checkout Cat', slug: 'checkout-cat', description: 'Checkout tests' });
  [bookOne, bookTwo] = await Book.create([
    makeBook({ title: 'Book One', author: 'Ada', price: 250, stock: 5 }),
    makeBook({ title: 'Book Two', author: 'Grace', price: 120, stock: 3 }),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('OBS-25: checkout access control', () => {
  test('requires authentication', async () => {
    for (const response of await Promise.all([
      request(app).get('/api/checkout/options'),
      request(app).post('/api/checkout/summary').send(validBody()),
    ])) {
      assert.equal(response.status, 401);
      assert.equal(response.body.error.code, 'AUTHENTICATION_REQUIRED');
    }
  });

  test('is only for CUSTOMER accounts', async () => {
    const admin = await createAdminAgent();
    assert.equal((await admin.get('/api/checkout/options')).status, 403);
    assert.equal((await admin.post('/api/checkout/summary').send(validBody())).status, 403);
  });

  test('lists the configured checkout options', async () => {
    const { agent } = await createCustomer();
    const response = await agent.get('/api/checkout/options');
    assert.equal(response.status, 200);
    assert.equal(response.body.options.currency, checkoutPricing.currency);
    assert.equal(response.body.options.taxRatePercent, checkoutPricing.taxRatePercent);
    assert.deepEqual(
      response.body.options.shippingOptions.map((option) => option.id),
      checkoutPricing.shippingOptions.map((option) => option.id),
    );
  });
});

describe('OBS-25: empty cart and cart problems', () => {
  test('rejects checkout when there is no cart yet (409 CART_EMPTY)', async () => {
    const { agent } = await createCustomer();
    const response = await agent.post('/api/checkout/summary').send(validBody());
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'CART_EMPTY');
  });

  test('rejects checkout when the cart was emptied', async () => {
    const { agent, user } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(bookOne._id), quantity: 1 });
    await Cart.updateOne({ user: user.id }, { $set: { items: [] } });
    const response = await agent.post('/api/checkout/summary').send(validBody());
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'CART_EMPTY');
  });

  test('reports a book that is no longer available', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(bookOne._id), quantity: 1 });
    await Book.updateOne({ _id: bookOne._id }, { active: false });
    const response = await agent.post('/api/checkout/summary').send(validBody());
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'CHECKOUT_CART_INVALID');
    assert.equal(response.body.error.details.issues[0].code, 'BOOK_NOT_AVAILABLE');
  });

  test('reports when stock has dropped below the cart quantity', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(bookOne._id), quantity: 4 });
    await Book.updateOne({ _id: bookOne._id }, { stock: 2 });
    const response = await agent.post('/api/checkout/summary').send(validBody());
    assert.equal(response.status, 409);
    assert.equal(response.body.error.code, 'CHECKOUT_CART_INVALID');
    const [issue] = response.body.error.details.issues;
    assert.equal(issue.code, 'INSUFFICIENT_STOCK');
    assert.equal(issue.requested, 4);
    assert.equal(issue.available, 2);
  });
});

describe('OBS-25: delivery address validation', () => {
  async function customerWithCart() {
    const customer = await createCustomer();
    await customer.agent.post('/api/cart').send({ bookId: String(bookOne._id), quantity: 1 });
    return customer;
  }

  test('rejects an empty body and names every missing field', async () => {
    const { agent } = await customerWithCart();
    const response = await agent.post('/api/checkout/summary').send({});
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
    for (const field of ['fullName', 'phone', 'line1', 'city', 'state', 'postalCode', 'country', 'shippingOption']) {
      assert.ok(response.body.error.details[field], `${field} should be reported`);
    }
    assert.equal(response.body.error.details.line2, undefined, 'address line 2 is optional');
  });

  test('rejects each invalid field with a field-level message', async () => {
    const { agent } = await customerWithCart();
    const cases = {
      fullName: 'A',
      phone: '12345',
      line1: 'ab',
      city: '!!',
      state: '#',
      postalCode: '1',
      country: '1',
    };
    for (const [field, value] of Object.entries(cases)) {
      const response = await agent.post('/api/checkout/summary').send(validBody({ [field]: value }));
      assert.equal(response.status, 400, `${field}=${value}`);
      assert.ok(response.body.error.details[field], `${field} should be reported`);
    }
  });

  test('accepts addresses from other countries (no India-only restriction)', async () => {
    const { agent } = await customerWithCart();
    const samples = [
      { postalCode: '10001', country: 'United States', phone: '+1 (212) 555-0147', state: 'New York', city: 'New York' },
      { postalCode: 'SW1A 1AA', country: 'United Kingdom', phone: '+44 20 7946 0958', state: 'England', city: 'London' },
      { postalCode: '411001', country: 'India', phone: '9876543210', state: 'Maharashtra', city: 'Pune' },
    ];
    for (const sample of samples) {
      const response = await agent.post('/api/checkout/summary').send(validBody(sample));
      assert.equal(response.status, 200, `${sample.country}: ${JSON.stringify(response.body)}`);
      assert.equal(response.body.summary.address.country, sample.country);
    }
  });

  test('address line 2 is optional and trimmed values are echoed back', async () => {
    const { agent } = await customerWithCart();
    const response = await agent.post('/api/checkout/summary').send(validBody({ line2: undefined, fullName: '  Anwitha Potluri  ' }));
    assert.equal(response.status, 200);
    assert.equal(response.body.summary.address.line2, '');
    assert.equal(response.body.summary.address.fullName, 'Anwitha Potluri');
  });

  test('rejects an unknown shipping option', async () => {
    const { agent } = await customerWithCart();
    const response = await agent.post('/api/checkout/summary').send(validBody({ shippingOption: 'TELEPORT' }));
    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'INVALID_SHIPPING_OPTION');
  });
});

describe('OBS-25: server-calculated summary', () => {
  test('itemises the cart using database prices and ignores anything the client sends', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(bookOne._id), quantity: 2 });
    await agent.post('/api/cart').send({ bookId: String(bookTwo._id), quantity: 1 });

    const response = await agent.post('/api/checkout/summary').send({
      ...validBody(),
      total: 1,
      subtotal: 1,
      items: [{ bookId: String(bookOne._id), unitPrice: 1, quantity: 99 }],
      tax: { amount: 0 },
    });
    assert.equal(response.status, 200);
    const { summary } = response.body;
    assert.equal(summary.isPreview, true);
    assert.equal(summary.items.length, 2);
    assert.deepEqual(summary.items.map((item) => [item.title, item.unitPrice, item.quantity, item.lineTotal]), [
      ['Book One', 250, 2, 500],
      ['Book Two', 120, 1, 120],
    ]);
    assert.equal(summary.itemCount, 3);
    assert.equal(summary.subtotal, 620);
    assert.equal(summary.total, 620 + summary.shipping.amount + summary.tax.amount);
  });

  test('uses the current catalogue price, not the price when the book was added', async () => {
    const { agent } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(bookOne._id), quantity: 2 });
    await Book.updateOne({ _id: bookOne._id }, { price: 300 });
    const response = await agent.post('/api/checkout/summary').send(validBody());
    assert.equal(response.body.summary.subtotal, 600);
  });

  test('calculates shipping and tax from configuration (rounded in minor units)', async () => {
    const { agent, user } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(bookOne._id), quantity: 2 });
    await agent.post('/api/cart').send({ bookId: String(bookTwo._id), quantity: 1 });
    const address = { fullName: 'A B', phone: '9876543210', line1: '12 MG Road', city: 'Pune', state: 'MH', postalCode: '411001', country: 'India' };

    // subtotal 620.00 + shipping 49.50 + 5% tax on books (31.00) = 700.50
    const books = await buildCheckoutSummary(user.id, { address, shippingOption: 'FAST' }, {
      currency: 'INR', taxRatePercent: 5, taxAppliesToShipping: false,
      shippingOptions: [{ id: 'FAST', label: 'Fast', fee: 49.5 }],
    });
    assert.equal(books.subtotal, 620);
    assert.equal(books.shipping.amount, 49.5);
    assert.equal(books.tax.amount, 31);
    assert.equal(books.total, 700.5);

    // tax also applied to shipping: 5% of 669.50 = 33.475 -> 33.48 (rounded to the nearest paisa)
    const withShipping = await buildCheckoutSummary(user.id, { address, shippingOption: 'FAST' }, {
      currency: 'INR', taxRatePercent: 5, taxAppliesToShipping: true,
      shippingOptions: [{ id: 'FAST', label: 'Fast', fee: 49.5 }],
    });
    assert.equal(withShipping.tax.amount, 33.48);
    assert.equal(withShipping.total, 620 + 49.5 + 33.48);
  });

  test('avoids floating-point drift on awkward prices', async () => {
    const { agent, user } = await createCustomer();
    const awkward = await Book.create(makeBook({ title: 'Awkward', price: 19.99, stock: 9 }));
    await agent.post('/api/cart').send({ bookId: String(awkward._id), quantity: 3 });
    const summary = await buildCheckoutSummary(
      user.id,
      { address: { fullName: 'A B', phone: '9876543210', line1: '12 MG Road', city: 'Pune', state: 'MH', postalCode: '411001', country: 'India' }, shippingOption: 'STANDARD' },
      { currency: 'INR', taxRatePercent: 18, taxAppliesToShipping: false, shippingOptions: [{ id: 'STANDARD', label: 'Standard', fee: 0 }] },
    );
    assert.equal(summary.subtotal, 59.97);
    assert.equal(summary.tax.amount, 10.79); // 10.7946 rounded
    assert.equal(summary.total, 70.76);
  });

  test('keeps each customer\'s summary to their own cart', async () => {
    const first = await createCustomer('first');
    const second = await createCustomer('second');
    await first.agent.post('/api/cart').send({ bookId: String(bookOne._id), quantity: 1 });
    await second.agent.post('/api/cart').send({ bookId: String(bookTwo._id), quantity: 2 });
    const response = await second.agent.post('/api/checkout/summary').send(validBody());
    assert.deepEqual(response.body.summary.items.map((item) => item.title), ['Book Two']);
    assert.equal(response.body.summary.subtotal, 240);
  });

  test('is a read-only preview: no stock change, no cart change, no order created', async () => {
    const { agent, user } = await createCustomer();
    await agent.post('/api/cart').send({ bookId: String(bookOne._id), quantity: 2 });
    const stockBefore = (await Book.findById(bookOne._id).lean()).stock;
    const cartBefore = await Cart.findOne({ user: user.id }).lean();

    for (let i = 0; i < 3; i += 1) {
      assert.equal((await agent.post('/api/checkout/summary').send(validBody())).status, 200);
    }

    assert.equal((await Book.findById(bookOne._id).lean()).stock, stockBefore);
    const cartAfter = await Cart.findOne({ user: user.id }).lean();
    assert.equal(cartAfter.__v, cartBefore.__v);
    assert.deepEqual(cartAfter.items.map((item) => [String(item.book), item.quantity]), cartBefore.items.map((item) => [String(item.book), item.quantity]));
    const { Order } = await import('../src/modules/shopping-orders/models/Order.js');
    assert.equal(await Order.countDocuments(), 0, 'checkout preview must not create an order');
  });
});
