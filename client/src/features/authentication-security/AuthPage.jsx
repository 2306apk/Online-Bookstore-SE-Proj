import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../app/AuthContext.jsx';
import { ApiError } from '../../api/client.js';
import { validateLogin, validateRegistration } from './validation.js';

export function AuthPage() {
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  function switchMode(nextMode) {
    setMode(nextMode);
    setErrors({});
    setServerError('');
  }

  function updateField(event) {
    setForm((current) => ({ ...current, [event.target.name]: event.target.value }));
    setErrors((current) => ({ ...current, [event.target.name]: '' }));
  }

  async function submit(event) {
    event.preventDefault();
    const validationErrors = mode === 'register' ? validateRegistration(form) : validateLogin(form);
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }

    setSubmitting(true);
    setServerError('');
    try {
      if (mode === 'register') {
        await register({ name: form.name.trim(), email: form.email.trim(), password: form.password });
      } else {
        await login({ email: form.email.trim(), password: form.password });
      }
      navigate(location.state?.from || '/', { replace: true });
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'We could not complete that request.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="auth-layout">
      <div className="auth-visual">
        <p className="eyebrow">A quieter place to browse</p>
        <h1>Find the next book that stays with you.</h1>
        <p>Keep your cart ready while you explore a considered catalogue of stories, systems and ideas.</p>
        <Link to="/" className="text-link">Browse as a guest <span>{'->'}</span></Link>
      </div>
      <div className="auth-card">
        <div className="tab-row" role="tablist" aria-label="Authentication mode">
          <button type="button" className={mode === 'login' ? 'tab active' : 'tab'} onClick={() => switchMode('login')}>Sign in</button>
          <button type="button" className={mode === 'register' ? 'tab active' : 'tab'} onClick={() => switchMode('register')}>Create account</button>
        </div>
        <h2>{mode === 'login' ? 'Welcome back.' : 'Start your shelf.'}</h2>
        <p className="muted">{mode === 'login' ? 'Use your account to keep your cart in sync.' : 'A customer account takes less than a minute.'}</p>
        <form onSubmit={submit} noValidate>
          {mode === 'register' && (
            <label>
              Name
              <input name="name" value={form.name} onChange={updateField} autoComplete="name" />
              {errors.name && <small className="field-error">{errors.name}</small>}
            </label>
          )}
          <label>
            Email
            <input name="email" type="email" value={form.email} onChange={updateField} autoComplete="email" />
            {errors.email && <small className="field-error">{errors.email}</small>}
          </label>
          <label>
            Password
            <input name="password" type="password" value={form.password} onChange={updateField} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
            {errors.password && <small className="field-error">{errors.password}</small>}
          </label>
          {serverError && <p className="alert error" role="alert">{serverError}</p>}
          <button className="button button-primary button-wide" type="submit" disabled={submitting}>
            {submitting ? 'Working...' : mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>
      </div>
    </section>
  );
}
