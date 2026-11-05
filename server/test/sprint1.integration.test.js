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
import { Cart } from '../src/modules/shopping-orders/models/Cart.js';

let mongo;
let category;
let availableBook;
let outOfStockBook;
let inactiveBook;

const customerPassword = 'CustomerPass123!';
const adminPassword = 'AdminPass123!';

async function createCustomer(email = `customer-${Date.now()}@example.com`) {
  const agent = request.agent(app);
  const response = await agent.post('/api/auth/register').send({
    name: 'Test Customer',
    email,
    password: customerPassword,
  });
  assert.equal(response.status, 201);
  return { agent, user: response.body.user, email };
}

async function createAdmin() {
  const email = `admin-${Date.now()}@example.com`;
  await User.create({
    name: 'Test Admin',
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
  await Promise.all([User.deleteMany({}), Book.deleteMany({}), Category.deleteMany({}), Cart.deleteMany({})]);
  category = await Category.create({ name: 'Technology', slug: 'technology', description: 'Technology books' });
  [availableBook, outOfStockBook, inactiveBook] = await Book.create([
    {
      title: 'Reliable Systems',
      author: 'Ada Lovelace',
      description: 'A practical guide to robust systems.',
      keywords: ['distributed', 'engineering'],
      price: 25,
      stock: 4,
      active: true,
      category: category._id,
    },
    {
      title: 'Empty Shelf',
      author: 'Grace Hopper',
      description: 'This development book is out of stock.',
      keywords: ['technology'],
      price: 18,
      stock: 0,
      active: true,
      category: category._id,
    },
    {
      title: 'Hidden Book',
      author: 'Unavailable Author',
      description: 'This record is intentionally inactive.',
      keywords: ['hidden'],
      price: 12,
      stock: 5,
      active: false,
      category: category._id,
    },
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

describe('TC-AUTH-01, TC-AUTH-02, TC-AUTH-03 and TC-SEC-01: authentication', () => {
  test('registers a customer, rejects duplicates and stores only a hash', async () => {
    const agent = request.agent(app);
    const registration = await agent.post('/api/auth/register').send({
      name: 'A New Reader',
      email: 'reader@example.com',
      password: customerPassword,
    });

    assert.equal(registration.status, 201);
    assert.equal(registration.body.user.email, 'reader@example.com');
    assert.equal(registration.body.user.passwordHash, undefined);

    const storedUser = await User.findOne({ email: 'reader@example.com' }).select('+passwordHash');
    assert.ok(storedUser.passwordHash);
    assert.notEqual(storedUser.passwordHash, customerPassword);
    assert.ok(storedUser.passwordHash.startsWith('$2'));

    const duplicate = await request(app).post('/api/auth/register').send({
      name: 'Another Reader',
      email: 'reader@example.com',
      password: customerPassword,
    });
    assert.equal(duplicate.status, 409);

    const weak = await request(app).post('/api/auth/register').send({
      name: 'Weak Reader',
      email: 'weak@example.com',
      password: 'short',
    });
    assert.equal(weak.status, 400);
  });

  test('logs in with valid credentials, rejects invalid credentials and logs out', async () => {
    await User.create({
      name: 'Login Reader',
      email: 'login@example.com',
      passwordHash: await hashPassword(customerPassword),
      role: 'CUSTOMER',
    });
    const agent = request.agent(app);
    const invalid = await agent.post('/api/auth/login').send({ email: 'login@example.com', password: 'WrongPass123!' });
    assert.equal(invalid.status, 401);

    const login = await agent.post('/api/auth/login').send({ email: 'login@example.com', password: customerPassword });
    assert.equal(login.status, 200);
    assert.equal(login.body.user.role, 'CUSTOMER');
    assert.equal((await agent.get('/api/cart')).status, 200);

    assert.equal((await agent.post('/api/auth/logout')).status, 204);
    assert.equal((await agent.get('/api/cart')).status, 401);
    assert.equal((await request(app).get('/api/cart')).status, 401);
  });
});

describe('TC-CAT-01 and TC-SRCH-01: catalogue and search', () => {
  test('lists active books, matches title/author/keyword and handles no results safely', async () => {
    const list = await request(app).get('/api/books');
    assert.equal(list.status, 200);
    assert.equal(list.body.books.length, 2);
    assert.ok(list.body.books.some((book) => book.title === availableBook.title));
    assert.ok(!list.body.books.some((book) => book.title === inactiveBook.title));

    const titleMatch = await request(app).get('/api/books?q=reliable');
    assert.equal(titleMatch.body.books.length, 1);
    const authorMatch = await request(app).get('/api/books?author=hopper');
    assert.equal(authorMatch.body.books.length, 1);
    const keywordMatch = await request(app).get('/api/books?keyword=engineering');
    assert.equal(keywordMatch.body.books.length, 1);
    const noMatch = await request(app).get('/api/books?q=does-not-exist');
    assert.equal(noMatch.status, 200);
    assert.equal(noMatch.body.books.length, 0);
    const escaped = await request(app).get('/api/books?q=.*');
    assert.equal(escaped.status, 200);
    assert.equal(escaped.body.books.length, 0);
    const unsafeQuery = await request(app).get('/api/books?q[$ne]=anything');
    assert.equal(unsafeQuery.status, 400);
  });
});

describe('TC-CART-01, TC-CART-02 and TC-SEC-03: customer cart', () => {
  test('adds, merges, updates and removes items with server stock and price checks', async () => {
    const { agent } = await createCustomer('cart-reader@example.com');
    const unauthenticated = await request(app).post('/api/cart').send({ bookId: availableBook._id.toString(), quantity: 1 });
    assert.equal(unauthenticated.status, 401);

    const firstAdd = await agent.post('/api/cart').send({ bookId: availableBook._id.toString(), quantity: 2 });
    assert.equal(firstAdd.status, 201);
    assert.equal(firstAdd.body.cart.items[0].quantity, 2);
    assert.equal(firstAdd.body.cart.total, 50);

    const duplicateAdd = await agent.post('/api/cart').send({ bookId: availableBook._id.toString(), quantity: 1 });
    assert.equal(duplicateAdd.status, 201);
    assert.equal(duplicateAdd.body.cart.items[0].quantity, 3);
    assert.equal(duplicateAdd.body.cart.items[0].lineTotal, 75);
    const itemId = duplicateAdd.body.cart.items[0].itemId;

    assert.equal((await agent.patch(`/api/cart/${itemId}`).send({ quantity: 4 })).status, 200);
    assert.equal((await agent.patch(`/api/cart/${itemId}`).send({ quantity: 5 })).status, 409);
    assert.equal((await agent.patch(`/api/cart/${itemId}`).send({ quantity: 1.5 })).status, 400);
    assert.equal((await agent.post('/api/cart').send({ bookId: availableBook._id.toString(), quantity: 0 })).status, 400);
    assert.equal((await agent.post('/api/cart').send({ bookId: outOfStockBook._id.toString(), quantity: 1 })).status, 409);

    const secondCustomer = await createCustomer('cart-other@example.com');
    const otherCart = await secondCustomer.agent.get('/api/cart');
    assert.equal(otherCart.body.cart.items.length, 0);
    assert.equal((await secondCustomer.agent.delete(`/api/cart/${itemId}`)).status, 404);

    const removed = await agent.delete(`/api/cart/${itemId}`);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.cart.itemCount, 0);
  });
});

describe('TC-ADM-01 and TC-SEC-02: administration and RBAC', () => {
  test('blocks guests/customers and lets admins manage categories and books', async () => {
    assert.equal((await request(app).get('/api/admin/books')).status, 401);
    const customer = await createCustomer('normal-reader@example.com');
    assert.equal((await customer.agent.get('/api/admin/books')).status, 403);
    assert.equal((await customer.agent.post('/api/admin/categories').send({ name: 'Blocked' })).status, 403);

    const admin = await createAdmin();
    const categoryResponse = await admin.post('/api/admin/categories').send({ name: 'History', description: 'Historical works' });
    assert.equal(categoryResponse.status, 201);
    const history = categoryResponse.body.category;

    const invalidBook = await admin.post('/api/admin/books').send({ title: '', author: 'Nope', price: -1, stock: 1, category: history.id });
    assert.equal(invalidBook.status, 400);

    const created = await admin.post('/api/admin/books').send({
      title: 'A New Historical Record',
      author: 'Archivist One',
      description: 'A new admin-managed title.',
      keywords: ['history', 'archive'],
      price: 31.5,
      stock: 8,
      category: history.id,
      active: true,
    });
    assert.equal(created.status, 201);
    const createdBook = created.body.book;
    assert.equal(createdBook.category.id, history.id);

    const publicMatch = await request(app).get('/api/books?q=historical');
    assert.equal(publicMatch.body.books.length, 1);
    assert.equal(publicMatch.body.books[0].title, createdBook.title);

    const updatedCategory = await admin.patch(`/api/admin/categories/${history.id}`).send({ name: 'History & Memory' });
    assert.equal(updatedCategory.status, 200);
    const updatedBook = await admin.patch(`/api/admin/books/${createdBook.id}`).send({ price: 35, active: false });
    assert.equal(updatedBook.status, 200);
    assert.equal(updatedBook.body.book.price, 35);
    assert.equal((await request(app).get('/api/books?q=historical')).body.books.length, 0);
  });
});
