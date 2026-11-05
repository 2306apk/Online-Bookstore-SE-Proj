import { Router } from 'express';
import { browseBooks } from './service.js';
import { validateBrowseQuery } from './schemas.js';

const router = Router();

router.get('/', async (request, response, next) => {
  try {
    const validation = validateBrowseQuery(request.query);

    if (!validation.valid) {
      return response.status(400).json({
        error: validation.message,
      });
    }

    const result = await browseBooks(validation.value);

    return response.status(200).json(result);
  } catch (error) {
    return next(error);
  }
});

export default router;