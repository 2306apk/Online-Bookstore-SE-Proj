import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useOptionalWishlist } from '../../app/WishlistContext.jsx';
import './wishlist.css';

function HeartButton({ bookId, title, wishlist }) {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const saved = wishlist.isWishlisted(bookId);

  async function toggle() {
    if (wishlist.viewer === 'guest') {
      navigate('/auth');
      return;
    }
    setPending(true);
    try {
      if (saved) await wishlist.removeBook(bookId);
      else await wishlist.addBook(bookId);
    } catch {
      // The wishlist page shows request errors; the heart simply stays as it was.
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      className="wishlist-heart"
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from wishlist` : `Add ${title} to wishlist`}
      title={saved ? 'Remove from wishlist' : 'Save to wishlist'}
      disabled={pending}
      onClick={toggle}
    >
      <span aria-hidden="true">{saved ? '♥' : '♡'}</span>
    </button>
  );
}

/**
 * Heart toggle for a book card. Renders nothing outside a WishlistProvider (so existing
 * components and tests are unaffected) and nothing for non-customer accounts such as admins.
 */
export function WishlistButton({ bookId, title = 'this book' }) {
  const wishlist = useOptionalWishlist();
  if (!wishlist || !bookId || wishlist.viewer === 'other') return null;
  return <HeartButton bookId={bookId} title={title} wishlist={wishlist} />;
}
