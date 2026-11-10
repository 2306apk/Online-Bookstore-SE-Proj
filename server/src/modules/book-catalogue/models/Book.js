import mongoose from 'mongoose';

const bookSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 200,
      index: true,
    },
    author: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
      index: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    keywords: {
      type: [String],
      default: [],
      index: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0.01,
      max: 1000000,
    },
    coverUrl: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    stock: {
      type: Number,
      required: true,
      min: 0,
      max: 1000000,
      validate: {
        validator: Number.isInteger,
        message: 'Stock must be a whole number.',
      },
    },
    active: {
      type: Boolean,
      default: true,
      index: true,
    },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
      index: true,
    },
  },
  { timestamps: true },
);

bookSchema.index({ active: 1, createdAt: -1 });
bookSchema.index({ title: 'text', author: 'text', description: 'text', keywords: 'text' });

export const Book = mongoose.models.Book || mongoose.model('Book', bookSchema);
