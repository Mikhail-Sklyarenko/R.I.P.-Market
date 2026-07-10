import { useEffect, useRef, useState } from 'react';
import {
  getAuthConfig,
  getSteamLinkUrl,
  getUserMe,
  unlinkSteam,
  updateTradeUrl,
} from '../api/marketplace';
import type { AuthConfig } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { ExtensionConnectPanel } from '../components/ExtensionConnectPanel';
import { PageHeader } from '../components/PageHeader';
import { ReadinessChecklist } from '../components/ReadinessChecklist';
import { hasLinkedSteamId } from '../utils/steam-id';
import { disconnectExtension } from '../utils/extension';
import { SteamTradeUrlButton } from '../components/SteamTradeUrlButton';
import { isValidSteamTradeUrl } from '../utils/trade-url';
import { profileToAuthUser } from '../utils/user-profile';
import { formatUserRole, formatUserStatus } from '../utils/format';

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api/v1';
const STEAM_LOGOUT_URL = 'https://steamcommunity.com/login/logout/';

export function AccountPage() {
  const { token, user, updateUser } = useAuth();
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [tradeUrlInput, setTradeUrlInput] = useState('');
  const [linkLoading, setLinkLoading] = useState(false);
  const [changeSteamLoading, setChangeSteamLoading] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [tradeUrlError, setTradeUrlError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const tradeUrlDirtyRef = useRef(false);

  useEffect(() => {
    tradeUrlDirtyRef.current = false;
  }, [token]);

  useEffect(() => {
    getAuthConfig()
      .then(setConfig)
      .catch((err: unknown) => setError(err));
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }
    getUserMe(token)
      .then((profile) => {
        updateUser(profileToAuthUser(profile));
        if (!tradeUrlDirtyRef.current) {
          setTradeUrlInput(profile.tradeUrl ?? '');
        }
      })
      .catch((err: unknown) => setError(err));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateUser is stable enough for profile sync on save
  }, [token]);

  async function handleLinkSteam() {
    if (!token) {
      return;
    }
    setLinkLoading(true);
    setError(null);
    try {
      const response = await getSteamLinkUrl(token);
      window.location.href = response.url;
    } catch (err) {
      setError(err);
      setLinkLoading(false);
    }
  }

  async function handleChangeSteam() {
    if (!token) {
      return;
    }

    const confirmed = window.confirm(
      'Отвязать текущий Steam и привязать другой аккаунт?\n\n' +
        'Сначала откроется выход из Steam в браузере — войдите под нужным аккаунтом, ' +
        'затем завершите привязку на этой странице.',
    );
    if (!confirmed) {
      return;
    }

    setChangeSteamLoading(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const profile = await unlinkSteam(token);
      updateUser(profileToAuthUser(profile));
      await disconnectExtension();
      window.open(STEAM_LOGOUT_URL, '_blank', 'noopener,noreferrer');
      setSuccessMessage(
        'Steam отвязан. Выйдите из Steam в открывшейся вкладке, затем нажмите «Привязать Steam».',
      );
    } catch (err) {
      setError(err);
    } finally {
      setChangeSteamLoading(false);
    }
  }

  async function handleSaveTradeUrl() {
    if (!token) {
      return;
    }

    const trimmed = tradeUrlInput.trim();
    if (!trimmed) {
      setTradeUrlError('Укажите Trade URL из Steam.');
      return;
    }
    if (!isValidSteamTradeUrl(trimmed)) {
      setTradeUrlError(
        'Некорректная ссылка. Нужен URL вида https://steamcommunity.com/tradeoffer/new/?partner=…&token=…',
      );
      return;
    }

    setSaveLoading(true);
    setTradeUrlError(null);
    setSuccessMessage(null);
    setError(null);

    try {
      const profile = await updateTradeUrl(token, trimmed);
      updateUser(profileToAuthUser(profile));
      tradeUrlDirtyRef.current = false;
      setTradeUrlInput(profile.tradeUrl ?? trimmed);
      setSuccessMessage('Ссылка на обмен сохранена.');
    } catch (err) {
      setError(err);
    } finally {
      setSaveLoading(false);
    }
  }

  const steamLinked = hasLinkedSteamId(user?.steamId);
  const canLinkSteam = Boolean(config?.steamLoginAvailable) && Boolean(user) && !steamLinked;
  const canChangeSteam =
    Boolean(config?.steamLoginAvailable) && Boolean(user) && steamLinked;
  const showDevAuthHint = import.meta.env.DEV;

  return (
    <div className="page account-page">
      <PageHeader
        title="Аккаунт"
        subtitle="Профиль, Steam и настройки для сделок."
      />

      <div className="account-page-grid">
        <div className="account-page-main">
          <div className="card account-profile-card" data-testid="account-page">
            <h3 className="account-section-title">Профиль</h3>
            <dl className="account-profile-grid meta-list">
              <div>
                <dt>Имя</dt>
                <dd data-testid="account-username">{user?.username ?? '—'}</dd>
              </div>
              <div>
                <dt>Роль</dt>
                <dd data-testid="account-role">{formatUserRole(user?.role)}</dd>
              </div>
              <div>
                <dt>Статус</dt>
                <dd data-testid="account-status">{formatUserStatus(user?.status)}</dd>
              </div>
              <div>
                <dt>Steam ID</dt>
                <dd data-testid="account-steam-id">
                  {steamLinked ? user?.steamId : 'Не привязан'}
                </dd>
              </div>
              {steamLinked ? (
                <div>
                  <dt>Ник Steam</dt>
                  <dd data-testid="account-steam-persona">
                    {user?.steamPersonaName ?? 'Загрузка…'}
                  </dd>
                </div>
              ) : null}
            </dl>

            {showDevAuthHint && config ? (
              <p className="muted small account-dev-hint">
                Dev: {config.authProvider}
                {config.authProvider === 'steam' ? (
                  <>
                    {' '}
                    · <code>{API_BASE_URL}/auth/steam/callback</code>
                  </>
                ) : null}
              </p>
            ) : null}

            {canLinkSteam ? (
              <div className="account-steam-actions" data-testid="link-steam-panel">
                <p className="muted small">
                  Привяжите Steam для синхронизации инвентаря и сделок.
                </p>
                <button
                  type="button"
                  className="button primary"
                  disabled={linkLoading}
                  data-testid="link-steam-button"
                  onClick={() => void handleLinkSteam()}
                >
                  {linkLoading ? 'Перенаправление…' : 'Привязать Steam'}
                </button>
              </div>
            ) : null}

            {steamLinked ? (
              <div className="account-steam-actions" data-testid="steam-linked-panel">
                <p className="success-text" data-testid="steam-linked-message">
                  Steam привязан
                  {user?.steamPersonaName ? `: ${user.steamPersonaName}` : ''}
                </p>
                {canChangeSteam ? (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={changeSteamLoading || linkLoading}
                    data-testid="change-steam-button"
                    onClick={() => void handleChangeSteam()}
                  >
                    {changeSteamLoading ? 'Отвязка…' : 'Сменить Steam'}
                  </button>
                ) : null}
              </div>
            ) : null}

            {!canLinkSteam && !steamLinked && config?.authProvider === 'mock' ? (
              <p className="muted small" data-testid="steam-link-unavailable">
                Привязка Steam доступна при <code>AUTH_PROVIDER=steam</code>.
              </p>
            ) : null}
          </div>
        </div>

        <aside className="account-page-sidebar">
          <div data-testid="account-readiness">
            <ReadinessChecklist user={user} config={config} compactWhenReady />
          </div>

          <div className="card account-settings-card">
            <div className="account-trade-url-section">
              <h3 className="account-section-title">Trade URL</h3>
              <p className="muted small">
                Нужен для обменов в Steam.
              </p>

              <label className="field">
                <span className="field-label">Ссылка на обмен</span>
                <input
                  type="url"
                  value={tradeUrlInput}
                  onChange={(event) => {
                    tradeUrlDirtyRef.current = true;
                    setTradeUrlInput(event.target.value);
                    setTradeUrlError(null);
                    setSuccessMessage(null);
                  }}
                  placeholder="https://steamcommunity.com/tradeoffer/new/?partner=…&token=…"
                  data-testid="account-trade-url-input"
                />
              </label>

              {tradeUrlError ? (
                <p className="alert alert-error" role="alert">
                  {tradeUrlError}
                </p>
              ) : null}

              {successMessage ? (
                <p className="success-text" data-testid="account-trade-url-success">
                  {successMessage}
                </p>
              ) : null}

              <button
                type="button"
                className="button primary"
                disabled={saveLoading || !token}
                data-testid="account-trade-url-save"
                onClick={() => void handleSaveTradeUrl()}
              >
                {saveLoading ? 'Сохранение…' : 'Сохранить ссылку'}
              </button>

              <SteamTradeUrlButton />

              <details className="account-trade-url-help">
                <summary>Как получить ссылку</summary>
                <ol className="account-trade-url-steps">
                  <li>Нажмите «Открыть настройки Steam» выше.</li>
                  <li>Раздел «Кто может присылать мне предложения обмена?»</li>
                  <li>Скопируйте ссылку и вставьте в поле выше.</li>
                </ol>
              </details>
            </div>

            {token && config?.extension?.extensionChannelEnabled ? (
              <ExtensionConnectPanel token={token} compact />
            ) : null}
          </div>

          <ErrorAlert error={error} />
        </aside>
      </div>
    </div>
  );
}
