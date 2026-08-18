import { Navigate, useParams } from 'react-router-dom';

/** Legacy checkout URL: purchase now happens on the listing page. */
export function CheckoutPage() {
  const { id } = useParams();
  if (!id) {
    return <Navigate to="/catalog" replace />;
  }
  return <Navigate to={`/lots/${id}`} replace />;
}
