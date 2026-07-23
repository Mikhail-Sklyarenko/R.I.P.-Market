import type { AuthConfig, AuthUser } from '../api/types';
import { useLocale } from '../i18n';
import { hasLinkedSteamId } from '../utils/steam-id';
import { hasTradeUrl } from '../utils/trade-url';

type ReadinessUser = Pick<AuthUser, 'steamId'> & {
  tradeUrl?: string | null;
};

type ReadinessChecklistProps = {
  user?: ReadinessUser | null;
  config?: AuthConfig | null;
  compactWhenReady?: boolean;
};

type ChecklistItem = {
  key: 'steam' | 'trade-url';
  label: string;
  ready: boolean;
  hint?: string;
};

function ChecklistMark({ ready }: { ready: boolean }) {
  return (
    <span
      className={`readiness-checklist-mark readiness-checklist-mark-${ready ? 'ok' : 'missing'}`}
      aria-hidden="true"
    >
      {ready ? '✓' : '✗'}
    </span>
  );
}

export function ReadinessChecklist({
  user,
  config,
  compactWhenReady = false,
}: ReadinessChecklistProps) {
  const { t } = useLocale();
  const steamLinked = hasLinkedSteamId(user?.steamId);
  const tradeUrlReady = hasTradeUrl(user?.tradeUrl);

  const items: ChecklistItem[] = [
    {
      key: 'steam',
      label: t('readiness.steamItemLabel'),
      ready: steamLinked,
      hint:
        !steamLinked && config?.steamLoginAvailable ? t('readiness.steamHint') : undefined,
    },
    {
      key: 'trade-url',
      label: t('readiness.tradeUrlItemLabel'),
      ready: tradeUrlReady,
      hint: !tradeUrlReady ? t('readiness.tradeUrlHint') : undefined,
    },
  ];

  if (compactWhenReady && items.every((item) => item.ready)) {
    return (
      <div className="readiness-checklist-compact" data-testid="readiness-checklist">
        <p className="readiness-checklist-compact-text">
          <span data-testid="readiness-steam">✓ {t('readiness.steamLinkedLabel')}</span>
          <span aria-hidden="true"> · </span>
          <span data-testid="readiness-trade-url">✓ {t('readiness.tradeUrlReadyLabel')}</span>
        </p>
      </div>
    );
  }

  return (
    <div className="card readiness-checklist" data-testid="readiness-checklist">
      <h3 className="readiness-checklist-title">{t('readiness.checklistTitle')}</h3>
      <ul className="readiness-checklist-list">
        {items.map((item) => (
          <li
            key={item.key}
            className={`readiness-checklist-item readiness-checklist-item-${item.ready ? 'ok' : 'missing'}`}
            data-testid={`readiness-${item.key}`}
          >
            <ChecklistMark ready={item.ready} />
            <div className="readiness-checklist-copy">
              <span className="readiness-checklist-label">{item.label}</span>
              {item.hint ? <p className="muted small readiness-checklist-hint">{item.hint}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
