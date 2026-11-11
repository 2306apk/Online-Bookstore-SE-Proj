
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import request from 'supertest';
import app from '../src/app.js';
import { validateBrowseQuery } from '../src/modules/book-catalogue/schemas.js';

describe('OBS-SR-03: Catalogue Query Parameter Security', () => {
  test('accepts a valid category ObjectId', () => {
    const categoryId = '507f1f77bcf86cd799439011';

    const result = validateBrowseQuery({
      category: categoryId,
    });

    assert.equal(result.category, categoryId);
  });

  test('rejects an invalid category identifier', () => {
    assert.throws(
      () => validateBrowseQuery({ category: 'invalid-category' }),
      /category must be a valid identifier/,
    );
  });

  test('rejects MongoDB operator objects in category', () => {
    assert.throws(
      () => validateBrowseQuery({
        category: { $ne: null },
      }),
      /category must be a valid identifier/,
    );
  });

  test('rejects unsupported query parameters', () => {
    assert.throws(
      () => validateBrowseQuery({
        $where: 'true',
      }),
      /Unsupported query parameter/,
    );
  });

  test('returns HTTP 400 for malformed category identifiers', async () => {
    const response = await request(app)
      .get('/api/books')
      .query({ category: 'invalid-category' });

    assert.equal(response.status, 400);
  });

  test('returns HTTP 400 for MongoDB operator query parameters', async () => {
    const response = await request(app)
      .get('/api/books')
      .query({ 'category[$ne]': 'anything' });

    assert.equal(response.status, 400);
  });
});
