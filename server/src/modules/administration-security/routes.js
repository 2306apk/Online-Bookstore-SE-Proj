
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
  updateBookSchema,
  updateCategorySchema,
} from './schemas.js';
import {
  createBook,
  createCategory,
  deactivateBook,
  listAdminBooks,
  listAdminCategories,
  updateBook,
  updateCategory,
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
