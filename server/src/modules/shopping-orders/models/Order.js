import mongoose from 'mongoose';

// What the customer bought, frozen at purchase time so later price or title changes never rewrite history.
const orderItemSchema = new mongoose.Schema(
  {
    book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
    title: { type: String, required: true },
    author: { type: String, default: '' },
    coverImage: { type: String, default: '' },
    unitPrice: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

export const ORDER_STATUSES = Object.freeze(['PLACED', 'SHIPPED', 'DELIVERED', 'CANCELLED']);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: { type: String, enum: ORDER_STATUSES, default: 'PLACED', index: true },
    currency: { type: String, required: true },
    items: { type: [orderItemSchema], validate: (value) => value.length > 0 },
    itemCount: { type: Number, required: true },
    subtotal: { type: Number, required: true },
    shipping: { id: String, label: String, amount: Number },
    tax: { ratePercent: Number, amount: Number },
    total: { type: Number, required: true },
    address: {
      fullName: String, phone: String, line1: String, line2: { type: String, default: '' },
      city: String, state: String, postalCode: String, country: String,
    },
    // Only a simulated reference is kept. No card numbers or other payment secrets are ever stored.
    payment: {
      method: { type: String, default: 'SANDBOX' },
      status: { type: String, default: 'SUCCEEDED' },
      reference: { type: String, required: true },
    },
    // The checkout attempt that produced this order. Unique, so one attempt can never create two orders.
    attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAttempt', default: undefined },
    // Used by cancellation (OBS-28) so stock is restored exactly once.
    stockRestored: { type: Boolean, default: false },
  },
  { timestamps: true },
);

orderSchema.index({ attempt: 1 }, { unique: true, sparse: true });

export const Order = mongoose.models.Order || mongoose.model('Order', orderSchema);
