import { z } from 'zod';

const required = (label) => ({ error: `${label} is required.` });
const namePattern = /^[\p{L}][\p{L} .'-]*$/u;
const placePattern = /^[\p{L}\p{N}][\p{L}\p{N} .'-]*$/u;

/**
 * Delivery address. Deliberately NOT restricted to one country: the postal code and phone rules
 * are generic. Tighten them only if the team confirms an India-only requirement.
 */
export const addressSchema = z.object(
  {
  fullName: z.string(required('Full name')).trim()
    .min(2, 'Full name must be at least 2 characters.')
    .max(100, 'Full name must be at most 100 characters.')
    .regex(namePattern, 'Full name may contain only letters, spaces, apostrophes, dots and hyphens.'),
  phone: z.string(required('Phone number')).trim()
    .refine((value) => /^\+?[0-9]{7,15}$/.test(value.replace(/[\s().-]/g, '')), 'Enter a valid phone number (7 to 15 digits).'),
  line1: z.string(required('Address line 1')).trim()
    .min(3, 'Address line 1 must be at least 3 characters.')
    .max(150, 'Address line 1 must be at most 150 characters.'),
  line2: z.string().trim().max(150, 'Address line 2 must be at most 150 characters.').optional(),
  city: z.string(required('City')).trim()
    .min(2, 'City must be at least 2 characters.')
    .max(80, 'City must be at most 80 characters.')
    .regex(placePattern, 'Enter a valid city.'),
  state: z.string(required('State or region')).trim()
    .min(2, 'State or region must be at least 2 characters.')
    .max(80, 'State or region must be at most 80 characters.')
    .regex(placePattern, 'Enter a valid state or region.'),
  postalCode: z.string(required('Postal code')).trim()
    .regex(/^[A-Za-z0-9][A-Za-z0-9 -]{1,8}[A-Za-z0-9]$/, 'Enter a valid postal code (3 to 10 letters or digits).'),
  country: z.string(required('Country')).trim()
    .min(2, 'Country must be at least 2 characters.')
    .max(56, 'Country must be at most 56 characters.')
    .regex(namePattern, 'Enter a valid country.'),
  },
  required('Delivery address'),
);

// Flat request body (address fields plus shippingOption) so validation errors map straight to form fields.
export const checkoutSummarySchema = addressSchema.extend({
  shippingOption: z.string(required('Shipping option')).trim().min(1, 'Choose a shipping option.'),
});
