import { Book } from './models/Book.js';
import { Category } from './models/Category.js';
import { buildSearchConditions } from './search.js';

export function toCategory(category) {
  return {
    id: category._id.toString(),
    name: category.name,
    slug: category.slug,
    description: category.description,
    active: category.active,
  };
}

export function toBook(book) {
  const category = book.category && typeof book.category === 'object' && book.category.name
    ? toCategory(book.category)
    : book.category?.toString();

  return {
    id: book._id.toString(),
    title: book.title,
    author: book.author,
    description: book.description,
    keywords: book.keywords,
    price: book.price,
    coverUrl: book.coverUrl,
    stock: book.stock,
    available: book.active && book.stock > 0,
    active: book.active,
    category,
  };
}

export async function listPublicBooks(query) {
  const { q, title, author, keyword, page = 1, limit = 12 } = query;
  const conditions = [{ active: true }, ...buildSearchConditions({ q, title, author, keyword })];
  const filter = conditions.length === 1 ? conditions[0] : { $and: conditions };
  const [books, total] = await Promise.all([
    Book.find(filter)
      .populate('category')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Book.countDocuments(filter),
  ]);

  return {
    books: books.map(toBook),
    pagination: {
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    },
  };
}

export async function listCategories({ includeInactive = false } = {}) {
  const filter = includeInactive ? {} : { active: true };
  const categories = await Category.find(filter).sort({ name: 1 }).lean();
  return categories.map(toCategory);
}
