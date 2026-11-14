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
import { Review } from '../src/modules/book-catalogue/models/Review.js';
import { Order } from '../src/modules/shopping-orders/models/Order.js';

let mongo;
let category;
let testBook;
let verifiedCustomer;
let regularCustomer;
let adminAgent;

const customerPassword = 'CustomerPass123!';
const adminPassword = 'AdminPass123!';

async function createCustomer(name, emailPrefix) {
  const email = `${emailPrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name,
    email,
    password: customerPassword,
  });
  assert.equal(response.status, 201);
  return { agent, user: response.body.user };
}

async function createAdmin() {
  const email = `admin-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  await User.create({
    name: 'Moderation Admin',
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
    Review.deleteMany({}),
    Order.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);

  category = await Category.create({
    name: 'Fiction',
    slug: 'fiction',
    description: 'Fiction books',
    active: true,
  });

  testBook = await Book.create({
    title: 'Clean Code',
    author: 'Robert C. Martin',
    description: 'A handbook of agile software craftsmanship',
    keywords: ['clean', 'code', 'software'],
    category: category._id,
    price: 350,
    stock: 20,
    active: true,
  });

  verifiedCustomer = await createCustomer('Verified Buyer', 'buyer');
  regularCustomer = await createCustomer('Regular Browser', 'browser');
  adminAgent = await createAdmin();

  // Create an order for verifiedCustomer so they are recognized as a verified purchaser
  await Order.create({
    orderNumber: 'ORD-VERIFIED-001',
    user: verifiedCustomer.user.id,
    status: 'DELIVERED',
    currency: 'INR',
    items: [
      {
        book: testBook._id,
        title: testBook.title,
        unitPrice: testBook.price,
        quantity: 1,
        lineTotal: 350,
      },
    ],
    itemCount: 1,
    subtotal: 350,
    shipping: { id: 'STANDARD', label: 'Standard', amount: 50 },
    tax: { ratePercent: 5, amount: 20 },
    total: 420,
    address: {
      fullName: 'Verified Buyer',
      phone: '+91 98765 43210',
      line1: '123 Baker Street',
      city: 'Bengaluru',
      state: 'Karnataka',
      postalCode: '560001',
      country: 'India',
    },
    payment: {
      method: 'SANDBOX',
      status: 'SUCCEEDED',
      reference: 'SIM-REF-VERIFIED-1',
    },
    statusHistory: [{ status: 'PLACED' }, { status: 'DELIVERED' }],
  });
});

after(async () => {
  await Promise.all([User, Book, Category, Order, Review, AuditLog].map((m) => m.deleteMany({})));
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('OBS-29: Customer Review Submission and Verified Purchase Rules', () => {
  test('authenticates review submission and marks verified buyers with isVerifiedPurchase: true', async () => {
    const bookId = testBook._id.toString();

    const response = await verifiedCustomer.agent
      .post(`/api/books/${bookId}/reviews`)
      .send({
        rating: 5,
        comment: 'Outstanding guide on writing maintainable software.',
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.review.rating, 5);
    assert.equal(response.body.review.isVerifiedPurchase, true);
    assert.equal(response.body.review.status, 'APPROVED');
  });

  test('marks non-purchaser customer reviews with isVerifiedPurchase: false', async () => {
    const bookId = testBook._id.toString();

    const response = await regularCustomer.agent
      .post(`/api/books/${bookId}/reviews`)
      .send({
        rating: 4,
        comment: 'Great book even though I bought it elsewhere!',
      });

    assert.equal(response.status, 201);
    assert.equal(response.body.review.rating, 4);
    assert.equal(response.body.review.isVerifiedPurchase, false);
    assert.equal(response.body.review.status, 'APPROVED');
  });

  test('validates rating constraints (1-5 whole integer) and comment length', async () => {
    const bookId = testBook._id.toString();

    const zeroRating = await regularCustomer.agent
      .post(`/api/books/${bookId}/reviews`)
      .send({ rating: 0, comment: 'Valid comment with enough text.' });
    assert.equal(zeroRating.status, 400);

    const sixRating = await regularCustomer.agent
      .post(`/api/books/${bookId}/reviews`)
      .send({ rating: 6, comment: 'Valid comment with enough text.' });
    assert.equal(sixRating.status, 400);

    const floatRating = await regularCustomer.agent
      .post(`/api/books/${bookId}/reviews`)
      .send({ rating: 4.5, comment: 'Valid comment with enough text.' });
    assert.equal(floatRating.status, 400);

    const shortComment = await regularCustomer.agent
      .post(`/api/books/${bookId}/reviews`)
      .send({ rating: 5, comment: 'Too short' });
    assert.equal(shortComment.status, 400);
  });

  test('prevents duplicate reviews for the same book by the same customer (HTTP 409)', async () => {
    const bookId = testBook._id.toString();

    const firstRes = await verifiedCustomer.agent
      .post(`/api/books/${bookId}/reviews`)
      .send({
        rating: 5,
        comment: 'First review submitted successfully.',
      });
    assert.equal(firstRes.status, 201);

    const dupRes = await verifiedCustomer.agent
      .post(`/api/books/${bookId}/reviews`)
      .send({
        rating: 4,
        comment: 'Second review that should be rejected as duplicate.',
      });
    assert.equal(dupRes.status, 409);
    assert.equal(dupRes.body.error.code, 'DUPLICATE_REVIEW');
  });

  test('allows customer to delete their own review and resubmit', async () => {
    const bookId = testBook._id.toString();

    await verifiedCustomer.agent
      .post(`/api/books/${bookId}/reviews`)
      .send({
        rating: 5,
        comment: 'Review that will be deleted by its author.',
      });

    const deleteRes = await verifiedCustomer.agent
      .delete(`/api/books/${bookId}/reviews/mine`);
    assert.equal(deleteRes.status, 200);

    // After deletion, customer is free to submit a new review
    const resubmitRes = await verifiedCustomer.agent
      .post(`/api/books/${bookId}/reviews`)
      .send({
        rating: 4,
        comment: 'Fresh new review replacing the previous one.',
      });
    assert.equal(resubmitRes.status, 201);
  });
});

describe('OBS-29: Admin Review Moderation & Dynamic Aggregate Rating', () => {
  let verifiedRev;
  let regularRev;

  beforeEach(async () => {
    const bookId = testBook._id.toString();

    const res1 = await verifiedCustomer.agent
      .post(`/api/books/${bookId}/reviews`)
      .send({
        rating: 5,
        comment: 'First constructive verified review.',
      });
    verifiedRev = res1.body.review;

    const res2 = await regularCustomer.agent
      .post(`/api/books/${bookId}/reviews`)
      .send({
        rating: 1,
        comment: 'Inappropriate offensive text that violates standards.',
      });
    regularRev = res2.body.review;
  });

  test('protects admin moderation routes with RBAC', async () => {
    const unauthRes = await request(app).get('/api/admin/reviews');
    assert.equal(unauthRes.status, 401);

    const custRes = await regularCustomer.agent.get('/api/admin/reviews');
    assert.equal(custRes.status, 403);

    const adminRes = await adminAgent.get('/api/admin/reviews');
    assert.equal(adminRes.status, 200);
    assert.equal(adminRes.body.reviews.length, 2);
  });

  test('filters reviews by status for admin moderation', async () => {
    const response = await adminAgent.get('/api/admin/reviews?status=APPROVED');
    assert.equal(response.status, 200);
    assert.equal(response.body.reviews.length, 2);
  });

  test('moderates a review (REJECTED) and removes it from public book reviews and rating', async () => {
    const bookId = testBook._id.toString();

    // Initial state: 2 reviews, average (5 + 1) / 2 = 3.0
    const beforePublic = await request(app).get(`/api/books/${bookId}/reviews`);
    assert.equal(beforePublic.body.reviews.length, 2);
    assert.equal(beforePublic.body.rating.average, 3.0);
    assert.equal(beforePublic.body.rating.count, 2);

    // Admin marks the inappropriate review as REJECTED
    const modRes = await adminAgent
      .patch(`/api/admin/reviews/${regularRev.id}/status`)
      .send({ status: 'REJECTED' });
    assert.equal(modRes.status, 200);
    assert.equal(modRes.body.review.status, 'REJECTED');

    const auditLog = await AuditLog.findOne({ eventType: 'ADMIN_REVIEW_MODERATED' });
    assert.ok(auditLog);

    // Public list now only includes the APPROVED review; average is now 5.0
    const afterPublic = await request(app).get(`/api/books/${bookId}/reviews`);
    assert.equal(afterPublic.body.reviews.length, 1);
    assert.equal(afterPublic.body.reviews[0].id, verifiedRev.id);
    assert.equal(afterPublic.body.rating.average, 5.0);
    assert.equal(afterPublic.body.rating.count, 1);
  });

  test('allows admin to delete an inappropriate review permanently', async () => {
    const deleteRes = await adminAgent.delete(`/api/admin/reviews/${regularRev.id}`);
    assert.equal(deleteRes.status, 200);

    const auditLog = await AuditLog.findOne({ eventType: 'ADMIN_REVIEW_DELETED' });
    assert.ok(auditLog);

    const listRes = await adminAgent.get('/api/admin/reviews');
    assert.equal(listRes.body.reviews.length, 1);
    assert.equal(listRes.body.reviews[0].id, verifiedRev.id);
  });
});
