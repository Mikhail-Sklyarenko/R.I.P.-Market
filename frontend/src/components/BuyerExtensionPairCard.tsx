import { ExtensionConnectPanel } from './ExtensionConnectPanel';
import { useLocale } from '../i18n';
import type { Order } from '../api/types';
import { resolveBuyerExtensionPairMoment } from '../utils/buyer-extension-pair';

type BuyerExtensionPairCardProps = {
  order: Order;
  token: string;
  extensionTradeAckEnabled: boolean;
  extensionConnected: boolean;
  onConnectedChange?: (connected: boolean) => void;
};

/**
 * I1 / C1: buyer pairing CTA — or ready + deep link once the offer exists.
 */
export function BuyerExtensionPairCard({
  order,
  token,
  extensionTradeAckEnabled,
  extensionConnected,
  onConnectedChange,
}: BuyerExtensionPairCardProps) {
  const { t } = useLocale();
  const moment = resolveBuyerExtensionPairMoment({
    order,
    role: 'buyer',
    extensionTradeAckEnabled,
    extensionConnected,
  });

  if (moment.showReadyHint) {
    return (
      <section
        className="buyer-extension-pair buyer-extension-pair--ready"
        data-testid="buyer-extension-pair-ready"
      >
        <p className="eyebrow">{t('buyerExtensionPair.eyebrow')}</p>
        <strong>{t('buyerExtensionPair.readyTitle')}</strong>
        <p className="muted small">{t('buyerExtensionPair.readyBody')}</p>
        {moment.steamOfferUrl ? (
          <a
            className="button primary sm"
            href={moment.steamOfferUrl}
            target="_blank"
            rel="noreferrer"
            data-testid="buyer-extension-open-verified-offer"
          >
            {t('buyerExtensionPair.openVerifiedOffer')}
          </a>
        ) : null}
      </section>
    );
  }

  if (!moment.showPairPrompt) {
    return null;
  }

  return (
    <section
      className="buyer-extension-pair buyer-extension-pair--prompt"
      data-testid="buyer-extension-pair-prompt"
    >
      <p className="eyebrow">{t('buyerExtensionPair.eyebrow')}</p>
      <strong>{t('buyerExtensionPair.promptTitle')}</strong>
      <p className="muted small">{t('buyerExtensionPair.promptBody')}</p>
      <ExtensionConnectPanel
        token={token}
        compact
        purpose="buyer_safe_accept"
        onConnectedChange={onConnectedChange}
      />
    </section>
  );
}
