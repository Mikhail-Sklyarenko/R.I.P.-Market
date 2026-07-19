import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './auth/AdminRoute';
import { AuthProvider } from './auth/AuthContext';
import { WalletProvider } from './wallet/WalletContext';
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
import { ItemPage } from './pages/ItemPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { CreateLotPage } from './pages/CreateLotPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { SteamCallbackPage } from './pages/SteamCallbackPage';
import { LotPage } from './pages/LotPage';
import { DealsPage } from './pages/DealsPage';
import {
  MyOrdersRedirect,
  SellActivityRedirect,
  SellMyLotsRedirect,
} from './pages/LegacyDealsRedirects';
import { NotificationsPage } from './pages/NotificationsPage';
import { OrderPage } from './pages/OrderPage';
import { FaqPage } from './pages/FaqPage';
import { SupportPage } from './pages/SupportPage';
import { WalletPage } from './pages/WalletPage';

export function App() {
  return (
    <AuthProvider>
      <WalletProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/steam/callback" element={<SteamCallbackPage />} />

        <Route element={<Layout />}>
          <Route path="/" element={<CatalogPage />} />
          <Route path="/catalog" element={<CatalogPage />} />
          <Route path="/catalog/items/:id" element={<ItemPage />} />
          <Route path="/lots/:id" element={<LotPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="/support" element={<SupportPage />} />

          <Route element={<ProtectedRoute />}>
            <Route path="/account" element={<AccountPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/lots/:id/checkout" element={<CheckoutPage />} />
            <Route path="/orders/:id" element={<OrderPage />} />
            <Route path="/deals" element={<DealsPage />} />
            <Route path="/my/orders" element={<MyOrdersRedirect />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/sell/inventory" element={<InventoryPage />} />
            <Route path="/sell/lots/new" element={<CreateLotPage />} />
            <Route path="/sell/my-lots" element={<SellMyLotsRedirect />} />
            <Route path="/sell/activity" element={<SellActivityRedirect />} />
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

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </WalletProvider>
    </AuthProvider>
  );
}
