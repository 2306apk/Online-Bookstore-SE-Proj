import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    author: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },

     publisher: {
      type: String,
      trim: true,
      default: '',
      maxlength: 150,
    },

    description: {
      type: String,
      default: '',
      trim: true,
      maxlength: 3000,
    },

    keywords: {
      type: [String],
      default: [],
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },

    price: {
      type: Number,
      required: true,
      min: 0,
    },

    stock: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    coverImage: {
      type: String,
      default: '',
    },

    isbn: {
      type: String,
      trim: true,
      default: '',
    },

    active: {
      type: Boolean,
      default: true,
    },

    // Stock currently held by checkouts that are still in progress (OBS-26). An entry is added in the
    // SAME update that lowers `stock`, and removed in the same update that returns it (or when the
    // order is confirmed), so stock and its record can never disagree. Hidden from normal queries.
    reservations: {
      type: [{ attempt: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentAttempt' }, quantity: Number, _id: false }],
      default: undefined,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
    },
    toObject: {
      virtuals: true,
    },
  }
);

bookSchema.index({ active: 1, title: 1 });
bookSchema.index({ category: 1, active: 1 });
bookSchema.index({ 'reservations.attempt': 1 }, { sparse: true });

export const Book =
  mongoose.models.Book ||
  mongoose.model('Book', bookSchema);