import express from 'express';
import { asyncHandler } from '../../middleware/errors.js';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireRole } from '../authentication-security/middleware.js';
import { addCartItemSchema, updateCartItemSchema } from './schemas.js';
import { addCartItem, getCart, removeCartItem, updateCartItem } from './service.js';

const router = express.Router();
const customerOnly = [authenticate, requireRole('CUSTOMER')];

router.get('/', ...customerOnly, asyncHandler(async (request, response) => {
  response.json({ cart: await getCart(request.user.id) });
}));

router.post('/', ...customerOnly, validate(addCartItemSchema), asyncHandler(async (request, response) => {
  response.status(201).json({ cart: await addCartItem(request.user.id, request.body) });
}));

router.patch('/:itemId', ...customerOnly, validate(updateCartItemSchema), asyncHandler(async (request, response) => {
  response.json({ cart: await updateCartItem(request.user.id, request.params.itemId, request.body) });
}));

router.put('/:itemId', ...customerOnly, validate(updateCartItemSchema), asyncHandler(async (request, response) => {
  response.json({ cart: await updateCartItem(request.user.id, request.params.itemId, request.body) });
}));

router.delete('/:itemId', ...customerOnly, asyncHandler(async (request, response) => {
  response.json({ cart: await removeCartItem(request.user.id, request.params.itemId) });
}));

export default router;
