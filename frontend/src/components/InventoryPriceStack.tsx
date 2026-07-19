import { MoneyDisplay } from './MoneyDisplay';

type PriceStackProps = {
  steamPriceMinor?: number | null;
  marketplacePriceMinor?: string | null;
  testIdPrefix: string;
  loading?: boolean;
  requireSteamPrice?: boolean;
};

function PriceStackSkeleton({ testIdPrefix }: { testIdPrefix: string }) {
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

export function InventoryPriceStack({
  steamPriceMinor,
  marketplacePriceMinor,
  testIdPrefix,
  loading = false,
  requireSteamPrice = false,
}: PriceStackProps) {
  if (loading && !steamPriceMinor && !marketplacePriceMinor) {
    return <PriceStackSkeleton testIdPrefix={testIdPrefix} />;
  }

  const hasMarket = Boolean(marketplacePriceMinor);
  const hasSteam = Boolean(steamPriceMinor);

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
          Steam{' '}
          <span data-testid={`${testIdPrefix}-steam-price`}>
            <MoneyDisplay minor={steamPriceMinor!} />
          </span>
        </p>
        <p className="inventory-price-secondary muted small">
          Маркет{' '}
          <span data-testid={`${testIdPrefix}-market-price`}>нет лотов</span>
        </p>
      </div>
    );
  }

  if (requireSteamPrice) {
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
