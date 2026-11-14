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
    // NONE (not charged) -> CAPTURED (charged, order not saved yet) -> REVERSING -> REVERSED,
    // or REVERSAL_FAILED (charged, no order, reversal failed: needs a person, see recovery).
    paymentState: { type: String, enum: ['NONE', 'CAPTURED', 'REVERSING', 'REVERSED', 'REVERSAL_FAILED'], default: 'NONE' },
    reversalAttempts: { type: Number, default: 0 },
    reversalError: { type: String, default: '' },
    // Cart rows that this checkout ordered, so cart clean-up can be finished later if it was interrupted.
    cartItemIds: { type: [String], default: [] },
    cartCleared: { type: Boolean, default: false },
    // The books and quantities this checkout holds or has held. Fixed when the attempt is created; the
    // live "who holds what" record is Book.reservations (see stock-reservations.js).
    lines: {
      type: [{ book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book' }, quantity: Number, _id: false }],
      default: [],
    },
    // Lease: whoever holds an unexpired lease is the only one allowed to move this attempt forward.
    // A live checkout renews it before every step; recovery may only take an attempt whose lease has expired.
    // The default (the epoch) means "nobody holds it".
    leaseOwner: { type: String, default: '' },
    leaseExpiresAt: { type: Date, default: () => new Date(0) },
  },
  { timestamps: true },
);

paymentAttemptSchema.index({ user: 1, idempotencyKey: 1 }, { unique: true });
paymentAttemptSchema.index({ status: 1, leaseExpiresAt: 1 });
paymentAttemptSchema.index({ paymentState: 1 });

export const PaymentAttempt = mongoose.models.PaymentAttempt || mongoose.model('PaymentAttempt', paymentAttemptSchema);
