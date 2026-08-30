import { Link } from 'react-router-dom';
import { useLocale } from '../i18n';
import {
  inventorySteamPathCopyKeys,
  type InventorySteamPathReason,
} from '../utils/inventory-steam-path';
import { CS2_STEAM_INVENTORY_URL } from '../utils/steam-inventory-links';

type InventorySteamPathBannerProps = {
  reason: InventorySteamPathReason;
  onRetry?: () => void;
  retrying?: boolean;
  /** Soft strip above a cached grid vs full empty card. */
  compact?: boolean;
};

/**
 * When Steam blocks server inventory sync, never leave the seller stranded —
 * push them to Steam CS2 inventory where the extension sell path works.
 */
export function InventorySteamPathBanner({
  reason,
  onRetry,
  retrying = false,
  compact = false,
}: InventorySteamPathBannerProps) {
  const { t } = useLocale();
  const keys = inventorySteamPathCopyKeys(reason);

  return (
    <div
      className={
        compact
          ? 'inventory-steam-path inventory-steam-path--compact'
          : 'card inventory-steam-path'
      }
      data-testid="inventory-steam-path"
      data-reason={reason}
    >
      <h3 className="inventory-steam-path-title">{t(keys.titleKey)}</h3>
      <p className="muted small inventory-steam-path-body">{t(keys.bodyKey)}</p>
      <div className="inventory-steam-path-actions">
        <a
          className="button primary"
          href={CS2_STEAM_INVENTORY_URL}
          target="_blank"
          rel="noreferrer noopener"
          data-testid="inventory-steam-path-open"
        >
          {t(keys.primaryKey)}
        </a>
        {onRetry ? (
          <button
            type="button"
            className="button secondary"
            disabled={retrying}
            data-testid="inventory-steam-path-retry"
            onClick={onRetry}
          >
            {retrying ? t('inventory.refreshing') : t('inventory.refresh')}
          </button>
        ) : null}
        <Link
          to="/support"
          className="button secondary"
          data-testid="inventory-steam-path-support"
        >
          {t('support.title')}
        </Link>
      </div>
    </div>
  );
}
