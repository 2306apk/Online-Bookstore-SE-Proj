import { describe, expect, it } from 'vitest';
import { calculateCartSummary } from './cart-utils.js';

describe('cart summary calculations', () => {
  it('counts quantities and rounds the server totals for display', () => {
    expect(calculateCartSummary([{ quantity: 2, lineTotal: 19.99 }, { quantity: 1, lineTotal: 5.01 }])).toEqual({ itemCount: 3, total: 25 });
  });

  it('handles an empty cart', () => {
    expect(calculateCartSummary([])).toEqual({ itemCount: 0, total: 0 });
  });
});
