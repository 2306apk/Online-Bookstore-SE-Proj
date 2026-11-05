import { Router } from 'express';
import { browseBooks } from './service.js';
import { searchBooks } from './search.js';
import { validateBrowseQuery } from './schemas.js';

const router = Router();

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

export default router;