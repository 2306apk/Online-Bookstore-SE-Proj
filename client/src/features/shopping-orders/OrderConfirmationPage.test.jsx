import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ApiError } from '../../api/client.js';

vi.mock('../../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), apiFetch: vi.fn() }));
import { apiFetch } from '../../api/client.js';
import { OrderConfirmationPage } from './OrderConfirmationPage.jsx';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const order = {
  id: 'o1', orderNumber: 'OBS-ABC-123', status: 'PLACED', currency: 'INR', subtotal: 500, total: 500,
  items: [{ itemId: 'i1', title: 'Reliable Systems', quantity: 2, lineTotal: 500 }],
  shipping: { amount: 0 }, tax: { amount: 0 }, payment: { status: 'SUCCEEDED', reference: 'SIM-1' },
  address: { fullName: 'Anwitha Potluri', line1: '12 MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'India' },
};

function renderPage() {
  render(
    <MemoryRouter initialEntries={['/orders/o1']}>
      <Routes><Route path="/orders/:orderId" element={<OrderConfirmationPage />} /></Routes>
    </MemoryRouter>,
  );
}

describe('OBS-26: OrderConfirmationPage', () => {
  it('shows the order number, items, status and payment reference', async () => {
    apiFetch.mockResolvedValue({ order });
    renderPage();
    expect(await screen.findByText('OBS-ABC-123')).toBeInTheDocument();
    expect(screen.getByText('Reliable Systems x 2')).toBeInTheDocument();
    expect(screen.getByText('PLACED')).toBeInTheDocument();
    expect(screen.getByText(/SIM-1/)).toBeInTheDocument();
    expect(apiFetch).toHaveBeenCalledWith('/orders/o1');
  });

  it('shows a clear message when the order cannot be loaded', async () => {
    apiFetch.mockRejectedValue(new ApiError('The order was not found.', 404, 'ORDER_NOT_FOUND'));
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent('The order was not found.');
  });
});
