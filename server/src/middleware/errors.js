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

/**
 * Uniform error envelope helper: guarantees exactly one top-level "error" key.
 */
function sendError(response, statusCode, code, message, details) {
  const errorPayload = {
    code,
    message,
    ...(details !== undefined ? { details } : {}),
  };

  // Strictly ensure stack traces and internal fields are never exposed
  delete errorPayload.stack;

  return response.status(statusCode).json({
    error: errorPayload,
  });
}

export function errorHandler(error, request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }

  // 1. Handle JSON parsing errors from express.json()
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return sendError(
      response,
      400,
      'INVALID_JSON',
      'The request payload contains malformed JSON.'
    );
  }

  // 2. Handle Zod validation errors
  if (error?.name === 'ZodError') {
    const details = typeof error.flatten === 'function'
      ? error.flatten().fieldErrors
      : error.errors;
    return sendError(
      response,
      400,
      'VALIDATION_ERROR',
      'Please correct the highlighted fields.',
      details
    );
  }

  // 3. Handle Mongoose Validation Errors
  if (error?.name === 'ValidationError') {
    const details = error.errors
      ? Object.fromEntries(
          Object.entries(error.errors).map(([field, err]) => [field, [err.message]])
        )
      : undefined;
    return sendError(
      response,
      400,
      'VALIDATION_ERROR',
      'The submitted data is invalid.',
      details
    );
  }

  // 4. Handle Mongoose CastError (e.g. invalid MongoDB ObjectId)
  if (error?.name === 'CastError') {
    return sendError(
      response,
      400,
      'INVALID_IDENTIFIER',
      `Invalid format for identifier '${error.path || 'id'}'.`
    );
  }

  // 5. Handle MongoDB Duplicate Key Error (E11000)
  if (error?.code === 11000) {
    return sendError(
      response,
      409,
      'DUPLICATE_RESOURCE',
      'A resource with those details already exists.'
    );
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

  return sendError(response, statusCode, code, message, error?.details);
}
