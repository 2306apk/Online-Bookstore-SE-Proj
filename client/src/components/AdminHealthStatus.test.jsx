
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AdminHealthStatus } from './AdminHealthStatus.jsx';
import { apiFetch } from '../api/client.js';

vi.mock('../api/client.js', () => ({
  apiFetch: vi.fn(),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('OBS-24: Admin Health Status Widget', () => {
  it('displays a loading state while checking health', () => {
    apiFetch.mockReturnValue(new Promise(() => {}));

    render(<AdminHealthStatus />);

    expect(screen.getByText('Checking system health…')).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/health');
  });

  it('displays healthy status when the database is connected', async () => {
    apiFetch.mockResolvedValue({
      status: 'ok',
      database: 'connected',
    });

    render(<AdminHealthStatus />);

    expect(await screen.findByText('System healthy')).toBeInTheDocument();
    expect(screen.getByText('Database connected')).toBeInTheDocument();
  });

  it('displays unavailable status when the API returns HTTP 503', async () => {
    apiFetch.mockRejectedValue({
      status: 503,
      message: 'Service unavailable',
    });

    render(<AdminHealthStatus />);

    expect(await screen.findByText('Database unavailable')).toBeInTheDocument();
    expect(screen.getByText('Database disconnected')).toBeInTheDocument();
  });

  it('displays a safe message when the network request fails', async () => {
    apiFetch.mockRejectedValue(new Error('Sensitive internal network details'));

    render(<AdminHealthStatus />);

    expect(
      await screen.findByText('Unable to check system health')
    ).toBeInTheDocument();

    expect(
      screen.queryByText('Sensitive internal network details')
    ).not.toBeInTheDocument();
  });

  it('does not display sensitive database connection information', async () => {
    apiFetch.mockResolvedValue({
      status: 'ok',
      database: 'connected',
      connectionString: 'mongodb://admin:secret@localhost:27017',
    });

    render(<AdminHealthStatus />);

    expect(await screen.findByText('System healthy')).toBeInTheDocument();
    expect(screen.queryByText(/mongodb:\/\//)).not.toBeInTheDocument();
    expect(screen.queryByText(/secret/)).not.toBeInTheDocument();
  });
});
