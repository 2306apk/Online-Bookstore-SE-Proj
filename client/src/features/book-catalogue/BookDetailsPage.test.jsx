
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { BookDetailsPage } from './BookDetailsPage.jsx';

const mocks = vi.hoisted(() => ({
  apiFetch: vi.fn(),
  addItem: vi.fn(),
  navigate: vi.fn(),
  user: { role: 'CUSTOMER' },
}));

vi.mock('../../api/client.js', () => ({
  apiFetch: mocks.apiFetch,
}));

vi.mock('../../app/AuthContext.jsx', () => ({
  useAuth: () => ({ user: mocks.user, loading: false }),
}));

vi.mock('../../app/CartContext.jsx', () => ({
  useCart: () => ({ addItem: mocks.addItem }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  mocks.user = { role: 'CUSTOMER' };
});

const sampleBook = {
  id: 'book-123',
  title: 'Reliable Systems',
  author: 'Ada Lovelace',
  description: 'A practical guide to robust systems.',
  isbn: '9781234567890',
  price: 350,
  stock: 4,
  coverImage: '',
  category: { name: 'Technology' },
};

function renderDetails() {
  return render(
    <MemoryRouter initialEntries={['/books/book-123']}>
      <Routes>
        <Route path="/books/:id" element={<BookDetailsPage />} />
        <Route path="/auth" element={<p>Login page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe('OBS-21: Book Details Page', () => {
  it('loads and displays book details and current stock', async () => {
    mocks.apiFetch.mockResolvedValue({ book: sampleBook });

    renderDetails();

    expect(await screen.findByRole('heading', {
      name: 'Reliable Systems',
    })).toBeInTheDocument();

    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.getByText('A practical guide to robust systems.')).toBeInTheDocument();
    expect(screen.getByText('9781234567890')).toBeInTheDocument();
    expect(screen.getByText('Technology')).toBeInTheDocument();
    expect(screen.getByText('In Stock: 4')).toBeInTheDocument();

    expect(mocks.apiFetch).toHaveBeenCalledWith(
      '/books/book-123',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('adds the displayed book to the customer cart', async () => {
    mocks.apiFetch.mockResolvedValue({ book: sampleBook });
    mocks.addItem.mockResolvedValue({});

    renderDetails();

    fireEvent.click(await screen.findByRole('button', { name: 'Add to Cart' }));

    await waitFor(() => {
      expect(mocks.addItem).toHaveBeenCalledWith('book-123', 1);
    });

    expect(await screen.findByText('Book added to your cart.')).toBeInTheDocument();
  });

  it('does not allow adding an out-of-stock book', async () => {
    mocks.apiFetch.mockResolvedValue({
      book: { ...sampleBook, stock: 0 },
    });

    renderDetails();

    expect(await screen.findByRole('button', {
      name: 'Out of Stock',
    })).toBeDisabled();

    expect(mocks.addItem).not.toHaveBeenCalled();
  });

  it('shows an error and catalogue link when the book cannot be found', async () => {
    mocks.apiFetch.mockRejectedValue(new Error('Book not found.'));

    renderDetails();

    expect(await screen.findByRole('alert')).toHaveTextContent('Book not found.');
    expect(screen.getByRole('link', { name: 'Back to Catalogue' })).toHaveAttribute('href', '/');
  });

  it('displays customer reviews with verified purchase badge and allows deletion of own review', async () => {
    mocks.user = { id: 'cust-1', role: 'CUSTOMER' };
    const sampleReviews = [
      {
        id: 'rev-1',
        rating: 5,
        comment: 'Comprehensive guide to reliability.',
        customerName: 'Alice',
        customerId: 'cust-1',
        isVerifiedPurchase: true,
        createdAt: new Date().toISOString(),
      },
    ];

    mocks.apiFetch.mockImplementation((url) => {
      if (url === '/books/book-123') return Promise.resolve({ book: sampleBook });
      if (url === '/books/book-123/reviews') {
        return Promise.resolve({
          reviews: sampleReviews,
          rating: { average: 5, count: 1 },
        });
      }
      if (url === '/books/book-123/reviews/mine') return Promise.resolve({ message: 'Deleted' });
      return Promise.resolve({});
    });

    renderDetails();

    expect(await screen.findByText('Comprehensive guide to reliability.')).toBeInTheDocument();
    expect(screen.getByText('✓ Verified Purchase')).toBeInTheDocument();

    const deleteBtn = screen.getByRole('button', { name: 'Delete my review' });
    fireEvent.click(deleteBtn);

    await waitFor(() => {
      expect(mocks.apiFetch).toHaveBeenCalledWith(
        '/books/book-123/reviews/mine',
        expect.objectContaining({ method: 'DELETE' })
      );
    });
  });
});

