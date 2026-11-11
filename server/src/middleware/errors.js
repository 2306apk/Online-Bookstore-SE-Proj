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
    const errorPayload = {
      code: 'INVALID_JSON',
      message: 'The request payload contains malformed JSON.',
    };
    response.status(400).json({
      error: errorPayload,
    });
    return;
  }

  // 2. Handle Zod validation errors
  if (error?.name === 'ZodError') {
    const details = typeof error.flatten === 'function'
      ? error.flatten().fieldErrors
      : error.errors;
    const errorPayload = {
      code: 'VALIDATION_ERROR',
      message: 'Please correct the highlighted fields.',
      ...(details ? { details } : {}),
    };
    response.status(400).json({
      error: errorPayload,
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
    const errorPayload = {
      code: 'VALIDATION_ERROR',
      message: 'The submitted data is invalid.',
      ...(details ? { details } : {}),
    };
    response.status(400).json({
      error: errorPayload,
    });
    return;
  }

  // 4. Handle Mongoose CastError (e.g. invalid MongoDB ObjectId)
  if (error?.name === 'CastError') {
    const errorPayload = {
      code: 'INVALID_IDENTIFIER',
      message: `Invalid format for identifier '${error.path || 'id'}'.`,
    };
    response.status(400).json({
      error: errorPayload,
    });
    return;
  }

  // 5. Handle MongoDB Duplicate Key Error (E11000)
  if (error?.code === 11000) {
    const errorPayload = {
      code: 'DUPLICATE_RESOURCE',
      message: 'A resource with those details already exists.',
    };
    response.status(409).json({
      error: errorPayload,
    });
    return;
  }

  // 6. Handle Known Operational Application Errors vs Unexpected Server Faults
  const statusCode = Number.isInteger(error?.statusCode) && error.statusCode >= 400 && error.statusCode < 600
    ? error.statusCode
    : 500;
  const isServerFault = statusCode >= 500;

  if (isServerFault) {
    // Log complete internal error and stack trace on server console ONLY
    console.error(`[API ERROR] ${request.method} ${request.originalUrl}:`, error);
  }

  // Safe user-friendly message: Never expose raw system error messages or stack traces on 500 errors
  const message = isServerFault
    ? 'An unexpected server error occurred.'
    : (error?.message || 'The request could not be completed.');
  const code = isServerFault
    ? 'INTERNAL_ERROR'
    : (error?.code || 'REQUEST_ERROR');

  const errorPayload = {
    code,
    message,
    ...(error?.details ? { details: error.details } : {}),
  };

  // Strictly ensure no stack or internal details are attached to the payload
  delete errorPayload.stack;

  response.status(statusCode).json({
    error: errorPayload,
  });
}
