import { describe, expect, it } from 'vitest';
import { validateLogin, validateRegistration } from './validation.js';

describe('authentication form validation', () => {
  it('requires valid registration details', () => {
    expect(validateRegistration({ name: 'A', email: 'not-an-email', password: 'weak' })).toEqual({
      name: 'Enter at least 2 characters for your name.',
      email: 'Enter a valid email address.',
      password: 'Use 8-72 characters with upper, lower and numeric characters.',
    });
    expect(validateRegistration({ name: 'Reader Name', email: 'reader@example.com', password: 'ValidPass123!' })).toEqual({});
  });

  it('requires email and password at login', () => {
    expect(validateLogin({ email: '', password: '' })).toEqual({
      email: 'Enter a valid email address.',
      password: 'Enter your password.',
    });
  });
});
