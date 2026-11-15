import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app.js';
import { hashPassword } from '../src/modules/authentication-security/password.js';
import { User } from '../src/modules/authentication-security/models/User.js';
import { AuditLog } from '../src/modules/authentication-security/models/AuditLog.js';
import { Book } from '../src/modules/book-catalogue/models/Book.js';
import { Category } from '../src/modules/book-catalogue/models/Category.js';
import { Order } from '../src/modules/shopping-orders/models/Order.js';

let mongo;
let category;
let testBook;
let customerUser;
let customerAgent;
let adminAgent;

const customerPassword = 'CustomerPass123!';
const adminPassword = 'AdminPass123!';

async function createCustomer() {
  const email = `customer-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: 'Test Customer',
    email,
    password: customerPassword,
  });
  assert.equal(response.status, 201);
  return { agent, user: response.body.user };
}

async function createAdmin() {
  const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await User.create({
    name: 'Test Admin',
    email,
    passwordHash: await hashPassword(adminPassword),
    role: 'ADMIN',
  });
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({
    email,
    password: adminPassword,
  });
  assert.equal(response.status, 200);
  return agent;
}

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
    Order.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);

  category = await Category.create({
    name: 'Technology',
    slug: 'technology',
    description: 'Tech books',
    active: true,
  });

  testBook = await Book.create({
    title: 'The Pragmatic Programmer',
    author: 'David Thomas',
    description: 'From journeyman to master',
    keywords: ['software', 'programming'],
    category: category._id,
    price: 499,
    stock: 10,
    active: true,
  });

  const customerData = await createCustomer();
  customerUser = customerData.user;
  customerAgent = customerData.agent;
  adminAgent = await createAdmin();
});

after(async () => {
  await Promise.all([User, Book, Category, Order, AuditLog].map((m) => m.deleteMany({})));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('OBS-30: Role-Based Access Control for Fulfillment & Restocking', () => {
  test('rejects unauthenticated requests with HTTP 401', async () => {
    const bookId = testBook._id.toString();
    const restockRes = await request(app)
      .post(`/api/admin/books/${bookId}/restock`)
      .send({ quantity: 5 });
    assert.equal(restockRes.status, 401);

    const ordersRes = await request(app).get('/api/admin/orders');
    assert.equal(ordersRes.status, 401);

    const summaryRes = await request(app).get('/api/admin/orders/summary');
    assert.equal(summaryRes.status, 401);

    const statusRes = await request(app)
      .patch(`/api/admin/orders/${new mongoose.Types.ObjectId()}/status`)
      .send({ status: 'SHIPPED' });
    assert.equal(statusRes.status, 401);
  });

  test('rejects customer requests with HTTP 403', async () => {
    const bookId = testBook._id.toString();
    const restockRes = await customerAgent
      .post(`/api/admin/books/${bookId}/restock`)
      .send({ quantity: 5 });
    assert.equal(restockRes.status, 403);

    const ordersRes = await customerAgent.get('/api/admin/orders');
    assert.equal(ordersRes.status, 403);

    const summaryRes = await customerAgent.get('/api/admin/orders/summary');
    assert.equal(summaryRes.status, 403);

    const statusRes = await customerAgent
      .patch(`/api/admin/orders/${new mongoose.Types.ObjectId()}/status`)
      .send({ status: 'SHIPPED' });
    assert.equal(statusRes.status, 403);
  });
});

describe('OBS-30: Book Inventory Restocking', () => {
  test('increments book stock correctly for a valid positive integer quantity', async () => {
    const bookId = testBook._id.toString();
    const response = await adminAgent
      .post(`/api/admin/books/${bookId}/restock`)
      .send({ quantity: 15 });

    assert.equal(response.status, 200);
    assert.equal(response.body.book.stock, 25);

    const updatedBook = await Book.findById(testBook._id);
    assert.equal(updatedBook.stock, 25);

    const auditLog = await AuditLog.findOne({ eventType: 'ADMIN_BOOK_RESTOCKED' });
    assert.ok(auditLog);
    assert.equal(auditLog.outcome, 'SUCCESS');
  });

  test('validates restock quantity and rejects zero, negative, and non-integer values with HTTP 400', async () => {
    const bookId = testBook._id.toString();

    const zeroRes = await adminAgent
      .post(`/api/admin/books/${bookId}/restock`)
      .send({ quantity: 0 });
    assert.equal(zeroRes.status, 400);

    const negativeRes = await adminAgent
      .post(`/api/admin/books/${bookId}/restock`)
      .send({ quantity: -5 });
    assert.equal(negativeRes.status, 400);

    const floatRes = await adminAgent
      .post(`/api/admin/books/${bookId}/restock`)
      .send({ quantity: 2.5 });
    assert.equal(floatRes.status, 400);

    const missingRes = await adminAgent
      .post(`/api/admin/books/${bookId}/restock`)
      .send({});
    assert.equal(missingRes.status, 400);
  });

  test('rejects invalid book identifier with HTTP 400 and nonexistent book with HTTP 404', async () => {
    const invalidIdRes = await adminAgent
      .post('/api/admin/books/invalid-id/restock')
      .send({ quantity: 5 });
    assert.equal(invalidIdRes.status, 400);

    const nonexistentId = new mongoose.Types.ObjectId().toString();
    const notFoundRes = await adminAgent
      .post(`/api/admin/books/${nonexistentId}/restock`)
      .send({ quantity: 5 });
    assert.equal(notFoundRes.status, 404);
  });

  test('atomically increments stock without lost updates under concurrent restock requests', async () => {
    const freshBook = await Book.create({
      title: 'Concurrency Test Book',
      author: 'Author',
      price: 200,
      stock: 10,
      active: true,
      category: category._id,
    });
    const bookId = freshBook._id.toString();

    const restockPromises = Array.from({ length: 5 }, () =>
      adminAgent.post(`/api/admin/books/${bookId}/restock`).send({ quantity: 10 })
    );

    const responses = await Promise.all(restockPromises);
    for (const res of responses) {
      assert.equal(res.status, 200);
    }

    const updated = await Book.findById(freshBook._id);
    assert.equal(updated.stock, 60);
  });
});

describe('OBS-30: Order Fulfillment Management', () => {
  async function seedOrders() {
    const placedOrder = await Order.create({
      orderNumber: 'ORD-TEST-001',
      user: customerUser.id,
      status: 'PLACED',
      currency: 'INR',
      items: [
        {
          book: testBook._id,
          title: testBook.title,
          unitPrice: testBook.price,
          quantity: 2,
          lineTotal: 998,
        },
      ],
      itemCount: 2,
      subtotal: 998,
      shipping: { id: 'STANDARD', label: 'Standard', amount: 50 },
      tax: { ratePercent: 5, amount: 50 },
      total: 1098,
      address: {
        fullName: 'Test Customer',
        phone: '+91 99999 88888',
        line1: '123 MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'India',
      },
      payment: {
        method: 'SANDBOX',
        status: 'SUCCEEDED',
        reference: 'SIM-REF-001',
      },
      statusHistory: [{ status: 'PLACED', at: new Date() }],
    });

    const shippedOrder = await Order.create({
      orderNumber: 'ORD-TEST-002',
      user: customerUser.id,
      status: 'SHIPPED',
      currency: 'INR',
      items: [
        {
          book: testBook._id,
          title: testBook.title,
          unitPrice: testBook.price,
          quantity: 1,
          lineTotal: 499,
        },
      ],
      itemCount: 1,
      subtotal: 499,
      shipping: { id: 'STANDARD', label: 'Standard', amount: 50 },
      tax: { ratePercent: 5, amount: 25 },
      total: 574,
      address: {
        fullName: 'Test Customer',
        phone: '+91 99999 88888',
        line1: '123 MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'India',
      },
      payment: {
        method: 'SANDBOX',
        status: 'SUCCEEDED',
        reference: 'SIM-REF-002',
      },
      statusHistory: [
        { status: 'PLACED', at: new Date(Date.now() - 3600000) },
        { status: 'SHIPPED', at: new Date() },
      ],
    });

    const cancelledOrder = await Order.create({
      orderNumber: 'ORD-TEST-003',
      user: customerUser.id,
      status: 'CANCELLED',
      currency: 'INR',
      items: [
        {
          book: testBook._id,
          title: testBook.title,
          unitPrice: testBook.price,
          quantity: 1,
          lineTotal: 499,
        },
      ],
      itemCount: 1,
      subtotal: 499,
      shipping: { id: 'STANDARD', label: 'Standard', amount: 50 },
      tax: { ratePercent: 5, amount: 25 },
      total: 574,
      address: {
        fullName: 'Test Customer',
        phone: '+91 99999 88888',
        line1: '123 MG Road',
        city: 'Bengaluru',
        state: 'Karnataka',
        postalCode: '560001',
        country: 'India',
      },
      payment: {
        method: 'SANDBOX',
        status: 'REFUNDED',
        reference: 'SIM-REF-003',
      },
      statusHistory: [
        { status: 'PLACED', at: new Date(Date.now() - 7200000) },
        { status: 'CANCELLED', at: new Date() },
      ],
      cancelledAt: new Date(),
    });

    return { placedOrder, shippedOrder, cancelledOrder };
  }

  test('lists all customer orders for admin with pagination', async () => {
    await seedOrders();

    const response = await adminAgent.get('/api/admin/orders');
    assert.equal(response.status, 200);
    assert.equal(response.body.orders.length, 3);
    assert.equal(response.body.pagination.total, 3);
    assert.ok(response.body.orders[0].customer);
    assert.equal(response.body.orders[0].customer.name, 'Test Customer');
  });

  test('filters orders by fulfillment status', async () => {
    await seedOrders();

    const placedRes = await adminAgent.get('/api/admin/orders?status=PLACED');
    assert.equal(placedRes.status, 200);
    assert.equal(placedRes.body.orders.length, 1);
    assert.equal(placedRes.body.orders[0].status, 'PLACED');

    const shippedRes = await adminAgent.get('/api/admin/orders?status=SHIPPED');
    assert.equal(shippedRes.status, 200);
    assert.equal(shippedRes.body.orders.length, 1);
    assert.equal(shippedRes.body.orders[0].status, 'SHIPPED');

    const cancelledRes = await adminAgent.get('/api/admin/orders?status=CANCELLED');
    assert.equal(cancelledRes.status, 200);
    assert.equal(cancelledRes.body.orders.length, 1);
    assert.equal(cancelledRes.body.orders[0].status, 'CANCELLED');
  });

  test('returns order summary and sales overview', async () => {
    await seedOrders();

    const response = await adminAgent.get('/api/admin/orders/summary');
    assert.equal(response.status, 200);
    assert.equal(response.body.summary.totalOrders, 3);
    // Revenue is calculated for non-cancelled orders: 1098 + 574 = 1672
    assert.equal(response.body.summary.totalRevenue, 1672);
    assert.equal(response.body.summary.statusCounts.PLACED, 1);
    assert.equal(response.body.summary.statusCounts.SHIPPED, 1);
    assert.equal(response.body.summary.statusCounts.CANCELLED, 1);
    assert.equal(response.body.summary.statusCounts.DELIVERED, 0);
  });

  test('retrieves single order details by id', async () => {
    const { placedOrder } = await seedOrders();

    const response = await adminAgent.get(`/api/admin/orders/${placedOrder._id}`);
    assert.equal(response.status, 200);
    assert.equal(response.body.order.orderNumber, 'ORD-TEST-001');
    assert.equal(response.body.order.status, 'PLACED');
    assert.equal(response.body.order.items.length, 1);

    const notFoundRes = await adminAgent.get(`/api/admin/orders/${new mongoose.Types.ObjectId()}`);
    assert.equal(notFoundRes.status, 404);

    const invalidRes = await adminAgent.get('/api/admin/orders/invalid-id');
    assert.equal(invalidRes.status, 400);
  });

  test('updates order fulfillment status along valid transitions (PLACED -> SHIPPED -> DELIVERED)', async () => {
    const { placedOrder } = await seedOrders();

    // PLACED -> SHIPPED
    const shipRes = await adminAgent
      .patch(`/api/admin/orders/${placedOrder._id}/status`)
      .send({ status: 'SHIPPED' });
    assert.equal(shipRes.status, 200);
    assert.equal(shipRes.body.order.status, 'SHIPPED');

    const shippedAudit = await AuditLog.findOne({ eventType: 'ADMIN_ORDER_STATUS_UPDATED' });
    assert.ok(shippedAudit);

    // SHIPPED -> DELIVERED
    const deliverRes = await adminAgent
      .patch(`/api/admin/orders/${placedOrder._id}/status`)
      .send({ status: 'DELIVERED' });
    assert.equal(deliverRes.status, 200);
    assert.equal(deliverRes.body.order.status, 'DELIVERED');
  });

  test('rejects invalid status transitions and modifications to cancelled orders with HTTP 409', async () => {
    const { placedOrder, shippedOrder, cancelledOrder } = await seedOrders();

    // Skipping transition: PLACED directly to DELIVERED
    const skipRes = await adminAgent
      .patch(`/api/admin/orders/${placedOrder._id}/status`)
      .send({ status: 'DELIVERED' });
    assert.equal(skipRes.status, 409);

    // Backward transition: SHIPPED back to PLACED is rejected by schema / transition
    const backwardRes = await adminAgent
      .patch(`/api/admin/orders/${shippedOrder._id}/status`)
      .send({ status: 'PLACED' });
    assert.equal(backwardRes.status, 400); // Schema only accepts SHIPPED or DELIVERED

    // Cancelled order cannot be changed
    const cancelChangeRes = await adminAgent
      .patch(`/api/admin/orders/${cancelledOrder._id}/status`)
      .send({ status: 'SHIPPED' });
    assert.equal(cancelChangeRes.status, 409);
  });
});
