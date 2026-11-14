import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../api/client.js';

vi.mock('../../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), apiFetch: vi.fn() }));
import { apiFetch } from '../../api/client.js';
import { OrdersPage } from './OrdersPage.jsx';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const placed = {
  id: 'o1', orderNumber: 'OBS-AAA', status: 'PLACED', currency: 'INR', total: 500, createdAt: '2026-11-13T10:00:00Z', canCancel: true,
  items: [{ itemId: 'i1', title: 'Reliable Systems', quantity: 2, lineTotal: 500 }],
  tracking: [
    { status: 'PLACED', label: 'Placed', reached: true, at: '2026-11-13T10:00:00Z' },
    { status: 'SHIPPED', label: 'Shipped', reached: false, at: null },
    { status: 'DELIVERED', label: 'Delivered', reached: false, at: null },
  ],
};
const shipped = { ...placed, id: 'o2', orderNumber: 'OBS-BBB', status: 'SHIPPED', canCancel: false };
const pagination = (totalPages = 1) => ({ page: 1, limit: 10, total: 2, totalPages });

function renderPage() {
  render(<MemoryRouter><OrdersPage /></MemoryRouter>);
}

describe('OBS-27: OrdersPage', () => {
  it('lists orders with number, items, total, status and tracking steps', async () => {
    apiFetch.mockResolvedValue({ orders: [placed, shipped], pagination: pagination() });
    renderPage();
    expect(await screen.findByText('OBS-AAA')).toBeInTheDocument();
    expect(screen.getByText('OBS-BBB')).toBeInTheDocument();
    expect(screen.getAllByText('Reliable Systems x 2')).toHaveLength(2);
    expect(screen.getByText('SHIPPED')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Order progress')).toHaveLength(2);
    expect(apiFetch).toHaveBeenCalledWith('/orders/my-orders?page=1&limit=10');
  });

  it('shows an empty state when there are no orders', async () => {
    apiFetch.mockResolvedValue({ orders: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } });
    renderPage();
    expect(await screen.findByText('No orders yet.')).toBeInTheDocument();
  });

  it('only offers cancellation for orders that have not shipped', async () => {
    apiFetch.mockResolvedValue({ orders: [placed, shipped], pagination: pagination() });
    renderPage();
    await screen.findByText('OBS-AAA');
    expect(screen.getAllByRole('button', { name: 'Cancel order' })).toHaveLength(1);
  });

  it('asks for confirmation, then cancels and shows the cancelled status', async () => {
    apiFetch.mockResolvedValueOnce({ orders: [placed], pagination: pagination() });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    expect(apiFetch).toHaveBeenCalledTimes(1); // nothing is cancelled by the first click
    apiFetch.mockResolvedValueOnce({ order: { ...placed, status: 'CANCELLED', canCancel: false, tracking: [{ status: 'PLACED', label: 'Placed', reached: true }, { status: 'CANCELLED', label: 'Cancelled', reached: true }] } });
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    await waitFor(() => expect(screen.getByText('CANCELLED')).toBeInTheDocument());
    expect(apiFetch).toHaveBeenLastCalledWith('/orders/o1/cancel', expect.objectContaining({ method: 'POST' }));
    expect(screen.queryByRole('button', { name: 'Cancel order' })).not.toBeInTheDocument();
  });

  it('shows the server message when cancelling is refused', async () => {
    apiFetch.mockResolvedValueOnce({ orders: [placed], pagination: pagination() });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel order' }));
    apiFetch.mockRejectedValueOnce(new ApiError('This order has already been shipped and can no longer be cancelled.', 409, 'ORDER_NOT_CANCELLABLE'));
    fireEvent.click(screen.getByRole('button', { name: 'Yes, cancel it' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('already been shipped');
  });

  it('pages through long histories', async () => {
    apiFetch.mockResolvedValue({ orders: [placed], pagination: { page: 1, limit: 10, total: 12, totalPages: 2 } });
    renderPage();
    await screen.findByText('OBS-AAA');
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    await waitFor(() => expect(apiFetch).toHaveBeenLastCalledWith('/orders/my-orders?page=2&limit=10'));
  });

  it('shows a clear message when the history cannot be loaded', async () => {
    apiFetch.mockRejectedValue(new ApiError('Please sign in.', 401, 'AUTHENTICATION_REQUIRED'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('Please sign in.');
  });
});
