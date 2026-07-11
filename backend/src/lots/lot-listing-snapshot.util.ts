import type { InventoryAsset, ItemDefinition } from '@prisma/client';
import {
  buildFallbackInspectLink,
  resolveInspectLink,
} from './inspect-link.util';

type SnapshotSource = InventoryAsset & {
  itemDefinition: ItemDefinition;
};

export function buildLotListingSnapshotData(
  asset: SnapshotSource,
  sellerSteamId: string,
) {
  const inspectLink =
    resolveInspectLink(
      asset.inspectLinkTemplate,
      sellerSteamId,
      asset.assetExternalId,
    ) ??
    buildFallbackInspectLink({
      ownerSteamId: sellerSteamId,
      assetExternalId: asset.assetExternalId,
      classId: asset.classExternalId,
      instanceId: asset.instanceExternalId,
    });

  return {
    assetExternalId: asset.assetExternalId,
    marketHashName: asset.itemDefinition.marketHashName,
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
