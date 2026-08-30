import { useState } from 'react';
import type { OrderParty } from '../api/types';
import { useLocale } from '../i18n';
import {
  buildSteamProfileUrl,
  canLinkSteamProfile,
  formatCounterpartyDisplayName,
} from '../utils/steam-profile';

type TradeCounterpartyCardProps = {
  party: OrderParty;
  role: 'seller' | 'buyer';
  showScamWarning?: boolean;
  /** Optional item lines under the party (wear / float) for Deal Shield parity. */
  itemLines?: Array<{ label: string; value: string }>;
};

async function copyToClipboard(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

function initials(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ''}${parts[1]![0] ?? ''}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase() || '?';
}

export function TradeCounterpartyCard({
  party,
  role,
  showScamWarning = false,
  itemLines = [],
}: TradeCounterpartyCardProps) {
  const { t } = useLocale();
  const [copied, setCopied] = useState(false);
  const displayName = formatCounterpartyDisplayName(party);
  const steamId = party.steamId?.trim() ?? '';
  const avatarUrl = party.steamAvatarUrl?.trim() || null;
  const profileLink = canLinkSteamProfile(steamId)
    ? buildSteamProfileUrl(steamId)
    : null;

  async function handleCopySteamId() {
    if (!steamId) {
      return;
    }
    await copyToClipboard(steamId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="trade-counterparty-card"
      data-testid={`trade-counterparty-${role}`}
    >
      {showScamWarning ? (
        <div
          className="alert alert-warning trade-counterparty-scam"
          data-testid="trade-scam-warning"
        >
          <strong>{t('orderTradePanel.scamWarningTitle')}</strong>
          <p className="muted small">{t('orderTradePanel.scamWarningBody')}</p>
        </div>
      ) : null}

      <div className="trade-counterparty-header">
        {avatarUrl ? (
          <img
            className="trade-counterparty-avatar"
            src={avatarUrl}
            alt=""
            data-testid={`trade-counterparty-avatar-${role}`}
          />
        ) : (
          <span
            className="trade-counterparty-avatar-fallback"
            aria-hidden="true"
            data-testid={`trade-counterparty-avatar-fallback-${role}`}
          >
            {initials(displayName)}
          </span>
        )}
        <div className="trade-counterparty-header-copy">
          <span className="eyebrow">
            {role === 'seller'
              ? t('orderTradePanel.sellerLabel')
              : t('orderTradePanel.buyerLabel')}
          </span>
          <strong data-testid={`trade-counterparty-name-${role}`}>
            {displayName}
          </strong>
        </div>
      </div>

      {steamId ? (
        <div className="trade-counterparty-steam-id">
          <span className="muted small">{t('orderTradePanel.steamIdLabel')}</span>
          <code data-testid={`trade-counterparty-steam-id-${role}`}>
            {steamId}
          </code>
          <div className="trade-counterparty-steam-actions">
            <button
              type="button"
              className="button secondary sm"
              data-testid={`trade-counterparty-copy-${role}`}
              onClick={() => void handleCopySteamId()}
            >
              {copied ? t('orderTradePanel.copied') : t('orderTradePanel.copy')}
            </button>
            {profileLink ? (
              <a
                className="button secondary sm"
                href={profileLink}
                target="_blank"
                rel="noreferrer"
                data-testid={`trade-counterparty-profile-${role}`}
              >
                {t('orderTradePanel.openSteamProfile')}
              </a>
            ) : null}
          </div>
        </div>
      ) : (
        <p
          className="muted small"
          data-testid={`trade-counterparty-steam-id-missing-${role}`}
        >
          {t('orderTradePanel.steamIdMissing')}
        </p>
      )}

      {itemLines.length > 0 ? (
        <ul
          className="trade-counterparty-item-lines"
          data-testid={`trade-counterparty-item-lines-${role}`}
        >
          {itemLines.map((line) => (
            <li key={line.label}>
              <span className="muted small">{line.label}</span> {line.value}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
