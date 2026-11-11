
import { Book } from './models/Book.js';

export function buildCatalogueFilter({
  category,
  minPrice,
  maxPrice,
  inStock
} = {}) {
  const filter = { active: true };

  if (category) {
    filter.category = category;
  }

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};

    if (minPrice !== undefined) {
      filter.price.$gte = minPrice;
    }

    if (maxPrice !== undefined) {
      filter.price.$lte = maxPrice;
    }
  }

  if (inStock) {
    filter.stock = { $gt: 0 };
  }

  return filter;
}

export async function browseBooks({
  page = 1,
  limit = 20,
  category,
  minPrice,
  maxPrice,
  inStock
} = {}) {
  const filter = buildCatalogueFilter({
    category,
    minPrice,
    maxPrice,
    inStock
  });

  const skip = (page - 1) * limit;

  const [books, total] = await Promise.all([
    Book.find(filter)
      .populate('category', 'name slug')
      .sort({ title: 1 })
      .skip(skip)
      .limit(limit)
      .exec(),

    Book.countDocuments(filter)
  ]);

  return {
    books: books.map(toBook),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}

export function toCategory(category) {
  if (!category) return null;

  const data =
    typeof category.toObject === 'function'
      ? category.toObject()
      : category;

  return {
    ...data,
    id: String(data._id ?? data.id)
  };
}

export function toBook(book) {
  if (!book) return null;

  const data =
    typeof book.toObject === 'function'
      ? book.toObject()
      : book;

  return {
    ...data,
    id: String(data._id ?? data.id),
    available: Boolean(data.active && Number(data.stock) > 0),
    category:
      data.category &&
      typeof data.category === 'object' &&
      (data.category._id || data.category.id)
        ? toCategory(data.category)
        : data.category
  };
}
