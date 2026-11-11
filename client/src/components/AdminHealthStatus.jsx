
import { useEffect, useState } from 'react';
import { apiFetch } from '../api/client.js';

export function AdminHealthStatus() {
  const [health, setHealth] = useState({
    state: 'loading',
    message: 'Checking system health…',
    database: null,
  });

  useEffect(() => {
    let active = true;

    async function checkHealth() {
      try {
        const result = await apiFetch('/health');

        if (!active) return;

        if (result.status === 'ok' && result.database === 'connected') {
          setHealth({
            state: 'healthy',
            message: 'System healthy',
            database: 'Database connected',
          });
        } else {
          setHealth({
            state: 'unavailable',
            message: 'Database unavailable',
            database: 'Database disconnected',
          });
        }
      } catch (error) {
        if (!active) return;

        if (error.status === 503) {
          setHealth({
            state: 'unavailable',
            message: 'Database unavailable',
            database: 'Database disconnected',
          });
        } else {
          setHealth({
            state: 'error',
            message: 'Unable to check system health',
            database: null,
          });
        }
      }
    }

    checkHealth();

    return () => {
      active = false;
    };
  }, []);

  const indicator = {
    loading: '⏳',
    healthy: '●',
    unavailable: '●',
    error: '!',
  }[health.state];

  const indicatorColor = {
    loading: '#64748b',
    healthy: '#15803d',
    unavailable: '#b91c1c',
    error: '#b45309',
  }[health.state];

  return (
    <section
      aria-label="System Health"
      aria-live="polite"
      style={{
        padding: '20px',
        border: '1px solid var(--line, #dcded5)',
        borderRadius: '8px',
        background: 'var(--card, #fffdf8)',
      }}
    >
      <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>
        System Health
      </h2>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span aria-hidden="true" style={{ color: indicatorColor }}>
          {indicator}
        </span>

        <div>
          <strong>{health.message}</strong>
          {health.database && (
            <p className="muted" style={{ margin: '4px 0 0' }}>
              {health.database}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
