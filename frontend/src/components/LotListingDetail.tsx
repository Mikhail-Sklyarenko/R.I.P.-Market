import type { AuthUser, Lot } from '../api/types';
import { resolveLotDisplayItem } from '../utils/lot-display';
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
  returnPath: string;
  similarLots: Lot[];
  similarLoading: boolean;
  previewTestId?: string;
  specTestId?: string;
  stickersTestIdPrefix?: string;
  layoutTestId?: string;
  showSimilarLots?: boolean;
};

export function LotListingDetail({
  lot,
  token,
  user,
  requiresSteamLink,
  purchaseError,
  siblingOfferCount,
  catalogItemPath,
  returnPath,
  similarLots,
  similarLoading,
  previewTestId = 'lot-preview-card',
  specTestId = 'lot-spec',
  stickersTestIdPrefix = 'lot',
  layoutTestId = 'lot-page-grid',
  showSimilarLots = true,
}: LotListingDetailProps) {
  const displayItem = resolveLotDisplayItem(lot);
  const isUnavailable = lot.status !== 'ACTIVE';

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
              <ItemParamsPanel item={displayItem} testId={specTestId} />

              <LotStickers stickers={displayItem.stickers} testIdPrefix={stickersTestIdPrefix} />

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
            requiresSteamLink={requiresSteamLink}
            siblingOfferCount={siblingOfferCount}
            catalogItemPath={catalogItemPath}
            returnPath={returnPath}
            purchaseError={purchaseError}
          />
        </aside>
      </div>

      {!isUnavailable && showSimilarLots ? (
        <SimilarLots lots={similarLots} loading={similarLoading} />
      ) : null}
    </>
  );
}
