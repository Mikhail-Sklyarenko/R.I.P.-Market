import { useEffect, useState } from 'react';
import { getAuthConfig } from '../api/marketplace';
import { DealFlowSteps } from './DealFlowSteps';

type ExtensionAwarePurchaseTrustProps = {
  token?: string | null;
  /** data-testid prefix host (item vs lot). */
  testId?: string;
};

/**
 * Purchase-card trust block — deal-flow steps (extension pairing lives on Account).
 */
export function ExtensionAwarePurchaseTrust({
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
      <DealFlowSteps embedded extensionAware={extensionAware} />
    </div>
  );
}
