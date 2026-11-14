import express from 'express';
import rateLimit from 'express-rate-limit';
import config from '../../config/env.js';
import { asyncHandler, AppError } from '../../middleware/errors.js';
import { validate } from '../../middleware/validate.js';
import { authenticate } from './middleware.js';
import { registrationSchema, loginSchema } from './schemas.js';
import { authenticateUser, createAccessToken, registerUser } from './service.js';
import { getAuditContext, recordSecurityEvent } from './audit.service.js';

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 50,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many authentication attempts. Try again later.' } },
});

function setSessionCookie(response, token) {
  response.cookie(config.cookieName, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: 2 * 60 * 60 * 1000,
  });
}

router.post('/register', authLimiter, validate(registrationSchema), asyncHandler(async (request, response) => {
  const user = await registerUser(request.body);
  const token = createAccessToken(user);
  setSessionCookie(response, token);
  response.status(201).json({ user });
}));


router.post('/login', authLimiter, validate(loginSchema), asyncHandler(async (request, response) => {
  let user;

  try {
    user = await authenticateUser(request.body);
  } catch (error) {
    if (error.code === 'INVALID_CREDENTIALS') {
      await recordSecurityEvent({
        eventType: 'LOGIN_FAILURE',
        outcome: 'FAILURE',
        ...getAuditContext(request),
      });
    }

    throw error;
  }

  const token = createAccessToken(user);
  setSessionCookie(response, token);

  await recordSecurityEvent({
    eventType: 'LOGIN_SUCCESS',
    userId: user.id,
    outcome: 'SUCCESS',
    ...getAuditContext(request),
  });

  response.json({ user });
}));


router.post('/logout', (request, response) => {
  response.clearCookie(config.cookieName, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
  });
  response.status(204).send();
});

router.get('/me', authenticate, asyncHandler(async (request, response) => {
  if (!request.user) {
    throw new AppError(401, 'Authentication is required.', 'AUTHENTICATION_REQUIRED');
  }
  response.json({ user: request.user });
}));

export default router;
