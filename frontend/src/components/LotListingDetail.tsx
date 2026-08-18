import type { AuthUser, Lot } from '../api/types';
import { useLocale } from '../i18n';
import { formatDataTimestamp, resolveLotDisplayItem } from '../utils/lot-display';
import { isPurchaseBlocked } from './PurchaseReadinessAlerts';
import { ItemParamsPanel } from './ItemParamsPanel';
import { LotActionButtons } from './LotActionButtons';
import { LotItemHero } from './LotItemHero';
import { LotPurchaseCard } from './LotPurchaseCard';
import { LotStickers } from './LotStickers';
import { SimilarLots } from './SimilarLots';

type LotListingDetailProps = {
  lot: Lot;
  token: string | null;
  user: AuthUser | null;
  requiresSteamLink: boolean;
  purchaseError: unknown;
  siblingOfferCount: number | null;
  catalogItemPath: string | null;
  similarLots: Lot[];
  similarLoading: boolean;
  previewTestId?: string;
  specTestId?: string;
  stickersTestIdPrefix?: string;
  layoutTestId?: string;
  showSimilarLots?: boolean;
  onBuy: () => void;
};

export function LotListingDetail({
  lot,
  token,
  user,
  requiresSteamLink,
  purchaseError,
  siblingOfferCount,
  catalogItemPath,
  similarLots,
  similarLoading,
  previewTestId = 'lot-preview-card',
  specTestId = 'lot-spec',
  stickersTestIdPrefix = 'lot',
  layoutTestId = 'lot-page-grid',
  showSimilarLots = true,
  onBuy,
}: LotListingDetailProps) {
  const { t } = useLocale();
  const displayItem = resolveLotDisplayItem(lot);
  const isOwnLot = Boolean(user && lot.sellerId === user.id);
  const isUnavailable = lot.status !== 'ACTIVE';
  const steamPurchaseBlocked = isPurchaseBlocked(user, requiresSteamLink, Boolean(token));
  const canProceed = lot.status === 'ACTIVE' && !isOwnLot && !steamPurchaseBlocked;
  const showPurchaseBlockers =
    Boolean(token) && !isOwnLot && !isUnavailable && steamPurchaseBlocked;
  const snapshotCapturedAt = formatDataTimestamp(displayItem.capturedAt ?? null);

  return (
    <>
      {isUnavailable && showSimilarLots ? (
        <SimilarLots lots={similarLots} loading={similarLoading} prominent />
      ) : null}

      <div className="lot-page-grid" data-testid={layoutTestId}>
        <div className="lot-page-main">
          <div className="card lot-preview-card" data-testid={previewTestId}>
            <LotItemHero item={displayItem} />

            <div className="lot-preview-card-body">
              <ItemParamsPanel item={displayItem} testId={specTestId} showEmptyFloat />

              <LotStickers stickers={displayItem.stickers} testIdPrefix={stickersTestIdPrefix} />

              {snapshotCapturedAt ? (
                <p className="muted small lot-preview-meta" data-testid="lot-snapshot-captured-at">
                  {t('lot.snapshotCaptured', { when: snapshotCapturedAt })}
                </p>
              ) : null}

              <LotActionButtons
                inspectLink={lot.inspectLink}
                steamMarketUrl={lot.steamMarketUrl}
                steamMarketHashName={
                  lot.steamMarketHashName ?? displayItem.itemDefinition.marketHashName
                }
              />
            </div>
          </div>
        </div>

        <aside className="lot-page-sidebar">
          <LotPurchaseCard
            lot={lot}
            token={token}
            user={user}
            canProceed={canProceed}
            isOwnLot={isOwnLot}
            isUnavailable={isUnavailable}
            showPurchaseBlockers={showPurchaseBlockers}
            requiresSteamLink={requiresSteamLink}
            siblingOfferCount={siblingOfferCount}
            catalogItemPath={catalogItemPath}
            purchaseError={purchaseError}
            onBuy={onBuy}
          />
        </aside>
      </div>

      {!isUnavailable && showSimilarLots ? (
        <SimilarLots lots={similarLots} loading={similarLoading} />
      ) : null}
    </>
  );
}
