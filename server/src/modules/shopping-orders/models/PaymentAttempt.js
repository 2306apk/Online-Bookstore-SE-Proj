import mongoose from 'mongoose';

// One record per checkout attempt. It keeps failed or interrupted payments investigable
// (SRS OBS-NF-004) without ever creating an order, and its unique key makes retries idempotent.
const paymentAttemptSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    idempotencyKey: { type: String, required: true },
    status: { type: String, enum: ['STARTED', 'RESERVED', 'SUCCEEDED', 'FAILED'], default: 'STARTED' },
    amount: { type: Number, required: true },
    currency: { type: String, required: true },
    reference: { type: String, default: '' },
    failureCode: { type: String, default: '' },
    failureMessage: { type: String, default: '' },
    order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', default: null },
    // What happened to the money, tracked separately from the order so nothing is silently lost:
    // NONE (not charged) -> CAPTURED (charged, order not saved yet) -> REVERSED, or REVERSAL_FAILED (needs a human).
    paymentState: { type: String, enum: ['NONE', 'CAPTURED', 'REVERSED', 'REVERSAL_FAILED'], default: 'NONE' },
    // Cart rows that this checkout ordered, so cart clean-up can be finished later if it was interrupted.
    cartItemIds: { type: [String], default: [] },
    cartCleared: { type: Boolean, default: false },
    reserved: {
      type: [{ book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' }, quantity: Number, _id: false }],
      default: [],
    },
  },
  { timestamps: true },
);

paymentAttemptSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });

export const PaymentAttempt = mongoose.models.PaymentAttempt || mongoose.model('PaymentAttempt', paymentAttemptSchema);
