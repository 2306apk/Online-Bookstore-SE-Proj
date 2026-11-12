import { AppError } from '../../middleware/errors.js';
import { Book } from '../book-catalogue/models/Book.js';
import { toBook } from '../book-catalogue/service.js';
import { assertStrictObjectId } from './object-id.js';
import { Wishlist } from './models/Wishlist.js';
import { ensureCartItem } from './service.js';

const INVALID_BOOK = ['The book identifier is invalid.', 'INVALID_BOOK_ID'];

async function serializeWishlist(userId) {
  const wishlist = await Wishlist.findOne({ user: userId }).populate({
    path: 'books',
    populate: { path: 'category' },
  });

  // Deactivated or out-of-stock books stay visible with `available: false` (they cannot be moved to
  // the cart). Only books that no longer exist at all are dropped. Nothing the browser sends is trusted.
  const books = (wishlist?.books || []).filter(Boolean).map(toBook);
  return { items: books, bookIds: books.map((book) => book.id), count: books.length };
}

export async function getWishlist(userId) {
  return serializeWishlist(userId);
}

export async function addToWishlist(userId, { bookId }) {
  assertStrictObjectId(bookId, ...INVALID_BOOK);
  const book = await Book.findOne({ _id: bookId, active: true });
  if (!book) {
    throw new AppError(404, 'That book is not available.', 'BOOK_NOT_AVAILABLE');
  }

  const alreadySaved = Boolean(await Wishlist.exists({ user: userId, books: book._id }));

  // $addToSet is atomic and idempotent: adding the same book twice leaves one entry.
  // Two first-time requests can race to create the user's wishlist; the unique index lets one win,
  // so the loser simply repeats the (now non-creating) update.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await Wishlist.updateOne({ user: userId }, { $addToSet: { books: book._id } }, { upsert: true });
      break;
    } catch (error) {
      if (error?.code !== 11000 || attempt === 1) throw error;
    }
  }
  return { wishlist: await serializeWishlist(userId), created: !alreadySaved };
}

export async function removeFromWishlist(userId, bookId) {
  assertStrictObjectId(bookId, ...INVALID_BOOK);
  await Wishlist.updateOne({ user: userId }, { $pull: { books: bookId } });
  return serializeWishlist(userId);
}

/**
 * Moves a wishlisted book into the cart.
 *
 * Idempotent by design: the cart step is an "ensure at least 1" operation, never an increment,
 * so a retry after a partial failure (cart updated, wishlist removal failed) cannot change the
 * cart quantity. If the cart step fails (out of stock, inactive) the wishlist is left unchanged.
 */
export async function moveWishlistItemToCart(userId, bookId) {
  assertStrictObjectId(bookId, ...INVALID_BOOK);

  const entry = await Wishlist.exists({ user: userId, books: bookId });
  if (!entry) {
    throw new AppError(404, 'That book is not in your wishlist.', 'WISHLIST_ITEM_NOT_FOUND');
  }

  const cart = await ensureCartItem(userId, { bookId, quantity: 1 });
  await Wishlist.updateOne({ user: userId }, { $pull: { books: bookId } });
  return { cart, wishlist: await serializeWishlist(userId) };
}
