import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ApiError } from '../../api/client.js';

vi.mock('../../api/client.js', async (importOriginal) => ({ ...(await importOriginal()), apiFetch: vi.fn() }));
vi.mock('../../app/CartContext.jsx', () => ({ useCart: vi.fn() }));

import { apiFetch } from '../../api/client.js';
import { useCart } from '../../app/CartContext.jsx';
import { CheckoutPage } from './CheckoutPage.jsx';

afterEach(() => { cleanup(); vi.clearAllMocks(); });

const options = { currency: 'INR', taxRatePercent: 0, shippingOptions: [{ id: 'STANDARD', label: 'Standard delivery', amount: 0 }] };
const summary = {
  isPreview: true, currency: 'INR', itemCount: 2, subtotal: 500, total: 500,
  items: [{ itemId: 'i1', title: 'Reliable Systems', quantity: 2, lineTotal: 500 }],
  shipping: { id: 'STANDARD', label: 'Standard delivery', amount: 0 },
  tax: { ratePercent: 0, amount: 0 },
  address: { fullName: 'Anwitha Potluri', line1: '12 MG Road', line2: '', city: 'Bengaluru', state: 'Karnataka', postalCode: '560001', country: 'India' },
};
const values = { 'Full name': 'Anwitha Potluri', 'Phone number': '9876543210', 'Address line 1': '12 MG Road', City: 'Bengaluru', 'State / region': 'Karnataka', 'Postal code': '560001', Country: 'India' };

function setup(cart = { items: [{ itemId: 'i1' }], itemCount: 2, total: 500 }) {
  useCart.mockReturnValue({ cart, loading: false, refreshCart: vi.fn() });
  render(<MemoryRouter><CheckoutPage /></MemoryRouter>);
}
async function fill() {
  await screen.findByText(/Standard delivery/);
  for (const [label, value] of Object.entries(values)) fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

describe('OBS-25: CheckoutPage', () => {
  it('shows an empty-cart message with a link back to the catalogue', () => {
    apiFetch.mockResolvedValue({ options });
    setup({ items: [], itemCount: 0, total: 0 });
    expect(screen.getByText('Your cart is empty.')).toBeInTheDocument();
  });

  it('blocks submission and shows field errors when the address is incomplete', async () => {
    apiFetch.mockResolvedValue({ options });
    setup();
    await screen.findByText(/Standard delivery/);
    fireEvent.click(screen.getByRole('button', { name: 'Review order' }));
    expect(await screen.findAllByRole('alert')).not.toHaveLength(0);
    expect(apiFetch).toHaveBeenCalledTimes(1); // only the options request
  });

  it('shows the server-calculated summary for a valid address', async () => {
    apiFetch.mockResolvedValueOnce({ options }).mockResolvedValueOnce({ summary });
    setup();
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Review order' }));
    expect(await screen.findByText('Reliable Systems x 2')).toBeInTheDocument();
    expect(screen.getByText(/Payment is the next step/)).toBeInTheDocument();
    const [, call] = apiFetch.mock.calls;
    expect(call[0]).toBe('/checkout/summary');
    expect(JSON.parse(call[1].body)).toMatchObject({ fullName: 'Anwitha Potluri', shippingOption: 'STANDARD' });
    expect(JSON.parse(call[1].body)).not.toHaveProperty('total');
  });

  it('lists cart problems returned by the server', async () => {
    apiFetch.mockResolvedValueOnce({ options }).mockRejectedValueOnce(
      new ApiError('Some items in your cart need attention.', 409, 'CHECKOUT_CART_INVALID', { issues: [{ bookId: 'b', code: 'INSUFFICIENT_STOCK', title: 'Reliable Systems', requested: 4, available: 2 }] }),
    );
    setup();
    await fill();
    fireEvent.click(screen.getByRole('button', { name: 'Review order' }));
    await waitFor(() => expect(screen.getByText(/only 2 left/)).toBeInTheDocument());
  });
});
