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

  useEffect(() => {
    const controller = new AbortController();
    fetch('/downloads/extension.json', { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Download unavailable');
        }
        return response.json();
      })
      .then((data: unknown) => {
        if (
          data &&
          typeof data === 'object' &&
          'version' in data &&
          typeof (data as { version: unknown }).version === 'string'
        ) {
          setVersion((data as { version: string }).version);
        }
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

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
          {version ? (
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
          ) : (
            <p role="status" className="muted">
              {t('ux.downloadUnavailable')}
            </p>
          )}
        </li>

        <li className="card">
          <h2>{t('ux.stepInstall')}</h2>
          <p className="muted">{t('ux.stepInstallBody')}</p>
          <code className="extension-install-code">chrome://extensions</code>
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
