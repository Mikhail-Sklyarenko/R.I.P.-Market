import { useAuth } from '../auth/AuthContext';
import { MOCK_TRADE_ENABLED, canShowDevPanels } from '../utils/format';
import { SELLER_SALE_STEPS } from '../utils/seller-flow';

type SellerSaleInfoProps = {
  title?: string;
  showMockHint?: boolean;
};

export function SellerSaleInfo({
  title = 'Как проходит продажа',
  showMockHint,
}: SellerSaleInfoProps) {
  const { user } = useAuth();
  const showHint =
    showMockHint ?? (MOCK_TRADE_ENABLED && canShowDevPanels(user?.role));
  return (
    <div className="card deal-flow-info" data-testid="seller-sale-info">
      <h3>{title}</h3>
      <ol className="deal-flow-list">
        {SELLER_SALE_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {showHint ? (
        <p className="muted small" data-testid="seller-mock-trade-hint">
          Staging: исход сделки можно симулировать через mock-trade на странице заказа
          (доступно покупателю или админу в dev-окружении).
        </p>
      ) : null}
    </div>
  );
}
