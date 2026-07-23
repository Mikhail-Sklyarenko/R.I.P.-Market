import { useLocale } from '../i18n';

export function InventorySellPlaceholder() {
  const { t } = useLocale();
  return (
    <div className="card inventory-sell-placeholder" data-testid="inventory-sell-placeholder">
      <p className="inventory-sell-placeholder-title">
        {t('inventory.selectPlaceholderTitle')}
      </p>
      <p className="inventory-sell-placeholder-text muted small">
        {t('inventory.selectPlaceholderText')}
      </p>
    </div>
  );
}
