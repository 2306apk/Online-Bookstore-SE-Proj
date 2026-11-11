import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import express from 'express';
import request from 'supertest';
import { z } from 'zod';
import { AppError, errorHandler, notFoundHandler } from '../src/middleware/errors.js';
import app from '../src/app.js';

describe('OBS-31 / OBS-NF-005: Global Error Handling and Sanitization', () => {
  test('returns 404 with NOT_FOUND envelope for unknown endpoints', async () => {
    const response = await request(app).get('/api/unknown-endpoint-xyz');
    assert.equal(response.status, 404);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.deepEqual(response.body, {
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
      },
    });
  });

  test('catches malformed JSON syntax errors and returns 400 INVALID_JSON without crashing', async () => {
    const response = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{ "email": "broken-json, ');

    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.equal(response.body.error?.code, 'INVALID_JSON');
    assert.equal(response.body.error?.message, 'The request payload contains malformed JSON.');
    assert.equal(response.body.error?.stack, undefined);
  });

  test('formats Zod validation errors with field details and 400 status', async () => {
    const response = await request(app)
      .post('/api/auth/register')
      .send({ email: 'not-an-email', password: '123' });

    assert.equal(response.status, 400);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.equal(response.body.error?.code, 'VALIDATION_ERROR');
    assert.ok(response.body.error?.details);
    assert.equal(response.body.error?.stack, undefined);
  });

  test('handles operational AppError with custom status code, code, and details', async () => {
    const testApp = express();
    testApp.use(express.json());
    testApp.get('/test-app-error', (req, res, next) => {
      next(new AppError(402, 'Payment method declined.', 'PAYMENT_REQUIRED', { reason: 'insufficient_funds' }));
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/test-app-error');
    assert.equal(response.status, 402);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.deepEqual(response.body, {
      error: {
        code: 'PAYMENT_REQUIRED',
        message: 'Payment method declined.',
        details: { reason: 'insufficient_funds' },
      },
    });
  });

  test('handles Mongoose CastError with 400 INVALID_IDENTIFIER', async () => {
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
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.deepEqual(response.body, {
      error: {
        code: 'INVALID_IDENTIFIER',
        message: "Invalid format for identifier 'bookId'.",
      },
    });
  });

  test('handles Mongoose ValidationError with formatted field error details', async () => {
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
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.equal(response.body.error?.code, 'VALIDATION_ERROR');
    assert.equal(response.body.error?.message, 'The submitted data is invalid.');
    assert.deepEqual(response.body.error?.details, {
      title: ['Title is required.'],
      price: ['Price must be positive.'],
    });
  });

  test('handles unhandled 500 exceptions, masks internal details and strictly suppresses stack traces', async () => {
    const testApp = express();
    testApp.get('/test-internal-crash', (req, res, next) => {
      // Simulate raw internal DB crash with sensitive query/connection info
      const internalErr = new Error('FATAL: MongoConnectionPoolClosedException: user=root password=secretPass host=10.0.0.1');
      next(internalErr);
    });
    testApp.use(errorHandler);

    const response = await request(testApp).get('/test-internal-crash');
    assert.equal(response.status, 500);
    assert.deepEqual(Object.keys(response.body), ['error']);
    assert.deepEqual(response.body, {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected server error occurred.',
      },
    });

    // Verify stack traces and credentials are never leaked
    assert.equal(response.body.error?.stack, undefined);
    assert.equal(response.body.stack, undefined);
    assert.equal(JSON.stringify(response.body).includes('secretPass'), false);
    assert.equal(JSON.stringify(response.body).includes('MongoConnectionPoolClosedException'), false);
  });
});
