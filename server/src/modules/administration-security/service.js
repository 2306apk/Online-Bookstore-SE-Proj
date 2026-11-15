
import mongoose from 'mongoose';
import { AppError } from '../../middleware/errors.js';
import { Book } from '../book-catalogue/models/Book.js';
import { Category } from '../book-catalogue/models/Category.js';
import { toBook, toCategory } from '../book-catalogue/service.js';
import { Order, ORDER_STATUSES } from '../shopping-orders/models/Order.js';
import { advanceOrderStatus } from '../shopping-orders/order.lifecycle.service.js';
import { serializeOrder } from '../shopping-orders/order.service.js';
import {
  listAdminReviews,
  updateReviewModerationStatus,
  deleteAdminReview,
} from '../book-catalogue/review.service.js';

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

export function serializeAdminOrder(order) {
  const base = serializeOrder(order);
  return {
    ...base,
    customer:
      order.user && typeof order.user === 'object' && (order.user.name || order.user.email)
        ? {
            id: String(order.user._id || order.user.id),
            name: order.user.name || 'Customer',
            email: order.user.email || '',
          }
        : { id: String(order.user) },
  };
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

  for (const field of [
    'title',
    'author',
    'publisher',
    'description',
    'keywords',
    'price',
    'coverUrl',
    'stock',
    'active',
  ]) {
    if (data[field] !== undefined) book[field] = data[field];
  }

  await book.save();
  await book.populate('category');
  return toBook(book);
}

export async function deactivateBook(bookId) {
  return updateBook(bookId, { active: false });
}

export async function restockBook(bookId, quantity) {
  if (!mongoose.isValidObjectId(bookId)) {
    throw new AppError(400, 'The book identifier is invalid.', 'INVALID_BOOK_ID');
  }

  const parsedQty = Number(quantity);
  if (!Number.isInteger(parsedQty) || parsedQty <= 0) {
    throw new AppError(400, 'Restock quantity must be a positive integer.', 'INVALID_QUANTITY');
  }

  const book = await Book.findByIdAndUpdate(
    bookId,
    { $inc: { stock: parsedQty } },
    { new: true, runValidators: true }
  ).populate('category');

  if (!book) {
    throw new AppError(404, 'The book was not found.', 'BOOK_NOT_FOUND');
  }

  return toBook(book);
}

export async function listAdminOrders({ status, page = 1, limit = 20 } = {}) {
  const pageNumber = Math.max(1, parseInt(page, 10) || 1);
  const pageSize = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));

  const filter = {};
  if (status && status !== 'ALL' && ORDER_STATUSES.includes(status)) {
    filter.status = status;
  }

  const skip = (pageNumber - 1) * pageSize;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .exec(),
    Order.countDocuments(filter),
  ]);

  return {
    orders: orders.map(serializeAdminOrder),
    pagination: {
      page: pageNumber,
      limit: pageSize,
      total,
      pages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

export async function getAdminOrder(orderId) {
  if (!mongoose.isValidObjectId(orderId)) {
    throw new AppError(400, 'The order identifier is invalid.', 'INVALID_ORDER_ID');
  }

  const order = await Order.findById(orderId).populate('user', 'name email');
  if (!order) {
    throw new AppError(404, 'The order was not found.', 'ORDER_NOT_FOUND');
  }

  return serializeAdminOrder(order);
}

export async function getAdminOrderSummary() {
  const [totalOrders, statusBreakdown, revenueData] = await Promise.all([
    Order.countDocuments(),
    Order.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
        },
      },
    ]),
    Order.aggregate([
      {
        $match: {
          status: { $in: ['PLACED', 'SHIPPED', 'DELIVERED'] },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$total' },
        },
      },
    ]),
  ]);

  const statusCounts = {
    PLACED: 0,
    SHIPPED: 0,
    DELIVERED: 0,
    CANCELLED: 0,
  };
  for (const item of statusBreakdown) {
    if (item._id in statusCounts) {
      statusCounts[item._id] = item.count;
    }
  }

  const totalRevenue = revenueData.length > 0 ? Number(revenueData[0].totalRevenue.toFixed(2)) : 0;

  return {
    totalOrders,
    totalRevenue,
    statusCounts,
  };
}

export async function updateAdminOrderStatus(orderId, status) {
  return advanceOrderStatus(orderId, status);
}

export {
  listAdminReviews,
  updateReviewModerationStatus,
  deleteAdminReview,
};

