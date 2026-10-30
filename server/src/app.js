import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import config from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import authenticationRoutes from './modules/authentication-security/routes.js';
import administrationRoutes from './modules/administration-security/routes.js';
import bookCatalogueRoutes from './modules/book-catalogue/routes.js';
import shoppingRoutes from './modules/shopping-orders/routes.js';
import mongoose from 'mongoose';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());

app.get('/api/health', (request, response) => {
  response.json({
    status: 'ok',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

app.use('/api/auth', authenticationRoutes);
app.use('/api/books', bookCatalogueRoutes);
app.use('/api/cart', shoppingRoutes);
app.use('/api/admin', administrationRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;
