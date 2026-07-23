import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { MOCK_TRADE_ENABLED, canShowDevPanels } from '../utils/format';
import { SELLER_SALE_STEP_KEYS } from '../utils/seller-flow';

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
  title,
  showMockHint,
  compact = false,
}: SellerSaleInfoProps) {
  const { t } = useLocale();
  const { user } = useAuth();
  const showHint =
    showMockHint ?? (MOCK_TRADE_ENABLED && canShowDevPanels(user?.role));
  const resolvedTitle = title ?? t('sellerSale.title');

  const body = (
    <>
      <ol className="deal-flow-list">
        {SELLER_SALE_STEP_KEYS.map((key) => (
          <li key={key}>{t(key)}</li>
        ))}
      </ol>
      {showHint ? (
        <p className="muted small" data-testid="seller-mock-trade-hint">
          {t('sellerSale.mockHint')}
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
        <summary className="checkout-deal-flow-summary">{resolvedTitle}</summary>
        <div className="checkout-deal-flow-body">{body}</div>
      </details>
    );
  }

  return (
    <div className="card deal-flow-info" data-testid="seller-sale-info">
      <h3>{resolvedTitle}</h3>
      {body}
    </div>
  );
}
