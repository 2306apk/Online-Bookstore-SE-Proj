
import { AppError } from './errors.js';

const FORBIDDEN_KEYS = new Set([
  '__proto__',
  'prototype',
  'constructor',
]);

function hasUnsafeKey(value) {
  if (Array.isArray(value)) {
    return value.some(hasUnsafeKey);
  }

  if (value === null || typeof value !== 'object') {
    return false;
  }

  return Object.entries(value).some(([key, nestedValue]) => {
    return (
      key.startsWith('$') ||
      key.includes('.') ||
      FORBIDDEN_KEYS.has(key) ||
      hasUnsafeKey(nestedValue)
    );
  });
}

export function rejectUnsafeInput(request, response, next) {
  if (hasUnsafeKey(request.body)) {
    return next(
      new AppError(
        400,
        'The request contains invalid input.',
        'INVALID_INPUT'
      )
    );
  }

  return next();
}
