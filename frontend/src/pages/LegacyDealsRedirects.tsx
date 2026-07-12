import { Navigate, useSearchParams } from 'react-router-dom';

export function MyOrdersRedirect() {
  return <Navigate to="/deals?tab=purchases" replace />;
}

export function SellActivityRedirect() {
  const [searchParams] = useSearchParams();
  const legacyTab = searchParams.get('tab');
  const target = legacyTab === 'orders' ? 'sales' : 'listings';
  return <Navigate to={`/deals?tab=${target}`} replace />;
}

export function SellMyLotsRedirect() {
  return <Navigate to="/deals?tab=listings" replace />;
}
