export class AppError extends Error {
  constructor(statusCode, message, code = 'REQUEST_ERROR', details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function asyncHandler(handler) {
  return (request, response, next) => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}

export function notFoundHandler(request, response, next) {
  next(new AppError(404, 'The requested resource was not found.', 'NOT_FOUND'));
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  if (error?.name === 'ValidationError') {
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The submitted data is invalid.',
      },
    });
    return;
  }

  if (error?.code === 11000) {
    response.status(409).json({
      error: {
        code: 'DUPLICATE_RESOURCE',
        message: 'A resource with those details already exists.',
      },
    });
    return;
  }

  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const message = statusCode >= 500 ? 'An unexpected server error occurred.' : error.message;

  if (statusCode >= 500) {
    console.error(`[api] ${request.method} ${request.originalUrl}: ${error?.message || 'unknown error'}`);
  }

  response.status(statusCode).json({
    error: {
      code: error?.code || 'INTERNAL_ERROR',
      message,
      ...(error?.details ? { details: error.details } : {}),
    },
  });
}
