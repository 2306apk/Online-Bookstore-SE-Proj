import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const isProduction = process.env.NODE_ENV === 'production';

const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 5000),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/online_bookstore',
  jwtSecret: process.env.JWT_SECRET || (isProduction ? '' : 'local-development-secret-change-me-32-characters'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '2h',
  cookieName: process.env.COOKIE_NAME || 'online_bookstore_session',
  isProduction,
};

if (config.isProduction && config.jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters in production.');
}

export default config;
