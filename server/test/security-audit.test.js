
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import app from '../src/app.js';
import { AuditLog } from '../src/modules/authentication-security/models/AuditLog.js';
import { User } from '../src/modules/authentication-security/models/User.js';
import { hashPassword } from '../src/modules/authentication-security/password.js';
import { Book } from '../src/modules/book-catalogue/models/Book.js';
import { Category } from '../src/modules/book-catalogue/models/Category.js';

let mongo;
let category;

const customerPassword = 'CustomerPass123!';
const adminPassword = 'AdminPass123!';

async function createCustomer() {
  const agent = request.agent(app);

  const response = await agent.post('/api/auth/register').send({
    name: 'Audit Customer',
    email: 'customer@example.com',
    password: customerPassword,
  });

  assert.equal(response.status, 201);
  return { agent, user: response.body.user };
}

async function createAdmin() {
  const user = await User.create({
    name: 'Audit Admin',
    email: 'admin@example.com',
    passwordHash: await hashPassword(adminPassword),
    role: 'ADMIN',
  });

  const agent = request.agent(app);

  const response = await agent.post('/api/auth/login').send({
    email: user.email,
    password: adminPassword,
  });

  assert.equal(response.status, 200);
  return { agent, user };
}

async function getEvents(eventType) {
  return AuditLog.find({ eventType }).lean();
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
    AuditLog.deleteMany({}),
    User.deleteMany({}),
    Book.deleteMany({}),
    Category.deleteMany({}),
  ]);

  category = await Category.create({
    name: 'Science',
    slug: 'science',
    description: 'Science literature',
  });
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

describe('OBS-SR-005: Security Event Logging', () => {
  test('records successful login attempts', async () => {
    await createCustomer();

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'customer@example.com',
        password: customerPassword,
      });

    assert.equal(response.status, 200);

    const events = await getEvents('LOGIN_SUCCESS');

    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, 'SUCCESS');
    assert.equal(
      events[0].userId.toString(),
      response.body.user.id,
    );
    assert.ok(events[0].createdAt);
  });

  test('records failed login attempts without passwords', async () => {
    await createCustomer();

    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'customer@example.com',
        password: 'IncorrectPassword123!',
      });

    assert.equal(response.status, 401);

    const events = await getEvents('LOGIN_FAILURE');

    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, 'FAILURE');
    assert.equal(events[0].userId, null);

    const stored = JSON.stringify(events[0]);
    assert.equal(stored.includes('IncorrectPassword123!'), false);
    assert.equal(stored.includes(customerPassword), false);
    assert.equal(stored.includes('customer@example.com'), false);
  });

  test('records successful admin book creation', async () => {
    const { agent, user } = await createAdmin();

    const response = await agent.post('/api/admin/books').send({
      title: 'Audit Test Book',
      author: 'Test Author',
      description: 'Book used for audit tests.',
      price: 50,
      stock: 10,
      category: category._id.toString(),
    });

    assert.equal(response.status, 201);

    const events = await getEvents('ADMIN_BOOK_CREATED');

    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, 'SUCCESS');
    assert.equal(events[0].userId.toString(), user.id);
  });

  test('records successful category creation and updates', async () => {
    const { agent } = await createAdmin();

    const created = await agent.post('/api/admin/categories').send({
      name: 'Mathematics',
      description: 'Mathematics books',
    });

    assert.equal(created.status, 201);

    const updated = await agent
      .patch(`/api/admin/categories/${created.body.category.id}`)
      .send({ name: 'Applied Mathematics' });

    assert.equal(updated.status, 200);

    assert.equal(
      (await getEvents('ADMIN_CATEGORY_CREATED')).length,
      1,
    );

    assert.equal(
      (await getEvents('ADMIN_CATEGORY_UPDATED')).length,
      1,
    );
  });

  test('records forbidden admin access by customers', async () => {
    const { agent, user } = await createCustomer();

    const response = await agent.get('/api/admin/books');

    assert.equal(response.status, 403);

    const events = await getEvents('ACCESS_DENIED');

    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, 'FAILURE');
    assert.equal(events[0].userId.toString(), user.id);
  });

  test('records unauthenticated admin access attempts', async () => {
    const response = await request(app).get('/api/admin/books');

    assert.equal(response.status, 401);

    const events = await getEvents('ACCESS_DENIED');

    assert.equal(events.length, 1);
    assert.equal(events[0].outcome, 'FAILURE');
    assert.equal(events[0].userId, null);
  });

  test('does not store sensitive request information', async () => {
    const { agent } = await createCustomer();

    const response = await agent.get('/api/admin/books');

    assert.equal(response.status, 403);

    const events = await AuditLog.find().lean();

    assert.ok(events.length > 0);

    for (const event of events) {
      const stored = JSON.stringify(event);

      assert.equal(stored.includes(customerPassword), false);
      assert.equal(stored.includes('passwordHash'), false);
      assert.equal(stored.includes('authorization'), false);
      assert.equal(stored.includes('cookie'), false);

      assert.deepEqual(
        Object.keys(event).sort(),
        [
          '_id',
          '__v',
          'createdAt',
          'eventType',
          'ipAddress',
          'outcome',
          'userId',
        ].sort(),
      );
    }
  });
});
