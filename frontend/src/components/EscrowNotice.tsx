import { useLocale } from '../i18n';

export function EscrowNotice({ compact = false }: { compact?: boolean }) {
  const { t } = useLocale();
  if (compact) {
    return (
      <p className="checkout-footnote" data-testid="escrow-notice">
        {t('escrow.compact')}
      </p>
    );
  }

  return (
    <p className="escrow-notice" data-testid="escrow-notice">
      {t('escrow.full')}
    </p>
  );
}
