
import mongoose from 'mongoose';
import { AppError } from '../../middleware/errors.js';
import { Book } from './models/Book.js';
import { Review, REVIEW_STATUSES } from './models/Review.js';
import { Order } from '../shopping-orders/models/Order.js';

export function serializeReview(review) {
  return {
    id: String(review._id || review.id),
    rating: review.rating,
    comment: review.comment,
    customerName: review.customer?.name || 'Customer',
    customerEmail: review.customer?.email,
    customerId: review.customer?._id ? String(review.customer._id) : String(review.customer || ''),
    bookId: review.book?._id ? String(review.book._id) : String(review.book || ''),
    bookTitle: review.book?.title,
    bookAuthor: review.book?.author,
    status: review.status || 'APPROVED',
    isVerifiedPurchase: Boolean(review.isVerifiedPurchase),
    createdAt: review.createdAt,
    updatedAt: review.updatedAt,
  };
}

export async function listBookReviews(bookId) {
  if (!mongoose.isValidObjectId(bookId)) {
    throw new AppError(400, 'Invalid book identifier.', 'INVALID_IDENTIFIER');
  }

  const book = await Book.findOne({
    _id: bookId,
    active: true,
  })
    .select('_id')
    .lean();

  if (!book) {
    throw new AppError(404, 'Book not found.', 'NOT_FOUND');
  }

  const visibleFilter = {
    book: book._id,
    status: 'APPROVED',
  };

  const [reviews, summary] = await Promise.all([
    Review.find(visibleFilter)
      .populate('customer', 'name')
      .sort({ createdAt: -1 })
      .lean()
      .exec(),

    Review.aggregate([
      { $match: visibleFilter },
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
      customerId: review.customer?._id ? String(review.customer._id) : String(review.customer || ''),
      status: review.status || 'APPROVED',
      isVerifiedPurchase: Boolean(review.isVerifiedPurchase),
      createdAt: review.createdAt,
    })),
    rating: {
      average: Number(aggregate.averageRating.toFixed(1)),
      count: aggregate.reviewCount,
    },
  };
}

export async function createBookReview(bookId, customerId, data) {
  if (!mongoose.isValidObjectId(bookId)) {
    throw new AppError(400, 'Invalid book identifier.', 'INVALID_IDENTIFIER');
  }

  const book = await Book.findOne({
    _id: bookId,
    active: true,
  })
    .select('_id')
    .lean();

  if (!book) {
    throw new AppError(404, 'Book not found.', 'NOT_FOUND');
  }

  const isVerifiedPurchase = Boolean(
    await Order.exists({
      user: customerId,
      'items.book': book._id,
      status: { $in: ['PLACED', 'SHIPPED', 'DELIVERED'] },
    })
  );

  try {
    const review = await Review.create({
      book: book._id,
      customer: customerId,
      rating: data.rating,
      comment: data.comment,
      status: 'APPROVED',
      isVerifiedPurchase,
    });

    await review.populate('customer', 'name');

    return {
      id: String(review._id),
      rating: review.rating,
      comment: review.comment,
      customerName: review.customer?.name || 'Customer',
      customerId: String(review.customer?._id || customerId),
      status: review.status,
      isVerifiedPurchase: review.isVerifiedPurchase,
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

export async function deleteOwnReview(bookId, customerId) {
  if (!mongoose.isValidObjectId(bookId)) {
    throw new AppError(400, 'Invalid book identifier.', 'INVALID_IDENTIFIER');
  }

  const review = await Review.findOne({
    book: bookId,
    customer: customerId,
  });

  if (!review) {
    throw new AppError(404, 'Review not found.', 'REVIEW_NOT_FOUND');
  }

  await Review.deleteOne({ _id: review._id });
  return { message: 'Review deleted successfully.' };
}

export async function listAdminReviews({ status, page = 1, limit = 20 } = {}) {
  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

  const filter = {};
  if (status && status !== 'ALL' && REVIEW_STATUSES.includes(status)) {
    filter.status = status;
  }

  const skip = (pageNumber - 1) * pageSize;

  const [reviews, total] = await Promise.all([
    Review.find(filter)
      .populate('book', 'title author coverImage')
      .populate('customer', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .exec(),
    Review.countDocuments(filter),
  ]);

  return {
    reviews: reviews.map(serializeReview),
    pagination: {
      page: pageNumber,
      limit: pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function updateReviewModerationStatus(reviewId, status) {
  if (!mongoose.isValidObjectId(reviewId)) {
    throw new AppError(400, 'Invalid review identifier.', 'INVALID_IDENTIFIER');
  }

  if (!REVIEW_STATUSES.includes(status)) {
    throw new AppError(
      400,
      `Status must be one of: ${REVIEW_STATUSES.join(', ')}.`,
      'INVALID_STATUS'
    );
  }

  const review = await Review.findById(reviewId);
  if (!review) {
    throw new AppError(404, 'Review not found.', 'REVIEW_NOT_FOUND');
  }

  review.status = status;
  await review.save();

  await review.populate('book', 'title author coverImage');
  await review.populate('customer', 'name email');

  return serializeReview(review);
}

export async function deleteAdminReview(reviewId) {
  if (!mongoose.isValidObjectId(reviewId)) {
    throw new AppError(400, 'Invalid review identifier.', 'INVALID_IDENTIFIER');
  }

  const review = await Review.findByIdAndDelete(reviewId);
  if (!review) {
    throw new AppError(404, 'Review not found.', 'REVIEW_NOT_FOUND');
  }

  return { message: 'Review deleted successfully.' };
}

