import mongoose from 'mongoose';

const wishlistSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    books: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Book' }],
      default: [],
    },
  },
  { timestamps: true },
);

export const Wishlist = mongoose.models.Wishlist || mongoose.model('Wishlist', wishlistSchema);
