import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAuthConfig,
  getSteamLinkUrl,
  getUserMe,
  unlinkSteam,
  updateTradeUrl,
} from '../api/marketplace';
import type { AuthConfig } from '../api/types';
import { ApiError } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { AccountTradingOnboarding } from '../components/AccountTradingOnboarding';
import { ErrorAlert } from '../components/ErrorAlert';
import { ExtensionConnectPanel } from '../components/ExtensionConnectPanel';
import { PageHeader } from '../components/PageHeader';
import { SteamTradeUrlButton } from '../components/SteamTradeUrlButton';
import { disconnectExtension } from '../utils/extension';
import { formatApiErrorMessage } from '../utils/format';
import { hasLinkedSteamId } from '../utils/steam-id';
import { hasTradeUrl, isValidSteamTradeUrl } from '../utils/trade-url';
import { profileToAuthUser } from '../utils/user-profile';

const STEAM_LOGOUT_URL = 'https://steamcommunity.com/login/logout/';

function SteamAvatar({
  url,
  name,
}: {
  url?: string | null;
  name: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || 'S';
  if (url) {
    return <img src={url} alt="" className="account-avatar-image" width={72} height={72} />;
  }
  return (
    <span className="account-avatar-fallback" aria-hidden="true">
      {initial}
    </span>
  );
}

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
      if (err instanceof ApiError && err.code === 'TRADE_URL_STEAM_MISMATCH') {
        setTradeUrlError(formatApiErrorMessage(err.code, locale));
        return;
      }
      setError(err);
    } finally {
      setSaveLoading(false);
    }
  }

  const steamLinked = hasLinkedSteamId(user?.steamId);
  const tradeUrlReady = hasTradeUrl(user?.tradeUrl);
  const canLinkSteam = Boolean(config?.steamLoginAvailable) && Boolean(user) && !steamLinked;
  const canChangeSteam =
    Boolean(config?.steamLoginAvailable) && Boolean(user) && steamLinked;
  const showDevAuthHint = import.meta.env.DEV;
  const displayName =
    user?.steamPersonaName?.trim() ||
    user?.username?.trim() ||
    t('account.guestName');
  const steamProfileUrl = steamLinked
    ? `https://steamcommunity.com/profiles/${user?.steamId}`
    : null;
  const isAdmin = user?.role === 'ADMIN';
  const tradeUrlStatusReady =
    tradeUrlReady && tradeUrlInput.trim() === (user?.tradeUrl ?? '').trim();

  return (
    <div className="page account-page" data-testid="account-page">
      <PageHeader title={t('account.title')} subtitle={t('account.subtitle')} />

      <AccountTradingOnboarding
        steamId={user?.steamId}
        tradeUrl={user?.tradeUrl}
        config={config}
      />

      <ErrorAlert error={error} />

      <section className="account-identity" aria-label={t('account.identityAria')}>
        <div className="account-identity-glow" aria-hidden="true" />
        <div className="account-avatar" data-testid="account-avatar">
          <SteamAvatar url={user?.steamAvatarUrl} name={displayName} />
        </div>
        <div className="account-identity-copy">
          <div className="account-identity-title-row">
            <h2 className="account-identity-name" data-testid="account-username">
              {displayName}
            </h2>
            {isAdmin ? (
              <Link to="/admin" className="account-admin-chip" data-testid="account-role">
                {t('account.adminChip')}
              </Link>
            ) : (
              <span className="sr-only" data-testid="account-role">
                {user?.role ?? ''}
              </span>
            )}
          </div>
          <p className="account-identity-status" data-testid="account-status">
            {steamLinked
              ? t('account.steamLinkedMessage')
              : t('account.steamNotLinked')}
          </p>
          <div className="account-readiness" aria-label={t('account.readinessAria')}>
            <span
              className={`account-readiness-chip${steamLinked ? ' is-ready' : ''}`}
              data-testid="account-readiness-steam"
            >
              {steamLinked ? t('account.readinessSteamOk') : t('account.readinessSteamNeed')}
            </span>
            <span
              className={`account-readiness-chip${tradeUrlReady ? ' is-ready' : ''}`}
              data-testid="account-readiness-trade-url"
            >
              {tradeUrlReady ? t('account.readinessTradeUrlOk') : t('account.readinessTradeUrlNeed')}
            </span>
          </div>
        </div>
      </section>

      <div className="account-page-grid">
        <section className="account-page-primary" aria-label={t('account.setupAria')}>
          <div className="card account-settings-card" id="account-trade-url-section">
            <div className="account-card-head">
              <div>
                <h3 className="account-section-title">{t('account.tradeUrlTitle')}</h3>
                <p className="muted small account-section-lead">{t('account.tradeUrlNeeded')}</p>
              </div>
              <span
                className={`account-status-pill${tradeUrlStatusReady ? ' is-ready' : ''}`}
                data-testid="account-trade-url-status"
              >
                {tradeUrlStatusReady ? t('account.tradeUrlStatusReady') : t('account.tradeUrlStatusNeed')}
              </span>
            </div>

            <div className="account-trade-url-section">
              <label className="field account-trade-url-field">
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
                  spellCheck={false}
                  autoComplete="off"
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
          </div>

          {token && config?.extension?.extensionChannelEnabled ? (
            <div
              id="account-extension-section"
              className="card account-extension-card"
            >
              <ExtensionConnectPanel token={token} compact />
            </div>
          ) : null}
        </section>

        <aside className="account-page-secondary" aria-label={t('account.steamSectionTitle')}>
          <div className="card account-profile-card">
            <div className="account-card-head">
              <div>
                <h3 className="account-section-title">{t('account.steamSectionTitle')}</h3>
                <p className="muted small account-section-lead">{t('account.steamCardLead')}</p>
              </div>
              <span
                className={`account-status-pill${steamLinked ? ' is-ready' : ''}`}
                data-testid="account-steam-status"
              >
                {steamLinked ? t('account.steamStatusLinked') : t('account.steamStatusNeed')}
              </span>
            </div>

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

                <dl className="account-steam-meta">
                  <div>
                    <dt>{t('account.steamNick')}</dt>
                    <dd data-testid="account-steam-persona">
                      {user?.steamPersonaName ?? t('account.steamPersonaLoading')}
                    </dd>
                  </div>
                  <div>
                    <dt>{t('account.steamId')}</dt>
                    <dd data-testid="account-steam-id">{user?.steamId}</dd>
                  </div>
                </dl>

                <div className="account-steam-footer">
                  {steamProfileUrl ? (
                    <a
                      href={steamProfileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="button secondary sm"
                      data-testid="account-steam-profile-link"
                    >
                      {t('account.openSteamProfile')}
                    </a>
                  ) : null}
                  {canChangeSteam ? (
                    <button
                      type="button"
                      className="button ghost sm"
                      disabled={changeSteamLoading || linkLoading}
                      data-testid="change-steam-button"
                      onClick={() => void handleChangeSteam()}
                    >
                      {changeSteamLoading
                        ? t('account.changeSteamLoading')
                        : t('account.changeSteamButton')}
                    </button>
                  ) : null}
                </div>
              </div>
            ) : null}

            {!canLinkSteam && !steamLinked && config?.authProvider === 'mock' ? (
              <p className="muted small" data-testid="steam-link-unavailable">
                {t('account.steamLinkUnavailable')}
              </p>
            ) : null}

            {!steamLinked ? (
              <span className="sr-only" data-testid="account-steam-id">
                {t('account.steamNotLinkedValue')}
              </span>
            ) : null}

            {showDevAuthHint && config ? (
              <p className="muted small account-dev-hint">
                {t('account.devHint', { provider: config.authProvider })}
              </p>
            ) : null}
          </div>

          <div className="account-quick-links card">
            <h3 className="account-section-title">{t('account.quickLinksTitle')}</h3>
            <p className="muted small account-section-lead">{t('account.quickLinksLead')}</p>
            <div className="account-quick-links-actions">
              <Link to="/catalog" className="button secondary sm">
                {t('account.quickCatalog')}
              </Link>
              <Link to="/sell/inventory" className="button secondary sm">
                {t('account.quickInventory')}
              </Link>
              <Link to="/wallet" className="button secondary sm">
                {t('account.quickWallet')}
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
