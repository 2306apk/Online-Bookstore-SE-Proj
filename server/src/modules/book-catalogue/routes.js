
import { Router } from 'express';
import { browseBooks, toBook, toCategory } from './service.js';
import { AppError, asyncHandler } from '../../middleware/errors.js';
import { searchBooks } from './search.js';
import { validateBrowseQuery } from './schemas.js';
import { Category } from './models/Category.js';
import { Book } from './models/Book.js';

const router = Router();

router.get('/categories', async (request, response) => {
  try {
    const categories = await Category.find({ active: true })
      .select('name slug')
      .sort({ name: 1 })
      .lean()
      .exec();

    return response.status(200).json({
      categories: categories.map(toCategory)
    });
  } catch {
    return response.status(500).json({
      message: 'Unable to load categories'
    });
  }
});

router.get('/filters', async (request, response) => {
  try {
    const [categories, priceData] = await Promise.all([
      Category.find({ active: true })
        .select('name slug')
        .sort({ name: 1 })
        .lean()
        .exec(),

      Book.aggregate([
        { $match: { active: true } },
        {
          $group: {
            _id: null,
            min: { $min: '$price' },
            max: { $max: '$price' }
          }
        }
      ])
    ]);

    const priceRange = priceData.length > 0
      ? { min: priceData[0].min, max: priceData[0].max }
      : { min: 0, max: 0 };

    return response.status(200).json({
      categories: categories.map(toCategory),
      priceRange
    });
  } catch {
    return response.status(500).json({
      message: 'Unable to load catalogue filters'
    });
  }
});

router.get('/', async (request, response) => {
  try {
    const query = validateBrowseQuery(request.query);

    const hasSearch =
      Boolean(query.q) ||
      Boolean(query.author) ||
      Boolean(query.keyword);

    const result = hasSearch
      ? await searchBooks(query)
      : await browseBooks(query);

    return response.status(200).json(result);
  } catch (error) {
    return response.status(400).json({
      message: error.message || 'Invalid catalogue query'
    });
  }
});
router.get(
  '/:id',
  asyncHandler(async (request, response) => {
    if (!/^[a-f\d]{24}$/i.test(request.params.id)) {
      throw new AppError(
        400,
        'Invalid book identifier.',
        'INVALID_IDENTIFIER'
      );
    }

    const book = await Book.findOne({
      _id: request.params.id,
      active: true,
    })
      .populate('category', 'name slug')
      .exec();

    if (!book) {
      throw new AppError(
        404,
        'Book not found.',
        'NOT_FOUND'
      );
    }

    return response.status(200).json({
      book: toBook(book),
    });
  })
);
export default router;
