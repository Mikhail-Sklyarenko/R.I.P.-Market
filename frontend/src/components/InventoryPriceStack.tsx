import { useLocale } from '../i18n';
import { MoneyDisplay } from './MoneyDisplay';

type PriceStackProps = {
  steamPriceMinor?: number | null;
  marketplacePriceMinor?: string | null;
  testIdPrefix: string;
  loading?: boolean;
  requireSteamPrice?: boolean;
  /** Catalog cards: one price line, no duplicate Steam / empty market hints. */
  compact?: boolean;
  /**
   * seller = inventory: always Steam as primary (no marketplace takeover).
   * buyer = catalog/default: marketplace min can be primary when present.
   */
  context?: 'buyer' | 'seller';
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
  compact = false,
  context = 'buyer',
}: PriceStackProps) {
  const { t } = useLocale();
  if (loading && !steamPriceMinor && !marketplacePriceMinor) {
    if (compact) {
      return (
        <div className="inventory-price-stack" data-testid={`${testIdPrefix}-prices`}>
          <p className="inventory-price-primary muted" data-testid={`${testIdPrefix}-primary-price`}>
            —
          </p>
        </div>
      );
    }
    return <PriceStackSkeleton testIdPrefix={testIdPrefix} />;
  }

  const hasMarket = Boolean(marketplacePriceMinor);
  const hasSteam = Boolean(steamPriceMinor);

  if (compact && hasSteam && !hasMarket) {
    return (
      <div className="inventory-price-stack" data-testid={`${testIdPrefix}-prices`}>
        <p className="inventory-price-primary" data-testid={`${testIdPrefix}-primary-price`}>
          <MoneyDisplay minor={steamPriceMinor!} strong />
        </p>
      </div>
    );
  }

  if (compact && !hasSteam && !hasMarket) {
    return (
      <div className="inventory-price-stack" data-testid={`${testIdPrefix}-prices`}>
        <p className="inventory-price-primary muted" data-testid={`${testIdPrefix}-primary-price`}>
          —
        </p>
      </div>
    );
  }

  // Inventory / seller: Steam is always the value signal; market is competition only.
  if (context === 'seller') {
    if (hasSteam) {
      return (
        <div className="inventory-price-stack" data-testid={`${testIdPrefix}-prices`}>
          <p className="inventory-price-primary" data-testid={`${testIdPrefix}-primary-price`}>
            <MoneyDisplay minor={steamPriceMinor!} strong />
          </p>
          <p className="inventory-price-secondary muted small">
            {t('inventoryPriceStack.steam')}{' '}
            <span data-testid={`${testIdPrefix}-steam-price`}>
              <MoneyDisplay minor={steamPriceMinor!} />
            </span>
          </p>
          <p className="inventory-price-secondary muted small">
            {t('inventoryPriceStack.onRip')}{' '}
            <span data-testid={`${testIdPrefix}-market-price`}>
              {hasMarket ? (
                <>
                  {t('inventoryPriceStack.from')} <MoneyDisplay minor={marketplacePriceMinor!} />
                </>
              ) : (
                t('inventoryPriceStack.noLots')
              )}
            </span>
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
          <p
            className="inventory-price-secondary muted small"
            data-testid={`${testIdPrefix}-steam-price`}
          >
            {t('inventoryPriceStack.steam')} {t('inventoryPriceStack.na')} ·{' '}
            {t('inventoryPriceStack.onRip')}{' '}
            <span data-testid={`${testIdPrefix}-market-price`}>
              {hasMarket ? (
                <>
                  {t('inventoryPriceStack.from')} <MoneyDisplay minor={marketplacePriceMinor!} />
                </>
              ) : (
                '—'
              )}
            </span>
          </p>
        </div>
      );
    }

    return (
      <div className="inventory-price-stack" data-testid={`${testIdPrefix}-prices`}>
        <p className="inventory-price-primary muted" data-testid={`${testIdPrefix}-primary-price`}>
          —
        </p>
        <p className="inventory-price-secondary muted small" data-testid={`${testIdPrefix}-steam-price`}>
          {t('inventoryPriceStack.steam')} {t('inventoryPriceStack.na')} ·{' '}
          {t('inventoryPriceStack.onRip')}{' '}
          <span data-testid={`${testIdPrefix}-market-price`}>
            {hasMarket ? (
              <>
                {t('inventoryPriceStack.from')} <MoneyDisplay minor={marketplacePriceMinor!} />
              </>
            ) : (
              '—'
            )}
          </span>
        </p>
      </div>
    );
  }

  if (hasMarket) {
    return (
      <div className="inventory-price-stack" data-testid={`${testIdPrefix}-prices`}>
        <p className="inventory-price-primary" data-testid={`${testIdPrefix}-primary-price`}>
          <MoneyDisplay minor={marketplacePriceMinor!} strong />
        </p>
        <p className="inventory-price-secondary muted small">
          {t('inventoryPriceStack.steam')}{' '}
          <span data-testid={`${testIdPrefix}-steam-price`}>
            {hasSteam ? <MoneyDisplay minor={steamPriceMinor!} /> : t('inventoryPriceStack.na')}
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
          {t('inventoryPriceStack.steam')}{' '}
          <span data-testid={`${testIdPrefix}-steam-price`}>
            <MoneyDisplay minor={steamPriceMinor!} />
          </span>
        </p>
        <p className="inventory-price-secondary muted small">
          {t('inventoryPriceStack.market')}{' '}
          <span data-testid={`${testIdPrefix}-market-price`}>{t('inventoryPriceStack.noLots')}</span>
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
          {t('inventoryPriceStack.steam')} {t('inventoryPriceStack.na')} ·{' '}
          {t('inventoryPriceStack.market')} <span data-testid={`${testIdPrefix}-market-price`}>—</span>
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
        {t('inventoryPriceStack.steam')} {t('inventoryPriceStack.na')} ·{' '}
        {t('inventoryPriceStack.market')} <span data-testid={`${testIdPrefix}-market-price`}>—</span>
      </p>
    </div>
  );
}
