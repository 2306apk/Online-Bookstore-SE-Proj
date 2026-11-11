
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import mongoose from 'mongoose';
import request from 'supertest';
import app from '../src/app.js';

describe('OBS-24: System Availability and Health Monitoring', () => {
  test('returns HTTP 200 when MongoDB is connected', async () => {
    const originalReadyState = mongoose.connection.readyState;

    try {
      mongoose.connection.readyState = 1;

      const response = await request(app).get('/api/health');

      assert.equal(response.status, 200);
      assert.deepEqual(response.body, {
        status: 'ok',
        database: 'connected',
      });
    } finally {
      mongoose.connection.readyState = originalReadyState;
    }
  });

  test('returns HTTP 503 when MongoDB is disconnected', async () => {
    const originalReadyState = mongoose.connection.readyState;

    try {
      mongoose.connection.readyState = 0;

      const response = await request(app).get('/api/health');

      assert.equal(response.status, 503);
      assert.deepEqual(response.body, {
        status: 'unavailable',
        database: 'disconnected',
      });
    } finally {
      mongoose.connection.readyState = originalReadyState;
    }
  });


  test('does not expose database credentials or connection details', async () => {
    const originalReadyState = mongoose.connection.readyState;

    try {
      mongoose.connection.readyState = 0;

      const response = await request(app).get('/api/health');

      assert.equal(response.status, 503);
      assert.equal(response.body.status, 'unavailable');
      assert.equal(response.body.database, 'disconnected');

      assert.deepEqual(Object.keys(response.body).sort(), [
        'database',
        'status',
      ]);

      const responseText = JSON.stringify(response.body);

      assert.equal(responseText.includes('mongodb://'), false);
      assert.equal(responseText.includes('password'), false);
    } finally {
      mongoose.connection.readyState = originalReadyState;
    }
  });
 });