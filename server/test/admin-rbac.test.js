import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';
import app from '../src/app.js';
import { hashPassword } from '../src/modules/authentication-security/password.js';
import { User } from '../src/modules/authentication-security/models/User.js';
import { Book } from '../src/modules/book-catalogue/models/Book.js';
import { Category } from '../src/modules/book-catalogue/models/Category.js';

let mongo;
let category;
let activeBook;

const customerPassword = 'CustomerPass123!';
const adminPassword = 'AdminPass123!';

async function createCustomer(email = `customer-${Date.now()}@example.com`) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: 'RBAC Customer',
    email,
    password: customerPassword,
  });
  assert.equal(response.status, 201);
  return { agent, user: response.body.user, email };
}

async function createAdmin() {
  const email = `admin-${Date.now()}@example.com`;
  await User.create({
    name: 'RBAC Admin',
    email,
    passwordHash: await hashPassword(adminPassword),
    role: 'ADMIN',
  });
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/login').send({ email, password: adminPassword });
  assert.equal(response.status, 200);
  return agent;
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Book.deleteMany({}), Category.deleteMany({})]);
  category = await Category.create({ name: 'Science', slug: 'science', description: 'Science literature' });
  activeBook = await Book.create({
    title: 'Quantum Foundations',
    author: 'Erwin Schrodinger',
    description: 'Foundations of quantum mechanics.',
    keywords: ['physics', 'quantum'],
    price: 45,
    stock: 10,
    active: true,
    category: category._id,
  });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('OBS-SR-002: Role-Based Access Control (RBAC) Enforcement', () => {
  test('unauthenticated guests receive HTTP 401 across all admin endpoints', async () => {
    const endpoints = [
      { method: 'get', path: '/api/admin/books' },
      { method: 'post', path: '/api/admin/books' },
      { method: 'patch', path: `/api/admin/books/${activeBook._id}` },
      { method: 'delete', path: `/api/admin/books/${activeBook._id}` },
      { method: 'get', path: '/api/admin/categories' },
      { method: 'post', path: '/api/admin/categories' },
      { method: 'patch', path: `/api/admin/categories/${category._id}` },
    ];

    for (const { method, path } of endpoints) {
      const response = await request(app)[method](path);
      assert.equal(response.status, 401, `Expected 401 for unauthenticated ${method.toUpperCase()} ${path}`);
    }
  });

  test('authenticated customers receive HTTP 403 across all admin endpoints', async () => {
    const { agent } = await createCustomer();
    const endpoints = [
      { method: 'get', path: '/api/admin/books' },
      { method: 'post', path: '/api/admin/books', body: { title: 'Unauthorized Book' } },
      { method: 'patch', path: `/api/admin/books/${activeBook._id}`, body: { price: 99 } },
      { method: 'delete', path: `/api/admin/books/${activeBook._id}` },
      { method: 'get', path: '/api/admin/categories' },
      { method: 'post', path: '/api/admin/categories', body: { name: 'Unauthorized Category' } },
      { method: 'patch', path: `/api/admin/categories/${category._id}`, body: { name: 'Changed' } },
    ];

    for (const { method, path, body } of endpoints) {
      const requestBuilder = agent[method](path);
      if (body) requestBuilder.send(body);
      const response = await requestBuilder;
      assert.equal(response.status, 403, `Expected 403 for customer ${method.toUpperCase()} ${path}`);
    }
  });

  test('authenticated ADMIN users can access and manage admin endpoints', async () => {
    const admin = await createAdmin();

    const booksRes = await admin.get('/api/admin/books');
    assert.equal(booksRes.status, 200);
    assert.equal(booksRes.body.books.length, 1);

    const categoriesRes = await admin.get('/api/admin/categories');
    assert.equal(categoriesRes.status, 200);
    assert.equal(categoriesRes.body.categories.length, 1);

    const newCategoryRes = await admin.post('/api/admin/categories').send({
      name: 'Mathematics',
      description: 'Pure and applied mathematics',
    });
    assert.equal(newCategoryRes.status, 201);
    const mathCategory = newCategoryRes.body.category;

    const newBookRes = await admin.post('/api/admin/books').send({
      title: 'Linear Algebra Done Right',
      author: 'Sheldon Axler',
      description: 'A mathematics textbook on linear algebra.',
      keywords: ['math', 'algebra'],
      price: 52.0,
      stock: 12,
      category: mathCategory.id,
      active: true,
    });
    assert.equal(newBookRes.status, 201);
    const createdBook = newBookRes.body.book;

    const updateBookRes = await admin.patch(`/api/admin/books/${createdBook.id}`).send({
      price: 55.0,
    });
    assert.equal(updateBookRes.status, 200);
    assert.equal(updateBookRes.body.book.price, 55.0);

    const deactivateRes = await admin.delete(`/api/admin/books/${createdBook.id}`);
    assert.equal(deactivateRes.status, 200);
    assert.equal(deactivateRes.body.book.active, false);
  });

  test('rejects malformed or invalid admin payloads with HTTP 400', async () => {
    const admin = await createAdmin();

    const emptyBook = await admin.post('/api/admin/books').send({});
    assert.equal(emptyBook.status, 400);

    const invalidPrice = await admin.post('/api/admin/books').send({
      title: 'Invalid Book',
      author: 'Unknown Author',
      price: -10,
      stock: 5,
      category: category._id.toString(),
    });
    assert.equal(invalidPrice.status, 400);

    const emptyCategory = await admin.post('/api/admin/categories').send({ name: '' });
    assert.equal(emptyCategory.status, 400);
  });
});
