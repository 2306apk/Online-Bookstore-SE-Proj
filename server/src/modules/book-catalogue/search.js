
import { Book } from './models/Book.js';
import { toBook, buildCatalogueFilter } from './service.js';

export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSearchConditions({
  q,
  title,
  author,
  keyword
} = {}) {
  const conditions = [];
  const searchText = q ?? title;

  if (searchText) {
    const escaped = escapeRegex(searchText);

    conditions.push({
      $or: [
        { title: { $regex: escaped, $options: 'i' } },
        { author: { $regex: escaped, $options: 'i' } },
        { description: { $regex: escaped, $options: 'i' } },
        { keywords: { $regex: escaped, $options: 'i' } }
      ]
    });
  }

  if (author) {
    conditions.push({
      author: {
        $regex: escapeRegex(author),
        $options: 'i'
      }
    });
  }

  if (keyword) {
    conditions.push({
      keywords: {
        $regex: escapeRegex(keyword),
        $options: 'i'
      }
    });
  }

  return conditions;
}

export async function searchBooks({
  page = 1,
  limit = 20,
  category,
  q,
  author,
  keyword,
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

  const conditions = buildSearchConditions({
    q,
    author,
    keyword
  });

  if (conditions.length > 0) {
    filter.$and = conditions;
  }

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
