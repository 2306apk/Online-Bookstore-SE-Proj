import express from 'express';
import { asyncHandler } from '../../middleware/errors.js';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireRole } from '../authentication-security/middleware.js';
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

const router = express.Router();
router.use(authenticate, requireRole('ADMIN'));

router.get('/books', asyncHandler(async (request, response) => {
  response.json({ books: await listAdminBooks() });
}));

router.post('/books', validate(createBookSchema), asyncHandler(async (request, response) => {
  response.status(201).json({ book: await createBook(request.body) });
}));

router.patch('/books/:bookId', validate(updateBookSchema), asyncHandler(async (request, response) => {
  response.json({ book: await updateBook(request.params.bookId, request.body) });
}));

router.put('/books/:bookId', validate(updateBookSchema), asyncHandler(async (request, response) => {
  response.json({ book: await updateBook(request.params.bookId, request.body) });
}));

router.delete('/books/:bookId', asyncHandler(async (request, response) => {
  response.json({ book: await deactivateBook(request.params.bookId) });
}));

router.get('/categories', asyncHandler(async (request, response) => {
  response.json({ categories: await listAdminCategories() });
}));

router.post('/categories', validate(createCategorySchema), asyncHandler(async (request, response) => {
  response.status(201).json({ category: await createCategory(request.body) });
}));

router.patch('/categories/:categoryId', validate(updateCategorySchema), asyncHandler(async (request, response) => {
  response.json({ category: await updateCategory(request.params.categoryId, request.body) });
}));

router.put('/categories/:categoryId', validate(updateCategorySchema), asyncHandler(async (request, response) => {
  response.json({ category: await updateCategory(request.params.categoryId, request.body) });
}));

export default router;

