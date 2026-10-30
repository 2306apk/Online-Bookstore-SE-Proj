import assert from 'node:assert/strict';
import { test } from 'node:test';
import { passwordPattern } from '../src/modules/authentication-security/password.js';
import { buildSearchConditions, escapeRegex } from '../src/modules/book-catalogue/search.js';

test('password policy accepts a strong password and rejects weak values', () => {
  assert.equal(passwordPattern.test('ValidPass123!'), true);
  assert.equal(passwordPattern.test('password'), false);
  assert.equal(passwordPattern.test('SHORT1!'), false);
});

test('catalogue search escapes regular expression operators', () => {
  assert.equal(escapeRegex('.*'), '\\\.\\*');
  const conditions = buildSearchConditions({ q: '.*', title: undefined, author: undefined, keyword: undefined });
  assert.equal(conditions[0].$or[0].title.$regex, '\\\.\\*');
});
