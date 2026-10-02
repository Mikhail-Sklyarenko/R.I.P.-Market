import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { ExtensionConnectPanel } from '../components/ExtensionConnectPanel';
import { PageHeader } from '../components/PageHeader';
import { SteamLoginButton } from '../components/SteamLoginButton';
import { safeAppReturnPath } from '../utils/steam-return-path';

export function ExtensionInstallPage() {
  const { t } = useLocale();
  const { token } = useAuth();
  const [params] = useSearchParams();
  const returnPath = safeAppReturnPath(params.get('returnUrl')) ?? '/account';
  const [version, setVersion] = useState<string | null>(null);
  const [downloadState, setDownloadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [downloadAttempt, setDownloadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    fetch('/downloads/extension.json', { signal: controller.signal, cache: 'no-cache' })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Download unavailable');
        }
        return response.json();
      })
      .then((data: unknown) => {
        if (!active) return;
        if (
          data &&
          typeof data === 'object' &&
          'version' in data &&
          typeof (data as { version: unknown }).version === 'string' &&
          (data as { version: string }).version.trim().length > 0
        ) {
          setVersion((data as { version: string }).version);
          setDownloadState('ready');
        } else {
          throw new Error('Invalid download metadata');
        }
      })
      .catch(() => { if (active) setDownloadState('error'); })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [downloadAttempt]);

  return (
    <div className="page extension-install-page">
      <PageHeader
        eyebrow="R.I.P. Market · Steam"
        title={t('ux.extensionTitle')}
        subtitle={t('ux.extensionLead')}
      />

      <div className="card extension-beta-notice" role="note">
        <strong>{t('ux.betaTitle')}</strong>
        <p className="muted">{t('ux.betaBody')}</p>
      </div>

      <ol className="extension-install-steps">
        <li className="card">
          <h2>{t('ux.stepDownload')}</h2>
          <p className="muted">{t('ux.stepDownloadBody')}</p>
          {downloadState === 'ready' && version ? (
            <div className="extension-install-download">
              <a
                className="button primary"
                href="/downloads/rip-market-extension.zip"
                download
              >
                {t('ux.download')}
              </a>
              <p className="muted small">
                {t('ux.downloadVersion')} {version}
              </p>
            </div>
          ) : downloadState === 'loading' ? (
            <p role="status" className="muted">
              {t('common.loading')}
            </p>
          ) : (
            <div>
              <p role="status" className="muted">{t('ux.downloadUnavailable')}</p>
              <button type="button" className="button secondary" onClick={() => {
                setDownloadState('loading');
                setDownloadAttempt((attempt) => attempt + 1);
              }}>{t('ux.downloadRetry')}</button>
              <Link className="button ghost" to="/support">{t('ux.downloadSupport')}</Link>
            </div>
          )}
        </li>

        <li className="card">
          <h2>{t('ux.stepInstall')}</h2>
          <p className="muted">{t('ux.stepInstallBody')}</p>
          <code className="extension-install-code">chrome://extensions</code>
          <code className="extension-install-code">edge://extensions</code>
        </li>

        <li className="card">
          <h2>{t('ux.stepConnect')}</h2>
          <p className="muted">{t('ux.stepConnectBody')}</p>
          {token ? (
            <ExtensionConnectPanel token={token} compact />
          ) : (
            <SteamLoginButton label={t('ux.loginConnect')} />
          )}
        </li>
      </ol>

      <details className="card extension-install-details">
        <summary>{t('ux.permissionsTitle')}</summary>
        <p className="muted">{t('ux.permissionsBody')}</p>
      </details>

      <div className="extension-install-footer">
        <Link className="button secondary" to={returnPath}>
          {t('ux.resumeTrade')}
        </Link>
      </div>
    </div>
  );
}
