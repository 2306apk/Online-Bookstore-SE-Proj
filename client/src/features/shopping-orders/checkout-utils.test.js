import { describe, expect, it } from 'vitest';
import { describeCartIssue, formatMoney, validateAddress } from './checkout-utils.js';

const valid = { fullName: 'Anwitha Potluri', phone: '+91 98765 43210', line1: '12 MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'India' };

describe('OBS-25: validateAddress', () => {
  it('accepts a complete address; line 2 is optional', () => {
    expect(validateAddress(valid)).toEqual({});
  });
  it('flags every required field when empty, but not line 2', () => {
    const errors = validateAddress({});
    expect(Object.keys(errors).sort()).toEqual(['city', 'country', 'fullName', 'line1', 'phone', 'postalCode', 'state']);
  });
  it('does not restrict to India', () => {
    expect(validateAddress({ ...valid, postalCode: 'SW1A 1AA', phone: '+44 20 7946 0958', country: 'United Kingdom' })).toEqual({});
    expect(validateAddress({ ...valid, postalCode: '10001', phone: '(212) 555-0147', country: 'United States' })).toEqual({});
  });
  it('rejects a short phone number and a bad postal code', () => {
    expect(validateAddress({ ...valid, phone: '12345' }).phone).toBeTruthy();
    expect(validateAddress({ ...valid, postalCode: '!!' }).postalCode).toBeTruthy();
  });
});

describe('OBS-25: helpers', () => {
  it('formats money in the given currency', () => {
    expect(formatMoney(1234.5)).toContain('1,234.50');
  });
  it('describes cart issues in plain words', () => {
    expect(describeCartIssue({ code: 'INSUFFICIENT_STOCK', title: 'Book', requested: 4, available: 2 })).toMatch(/only 2 left/);
    expect(describeCartIssue({ code: 'BOOK_NOT_AVAILABLE', title: 'Book' })).toMatch(/no longer available/);
  });
});
