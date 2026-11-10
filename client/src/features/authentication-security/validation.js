export const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,72}$/;

export function validateRegistration({ name, email, password }) {
  const errors = {};
  if (!name?.trim() || name.trim().length < 2) errors.name = 'Enter at least 2 characters for your name.';
  if (!email?.includes('@')) errors.email = 'Enter a valid email address.';
  if (!passwordPattern.test(password || '')) errors.password = 'Use 8-72 characters with upper, lower and numeric characters.';
  return errors;
}

export function validateLogin({ email, password }) {
  const errors = {};
  if (!email?.includes('@')) errors.email = 'Enter a valid email address.';
  if (!password) errors.password = 'Enter your password.';
  return errors;
}
