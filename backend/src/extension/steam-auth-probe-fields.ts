// Diagnostic predicates only: never relax settlement validation or echo upstream values.
const obj = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const validId = (value: unknown): boolean =>
  typeof value === 'string' && /^[1-9][0-9]{0,19}$/.test(value);

export function probeItemFields(
  prefix: string,
  value: unknown,
  expectedAsset: string,
) {
  const item = obj(value);
  return {
    [`${prefix}AppMatches`]: item.appid === 730,
    [`${prefix}ContextMatches`]: item.contextid === '2',
    [`${prefix}AssetMatches`]: item.assetid === expectedAsset,
    [`${prefix}AmountMatches`]: item.amount === '1',
    [`${prefix}MarkedMissing`]: item.missing === true,
    [`${prefix}AppIsString`]: typeof item.appid === 'string',
    [`${prefix}ContextIsNumber`]: typeof item.contextid === 'number',
    [`${prefix}AssetIsNumber`]: typeof item.assetid === 'number',
    [`${prefix}AmountIsNumber`]: typeof item.amount === 'number',
  };
}

export function probeFields(
  offerValue: unknown,
  receiptValue: unknown,
  assetId: string,
  buyer: string,
) {
  const offer = obj(offerValue);
  const receipt = obj(receiptValue);
  const given = offer.items_to_give;
  const receiptGiven = receipt.assets_given;
  const receiptItem =
    Array.isArray(receiptGiven) && receiptGiven.length === 1
      ? obj(receiptGiven[0])
      : {};
  return {
    offerOutgoing: offer.is_our_offer === true,
    offerPartnerMatches:
      offer.accountid_other === Number(BigInt(buyer) - 76561197960265728n),
    offerPartnerIsString: typeof offer.accountid_other === 'string',
    offerGivenCount: Array.isArray(given) ? given.length : -1,
    offerReceivedEmpty:
      offer.items_to_receive === undefined ||
      (Array.isArray(offer.items_to_receive) &&
        offer.items_to_receive.length === 0),
    ...probeItemFields(
      'offerItem',
      Array.isArray(given) && given.length === 1 ? given[0] : null,
      assetId,
    ),
    receiptGivenCount: Array.isArray(receiptGiven) ? receiptGiven.length : -1,
    receiptReceivedEmpty:
      receipt.assets_received === undefined ||
      (Array.isArray(receipt.assets_received) &&
        receipt.assets_received.length === 0),
    ...probeItemFields('receiptItem', receiptItem, assetId),
    receiptNewContextIs2: receiptItem.new_contextid === '2',
    receiptNewContextIs16Number: receiptItem.new_contextid === 16,
    receiptNewContextIsNumber: typeof receiptItem.new_contextid === 'number',
    receiptNewContextPresent: receiptItem.new_contextid !== undefined,
    receiptNewAssetValid: validId(receiptItem.new_assetid),
    receiptNewAssetIsNumber: typeof receiptItem.new_assetid === 'number',
    receiptRollbackFieldsPresent:
      receiptItem.rollback_new_assetid !== undefined ||
      receiptItem.rollback_new_contextid !== undefined,
  };
}
