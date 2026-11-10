import express from 'express';
import { asyncHandler } from '../../middleware/errors.js';
import { validate } from '../../middleware/validate.js';
import { catalogueQuerySchema } from './schemas.js';
import { listCategories, listPublicBooks } from './service.js';

const router = express.Router();

router.get('/', validate(catalogueQuerySchema, 'query'), asyncHandler(async (request, response) => {
  response.json(await listPublicBooks(request.query));
}));

router.get('/categories', asyncHandler(async (request, response) => {
  response.json({ categories: await listCategories() });
}));

export default router;
