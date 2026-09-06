import { useState } from 'react';
import { useLocale } from '../i18n';

type BuyerReceivedAckProps = {
  acknowledging: boolean;
  onConfirm: () => void;
};

/**
 * Buyer close-the-deal CTA: two taps so payout is not released by a misclick.
 */
export function BuyerReceivedAck({
  acknowledging,
  onConfirm,
}: BuyerReceivedAckProps) {
  const { t } = useLocale();
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="buyer-accept-ack" data-testid="buyer-ack-received-cta">
      <strong>{t('buyerAcceptWizard.receivedTitle')}</strong>
      <p className="muted small">{t('buyerAcceptWizard.receivedBody')}</p>
      {confirming ? (
        <>
          <p className="muted small" data-testid="buyer-ack-received-confirm-copy">
            {t('buyerAcceptWizard.receivedConfirmBody')}
          </p>
          <div className="buyer-accept-ack-actions">
            <button
              type="button"
              className="button primary"
              disabled={acknowledging}
              data-testid="buyer-ack-received"
              onClick={onConfirm}
            >
              {acknowledging
                ? t('orderTradePanel.saving')
                : t('buyerAcceptWizard.receivedConfirmCta')}
            </button>
            <button
              type="button"
              className="button ghost sm"
              disabled={acknowledging}
              data-testid="buyer-ack-received-cancel"
              onClick={() => setConfirming(false)}
            >
              {t('buyerAcceptWizard.receivedCancel')}
            </button>
          </div>
        </>
      ) : (
        <button
          type="button"
          className="button primary"
          disabled={acknowledging}
          data-testid="buyer-ack-received-start"
          onClick={() => setConfirming(true)}
        >
          {t('buyerAcceptWizard.receivedCta')}
        </button>
      )}
    </div>
  );
}
