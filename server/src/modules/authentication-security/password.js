import bcrypt from 'bcryptjs';

export const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}
