// Pure rules for the order life cycle (no database access).
export const NEXT_STATUS = Object.freeze({ PLACED: 'SHIPPED', SHIPPED: 'DELIVERED' });
export const TRACKING_STEPS = Object.freeze([
  { status: 'PLACED', label: 'Placed' },
  { status: 'SHIPPED', label: 'Shipped' },
  { status: 'DELIVERED', label: 'Delivered' },
]);

// Only an order that has not shipped yet can be cancelled.
export const canCancelStatus = (status) => status === 'PLACED';

export function buildTracking(order) {
  const history = order.statusHistory?.length ? order.statusHistory : [{ status: 'PLACED', at: order.createdAt }];
  const reachedAt = new Map(history.map((entry) => [entry.status, entry.at]));
  if (order.status === 'CANCELLED') {
    return [
      { status: 'PLACED', label: 'Placed', reached: true, at: reachedAt.get('PLACED') ?? order.createdAt },
      { status: 'CANCELLED', label: 'Cancelled', reached: true, at: order.cancelledAt ?? reachedAt.get('CANCELLED') ?? null },
    ];
  }
  const currentIndex = TRACKING_STEPS.findIndex((step) => step.status === order.status);
  return TRACKING_STEPS.map((step, index) => ({
    status: step.status,
    label: step.label,
    reached: index <= currentIndex,
    at: reachedAt.get(step.status) ?? null,
  }));
}

// The stored history, with the PLACED entry filled in for orders saved before history existed.
export function historyOf(order) {
  const stored = (order.statusHistory ?? []).map(({ status, at }) => ({ status, at }));
  return stored.some((entry) => entry.status === 'PLACED') ? stored : [{ status: 'PLACED', at: order.createdAt }, ...stored];
}
