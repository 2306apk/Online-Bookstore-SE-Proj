export function calculateCartSummary(items) {
  const safeItems = Array.isArray(items) ? items : [];
  const itemCount = safeItems.reduce((sum, item) => sum + item.quantity, 0);
  const total = safeItems.reduce((sum, item) => sum + item.lineTotal, 0);
  return { itemCount, total: Number(total.toFixed(2)) };
}
