
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
});
