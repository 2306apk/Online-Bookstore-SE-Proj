
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { WishlistContext } from '../../app/WishlistContext.jsx';
import { BookCard } from './BookCard.jsx';

afterEach(cleanup);

const book = {
  id: 'b1',
  title: 'Reliable Systems',
  author: 'Ada Lovelace',
  description: 'Robust systems.',
  price: 250,
  stock: 4,
  coverImage: '',
};

describe('OBS-22: BookCard heart integration', () => {
  it('shows no heart without a wishlist provider (existing behaviour unchanged)', () => {
    render(
      <MemoryRouter>
        <BookCard book={book} />
      </MemoryRouter>
    );

    expect(screen.queryByRole('button')).toBeNull();
  });

  it('shows the heart toggle for a customer', () => {
    const value = {
      viewer: 'customer',
      isWishlisted: () => true,
      addBook: vi.fn(),
      removeBook: vi.fn(),
    };

    render(
      <MemoryRouter>
        <WishlistContext.Provider value={value}>
          <BookCard book={book} />
        </WishlistContext.Provider>
      </MemoryRouter>
    );

    expect(
      screen.getByRole('button', {
        name: 'Remove Reliable Systems from wishlist',
      })
    ).toHaveAttribute('aria-pressed', 'true');
  });
});
