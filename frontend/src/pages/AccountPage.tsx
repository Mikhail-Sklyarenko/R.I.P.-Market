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
import { useLocale } from '../i18n';
import { ErrorAlert } from '../components/ErrorAlert';
import { ExtensionConnectPanel } from '../components/ExtensionConnectPanel';
import { AccountTradingOnboarding } from '../components/AccountTradingOnboarding';
import { PageHeader } from '../components/PageHeader';
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
  const { locale, t } = useLocale();
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

    const confirmed = window.confirm(t('account.changeSteamConfirm'));
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
      setSuccessMessage(t('account.changeSteamSuccess'));
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
      setTradeUrlError(t('account.tradeUrlRequired'));
      return;
    }
    if (!isValidSteamTradeUrl(trimmed)) {
      setTradeUrlError(t('account.tradeUrlInvalid'));
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
      setSuccessMessage(t('account.tradeUrlSaved'));
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
    <div className="page account-page" data-testid="account-page">
      <PageHeader title={t('account.title')} subtitle={t('account.subtitle')} />

      <AccountTradingOnboarding
        steamId={user?.steamId}
        tradeUrl={user?.tradeUrl}
        config={config}
      />

      <ErrorAlert error={error} />

      <div className="account-page-grid">
        <section className="account-page-primary" aria-label={t('account.tradeUrlTitle')}>
          <div className="card account-settings-card">
            <div className="account-trade-url-section" id="account-trade-url-section">
              <h3 className="account-section-title">{t('account.tradeUrlTitle')}</h3>
              <p className="muted small">{t('account.tradeUrlNeeded')}</p>

              <label className="field">
                <span className="field-label">{t('account.tradeUrlLabel')}</span>
                <input
                  type="url"
                  value={tradeUrlInput}
                  onChange={(event) => {
                    tradeUrlDirtyRef.current = true;
                    setTradeUrlInput(event.target.value);
                    setTradeUrlError(null);
                    setSuccessMessage(null);
                  }}
                  placeholder={t('account.tradeUrlPlaceholder')}
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

              <div className="account-trade-url-actions">
                <button
                  type="button"
                  className="button primary"
                  disabled={saveLoading || !token}
                  data-testid="account-trade-url-save"
                  onClick={() => void handleSaveTradeUrl()}
                >
                  {saveLoading ? t('account.savingTradeUrl') : t('account.saveTradeUrl')}
                </button>
                <SteamTradeUrlButton label={t('account.getTradeUrl')} />
              </div>
            </div>

            {token && config?.extension?.extensionChannelEnabled ? (
              <div id="account-extension-section" className="account-extension-section">
                <ExtensionConnectPanel token={token} compact />
              </div>
            ) : null}
          </div>
        </section>

        <aside className="account-page-secondary" aria-label={t('account.steamSectionTitle')}>
          <div className="card account-profile-card">
            <h3 className="account-section-title">{t('account.steamSectionTitle')}</h3>

            {canLinkSteam ? (
              <div
                className="account-steam-actions"
                data-testid="link-steam-panel"
                id="account-steam-section"
              >
                <p className="muted small">{t('account.linkSteamHint')}</p>
                <button
                  type="button"
                  className="button primary"
                  disabled={linkLoading}
                  data-testid="link-steam-button"
                  onClick={() => void handleLinkSteam()}
                >
                  {linkLoading ? t('account.linkSteamRedirecting') : t('account.linkSteamButton')}
                </button>
              </div>
            ) : null}

            {steamLinked ? (
              <div
                className="account-steam-actions"
                data-testid="steam-linked-panel"
                id="account-steam-section"
              >
                <p className="success-text" data-testid="steam-linked-message">
                  {user?.steamPersonaName
                    ? t('account.steamLinkedWithName', { name: user.steamPersonaName })
                    : t('account.steamLinkedMessage')}
                </p>
                {canChangeSteam ? (
                  <button
                    type="button"
                    className="button secondary"
                    disabled={changeSteamLoading || linkLoading}
                    data-testid="change-steam-button"
                    onClick={() => void handleChangeSteam()}
                  >
                    {changeSteamLoading ? t('account.changeSteamLoading') : t('account.changeSteamButton')}
                  </button>
                ) : null}
              </div>
            ) : null}

            {!canLinkSteam && !steamLinked && config?.authProvider === 'mock' ? (
              <p className="muted small" data-testid="steam-link-unavailable">
                {t('account.steamLinkUnavailable')}
              </p>
            ) : null}

            <dl className="account-profile-grid meta-list">
              <div>
                <dt>{t('account.name')}</dt>
                <dd data-testid="account-username">{user?.username ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('account.role')}</dt>
                <dd data-testid="account-role">{formatUserRole(user?.role, locale)}</dd>
              </div>
              <div>
                <dt>{t('account.status')}</dt>
                <dd data-testid="account-status">{formatUserStatus(user?.status, locale)}</dd>
              </div>
              <div>
                <dt>{t('account.steamId')}</dt>
                <dd data-testid="account-steam-id">
                  {steamLinked ? user?.steamId : t('account.steamNotLinkedValue')}
                </dd>
              </div>
              {steamLinked ? (
                <div>
                  <dt>{t('account.steamNick')}</dt>
                  <dd data-testid="account-steam-persona">
                    {user?.steamPersonaName ?? t('account.steamPersonaLoading')}
                  </dd>
                </div>
              ) : null}
            </dl>

            {showDevAuthHint && config ? (
              <p className="muted small account-dev-hint">
                {t('account.devHint', { provider: config.authProvider })}
                {config.authProvider === 'steam' ? (
                  <>
                    {' '}
                    · <code>{API_BASE_URL}/auth/steam/callback</code>
                  </>
                ) : null}
              </p>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
