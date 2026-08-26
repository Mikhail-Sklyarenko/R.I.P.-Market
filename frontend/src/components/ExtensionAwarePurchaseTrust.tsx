import { useEffect, useState } from 'react';
import { getAuthConfig } from '../api/marketplace';
import { ExtensionAwareCommerceHint } from './ExtensionAwareCommerceHint';
import { DealFlowSteps } from './DealFlowSteps';

type ExtensionAwarePurchaseTrustProps = {
  token?: string | null;
  /** data-testid prefix host (item vs lot). */
  testId?: string;
};

/**
 * I1: purchase-card trust block — extension hint + deal-flow copy variants.
 */
export function ExtensionAwarePurchaseTrust({
  token = null,
  testId = 'purchase-trust',
}: ExtensionAwarePurchaseTrustProps) {
  const [extensionAware, setExtensionAware] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getAuthConfig()
      .then((config) => {
        if (!cancelled) {
          setExtensionAware(
            Boolean(config.extension?.extensionChannelEnabled),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="lot-purchase-trust" data-testid={testId}>
      <ExtensionAwareCommerceHint
        surface="buy"
        token={token}
        channelEnabled={extensionAware}
      />
      <DealFlowSteps embedded extensionAware={extensionAware} />
    </div>
  );
}
