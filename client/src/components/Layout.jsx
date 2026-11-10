import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../app/AuthContext.jsx';
import { useCart } from '../app/CartContext.jsx';

export function Layout() {
  const { user, logout } = useAuth();
  const { cart } = useCart();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate('/');
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <Link className="brand" to="/" aria-label="Northstar Books home">
          <span className="brand-mark">N</span>
          <span>Northstar <em>Books</em></span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <NavLink to="/" end>Catalogue</NavLink>
          {user?.role === 'ADMIN' && <NavLink to="/admin">Admin desk</NavLink>}
          {user?.role === 'CUSTOMER' && (
            <NavLink to="/cart" className="cart-link">
              Cart <span className="cart-count">{cart.itemCount}</span>
            </NavLink>
          )}
        </nav>
        <div className="account-actions">
          {user ? (
            <>
              <span className="welcome">Hi, {user.name.split(' ')[0]}</span>
              <button className="button button-quiet" type="button" onClick={handleLogout}>Log out</button>
            </>
          ) : (
            <Link className="button button-dark" to="/auth">Sign in</Link>
          )}
        </div>
      </header>
      <main className="site-main"><Outlet /></main>
      <footer className="site-footer">
        <span>Northstar Books / Sprint 1 demo</span>
        <span>Read widely. Choose deliberately.</span>
      </footer>
    </div>
  );
}
