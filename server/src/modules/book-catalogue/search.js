export function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildSearchConditions({ q, title, author, keyword }) {
  const conditions = [];
  const addMatch = (field, value) => {
    if (value) {
      conditions.push({ [field]: { $regex: escapeRegex(value), $options: 'i' } });
    }
  };

  if (q) {
    const expression = { $regex: escapeRegex(q), $options: 'i' };
    conditions.push({
      $or: [
        { title: expression },
        { author: expression },
        { description: expression },
        { keywords: expression },
      ],
    });
  }

  addMatch('title', title);
  addMatch('author', author);
  addMatch('keywords', keyword);
  return conditions;
}
