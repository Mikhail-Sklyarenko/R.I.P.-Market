import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';

export function ProtectedRoute() {
  const { token } = useAuth();
  const location = useLocation();

  if (!token) {
    const returnUrl = `${location.pathname}${location.search}`;
    return (
      <Navigate
        to={`/login?returnUrl=${encodeURIComponent(returnUrl)}`}
        replace
      />
    );
  }

  return <Outlet />;
}
