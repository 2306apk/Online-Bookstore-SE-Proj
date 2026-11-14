import mongoose from 'mongoose';

export const REVIEW_STATUSES = Object.freeze([
  'APPROVED',
  'FLAGGED',
  'REJECTED',
  'DELETED',
]);

const reviewSchema = new mongoose.Schema(
  {
    book: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Book',
      required: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: {
        validator: Number.isInteger,
        message: 'Rating must be a whole number from 1 to 5.',
      },
    },
    comment: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: REVIEW_STATUSES,
      default: 'APPROVED',
      index: true,
    },
    isVerifiedPurchase: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ book: 1, customer: 1 }, { unique: true });
reviewSchema.index({ book: 1, createdAt: -1 });
reviewSchema.index({ status: 1, createdAt: -1 });

export const Review =
  mongoose.models.Review || mongoose.model('Review', reviewSchema);
