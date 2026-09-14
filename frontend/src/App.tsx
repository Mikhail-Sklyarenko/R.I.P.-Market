import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AdminRoute } from './auth/AdminRoute';
import { AuthProvider } from './auth/AuthContext';
import { WalletProvider } from './wallet/WalletContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { SellProtectedRoute } from './auth/SellProtectedRoute';
import { AdminLayout } from './components/AdminLayout';
import { Layout } from './components/Layout';
import { LoadingState } from './components/LoadingState';
const AdminExtensionOpsPage = lazy(() =>
  import('./pages/admin/AdminExtensionOpsPage').then((module) => ({
    default: module.AdminExtensionOpsPage,
  })),
);
const AdminAllowlistPage = lazy(() =>
  import('./pages/admin/AdminAllowlistPage').then((module) => ({
    default: module.AdminAllowlistPage,
  })),
);
const AdminCatalogPricesPage = lazy(() =>
  import('./pages/admin/AdminCatalogPricesPage').then((module) => ({
    default: module.AdminCatalogPricesPage,
  })),
);
const AdminLotsPage = lazy(() =>
  import('./pages/admin/AdminLotsPage').then((module) => ({
    default: module.AdminLotsPage,
  })),
);
const AdminOrderCardPage = lazy(() =>
  import('./pages/admin/AdminOrderCardPage').then((module) => ({
    default: module.AdminOrderCardPage,
  })),
);
const AdminOrdersPage = lazy(() =>
  import('./pages/admin/AdminOrdersPage').then((module) => ({
    default: module.AdminOrdersPage,
  })),
);
const AdminOutboxPage = lazy(() =>
  import('./pages/admin/AdminOutboxPage').then((module) => ({
    default: module.AdminOutboxPage,
  })),
);
const AdminSupportTicketsPage = lazy(() =>
  import('./pages/admin/AdminSupportTicketsPage').then((module) => ({
    default: module.AdminSupportTicketsPage,
  })),
);
const AdminUsersPage = lazy(() =>
  import('./pages/admin/AdminUsersPage').then((module) => ({
    default: module.AdminUsersPage,
  })),
);
const AccountPage = lazy(() =>
  import('./pages/AccountPage').then((module) => ({
    default: module.AccountPage,
  })),
);
const CatalogPage = lazy(() =>
  import('./pages/CatalogPage').then((module) => ({
    default: module.CatalogPage,
  })),
);
const ItemPage = lazy(() =>
  import('./pages/ItemPage').then((module) => ({ default: module.ItemPage })),
);
const CheckoutPage = lazy(() =>
  import('./pages/CheckoutPage').then((module) => ({
    default: module.CheckoutPage,
  })),
);
const CreateLotPage = lazy(() =>
  import('./pages/CreateLotPage').then((module) => ({
    default: module.CreateLotPage,
  })),
);
const InventoryPage = lazy(() =>
  import('./pages/InventoryPage').then((module) => ({
    default: module.InventoryPage,
  })),
);
const LoginPage = lazy(() =>
  import('./pages/LoginPage').then((module) => ({ default: module.LoginPage })),
);
const SteamCallbackPage = lazy(() =>
  import('./pages/SteamCallbackPage').then((module) => ({
    default: module.SteamCallbackPage,
  })),
);
const LotPage = lazy(() =>
  import('./pages/LotPage').then((module) => ({ default: module.LotPage })),
);
const DealsPage = lazy(() =>
  import('./pages/DealsPage').then((module) => ({ default: module.DealsPage })),
);
import {
  MyOrdersRedirect,
  SellActivityRedirect,
  SellMyLotsRedirect,
} from './pages/LegacyDealsRedirects';
const NotificationsPage = lazy(() =>
  import('./pages/NotificationsPage').then((module) => ({
    default: module.NotificationsPage,
  })),
);
const OrderPage = lazy(() =>
  import('./pages/OrderPage').then((module) => ({ default: module.OrderPage })),
);
const FaqPage = lazy(() =>
  import('./pages/FaqPage').then((module) => ({ default: module.FaqPage })),
);
const SupportPage = lazy(() =>
  import('./pages/SupportPage').then((module) => ({
    default: module.SupportPage,
  })),
);
const WalletPage = lazy(() =>
  import('./pages/WalletPage').then((module) => ({
    default: module.WalletPage,
  })),
);

const ExtensionInstallPage = lazy(() => import('./pages/ExtensionInstallPage').then(m => ({ default: m.ExtensionInstallPage })));

const SavedItemsPage = lazy(() => import('./pages/SavedItemsPage').then(m => ({ default: m.SavedItemsPage })));

export function App() {
  return (
    <AuthProvider>
      <WalletProvider>
        <Suspense fallback={<LoadingState />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route
              path="/login/steam/callback"
              element={<SteamCallbackPage />}
            />

            <Route element={<Layout />}>
              <Route path="/" element={<CatalogPage />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/catalog/items/:id" element={<ItemPage />} />
              <Route path="/lots/:id" element={<LotPage />} />
              <Route path="/lots/:id/checkout" element={<CheckoutPage />} />
              <Route path="/saved" element={<SavedItemsPage />} />
              <Route path="/extension" element={<ExtensionInstallPage />} />
              <Route path="/faq" element={<FaqPage />} />
              <Route path="/support" element={<SupportPage />} />

              <Route element={<SellProtectedRoute />}>
                <Route path="/sell/inventory" element={<InventoryPage />} />
                <Route path="/sell/lots/new" element={<CreateLotPage />} />
                <Route path="/sell/my-lots" element={<SellMyLotsRedirect />} />
                <Route
                  path="/sell/activity"
                  element={<SellActivityRedirect />}
                />
              </Route>

              <Route element={<ProtectedRoute />}>
                <Route path="/account" element={<AccountPage />} />
                <Route path="/wallet" element={<WalletPage />} />
                <Route path="/orders/:id" element={<OrderPage />} />
                <Route path="/deals" element={<DealsPage />} />
                <Route path="/my/orders" element={<MyOrdersRedirect />} />
                <Route path="/notifications" element={<NotificationsPage />} />
              </Route>
            </Route>

            <Route element={<ProtectedRoute />}>
              <Route element={<AdminRoute />}>
                <Route element={<AdminLayout />}>
                  <Route
                    path="/admin/extension"
                    element={<AdminExtensionOpsPage />}
                  />
                  <Route path="/admin/orders" element={<AdminOrdersPage />} />
                  <Route
                    path="/admin/orders/:id"
                    element={<AdminOrderCardPage />}
                  />
                  <Route path="/admin/lots" element={<AdminLotsPage />} />
                  <Route path="/admin/users" element={<AdminUsersPage />} />
                  <Route
                    path="/admin/settlement/allowlist"
                    element={<AdminAllowlistPage />}
                  />
                  <Route path="/admin/outbox" element={<AdminOutboxPage />} />
                  <Route
                    path="/admin/support/tickets"
                    element={<AdminSupportTicketsPage />}
                  />
                  <Route
                    path="/admin/prices"
                    element={<AdminCatalogPricesPage />}
                  />
                  <Route
                    path="/admin/catalog/prices"
                    element={<AdminCatalogPricesPage />}
                  />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </WalletProvider>
    </AuthProvider>
  );
}
