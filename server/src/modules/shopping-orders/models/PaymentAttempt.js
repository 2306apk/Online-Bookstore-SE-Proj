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
    reserved: {
      type: [{ book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' }, quantity: Number, _id: false }],
      default: [],
    },
  },
  { timestamps: true },
);

paymentAttemptSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });

export const PaymentAttempt = mongoose.models.PaymentAttempt || mongoose.model('PaymentAttempt', paymentAttemptSchema);
