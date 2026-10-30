import mongoose from 'mongoose';
import { AppError } from '../../middleware/errors.js';
import { Book } from '../book-catalogue/models/Book.js';
import { toBook } from '../book-catalogue/service.js';
import { Cart } from './models/Cart.js';

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
