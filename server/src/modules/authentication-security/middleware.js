import jwt from 'jsonwebtoken';
import config from '../../config/env.js';
import { AppError } from '../../middleware/errors.js';
import { findUserById, toSafeUser } from './service.js';

function getToken(request) {
  const cookieToken = request.cookies?.[config.cookieName];
  if (cookieToken) {
    return cookieToken;
  }

  const authorization = request.get('authorization');
  if (authorization?.startsWith('Bearer ')) {
    return authorization.slice(7);
  }

  return null;
}

export async function authenticate(request, response, next) {
  const token = getToken(request);
  if (!token) {
    next(new AppError(401, 'Authentication is required.', 'AUTHENTICATION_REQUIRED'));
    return;
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    const user = await findUserById(payload.sub);
    if (!user) {
      throw new AppError(401, 'The session is no longer valid.', 'INVALID_SESSION');
    }

    request.user = toSafeUser(user);
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    next(new AppError(401, 'The session is invalid or has expired.', 'INVALID_SESSION'));
  }
}

export function requireRole(...roles) {
  return (request, response, next) => {
    if (!request.user) {
      next(new AppError(401, 'Authentication is required.', 'AUTHENTICATION_REQUIRED'));
      return;
    }

    if (!roles.includes(request.user.role)) {
      next(new AppError(403, 'You do not have permission to perform this action.', 'FORBIDDEN'));
      return;
    }

    next();
  };
}
