import { z } from 'zod';

const optionalUrl = z.string().trim().max(1000).refine((value) => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}, 'Cover URL must be a valid HTTP or HTTPS URL.').default('');

const bookFields = {
  publisher: z.string().trim().max(150).default(''),
  title: z.string().trim().min(1).max(200),
  author: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).default(''),
  keywords: z.array(z.string().trim().min(1).max(50)).max(20).default([]),
  price: z.number().positive().max(1000000),
  coverUrl: optionalUrl,
  stock: z.number().int().min(0).max(1000000),
  active: z.boolean().default(true),
  category: z.string().trim().min(1),
};

export const createBookSchema = z.object(bookFields);
export const updateBookSchema = z.object({
  publisher: bookFields.publisher.optional(),
  title: bookFields.title.optional(),
  author: bookFields.author.optional(),
  description: bookFields.description.optional(),
  keywords: bookFields.keywords.optional(),
  price: bookFields.price.optional(),
  coverUrl: optionalUrl.optional(),
  stock: bookFields.stock.optional(),
  active: bookFields.active.optional(),
  category: bookFields.category.optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one book field is required.');

export const createCategorySchema = z.object({
  name: z.string().trim().min(2).max(60),
  description: z.string().trim().max(240).default(''),
  active: z.boolean().default(true),
});

export const updateCategorySchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  description: z.string().trim().max(240).optional(),
  active: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'At least one category field is required.');

export const restockBookSchema = z.object({
  quantity: z.number().int({ message: 'Restock quantity must be a whole number.' })
    .positive({ message: 'Restock quantity must be greater than zero.' })
    .max(1000000, { message: 'Restock quantity cannot exceed 1,000,000.' }),
});

export const updateAdminOrderStatusSchema = z.object({
  status: z.enum(['SHIPPED', 'DELIVERED'], {
    errorMap: () => ({ message: 'Status must be SHIPPED or DELIVERED.' }),
  }),
});

export const updateReviewStatusSchema = z.object({
  status: z.enum(['APPROVED', 'FLAGGED', 'REJECTED', 'DELETED'], {
    errorMap: () => ({ message: 'Status must be APPROVED, FLAGGED, REJECTED, or DELETED.' }),
  }),
});


