import express from 'express';
import { asyncHandler } from '../../middleware/errors.js';
import { validate } from '../../middleware/validate.js';
import { authenticate, requireRole } from '../authentication-security/middleware.js';
import { wishlistItemSchema } from './wishlist.schemas.js';
import { addToWishlist, getWishlist, moveWishlistItemToCart, removeFromWishlist } from './wishlist.service.js';

const router = express.Router();
const customerOnly = [authenticate, requireRole('CUSTOMER')];

router.get('/', ...customerOnly, asyncHandler(async (request, response) => {
  response.json({ wishlist: await getWishlist(request.user.id) });
}));

router.post('/', ...customerOnly, validate(wishlistItemSchema), asyncHandler(async (request, response) => {
  const { wishlist, created } = await addToWishlist(request.user.id, request.body);
  response.status(created ? 201 : 200).json({ wishlist });
}));

router.post('/:bookId/move-to-cart', ...customerOnly, asyncHandler(async (request, response) => {
  response.json(await moveWishlistItemToCart(request.user.id, request.params.bookId));
}));

router.delete('/:bookId', ...customerOnly, asyncHandler(async (request, response) => {
  response.json({ wishlist: await removeFromWishlist(request.user.id, request.params.bookId) });
}));

export default router;
