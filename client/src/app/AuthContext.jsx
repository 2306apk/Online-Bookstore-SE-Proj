import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, jsonBody } from '../api/client.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    apiFetch('/auth/me')
      .then((payload) => {
        if (mounted) setUser(payload.user);
      })
      .catch(() => {
        if (mounted) setUser(null);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  async function login(credentials) {
    const payload = await apiFetch('/auth/login', { method: 'POST', body: jsonBody(credentials) });
    setUser(payload.user);
    return payload.user;
  }

  async function register(details) {
    const payload = await apiFetch('/auth/register', { method: 'POST', body: jsonBody(details) });
    setUser(payload.user);
    return payload.user;
  }

  async function logout() {
    await apiFetch('/auth/logout', { method: 'POST' });
    setUser(null);
  }

  const value = useMemo(() => ({ user, loading, login, register, logout }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider.');
  return context;
}
