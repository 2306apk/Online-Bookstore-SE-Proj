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

export const Book =
  mongoose.models.Book ||