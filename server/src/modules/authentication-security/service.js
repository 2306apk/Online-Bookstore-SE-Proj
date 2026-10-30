import jwt from 'jsonwebtoken';
import config from '../../config/env.js';
import { AppError } from '../../middleware/errors.js';
import { User } from './models/User.js';
import { hashPassword, verifyPassword } from './password.js';

export function toSafeUser(user) {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
  };
}

export async function registerUser({ name, email, password }) {
  const existingUser = await User.exists({ email });
  if (existingUser) {
    throw new AppError(409, 'An account with that email already exists.', 'EMAIL_IN_USE');
  }

  const passwordHash = await hashPassword(password);
  const user = await User.create({ name, email, passwordHash, role: 'CUSTOMER' });
  return toSafeUser(user);
}

export async function authenticateUser({ email, password }) {
  const user = await User.findOne({ email }).select('+passwordHash');
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw new AppError(401, 'Email or password is incorrect.', 'INVALID_CREDENTIALS');
  }

  return toSafeUser(user);
}

export function createAccessToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn },
  );
}

export async function findUserById(id) {
  return User.findById(id);
}
