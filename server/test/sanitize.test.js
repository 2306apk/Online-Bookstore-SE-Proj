
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import app from '../src/app.js';
import { rejectUnsafeInput } from '../src/middleware/sanitize.js';

describe('OBS-SR-03: Input Sanitization', () => {
  test('rejects MongoDB operator injection in login', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: { $ne: null },
        password: 'SomePassword123!',
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'INVALID_INPUT');
  });

  test('rejects nested MongoDB operator injection', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: 'Test User',
        email: 'test@example.com',
        password: 'StrongPassword123!',
        metadata: {
          nested: {
            $gt: '',
          },
        },
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'INVALID_INPUT');
  });

  test('rejects dotted keys and prototype-related keys', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send('{"email":"test@example.com","password":"Password123!","profile.role":"ADMIN"}')
      .set('Content-Type', 'application/json');

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'INVALID_INPUT');
  });

  test('preserves legitimate text and punctuation', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({
        name: "O'Connor-Smith",
        email: 'invalid-email',
        password: 'StrongPassword123!',
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  });

  test('preserves the OBS-31 error envelope', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: { $ne: null },
        password: 'Password123!',
      });

    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.equal(response.body.error.code, 'INVALID_INPUT');
    assert.equal(response.body.error.stack, undefined);
  });

  test('allows legitimate punctuation and HTML-like text without altering it', () => {
    const payload = {
      title: "Harry Potter & the Philosopher's Stone",
      description: '<script>alert("test")</script> is an example.',
      note: 'Price: ₹499.50 (20% off)!',
    };

    let nextCalled = false;

    rejectUnsafeInput(
      { body: payload },
      {},
      () => {
        nextCalled = true;
      }
    );

    assert.equal(nextCalled, true);
    assert.equal(
      payload.title,
      "Harry Potter & the Philosopher's Stone"
    );
    assert.equal(
      payload.description,
      '<script>alert("test")</script> is an example.'
    );
  });

  test('rejects nested MongoDB operators inside arrays', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'reader@example.com',
        password: 'StrongPassword123!',
        extra: [{ profile: { $where: 'this.role === "ADMIN"' } }],
      });

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'INVALID_INPUT');
  });

  test('rejects prototype pollution keys', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send(
        '{"email":"reader@example.com","password":"StrongPassword123!","__proto__":{"role":"ADMIN"}}'
      );

    assert.equal(response.status, 400);
    assert.equal(response.body.error.code, 'INVALID_INPUT');
  });

});
