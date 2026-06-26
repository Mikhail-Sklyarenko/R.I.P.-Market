import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './auth/AdminRoute';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AdminLayout } from './components/AdminLayout';
import { Layout } from './components/Layout';
import { AdminOrderCardPage } from './pages/admin/AdminOrderCardPage';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { AdminOutboxPage } from './pages/admin/AdminOutboxPage';
import { CatalogPage } from './pages/CatalogPage';
import { CreateLotPage } from './pages/CreateLotPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { SteamCallbackPage } from './pages/SteamCallbackPage';
import { LotPage } from './pages/LotPage';
import { MyLotsPage } from './pages/MyLotsPage';
import { MyOrdersPage } from './pages/MyOrdersPage';
import { OrderPage } from './pages/OrderPage';
import { WalletPage } from './pages/WalletPage';
import { getHomePathForRole } from './utils/format';

function HomeRedirect() {
  const raw = localStorage.getItem('rip_market_auth');
  if (raw) {
    try {
      const auth = JSON.parse(raw) as { user?: { role?: string } };
      if (auth.user?.role) {
        return <Navigate to={getHomePathForRole(auth.user.role)} replace />;
      }
    } catch {
      // ignore
    }
  }
  return <Navigate to="/catalog" replace />;
}

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/steam/callback" element={<SteamCallbackPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin/orders" element={<AdminOrdersPage />} />
              <Route path="/admin/orders/:id" element={<AdminOrderCardPage />} />
              <Route path="/admin/outbox" element={<AdminOutboxPage />} />
            </Route>
          </Route>
          <Route element={<Layout />}>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/catalog" element={<CatalogPage />} />
            <Route path="/lots/:id" element={<LotPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/orders/:id" element={<OrderPage />} />
            <Route path="/my/orders" element={<MyOrdersPage />} />
            <Route path="/sell/inventory" element={<InventoryPage />} />
            <Route path="/sell/lots/new" element={<CreateLotPage />} />
            <Route path="/sell/my-lots" element={<MyLotsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/catalog" replace />} />
      </Routes>
    </AuthProvider>
  );
}
