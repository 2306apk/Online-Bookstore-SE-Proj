import express from 'express';
import { asyncHandler } from '../../middleware/errors.js';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireRole } from '../authentication-security/middleware.js';
import { checkoutSummarySchema } from './checkout.schemas.js';
import { buildCheckoutSummary, getCheckoutOptions } from './checkout.service.js';

const router = express.Router();
const customerOnly = [authenticate, requireRole('CUSTOMER')];

router.get('/options', ...customerOnly, asyncHandler(async (request, response) => {
  response.json({ options: getCheckoutOptions() });
}));

router.post('/summary', ...customerOnly, validate(checkoutSummarySchema), asyncHandler(async (request, response) => {
  const { shippingOption, ...address } = request.body;
  response.json({ summary: await buildCheckoutSummary(request.user.id, { address, shippingOption }) });
}));

export default router;
