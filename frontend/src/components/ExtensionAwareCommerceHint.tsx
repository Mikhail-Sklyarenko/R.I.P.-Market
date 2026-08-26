import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAuthConfig } from '../api/marketplace';
import { useLocale } from '../i18n';
import {
  getExtensionRuntimeStatus,
  isExtensionRuntimeAvailable,
} from '../utils/extension';
import {
  resolveExtensionAwareHint,
  type ExtensionAwareSurface,
} from '../utils/extension-aware-commerce';
import { ExtensionConnectPanel } from './ExtensionConnectPanel';

type ExtensionAwareCommerceHintProps = {
  surface: ExtensionAwareSurface;
  token?: string | null;
  /** When known by parent, skip a second /auth/config fetch. */
  channelEnabled?: boolean | null;
};

/**
 * I1: soft extension trust strip on buy/sell entry surfaces.
 * Never blocks purchase or listing.
 */
export function ExtensionAwareCommerceHint({
  surface,
  token = null,
  channelEnabled: channelEnabledProp = null,
}: ExtensionAwareCommerceHintProps) {
  const { t } = useLocale();
  const [channelEnabledLocal, setChannelEnabledLocal] = useState(false);
  const [connected, setConnected] = useState(false);
  const runtimeAvailable = isExtensionRuntimeAvailable();
  const channelEnabled =
    channelEnabledProp != null ? channelEnabledProp : channelEnabledLocal;

  useEffect(() => {
    if (channelEnabledProp != null) {
      return;
    }
    let cancelled = false;
    getAuthConfig()
      .then((config) => {
        if (!cancelled) {
          setChannelEnabledLocal(
            Boolean(config.extension?.extensionChannelEnabled),
          );
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [channelEnabledProp]);

  useEffect(() => {
    if (!channelEnabled) {
      return;
    }
    let cancelled = false;
    const refresh = async () => {
      const status = await getExtensionRuntimeStatus();
      if (!cancelled) {
        setConnected(status.connected);
      }
    };
    void refresh();
    const timer = window.setInterval(() => {
      void refresh();
    }, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [channelEnabled]);

  const hint = resolveExtensionAwareHint({
    channelEnabled,
    runtimeAvailable,
    connected,
    surface,
  });

  if (hint.kind === 'hidden') {
    return null;
  }

  const purpose =
    surface === 'buy' ? 'buyer_safe_accept' : 'seller_auto';

  return (
    <aside
      className={`extension-aware-hint extension-aware-hint--${hint.kind}`}
      data-testid={`extension-aware-${surface}-hint`}
      data-kind={hint.kind}
    >
      <strong>{t(hint.titleKey)}</strong>
      <p className="muted small">{t(hint.bodyKey)}</p>
      {hint.showConnectPanel && token ? (
        <ExtensionConnectPanel
          token={token}
          compact
          purpose={purpose}
          onConnectedChange={setConnected}
        />
      ) : null}
      {hint.kind === 'install' || (hint.kind === 'pair' && !token) ? (
        <p className="muted small">
          <Link to="/account" data-testid={`extension-aware-${surface}-account`}>
            {t('extensionAwareCommerce.accountLink')}
          </Link>
        </p>
      ) : null}
    </aside>
  );
}
