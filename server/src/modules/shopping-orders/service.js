import mongoose from 'mongoose';
import { AppError } from '../../middleware/errors.js';
import { Book } from '../book-catalogue/models/Book.js';
import { toBook } from '../book-catalogue/service.js';
import { Cart } from './models/Cart.js';
import { assertStrictObjectId } from './object-id.js';

async function getCartDocument(userId) {
  let cart = await Cart.findOne({ user: userId });
  if (!cart) {
    cart = await Cart.create({ user: userId, items: [] });
  }
  return cart;
}

async function populateCart(cart) {
  await cart.populate({
    path: 'items.book',
    populate: { path: 'category' },
  });
  return cart;
}

export function serializeCart(cart) {
  const items = cart.items
    .filter((item) => item.book)
    .map((item) => ({
      itemId: item._id.toString(),
      book: toBook(item.book),
      quantity: item.quantity,
      lineTotal: Number((item.book.price * item.quantity).toFixed(2)),
    }));

  return {
    id: cart._id.toString(),
    items,
    itemCount: items.reduce((count, item) => count + item.quantity, 0),
    total: Number(items.reduce((total, item) => total + item.lineTotal, 0).toFixed(2)),
  };
}

async function findAvailableBook(bookId) {
  if (!mongoose.isValidObjectId(bookId)) {
    throw new AppError(400, 'The book identifier is invalid.', 'INVALID_BOOK_ID');
  }

  const book = await Book.findOne({ _id: bookId, active: true });
  if (!book) {
    throw new AppError(404, 'That book is not available.', 'BOOK_NOT_AVAILABLE');
  }
  return book;
}

function assertStock(book, quantity) {
  if (book.stock < quantity) {
    throw new AppError(409, `Only ${book.stock} copies are currently available.`, 'INSUFFICIENT_STOCK');
  }
}

export async function getCart(userId) {
  const cart = await getCartDocument(userId);
  return serializeCart(await populateCart(cart));
}

export async function addCartItem(userId, { bookId, quantity }) {
  const book = await findAvailableBook(bookId);
  const cart = await getCartDocument(userId);
  const existingItem = cart.items.find((item) => item.book.toString() === book._id.toString());
  const nextQuantity = (existingItem?.quantity || 0) + quantity;
  assertStock(book, nextQuantity);

  if (existingItem) {
    existingItem.quantity = nextQuantity;
  } else {
    cart.items.push({ book: book._id, quantity });
  }

  await cart.save();
  return serializeCart(await populateCart(cart));
}

export async function updateCartItem(userId, itemId, { quantity }) {
  if (!mongoose.isValidObjectId(itemId)) {
    throw new AppError(400, 'The cart item identifier is invalid.', 'INVALID_CART_ITEM_ID');
  }

  const cart = await getCartDocument(userId);
  const item = cart.items.id(itemId);
  if (!item) {
    throw new AppError(404, 'The cart item was not found.', 'CART_ITEM_NOT_FOUND');
  }

  const book = await findAvailableBook(item.book);
  assertStock(book, quantity);
  item.quantity = quantity;
  await cart.save();
  return serializeCart(await populateCart(cart));
}

export async function removeCartItem(userId, itemId) {
  if (!mongoose.isValidObjectId(itemId)) {
    throw new AppError(400, 'The cart item identifier is invalid.', 'INVALID_CART_ITEM_ID');
  }

  const cart = await getCartDocument(userId);
  const item = cart.items.id(itemId);
  if (!item) {
    throw new AppError(404, 'The cart item was not found.', 'CART_ITEM_NOT_FOUND');
  }

  cart.items.pull(itemId);
  await cart.save();
  return serializeCart(await populateCart(cart));
}

// Two first-time requests can both try to create the user's cart; the unique index lets one win.
async function getOrCreateCart(userId) {
  try {
    return await getCartDocument(userId);
  } catch (error) {
    if (error?.code === 11000) {
      const cart = await Cart.findOne({ user: userId });
      if (cart) return cart;
    }
    throw error;
  }
}

/**
 * Ensures the cart holds AT LEAST `quantity` copies of a book. This is not an increment:
 * calling it again, or with the book already in the cart at a higher quantity, changes nothing.
 * Used by wishlist "move to cart" so retries and simultaneous requests cannot add extra copies.
 *
 * Each attempt is a compare-and-swap on the cart's version (__v), so two simultaneous requests
 * can never leave two cart rows for the same book or a doubled quantity.
 */
export async function ensureCartItem(userId, { bookId, quantity = 1 }) {
  assertStrictObjectId(bookId, 'The book identifier is invalid.', 'INVALID_BOOK_ID');
  const book = await findAvailableBook(bookId);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const cart = await getOrCreateCart(userId);
    const items = cart.toObject().items;
    const existing = items.find((item) => String(item.book) === String(book._id));

    // Already satisfied: leave the cart exactly as it is (no stock check, no change).
    if (existing && existing.quantity >= quantity) {
      return serializeCart(await populateCart(cart));
    }

    assertStock(book, quantity);
    const nextItems = existing
      ? items.map((item) => (item === existing ? { ...item, quantity } : item))
      : [...items, { book: book._id, quantity }];

    const result = await Cart.updateOne(
      { _id: cart._id, __v: cart.__v },
      { $set: { items: nextItems }, $inc: { __v: 1 } },
    );
    if (result.modifiedCount === 1) {
      return serializeCart(await populateCart(await getOrCreateCart(userId)));
    }
    // Someone else changed the cart first: re-read and decide again.
  }

  throw new AppError(409, 'The cart is busy. Please try again.', 'CART_BUSY');
}
