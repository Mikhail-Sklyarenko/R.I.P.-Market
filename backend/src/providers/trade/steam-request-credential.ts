import { AsyncLocalStorage } from 'node:async_hooks';
import type { TradeVerificationContext } from './trade-provider.interface';
type Credential = {
  token?: string;
  offerId: string;
  context: TradeVerificationContext;
};
const scope = new AsyncLocalStorage<Credential>();
/** No global credential cache. Clear even inherited asynchronous references on exit. */
export async function withSteamRequestCredential<T>(
  offerId: string,
  context: TradeVerificationContext,
  token: string,
  action: () => Promise<T>,
): Promise<T> {
  const credential: Credential = { offerId, context: { ...context }, token };
  try {
    return await scope.run(credential, action);
  } finally {
    credential.token = undefined;
  }
}
export function requestCredential(
  offerId: string,
  context?: TradeVerificationContext,
): string | undefined {
  const value = scope.getStore();
  if (
    !context ||
    !value ||
    value.offerId !== offerId ||
    value.context.sellerSteamId !== context.sellerSteamId ||
    value.context.buyerSteamId !== context.buyerSteamId ||
    value.context.assetId !== context.assetId
  )
    return undefined;
  return value.token;
}
