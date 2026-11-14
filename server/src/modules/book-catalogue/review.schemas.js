
import { z } from 'zod';
import { REVIEW_STATUSES } from './models/Review.js';

export const createReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(10).max(1000),
});

export const updateReviewModerationSchema = z.object({
  status: z.enum(REVIEW_STATUSES, {
    errorMap: () => ({ message: `Status must be one of: ${REVIEW_STATUSES.join(', ')}.` }),
  }),
});

