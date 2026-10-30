import { z } from 'zod';
import { passwordPattern } from './password.js';

export const registrationSchema = z.object({
  name: z.string().trim().min(2, 'Name must contain at least 2 characters.').max(80),
  email: z.string().trim().email('Enter a valid email address.').max(254).transform((value) => value.toLowerCase()),
  password: z.string().regex(passwordPattern, 'Password must be 8-72 characters with upper, lower and numeric characters.'),
});

export const loginSchema = z.object({
  email: z.string().trim().email('Enter a valid email address.').max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(1, 'Password is required.'),
});
