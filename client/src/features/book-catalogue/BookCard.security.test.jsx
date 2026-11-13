
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BookCard } from './BookCard.jsx';

afterEach(() => {
  cleanup();
});

describe('OBS-SR-03: BookCard XSS protection', () => {
  const book = {
    id: 'security-test-book',
    title: '<script>alert("XSS")</script>',
    author: "O'Connor & Sons",
    description: '<img src=x onerror=alert("XSS")> A normal book description.',
    category: { name: 'Fiction & Literature' },
    price: 499.5,
    stock: 10,
    coverImage: '',
  };

  it('renders potentially malicious HTML as text, not executable elements', () => {
    const { container } = render(
      <MemoryRouter>
        <BookCard book={book} />
      </MemoryRouter>
    );

    expect(
      screen.getByText('<script>alert("XSS")</script>')
    ).toBeInTheDocument();

    expect(
      screen.getByText('<img src=x onerror=alert("XSS")> A normal book description.')
    ).toBeInTheDocument();

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('preserves legitimate punctuation and special characters', () => {
    render(
      <MemoryRouter>
        <BookCard book={book} />
      </MemoryRouter>
    );

    expect(screen.getByText("O'Connor & Sons")).toBeInTheDocument();
    expect(screen.getByText('Fiction & Literature')).toBeInTheDocument();
    expect(screen.getByText(/499\.50/)).toBeInTheDocument();
  });
});
