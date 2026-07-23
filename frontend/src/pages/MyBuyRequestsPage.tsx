import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelBuyRequest, listMyBuyRequests } from '../api/marketplace';
import type { BuyRequest } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
import { EmptyState } from '../components/EmptyState';
import { ErrorAlert } from '../components/ErrorAlert';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { translate } from '../i18n/translate.ts';
import { enMessages } from '../i18n/messages/en.ts';
import { ruMessages } from '../i18n/messages/ru.ts';
import type { Locale } from '../i18n/types.ts';

type MyBuyRequestsPageProps = {
  embedded?: boolean;
};

const messagesByLocale = {
  ru: ruMessages,
  en: enMessages,
} as const;

function formatBuyRequestStatus(status: BuyRequest['status'], locale: Locale): string {
  const key = `buyRequestStatus.${status}`;
  const label = translate(messagesByLocale[locale], key);
  return label === key ? status : label;
}

export function MyBuyRequestsPage({ embedded = false }: MyBuyRequestsPageProps) {
  const { t, locale } = useLocale();
  const { token } = useAuth();
  const [requests, setRequests] = useState<BuyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<unknown>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      return;
    }
    setLoading(true);
    setError(null);
    listMyBuyRequests(token)
      .then(setRequests)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleCancel(requestId: string) {
    if (!token) {
      return;
    }
    setCancelingId(requestId);
    setActionError(null);
    try {
      const updated = await cancelBuyRequest(token, requestId);
      setRequests((current) =>
        current.map((entry) => (entry.id === requestId ? updated : entry)),
      );
    } catch (err: unknown) {
      setActionError(err);
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <div className={embedded ? 'buy-requests-embedded' : 'page'} data-testid="buy-requests-page">
      {loading ? <LoadingState message={t('myBuyRequests.loading')} /> : null}
      <ErrorAlert error={error} />
      <ErrorAlert error={actionError} />

      {!loading && requests.length === 0 ? (
        <EmptyState
          title={t('myBuyRequests.emptyTitle')}
          message={t('myBuyRequests.emptyMessage')}
          action={
            <Link to="/catalog" className="button secondary">
              {t('myBuyRequests.toCatalog')}
            </Link>
          }
        />
      ) : null}

      {!loading && requests.length > 0 ? (
        <div className="card buy-requests-list" data-testid="buy-requests-list">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('myBuyRequests.colItem')}</th>
                <th>{t('myBuyRequests.colMaxPrice')}</th>
                <th>{t('myBuyRequests.colStatus')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => {
                const itemName =
                  request.itemDefinition?.marketHashName ?? request.itemDefinitionId;
                return (
                  <tr key={request.id} data-testid={`buy-request-row-${request.id}`}>
                    <td>
                      <Link
                        to={`/catalog/items/${request.itemDefinitionId}`}
                        className="buy-request-item-link"
                      >
                        {itemName}
                      </Link>
                    </td>
                    <td>
                      {request.maxPriceMinor ? (
                        <MoneyDisplay minor={request.maxPriceMinor} />
                      ) : (
                        <span className="muted">{t('myBuyRequests.noLimit')}</span>
                      )}
                    </td>
                    <td>
                      <span data-testid={`buy-request-status-${request.id}`}>
                        {formatBuyRequestStatus(request.status, locale)}
                      </span>
                    </td>
                    <td>
                      {request.status === 'OPEN' ? (
                        <button
                          type="button"
                          className="button secondary"
                          disabled={cancelingId === request.id}
                          data-testid={`buy-request-cancel-${request.id}`}
                          onClick={() => handleCancel(request.id)}
                        >
                          {t('myBuyRequests.cancel')}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
