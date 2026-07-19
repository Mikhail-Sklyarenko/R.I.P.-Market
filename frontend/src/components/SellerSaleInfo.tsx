import { useAuth } from '../auth/AuthContext';
import { MOCK_TRADE_ENABLED, canShowDevPanels } from '../utils/format';
import { SELLER_SALE_STEPS } from '../utils/seller-flow';

type SellerSaleInfoProps = {
  title?: string;
  showMockHint?: boolean;
  /** Collapsed by default — inventory first paint must stay grid-first. */
  compact?: boolean;
};

/**
 * Seller education block. On inventory use compact=true so the grid stays above the fold.
 */
export function SellerSaleInfo({
  title = 'Как проходит продажа',
  showMockHint,
  compact = false,
}: SellerSaleInfoProps) {
  const { user } = useAuth();
  const showHint =
    showMockHint ?? (MOCK_TRADE_ENABLED && canShowDevPanels(user?.role));

  const body = (
    <>
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
    </>
  );

  if (compact) {
    return (
      <details
        className="checkout-deal-flow inventory-sale-flow"
        data-testid="seller-sale-info"
      >
        <summary className="checkout-deal-flow-summary">{title}</summary>
        <div className="checkout-deal-flow-body">{body}</div>
      </details>
    );
  }

  return (
    <div className="card deal-flow-info" data-testid="seller-sale-info">
      <h3>{title}</h3>
      {body}
    </div>
  );
}
