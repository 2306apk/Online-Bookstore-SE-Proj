import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import express from 'express';
import request from 'supertest';
import { AppError, errorHandler, notFoundHandler } from '../src/middleware/errors.js';
import app from '../src/app.js';

describe('OBS-31 / OBS-NF-005: Global Error Handling and Sanitization', () => {
  test('returns 404 with exactly one top-level error key for unknown endpoints', async () => {
    const response = await request(app).get('/api/unknown-endpoint-xyz');
    assert.equal(response.status, 404);
    assert.equal(Object.keys(response.body).length, 1);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.deepEqual(response.body, {
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
      },
    });
  });

  test('catches malformed JSON syntax errors with exactly one top-level error key', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ "email": "broken-json, ');

    assert.equal(response.status, 400);
    assert.equal(Object.keys(response.body).length, 1);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.equal(response.body.error?.code, 'INVALID_JSON');
    assert.equal(response.body.error?.message, 'The request payload contains malformed JSON.');
    assert.equal(response.body.error?.stack, undefined);
  });

  test('formats Zod validation errors with exactly one top-level error key and field details', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: '123' });

    assert.equal(response.status, 400);
    assert.equal(Object.keys(response.body).length, 1);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.equal(response.body.error?.code, 'VALIDATION_ERROR');
    assert.ok(response.body.error?.details);
    assert.equal(response.body.error?.stack, undefined);
  });

  test('handles operational AppError with exactly one top-level error key', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.get('/test-app-error', (req, res, next) => {
      next(new AppError(402, 'Payment method declined.', 'PAYMENT_REQUIRED', { reason: 'insufficient_funds' }));
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/test-app-error');
    assert.equal(response.status, 402);
    assert.equal(Object.keys(response.body).length, 1);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.deepEqual(response.body, {
      error: {
        code: 'PAYMENT_REQUIRED',
        message: 'Payment method declined.',
        details: { reason: 'insufficient_funds' },
      },
    });
  });

  test('handles Mongoose CastError with 400 INVALID_IDENTIFIER and exactly one top-level error key', async () => {
    const testApp = express();
    testApp.get('/test-cast-error', (req, res, next) => {
      const castErr = new Error('Cast to ObjectId failed for value "bad-id" at path "bookId"');
      castErr.name = 'CastError';
      castErr.path = 'bookId';
      next(castErr);
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/test-cast-error');
    assert.equal(response.status, 400);
    assert.equal(Object.keys(response.body).length, 1);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.deepEqual(response.body, {
      error: {
        code: 'INVALID_IDENTIFIER',
        message: "Invalid format for identifier 'bookId'.",
      },
    });
  });

  test('handles Mongoose ValidationError with formatted details and exactly one top-level error key', async () => {
    const testApp = express();
    testApp.get('/test-mongoose-validation', (req, res, next) => {
      const validationErr = new Error('Validation failed');
      validationErr.name = 'ValidationError';
      validationErr.errors = {
        title: { message: 'Title is required.' },
        price: { message: 'Price must be positive.' },
      };
      next(validationErr);
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/test-mongoose-validation');
    assert.equal(response.status, 400);
    assert.equal(Object.keys(response.body).length, 1);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.equal(response.body.error?.code, 'VALIDATION_ERROR');
    assert.equal(response.body.error?.message, 'The submitted data is invalid.');
    assert.deepEqual(response.body.error?.details, {
      title: ['Title is required.'],
      price: ['Price must be positive.'],
    });
  });

  test('handles MongoDB duplicate-key error (E11000) with 409 DUPLICATE_RESOURCE and exactly one top-level error key', async () => {
    const testApp = express();
    testApp.get('/test-duplicate-key', (req, res, next) => {
      const duplicateErr = new Error('E11000 duplicate key error collection: bookstore.books index: isbn_1 dup key: { isbn: "978-0132350884" }');
      duplicateErr.code = 11000;
      next(duplicateErr);
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/test-duplicate-key');
    assert.equal(response.status, 409);
    assert.equal(Object.keys(response.body).length, 1);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.deepEqual(response.body, {
      error: {
        code: 'DUPLICATE_RESOURCE',
        message: 'A resource with those details already exists.',
      },
    });
  });

  test('handles unhandled 500 exceptions, masks internal details, suppresses stack traces, and has exactly one top-level key', async () => {
    const testApp = express();
    testApp.get('/test-internal-crash', (req, res, next) => {
      const internalErr = new Error('FATAL: MongoConnectionPoolClosedException: user=root password=secretPass host=10.0.0.1');
      internalErr.details = { dbHost: '10.0.0.1', internalQuery: 'SELECT * FROM credentials' };
      next(internalErr);
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/test-internal-crash');
    assert.equal(response.status, 500);
    assert.equal(Object.keys(response.body).length, 1);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.deepEqual(response.body, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred.',
      },
    });

    // Verify stack traces, internal details, and credentials are never leaked
    assert.equal(response.body.error?.stack, undefined);
    assert.equal(response.body.error?.details, undefined);
    assert.equal(response.body.stack, undefined);
    assert.equal(JSON.stringify(response.body).includes('secretPass'), false);
    assert.equal(JSON.stringify(response.body).includes('credentials'), false);
    assert.equal(JSON.stringify(response.body).includes('MongoConnectionPoolClosedException'), false);
  });
});
