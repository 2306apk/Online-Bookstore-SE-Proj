const allowedParameters = new Set(['page', 'limit', 'category']);

export function validateBrowseQuery(query) {
  for (const [key, value] of Object.entries(query)) {
    if (!allowedParameters.has(key) || typeof value !== 'string') {
      return {
        valid: false,
        message: `Invalid query parameter: ${key}`,
      };
    }
  }

  const page = Number(query.page ?? 1);
  const limit = Number(query.limit ?? 20);

  if (!Number.isInteger(page) || page < 1) {
    return { valid: false, message: 'Page must be a positive integer' };
  }

  if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
    return { valid: false, message: 'Limit must be between 1 and 100' };
  }

  return {
    valid: true,
    value: {
      page,
      limit,
      category: query.category,
    },
  };
}