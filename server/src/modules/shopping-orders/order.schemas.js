import { z } from 'zod';
import { checkoutSummarySchema } from './checkout.schemas.js';
import { PAYMENT_SCENARIOS } from './payment.gateway.js';

// Flat body (validate() reports field names for flat objects only). Unknown keys, including any
// price, total or card details a client might send, are stripped and never read.
export const createOrderSchema = checkoutSummarySchema.extend({
  idempotencyKey: z
    .string({ error: 'A checkout reference is required.' })
    .trim()
    .regex(/^[A-Za-z0-9_-]{16,64}$/, 'The checkout reference must be 16 to 64 letters, digits, "-" or "_".'),
  paymentScenario: z.enum(PAYMENT_SCENARIOS, { error: 'Choose a valid simulated payment outcome.' }).default('SUCCESS'),
});
