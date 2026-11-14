import express from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../middleware/errors.js';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireRole } from '../authentication-security/middleware.js';
import { createOrderSchema } from './order.schemas.js';
import { createOrder, getOwnOrder } from './order.service.js';
import { advanceOrderStatus, cancelOwnOrder, listOwnOrders } from './order.lifecycle.service.js';

const router = express.Router();
const customerOnly = [authenticate, requireRole('CUSTOMER')];
const adminOnly = [authenticate, requireRole('ADMIN')];

const statusSchema = z.object({
  status: z.enum(['SHIPPED', 'DELIVERED'], { error: 'Status must be SHIPPED or DELIVERED.' }),
});

router.post('/', ...customerOnly, validate(createOrderSchema), asyncHandler(async (request, response) => {
  const { shippingOption, idempotencyKey, paymentScenario, ...address } = request.body;
  const { order, replayed } = await createOrder(request.user.id, { address, shippingOption, idempotencyKey, paymentScenario });
  response.status(replayed ? 200 : 201).json({ order, replayed });
}));

// Must be registered before '/:orderId' so "my-orders" is not read as an order id.
router.get('/my-orders', ...customerOnly, asyncHandler(async (request, response) => {
  response.json(await listOwnOrders(request.user.id, request.query));
}));

router.get('/:orderId', ...customerOnly, asyncHandler(async (request, response) => {
  response.json({ order: await getOwnOrder(request.user.id, request.params.orderId) });
}));

router.post('/:orderId/cancel', ...customerOnly, asyncHandler(async (request, response) => {
  const { order, replayed } = await cancelOwnOrder(request.user.id, request.params.orderId);
  response.json({ order, replayed });
}));

// Minimal staff action so orders can move Placed -> Shipped -> Delivered until full admin order
// management (SRS OBS-F-017) is built.
router.patch('/:orderId/status', ...adminOnly, validate(statusSchema), asyncHandler(async (request, response) => {
  response.json({ order: await advanceOrderStatus(request.params.orderId, request.body.status) });
}));

export default router;
