
import express from 'express';
import { asyncHandler } from '../../middleware/errors.js';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireRole } from '../authentication-security/middleware.js';
import {
  getAuditContext,
  recordSecurityEvent,
} from '../authentication-security/audit.service.js';
import {
  createBookSchema,
  createCategorySchema,
  restockBookSchema,
  updateAdminOrderStatusSchema,
  updateBookSchema,
  updateCategorySchema,
  updateReviewStatusSchema,
} from './schemas.js';
import {
  createBook,
  createCategory,
  deactivateBook,
  deleteAdminReview,
  getAdminOrder,
  getAdminOrderSummary,
  listAdminBooks,
  listAdminCategories,
  listAdminOrders,
  listAdminReviews,
  restockBook,
  updateAdminOrderStatus,
  updateBook,
  updateCategory,
  updateReviewModerationStatus,
} from './service.js';

// Record successful administrative actions without sensitive data.
async function logAdminAction(request, eventType) {
  await recordSecurityEvent({
    eventType,
    userId: request.user.id,
    outcome: 'SUCCESS',
    ...getAuditContext(request),
  });
}

const router = express.Router();

// All admin routes require authentication and ADMIN role.
router.use(authenticate, requireRole('ADMIN'));

// ==================== BOOK MANAGEMENT ====================

// Get all books.
router.get('/books', asyncHandler(async (request, response) => {
  response.json({ books: await listAdminBooks() });
}));

// Create a new book.
router.post('/books', validate(createBookSchema), asyncHandler(async (request, response) => {
  const book = await createBook(request.body);

  await logAdminAction(request, 'ADMIN_BOOK_CREATED');

  response.status(201).json({ book });
}));

// Update a book using PATCH.
router.patch('/books/:bookId', validate(updateBookSchema), asyncHandler(async (request, response) => {
  const book = await updateBook(request.params.bookId, request.body);

  await logAdminAction(request, 'ADMIN_BOOK_UPDATED');

  response.json({ book });
}));

// Update a book using PUT.
router.put('/books/:bookId', validate(updateBookSchema), asyncHandler(async (request, response) => {
  const book = await updateBook(request.params.bookId, request.body);

  await logAdminAction(request, 'ADMIN_BOOK_UPDATED');

  response.json({ book });
}));

// Deactivate a book.
router.delete('/books/:bookId', asyncHandler(async (request, response) => {
  const book = await deactivateBook(request.params.bookId);

  await logAdminAction(request, 'ADMIN_BOOK_DEACTIVATED');

  response.json({ book });
}));

// Restock book inventory.
router.post('/books/:bookId/restock', validate(restockBookSchema), asyncHandler(async (request, response) => {
  const book = await restockBook(request.params.bookId, request.body.quantity);

  await logAdminAction(request, 'ADMIN_BOOK_RESTOCKED');

  response.json({ book });
}));

// ==================== ORDER FULFILLMENT ====================

// Order summary and sales statistics.
router.get('/orders/summary', asyncHandler(async (request, response) => {
  const summary = await getAdminOrderSummary();
  response.json({ summary });
}));

// List all orders with optional status filter and pagination.
router.get('/orders', asyncHandler(async (request, response) => {
  const result = await listAdminOrders(request.query);
  response.json(result);
}));

// Get a single order detail.
router.get('/orders/:orderId', asyncHandler(async (request, response) => {
  const order = await getAdminOrder(request.params.orderId);
  response.json({ order });
}));

// Advance order fulfillment status (PLACED -> SHIPPED -> DELIVERED).
router.patch('/orders/:orderId/status', validate(updateAdminOrderStatusSchema), asyncHandler(async (request, response) => {
  const order = await updateAdminOrderStatus(request.params.orderId, request.body.status);

  await logAdminAction(request, 'ADMIN_ORDER_STATUS_UPDATED');

  response.json({ order });
}));

router.put('/orders/:orderId/status', validate(updateAdminOrderStatusSchema), asyncHandler(async (request, response) => {
  const order = await updateAdminOrderStatus(request.params.orderId, request.body.status);

  await logAdminAction(request, 'ADMIN_ORDER_STATUS_UPDATED');

  response.json({ order });
}));

// ==================== REVIEW MODERATION ====================

// List all reviews with optional status filter and pagination.
router.get('/reviews', asyncHandler(async (request, response) => {
  const result = await listAdminReviews(request.query);
  response.json(result);
}));

// Moderate a review (APPROVED, FLAGGED, REJECTED, DELETED).
router.patch('/reviews/:reviewId/status', validate(updateReviewStatusSchema), asyncHandler(async (request, response) => {
  const review = await updateReviewModerationStatus(request.params.reviewId, request.body.status);

  await logAdminAction(request, 'ADMIN_REVIEW_MODERATED');

  response.json({ review });
}));

router.put('/reviews/:reviewId/status', validate(updateReviewStatusSchema), asyncHandler(async (request, response) => {
  const review = await updateReviewModerationStatus(request.params.reviewId, request.body.status);

  await logAdminAction(request, 'ADMIN_REVIEW_MODERATED');

  response.json({ review });
}));

// Delete an inappropriate review.
router.delete('/reviews/:reviewId', asyncHandler(async (request, response) => {
  const result = await deleteAdminReview(request.params.reviewId);

  await logAdminAction(request, 'ADMIN_REVIEW_DELETED');

  response.json(result);
}));

// ==================== CATEGORY MANAGEMENT ====================

// Get all categories.
router.get('/categories', asyncHandler(async (request, response) => {
  response.json({ categories: await listAdminCategories() });
}));

// Create a new category.
router.post('/categories', validate(createCategorySchema), asyncHandler(async (request, response) => {
  const category = await createCategory(request.body);

  await logAdminAction(request, 'ADMIN_CATEGORY_CREATED');

  response.status(201).json({ category });
}));

// Update a category using PATCH.
router.patch('/categories/:categoryId', validate(updateCategorySchema), asyncHandler(async (request, response) => {
  const category = await updateCategory(request.params.categoryId, request.body);

  await logAdminAction(request, 'ADMIN_CATEGORY_UPDATED');

  response.json({ category });
}));

// Update a category using PUT.
router.put('/categories/:categoryId', validate(updateCategorySchema), asyncHandler(async (request, response) => {
  const category = await updateCategory(request.params.categoryId, request.body);

  await logAdminAction(request, 'ADMIN_CATEGORY_UPDATED');

  response.json({ category });
}));

export default router;
