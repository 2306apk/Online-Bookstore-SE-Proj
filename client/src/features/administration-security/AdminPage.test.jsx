// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AdminPage } from './AdminPage.jsx';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
}));

vi.mock('../../api/client.js', () => ({
  apiFetch: mocks.apiFetch,
  jsonBody: (data) => JSON.stringify(data),
  ApiError: class ApiError extends Error {
    constructor(status, message) {
      super(message);
      this.status = status;
    }
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sampleBooks = [
  {
    id: 'book-1',
    title: 'Clean Code',
    author: 'Robert C. Martin',
    price: 450,
    stock: 5,
    active: true,
    keywords: ['clean', 'code'],
    category: { id: 'cat-1', name: 'Software' },
  },
];

const sampleCategories = [
  { id: 'cat-1', name: 'Software', active: true },
];

const sampleOrders = [
  {
    id: 'order-1',
    orderNumber: 'ORD-1001',
    customer: { name: 'Alice Smith', email: 'alice@example.com' },
    createdAt: new Date().toISOString(),
    itemCount: 2,
    total: 900,
    status: 'PLACED',
  },
];

const sampleSummary = {
  totalOrders: 1,
  totalRevenue: 900,
  statusCounts: { PLACED: 1, SHIPPED: 0, DELIVERED: 0, CANCELLED: 0 },
};

const sampleReviews = [
  {
    id: 'rev-1',
    bookTitle: 'Clean Code',
    bookAuthor: 'Robert C. Martin',
    customerName: 'Alice Smith',
    customerEmail: 'alice@example.com',
    rating: 5,
    comment: 'Exceptional book for developers!',
    isVerifiedPurchase: true,
    status: 'APPROVED',
  },
];

describe('OBS-30 & OBS-29: Admin Dashboard (Catalogue, Orders, Reviews)', () => {
  beforeEach(() => {
    mocks.apiFetch.mockImplementation((url) => {
      if (url === '/admin/books') return Promise.resolve({ books: sampleBooks });
      if (url === '/admin/categories') return Promise.resolve({ categories: sampleCategories });
      if (url.startsWith('/admin/orders/summary')) return Promise.resolve({ summary: sampleSummary });
      if (url.startsWith('/admin/orders')) return Promise.resolve({ orders: sampleOrders });
      if (url.startsWith('/admin/reviews')) return Promise.resolve({ reviews: sampleReviews });
      return Promise.resolve({});
    });
  });

  it('renders catalogue inventory and allows restocking', async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );

    expect(await screen.findByText('Clean Code')).toBeInTheDocument();
    expect(screen.getAllByText('Software').length).toBeGreaterThan(0);

    const restockInput = screen.getByLabelText('Restock quantity for Clean Code');
    fireEvent.change(restockInput, { target: { value: '15' } });

    mocks.apiFetch.mockImplementation((url, options) => {
      if (url === '/admin/books/book-1/restock' && options?.method === 'POST') {
        return Promise.resolve({
          book: { ...sampleBooks[0], stock: 20 },
        });
      }
      if (url === '/admin/books') return Promise.resolve({ books: [{ ...sampleBooks[0], stock: 20 }] });
      if (url === '/admin/categories') return Promise.resolve({ categories: sampleCategories });
      return Promise.resolve({});
    });

    const restockButton = screen.getByRole('button', { name: 'Restock' });
    fireEvent.click(restockButton);

    await waitFor(() => {
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/admin/books/book-1/restock',
        expect.objectContaining({ method: 'POST' })
      );
    });

    expect(await screen.findByText(/Restocked Clean Code/)).toBeInTheDocument();
  });

  it('switches to Order Fulfillment tab and advances order status', async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );

    const ordersTab = screen.getByRole('tab', { name: 'Order Fulfillment' });
    fireEvent.click(ordersTab);

    expect(await screen.findByText('ORD-1001')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getAllByText('PLACED').length).toBeGreaterThan(0);

    mocks.apiFetch.mockImplementation((url, options) => {
      if (url === '/admin/orders/order-1/status' && options?.method === 'PATCH') {
        return Promise.resolve({
          order: { ...sampleOrders[0], status: 'SHIPPED' },
        });
      }
      if (url.startsWith('/admin/orders/summary')) return Promise.resolve({ summary: sampleSummary });
      if (url.startsWith('/admin/orders')) {
        return Promise.resolve({ orders: [{ ...sampleOrders[0], status: 'SHIPPED' }] });
      }
      return Promise.resolve({});
    });

    const markShippedBtn = screen.getByRole('button', { name: 'Mark as Shipped' });
    fireEvent.click(markShippedBtn);

    await waitFor(() => {
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/admin/orders/order-1/status',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    expect(await screen.findByText(/Order status advanced to SHIPPED/)).toBeInTheDocument();
  });

  it('switches to Review Moderation tab and allows rejecting a review', async () => {
    render(
      <MemoryRouter>
        <AdminPage />
      </MemoryRouter>
    );

    const reviewsTab = screen.getByRole('tab', { name: 'Review Moderation' });
    fireEvent.click(reviewsTab);

    expect(await screen.findByText('Exceptional book for developers!')).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Verified' })).toBeInTheDocument();

    mocks.apiFetch.mockImplementation((url, options) => {
      if (url === '/admin/reviews/rev-1/status' && options?.method === 'PATCH') {
        return Promise.resolve({
          review: { ...sampleReviews[0], status: 'REJECTED' },
        });
      }
      if (url.startsWith('/admin/reviews')) {
        return Promise.resolve({ reviews: [{ ...sampleReviews[0], status: 'REJECTED' }] });
      }
      return Promise.resolve({});
    });

    const rejectBtn = screen.getByRole('button', { name: 'Reject' });
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/admin/reviews/rev-1/status',
        expect.objectContaining({ method: 'PATCH' })
      );
    });

    expect(await screen.findByText(/Review moderation status updated to REJECTED/)).toBeInTheDocument();
  });
});
