import { z } from 'zod';

export const wishlistItemSchema = z.object({
  bookId: z.string().trim().min(1, 'Book is required.'),
});
