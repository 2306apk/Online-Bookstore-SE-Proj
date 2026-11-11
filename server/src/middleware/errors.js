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

  // 1. Handle JSON parsing errors from express.json()
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    response.status(400).json({
      error: {
        code: 'INVALID_JSON',
        message: 'The request payload contains malformed JSON.',
      },
    });
    return;
  }

  // 2. Handle Zod validation errors
  if (error?.name === 'ZodError') {
    const details = typeof error.flatten === 'function'
      ? error.flatten().fieldErrors
      : error.errors;
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Please correct the highlighted fields.',
        ...(details ? { details } : {}),
      },
    });
    return;
  }

  // 3. Handle Mongoose Validation Errors
  if (error?.name === 'ValidationError') {
    const details = error.errors
      ? Object.fromEntries(
          Object.entries(error.errors).map(([field, err]) => [field, [err.message]])
        )
      : undefined;
    response.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'The submitted data is invalid.',
        ...(details ? { details } : {}),
      },
    });
    return;
  }

  // 4. Handle Mongoose CastError (e.g. invalid MongoDB ObjectId)
  if (error?.name === 'CastError') {
    response.status(400).json({
      error: {
        code: 'INVALID_IDENTIFIER',
        message: `Invalid format for identifier '${error.path || 'id'}'.`,
      },
    });
    return;
  }

  // 5. Handle MongoDB Duplicate Key Error (E11000)
  if (error?.code === 11000) {
    response.status(409).json({
      error: {
        code: 'DUPLICATE_RESOURCE',
        message: 'A resource with those details already exists.',
      },
    });
    return;
  }

  // 6. Handle Known Operational Application Errors (AppError)
  const isAppError = error instanceof AppError || (Number.isInteger(error?.statusCode) && error.statusCode < 500);
  const statusCode = Number.isInteger(error?.statusCode) ? error.statusCode : 500;
  const isServerFault = statusCode >= 500;

  if (isServerFault) {
    // Log complete internal error and stack trace on server console ONLY
    console.error(`[API ERROR] ${request.method} ${request.originalUrl}:`, error);
  }

  // Safe user-friendly message: Never expose raw system error messages or stack traces on 500 errors
  const message = isServerFault ? 'An unexpected server error occurred.' : (error?.message || 'The request could not be completed.');
  const code = isServerFault ? 'INTERNAL_ERROR' : (error?.code || 'REQUEST_ERROR');

  const errorPayload = {
    code,
    message,
    ...(error?.details ? { details: error.details } : {}),
  };

  // Strictly ensure no stack or sensitive properties are ever attached
  delete errorPayload.stack;

  response.status(statusCode).json({
    error: errorPayload,
  });
}
