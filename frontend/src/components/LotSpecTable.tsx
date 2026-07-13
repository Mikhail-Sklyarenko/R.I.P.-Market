import type { ItemDisplaySource } from '../utils/item-image';
import { ItemParamsPanel } from './ItemParamsPanel';

type LotSpecTableProps = {
  item: ItemDisplaySource;
};

/** @deprecated Prefer ItemParamsPanel; kept as a thin alias for existing call sites. */
export function LotSpecTable({ item }: LotSpecTableProps) {
  return <ItemParamsPanel item={item} testId="lot-spec" />;
}
