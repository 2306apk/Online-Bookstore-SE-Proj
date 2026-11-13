
import { AppError } from '../../middleware/errors.js';
import { Book } from './models/Book.js';
import { Review } from './models/Review.js';

export async function listBookReviews(bookId) {
  const book = await Book.findOne({
    _id: bookId,
    active: true,
  })
    .select('_id')
    .lean();

  if (!book) {
    throw new AppError(404, 'Book not found.', 'NOT_FOUND');
  }

  const [reviews, summary] = await Promise.all([
    Review.find({ book: book._id })
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .lean()
      .exec(),

    Review.aggregate([
      { $match: { book: book._id } },
      {
        $group: {
          _id: '$book',
          averageRating: { $avg: '$rating' },
          reviewCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  const aggregate = summary[0] || {
    averageRating: 0,
    reviewCount: 0,
  };

  return {
    reviews: reviews.map((review) => ({
      id: String(review._id),
      rating: review.rating,
      comment: review.comment,
      customerName: review.customer?.name || 'Customer',
      createdAt: review.createdAt,
    })),
    rating: {
      average: Number(aggregate.averageRating.toFixed(1)),
      count: aggregate.reviewCount,
    },
  };
}

export async function createBookReview(bookId, customerId, data) {
  const book = await Book.findOne({
    _id: bookId,
    active: true,
  })
    .select('_id')
    .lean();

  if (!book) {
    throw new AppError(404, 'Book not found.', 'NOT_FOUND');
  }

  try {
    const review = await Review.create({
      book: book._id,
      customer: customerId,
      rating: data.rating,
      comment: data.comment,
    });

    await review.populate('customer', 'name');

    return {
      id: String(review._id),
      rating: review.rating,
      comment: review.comment,
      customerName: review.customer?.name || 'Customer',
      createdAt: review.createdAt,
    };
  } catch (error) {
    if (error?.code === 11000) {
      throw new AppError(
        409,
        'You have already reviewed this book.',
        'DUPLICATE_REVIEW'
      );
    }

    throw error;
  }
}
