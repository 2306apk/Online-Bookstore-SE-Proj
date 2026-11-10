const ALLOWED_PARAMETERS = new Set([
  'page',
  'limit',
  'category',
  'q',
  'author',
  'keyword'
]);

function parsePositiveInteger(value, name, defaultValue, maxValue) {
  if (value === undefined) return defaultValue;

  if (
    typeof value !== 'string' ||
    !/^\d+$/.test(value)
  ) {
    throw new Error(`${name} must be a positive integer`);
  }

  const parsed = Number(value);

  if (
    !Number.isSafeInteger(parsed) ||
    parsed < 1 ||
    parsed > maxValue
  ) {
    throw new Error(`${name} must be between 1 and ${maxValue}`);
  }

  return parsed;
}

function parseSearchText(value, name) {
  if (value === undefined) return undefined;

  if (typeof value !== 'string') {
    throw new Error(`${name} must be a string`);
  }

  const parsed = value.trim();

  if (!parsed || parsed.length > 100) {
    throw new Error(`${name} must contain 1 to 100 characters`);
  }

  return parsed;
}

export function validateBrowseQuery(query) {
  for (const key of Object.keys(query)) {
    if (!ALLOWED_PARAMETERS.has(key)) {
      throw new Error(`Unsupported query parameter: ${key}`);
    }
  }

  const page = parsePositiveInteger(query.page, 'page', 1, 1000000);
  const limit = parsePositiveInteger(query.limit, 'limit', 20, 100);

  if (
    query.category !== undefined &&
    (typeof query.category !== 'string' || !query.category.trim())
  ) {
    throw new Error('category must be a non-empty string');
  }

  return {
    page,
    limit,
    category: query.category?.trim(),
    q: parseSearchText(query.q, 'q'),
    author: parseSearchText(query.author, 'author'),
    keyword: parseSearchText(query.keyword, 'keyword')
  };
}
import { Book } from './models/Book.js';

export function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSearchConditions({
  q,
  title,
  author,
  keyword
} = {}) {
  const conditions = [];

  if (q) {
    const pattern = escapeRegex(q);

    conditions.push({
      $or: [
        { title: { $regex: pattern, $options: 'i' } },
        { author: { $regex: pattern, $options: 'i' } },
        { description: { $regex: pattern, $options: 'i' } },
        { keywords: { $regex: pattern, $options: 'i' } }
      ]
    });
  }

  if (title) {
    conditions.push({
      title: { $regex: escapeRegex(title), $options: 'i' }
    });
  }

  if (author) {
    conditions.push({
      author: { $regex: escapeRegex(author), $options: 'i' }
    });
  }

  if (keyword) {
    conditions.push({
      keywords: { $regex: escapeRegex(keyword), $options: 'i' }
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
  keyword
} = {}) {
  const filter = { active: true };

  if (category) {
    filter.category = category;
  }

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
    books,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
}