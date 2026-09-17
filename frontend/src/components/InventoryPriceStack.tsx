import { useLocale } from '../i18n';
import { MoneyDisplay } from './MoneyDisplay';

type PriceStackProps = {
  steamPriceMinor?: number | null;
  marketplacePriceMinor?: string | null;
  steamPriceChange7dPct?: number | null;
  steamPriceChange30dPct?: number | null;
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

function formatChangePct(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}%`;
}

function SteamPriceChangeRow({
  change7dPct,
  change30dPct,
  testIdPrefix,
}: {
  change7dPct?: number | null;
  change30dPct?: number | null;
  testIdPrefix: string;
}) {
  const { t } = useLocale();
  const has7 =
    change7dPct != null && Number.isFinite(change7dPct);
  const has30 =
    change30dPct != null && Number.isFinite(change30dPct);
  if (!has7 && !has30) {
    return null;
  }
  return (
    <p
      className="inventory-price-change muted small"
      data-testid={`${testIdPrefix}-steam-change`}
    >
      {has7 ? (
        <span
          className={
            change7dPct! > 0
              ? 'price-change-up'
              : change7dPct! < 0
                ? 'price-change-down'
                : 'price-change-flat'
          }
          data-testid={`${testIdPrefix}-steam-change-7d`}
        >
          {t('inventoryPriceStack.change7d')} {formatChangePct(change7dPct!)}
        </span>
      ) : null}
      {has7 && has30 ? <span aria-hidden="true"> · </span> : null}
      {has30 ? (
        <span
          className={
            change30dPct! > 0
              ? 'price-change-up'
              : change30dPct! < 0
                ? 'price-change-down'
                : 'price-change-flat'
          }
          data-testid={`${testIdPrefix}-steam-change-30d`}
        >
          {t('inventoryPriceStack.change30d')} {formatChangePct(change30dPct!)}
        </span>
      ) : null}
    </p>
  );
}

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
  steamPriceChange7dPct = null,
  steamPriceChange30dPct = null,
  testIdPrefix,
  loading = false,
  requireSteamPrice = false,
  compact = false,
  context = 'buyer',
}: PriceStackProps) {
  const { t } = useLocale();
  const changeRow = (
    <SteamPriceChangeRow
      change7dPct={steamPriceChange7dPct}
      change30dPct={steamPriceChange30dPct}
      testIdPrefix={testIdPrefix}
    />
  );
  if (loading && !steamPriceMinor && !marketplacePriceMinor) {
    if (compact) {
      return (
        <div
          className="inventory-price-stack"
          data-testid={`${testIdPrefix}-prices`}
        >
          <p
            className="inventory-price-primary muted"
            data-testid={`${testIdPrefix}-primary-price`}
          >
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
      <div
        className="inventory-price-stack"
        data-testid={`${testIdPrefix}-prices`}
      >
        <p
          className="inventory-price-primary"
          data-testid={`${testIdPrefix}-primary-price`}
        >
          <MoneyDisplay minor={steamPriceMinor!} strong />
          <span className="guide-price-caption">{t('ux.steamGuideOnly')}</span>
        </p>
        {changeRow}
      </div>
    );
  }

  if (compact && hasMarket) {
    return (
      <div
        className="inventory-price-stack"
        data-testid={`${testIdPrefix}-prices`}
      >
        <p
          className="inventory-price-primary"
          data-testid={`${testIdPrefix}-primary-price`}
        >
          <MoneyDisplay minor={marketplacePriceMinor!} strong />
        </p>
        {hasSteam ? (
          <p className="inventory-price-secondary muted small">
            {t('inventoryPriceStack.steam')}{' '}
            <span data-testid={`${testIdPrefix}-steam-price`}>
              <MoneyDisplay minor={steamPriceMinor!} />
            </span>
          </p>
        ) : (
          <span
            hidden
            aria-hidden="true"
            data-testid={`${testIdPrefix}-market-price`}
          >
            {marketplacePriceMinor}
          </span>
        )}
        {changeRow}
      </div>
    );
  }

  if (compact && !hasSteam && !hasMarket) {
    return (
      <div
        className="inventory-price-stack"
        data-testid={`${testIdPrefix}-prices`}
      >
        <p
          className="inventory-price-primary muted"
          data-testid={`${testIdPrefix}-primary-price`}
        >
          —
        </p>
      </div>
    );
  }

  // Inventory / seller: Steam is always the value signal; market is competition only.
  if (context === 'seller') {
    if (hasSteam) {
      return (
        <div
          className="inventory-price-stack"
          data-testid={`${testIdPrefix}-prices`}
        >
          <p
            className="inventory-price-primary"
            data-testid={`${testIdPrefix}-primary-price`}
          >
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
                  {t('inventoryPriceStack.from')}{' '}
                  <MoneyDisplay minor={marketplacePriceMinor!} />
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
        <div
          className="inventory-price-stack"
          data-testid={`${testIdPrefix}-prices`}
        >
          <p
            className="inventory-price-primary"
            data-testid={`${testIdPrefix}-primary-price`}
          >
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
                  {t('inventoryPriceStack.from')}{' '}
                  <MoneyDisplay minor={marketplacePriceMinor!} />
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
      <div
        className="inventory-price-stack"
        data-testid={`${testIdPrefix}-prices`}
      >
        <p
          className="inventory-price-primary muted"
          data-testid={`${testIdPrefix}-primary-price`}
        >
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
                {t('inventoryPriceStack.from')}{' '}
                <MoneyDisplay minor={marketplacePriceMinor!} />
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
      <div
        className="inventory-price-stack"
        data-testid={`${testIdPrefix}-prices`}
      >
        <p
          className="inventory-price-primary"
          data-testid={`${testIdPrefix}-primary-price`}
        >
          <MoneyDisplay minor={marketplacePriceMinor!} strong />
        </p>
        <p className="inventory-price-secondary muted small">
          {t('inventoryPriceStack.steam')}{' '}
          <span data-testid={`${testIdPrefix}-steam-price`}>
            {hasSteam ? (
              <MoneyDisplay minor={steamPriceMinor!} />
            ) : (
              t('inventoryPriceStack.na')
            )}
          </span>
        </p>
        <span
          hidden
          aria-hidden="true"
          data-testid={`${testIdPrefix}-market-price`}
        >
          {marketplacePriceMinor}
        </span>
      </div>
    );
  }

  if (hasSteam) {
    return (
      <div
        className="inventory-price-stack"
        data-testid={`${testIdPrefix}-prices`}
      >
        <p
          className="inventory-price-primary"
          data-testid={`${testIdPrefix}-primary-price`}
        >
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
          <span data-testid={`${testIdPrefix}-market-price`}>
            {t('inventoryPriceStack.noLots')}
          </span>
        </p>
      </div>
    );
  }

  if (requireSteamPrice) {
    return (
      <div
        className="inventory-price-stack"
        data-testid={`${testIdPrefix}-prices`}
      >
        <p
          className="inventory-price-primary"
          data-testid={`${testIdPrefix}-primary-price`}
        >
          —
        </p>
        <p
          className="inventory-price-secondary muted small"
          data-testid={`${testIdPrefix}-steam-price`}
        >
          {t('inventoryPriceStack.steam')} {t('inventoryPriceStack.na')} ·{' '}
          {t('inventoryPriceStack.market')}{' '}
          <span data-testid={`${testIdPrefix}-market-price`}>—</span>
        </p>
      </div>
    );
  }

  return (
    <div
      className="inventory-price-stack"
      data-testid={`${testIdPrefix}-prices`}
    >
      <p
        className="inventory-price-primary"
        data-testid={`${testIdPrefix}-primary-price`}
      >
        —
      </p>
      <p
        className="inventory-price-secondary muted small"
        data-testid={`${testIdPrefix}-steam-price`}
      >
        {t('inventoryPriceStack.steam')} {t('inventoryPriceStack.na')} ·{' '}
        {t('inventoryPriceStack.market')}{' '}
        <span data-testid={`${testIdPrefix}-market-price`}>—</span>
      </p>
    </div>
  );
}
