import { MoneyDisplay } from './MoneyDisplay';

type PriceStackProps = {
  steamPriceMinor?: number | null;
  marketplacePriceMinor?: string | null;
  buffPriceMinor?: number | null;
  csfloatPriceMinor?: number | null;
  testIdPrefix: string;
  loading?: boolean;
};

export function InventoryPriceStack({
  steamPriceMinor,
  marketplacePriceMinor,
  buffPriceMinor,
  csfloatPriceMinor,
  testIdPrefix,
  loading = false,
}: PriceStackProps) {
  if (loading) {
    return (
      <div
        className="inventory-price-stack inventory-price-stack-loading"
        data-testid={`${testIdPrefix}-prices`}
        aria-busy="true"
      >
        <span className="inventory-price-primary-skeleton" aria-hidden="true" />
        <span className="inventory-price-secondary-skeleton" aria-hidden="true" />
      </div>
    );
  }

  const hasMarket = Boolean(marketplacePriceMinor);
  const hasSteam = Boolean(steamPriceMinor);
  const hasReference = Boolean(buffPriceMinor || csfloatPriceMinor);

  if (hasMarket) {
    return (
      <div className="inventory-price-stack" data-testid={`${testIdPrefix}-prices`}>
        <p className="inventory-price-primary" data-testid={`${testIdPrefix}-primary-price`}>
          <MoneyDisplay minor={marketplacePriceMinor!} strong />
        </p>
        <p className="inventory-price-secondary muted small">
          Steam{' '}
          <span data-testid={`${testIdPrefix}-steam-price`}>
            {hasSteam ? <MoneyDisplay minor={steamPriceMinor!} /> : 'н/д'}
          </span>
        </p>
        {hasReference ? (
          <p className="inventory-price-reference muted small">
            <span className="inventory-price-reference-label">Справка:</span>{' '}
            {buffPriceMinor ? (
              <span data-testid={`${testIdPrefix}-buff-price`}>
                Buff <MoneyDisplay minor={buffPriceMinor} />
              </span>
            ) : null}
            {buffPriceMinor && csfloatPriceMinor ? ' · ' : null}
            {csfloatPriceMinor ? (
              <span data-testid={`${testIdPrefix}-csfloat-price`}>
                CSFloat <MoneyDisplay minor={csfloatPriceMinor} />
              </span>
            ) : null}
          </p>
        ) : null}
        <span className="sr-only" data-testid={`${testIdPrefix}-market-price`}>
          {marketplacePriceMinor}
        </span>
      </div>
    );
  }

  if (hasSteam) {
    return (
      <div className="inventory-price-stack" data-testid={`${testIdPrefix}-prices`}>
        <p className="inventory-price-primary" data-testid={`${testIdPrefix}-primary-price`}>
          <MoneyDisplay minor={steamPriceMinor!} strong />
        </p>
        <p className="inventory-price-secondary muted small">
          Маркет <span data-testid={`${testIdPrefix}-market-price`}>—</span>
        </p>
        {hasReference ? (
          <p className="inventory-price-reference muted small">
            <span className="inventory-price-reference-label">Справка:</span>{' '}
            {buffPriceMinor ? (
              <span data-testid={`${testIdPrefix}-buff-price`}>
                Buff <MoneyDisplay minor={buffPriceMinor} />
              </span>
            ) : null}
            {buffPriceMinor && csfloatPriceMinor ? ' · ' : null}
            {csfloatPriceMinor ? (
              <span data-testid={`${testIdPrefix}-csfloat-price`}>
                CSFloat <MoneyDisplay minor={csfloatPriceMinor} />
              </span>
            ) : null}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="inventory-price-stack" data-testid={`${testIdPrefix}-prices`}>
      <p className="inventory-price-primary" data-testid={`${testIdPrefix}-primary-price`}>
        —
      </p>
      <p className="inventory-price-secondary muted small" data-testid={`${testIdPrefix}-steam-price`}>
        Steam н/д · Маркет <span data-testid={`${testIdPrefix}-market-price`}>—</span>
      </p>
    </div>
  );
}
