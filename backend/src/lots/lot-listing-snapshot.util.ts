import type { InventoryAsset, ItemDefinition } from '@prisma/client';
import { buildInspectLink } from './inspect-link.util';
import { resolveSteamMarketHashName } from './steam-market-link.util';

type SnapshotSource = InventoryAsset & {
  itemDefinition: ItemDefinition;
};

export function buildLotListingSnapshotData(
  asset: SnapshotSource,
  sellerSteamId: string,
) {
  const inspectLink = buildInspectLink({
    template: asset.inspectLinkTemplate,
    ownerSteamId: sellerSteamId,
    assetExternalId: asset.assetExternalId,
    inspectLinkPayload: asset.inspectLinkPayload,
  });

  const marketHashName = resolveSteamMarketHashName(
    asset.itemDefinition.marketHashName,
    asset.wear,
  );

  return {
    assetExternalId: asset.assetExternalId,
    marketHashName,
    weapon: asset.itemDefinition.weapon,
    rarity: asset.itemDefinition.rarity,
    iconUrl: asset.itemDefinition.iconUrl,
    floatValue: asset.floatValue,
    paintSeed: asset.paintSeed,
    wear: asset.wear,
    tradable: asset.tradable,
    marketable: asset.marketable,
    stickers: asset.stickers ?? [],
    inspectLink,
    capturedAt: new Date(),
  };
}
