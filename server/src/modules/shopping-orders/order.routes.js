import express from 'express';
import { asyncHandler } from '../../middleware/errors.js';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireRole } from '../authentication-security/middleware.js';
import { createOrderSchema } from './order.schemas.js';
import { createOrder, getOwnOrder } from './order.service.js';

const router = express.Router();
const customerOnly = [authenticate, requireRole('CUSTOMER')];

router.post('/', ...customerOnly, validate(createOrderSchema), asyncHandler(async (request, response) => {
  const { shippingOption, idempotencyKey, paymentScenario, ...address } = request.body;
  const { order, replayed } = await createOrder(request.user.id, { address, shippingOption, idempotencyKey, paymentScenario });
  response.status(replayed ? 200 : 201).json({ order, replayed });
}));

router.get('/:orderId', ...customerOnly, asyncHandler(async (request, response) => {
  response.json({ order: await getOwnOrder(request.user.id, request.params.orderId) });
}));

export default router;
