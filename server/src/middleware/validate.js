import { AppError } from './errors.js';

export function validate(schema, source = 'body') {
  return (request, response, next) => {
    const result = schema.safeParse(request[source]);

    if (!result.success) {
      next(new AppError(400, 'Please correct the highlighted fields.', 'VALIDATION_ERROR', result.error.flatten().fieldErrors));
      return;
    }

    request[source] = result.data;
    next();
  };
}
