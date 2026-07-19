import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { rememberSteamReturnPath } from '../utils/steam-return-path';

export function ProtectedRoute() {
  const { token } = useAuth();
  const location = useLocation();

  if (!token) {
    rememberSteamReturnPath(`${location.pathname}${location.search}`);
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
