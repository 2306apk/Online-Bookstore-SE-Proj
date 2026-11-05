import { Book } from './models/Book.js';

export async function browseBooks({
  page = 1,
  limit = 20,
  category,
} = {}) {
  const filter = { active: true };

  if (category) {
    filter.category = category;
  }

  const skip = (page - 1) * limit;

  const [books, total] = await Promise.all([
    Book.find(filter)
      .populate('category', 'name slug')
      .sort({ title: 1 })
      .skip(skip)
      .limit(limit)
      .exec(),

    Book.countDocuments(filter),
  ]);

  return {
    books,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
}