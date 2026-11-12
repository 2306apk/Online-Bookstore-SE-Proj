import mongoose from 'mongoose';
import { AppError } from '../../middleware/errors.js';

/**
 * Strict ObjectId check for new code.
 * mongoose.isValidObjectId() is deliberately loose (it accepts numbers and 12-byte buffers);
 * isObjectIdOrHexString() accepts only a real ObjectId or a 24-character hex string.
 */
export function isStrictObjectId(value) {
  return mongoose.isObjectIdOrHexString(value);
}

export function assertStrictObjectId(value, message, code) {
  if (!isStrictObjectId(value)) {
    throw new AppError(400, message, code);
  }
  return String(value);
}
