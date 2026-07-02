import type { AuthConfig, AuthUser } from '../api/types';
import { hasLinkedSteamId } from '../utils/steam-id';

type ReadinessUser = Pick<AuthUser, 'steamId'> & {
  tradeUrl?: string | null;
};

type ReadinessChecklistProps = {
  user?: ReadinessUser | null;
  config?: AuthConfig | null;
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

export function ReadinessChecklist({ user, config }: ReadinessChecklistProps) {
  const steamLinked = hasLinkedSteamId(user?.steamId);
  const tradeUrlReady = Boolean(user?.tradeUrl?.trim());

  const items: ChecklistItem[] = [
    {
      key: 'steam',
      label: 'Steam привязан',
      ready: steamLinked,
      hint:
        !steamLinked && config?.steamLoginAvailable
          ? 'Привяжите Steam, чтобы синхронизировать инвентарь и участвовать в сделках.'
          : undefined,
    },
    {
      key: 'trade-url',
      label: 'Ссылка на обмен указана',
      ready: tradeUrlReady,
      hint: !tradeUrlReady
        ? 'Укажите ссылку на обмен в настройках аккаунта для обменов в Steam.'
        : undefined,
    },
  ];

  return (
    <div className="card readiness-checklist" data-testid="readiness-checklist">
      <h3 className="readiness-checklist-title">Готовность к сделкам</h3>
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
