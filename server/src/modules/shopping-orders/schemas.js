import { z } from 'zod';

export const addCartItemSchema = z.object({
  bookId: z.string().trim().min(1, 'Book is required.'),
  quantity: z.number().int('Quantity must be a whole number.').positive('Quantity must be positive.').max(100).default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int('Quantity must be a whole number.').positive('Quantity must be positive.').max(100),
});
