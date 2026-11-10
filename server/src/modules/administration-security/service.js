import mongoose from 'mongoose';
import { AppError } from '../../middleware/errors.js';
import { Book } from '../book-catalogue/models/Book.js';
import { Category } from '../book-catalogue/models/Category.js';
import { toBook, toCategory } from '../book-catalogue/service.js';

function slugify(value) {
  return value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

async function requireCategory(categoryId) {
  if (!mongoose.isValidObjectId(categoryId)) {
    throw new AppError(400, 'The category identifier is invalid.', 'INVALID_CATEGORY_ID');
  }

  const category = await Category.findById(categoryId);
  if (!category) {
    throw new AppError(404, 'The category was not found.', 'CATEGORY_NOT_FOUND');
  }
  return category;
}

export async function listAdminBooks() {
  const books = await Book.find().populate('category').sort({ createdAt: -1 }).lean();
  return books.map(toBook);
}

export async function listAdminCategories() {
  const categories = await Category.find().sort({ name: 1 }).lean();
  return categories.map(toCategory);
}

export async function createCategory(data) {
  const category = await Category.create({
    ...data,
    name: data.name.trim(),
    slug: slugify(data.name),
  });
  return toCategory(category);
}

export async function updateCategory(categoryId, data) {
  const category = await requireCategory(categoryId);
  if (data.name) {
    category.name = data.name.trim();
    category.slug = slugify(data.name);
  }
  if (data.description !== undefined) category.description = data.description;
  if (data.active !== undefined) category.active = data.active;
  await category.save();
  return toCategory(category);
}

export async function createBook(data) {
  const category = await requireCategory(data.category);
  const book = await Book.create({
    ...data,
    category: category._id,
  });
  await book.populate('category');
  return toBook(book);
}

export async function updateBook(bookId, data) {
  if (!mongoose.isValidObjectId(bookId)) {
    throw new AppError(400, 'The book identifier is invalid.', 'INVALID_BOOK_ID');
  }

  const book = await Book.findById(bookId);
  if (!book) {
    throw new AppError(404, 'The book was not found.', 'BOOK_NOT_FOUND');
  }

  if (data.category) {
    const category = await requireCategory(data.category);
    book.category = category._id;
  }
  for (const field of ['title', 'author', 'description', 'keywords', 'price', 'coverUrl', 'stock', 'active']) {
    if (data[field] !== undefined) book[field] = data[field];
  }

  await book.save();
  await book.populate('category');
  return toBook(book);
}

export async function deactivateBook(bookId) {
  return updateBook(bookId, { active: false });
}

