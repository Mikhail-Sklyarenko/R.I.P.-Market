import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function AdminRoute() {
  const { token, user } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  if (user?.role !== 'ADMIN') {
    return <Navigate to="/catalog" replace />;
  }
  return <Outlet />;
}
