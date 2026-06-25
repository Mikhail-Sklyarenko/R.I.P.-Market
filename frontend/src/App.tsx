import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { ProtectedRoute } from './auth/ProtectedRoute';
import { Layout } from './components/Layout';
import { CreateLotPage } from './pages/CreateLotPage';
import { InventoryPage } from './pages/InventoryPage';
import { LoginPage } from './pages/LoginPage';
import { MyLotsPage } from './pages/MyLotsPage';

export function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<Layout />}>
            <Route path="/" element={<Navigate to="/sell/inventory" replace />} />
            <Route path="/sell/inventory" element={<InventoryPage />} />
            <Route path="/sell/lots/new" element={<CreateLotPage />} />
            <Route path="/sell/my-lots" element={<MyLotsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/sell/inventory" replace />} />
      </Routes>
    </AuthProvider>
  );
}
