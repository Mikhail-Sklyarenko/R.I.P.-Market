export type LotTradeExpectations = {
  expectedAssetId: string;
  marketHashName: string;
  expectedFloatValue: string | null;
};

type SnapshotLike = {
  assetExternalId: string;
  marketHashName: string;
  floatValue?: { toString(): string } | string | null;
};

type AssetLike = {
  assetExternalId: string;
  floatValue?: { toString(): string } | string | null;
  itemDefinition: { marketHashName: string };
};

export function resolveLotTradeExpectations(
  listingSnapshot: SnapshotLike | null | undefined,
  asset: AssetLike,
): LotTradeExpectations {
  const snapshotFloat =
    listingSnapshot?.floatValue === null ||
    listingSnapshot?.floatValue === undefined
      ? null
      : String(listingSnapshot.floatValue);
  const assetFloat =
    asset.floatValue === null || asset.floatValue === undefined
      ? null
      : String(asset.floatValue);

  return {
    expectedAssetId: listingSnapshot?.assetExternalId ?? asset.assetExternalId,
    marketHashName:
      listingSnapshot?.marketHashName ?? asset.itemDefinition.marketHashName,
    expectedFloatValue: snapshotFloat ?? assetFloat,
  };
}
