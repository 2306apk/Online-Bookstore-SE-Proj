import { z } from 'zod';

const optionalSearch = z.string().trim().max(100).optional().transform((value) => value || undefined);

export const catalogueQuerySchema = z.object({
  q: optionalSearch,
  title: optionalSearch,
  author: optionalSearch,
  keyword: optionalSearch,
  page: z.coerce.number().int().min(1).max(10000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
});
