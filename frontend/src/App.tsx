import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './auth/AdminRoute';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { AdminLayout } from './components/AdminLayout';
import { Layout } from './components/Layout';
import { AdminAllowlistPage } from './pages/admin/AdminAllowlistPage';
import { AdminLotsPage } from './pages/admin/AdminLotsPage';
import { AdminOrderCardPage } from './pages/admin/AdminOrderCardPage';
import { AdminOrdersPage } from './pages/admin/AdminOrdersPage';
import { AdminOutboxPage } from './pages/admin/AdminOutboxPage';
import { AdminUsersPage } from './pages/admin/AdminUsersPage';
import { AccountPage } from './pages/AccountPage';
import { CatalogPage } from './pages/CatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { CreateLotPage } from './pages/CreateLotPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { SteamCallbackPage } from './pages/SteamCallbackPage';
import { LotPage } from './pages/LotPage';
import { MyLotsPage } from './pages/MyLotsPage';
import { MyOrdersPage } from './pages/MyOrdersPage';
import { NotificationsPage } from './pages/NotificationsPage';
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

        <Route element={<Layout />}>
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/lots/:id" element={<LotPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/account" element={<AccountPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/lots/:id/checkout" element={<CheckoutPage />} />
            <Route path="/orders/:id" element={<OrderPage />} />
            <Route path="/my/orders" element={<MyOrdersPage />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/sell/inventory" element={<InventoryPage />} />
            <Route path="/sell/lots/new" element={<CreateLotPage />} />
            <Route path="/sell/my-lots" element={<MyLotsPage />} />
          </Route>
        </Route>

        <Route element={<ProtectedRoute />}>
          <Route element={<AdminRoute />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin/orders" element={<AdminOrdersPage />} />
              <Route path="/admin/orders/:id" element={<AdminOrderCardPage />} />
              <Route path="/admin/lots" element={<AdminLotsPage />} />
              <Route path="/admin/users" element={<AdminUsersPage />} />
              <Route path="/admin/settlement/allowlist" element={<AdminAllowlistPage />} />
              <Route path="/admin/outbox" element={<AdminOutboxPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/catalog" replace />} />
      </Routes>
    </AuthProvider>
  );
}
