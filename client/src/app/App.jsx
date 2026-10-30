import { Routes, Route } from 'react-router-dom';
import { Layout } from '../components/Layout.jsx';
import { ProtectedRoute } from './ProtectedRoute.jsx';
import { AuthPage } from '../features/authentication-security/AuthPage.jsx';
import { CataloguePage } from '../features/book-catalogue/CataloguePage.jsx';
import { CartPage } from '../features/shopping-orders/CartPage.jsx';
import { AdminPage } from '../features/administration-security/AdminPage.jsx';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<CataloguePage />} />
        <Route path="/auth" element={<AuthPage />} />
        <Route element={<ProtectedRoute role="CUSTOMER" />}>
          <Route path="/cart" element={<CartPage />} />
        </Route>
        <Route element={<ProtectedRoute role="ADMIN" />}>
          <Route path="/admin" element={<AdminPage />} />
        </Route>
      </Route>
    </Routes>
  );
}
