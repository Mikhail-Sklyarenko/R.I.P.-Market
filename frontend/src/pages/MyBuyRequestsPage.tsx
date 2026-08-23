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
import { getCatalogItemRef } from '../utils/item-slug';

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
          testId="buy-requests-empty"
          title={t('myBuyRequests.emptyTitle')}
          message={t('myBuyRequests.emptyMessage')}
          steps={[t('myBuyRequests.emptyStep1'), t('myBuyRequests.emptyStep2')]}
          action={
            <Link to="/catalog" className="button primary" data-testid="buy-requests-empty-catalog">
              {t('myBuyRequests.toCatalog')}
            </Link>
          }
        />
      ) : null}

      {!loading && requests.length > 0 ? (
        <div className="card buy-requests-list" data-testid="buy-requests-list">
          <div className="table-wrap mobile-card-table-wrap">
            <table className="data-table mobile-card-table">
              <thead>
                <tr>
                  <th>{t('myBuyRequests.colItem')}</th>
                  <th>{t('myBuyRequests.colMaxPrice')}</th>
                  <th>{t('myBuyRequests.colQuantity')}</th>
                  <th>{t('myBuyRequests.colReserved')}</th>
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
                      <td data-label={t('myBuyRequests.colItem')}>
                        <Link
                          to={`/catalog/items/${
                            request.itemDefinition
                              ? getCatalogItemRef(request.itemDefinition)
                              : request.itemDefinitionId
                          }`}
                          className="buy-request-item-link"
                        >
                          {itemName}
                        </Link>
                      </td>
                      <td data-label={t('myBuyRequests.colMaxPrice')}>
                        {request.maxPriceMinor ? (
                          <MoneyDisplay minor={request.maxPriceMinor} />
                        ) : (
                          <span className="muted">{t('myBuyRequests.noLimit')}</span>
                        )}
                      </td>
                      <td data-label={t('myBuyRequests.colQuantity')}>
                        {request.quantity > 1 || request.quantityFilled > 0
                          ? t('buyRequestPanel.quantityShort', {
                              filled: request.quantityFilled,
                              total: request.quantity,
                            })
                          : '1'}
                      </td>
                      <td data-label={t('myBuyRequests.colReserved')}>
                        {request.reservedAmountMinor ? (
                          <MoneyDisplay minor={request.reservedAmountMinor} />
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td data-label={t('myBuyRequests.colStatus')}>
                        <span data-testid={`buy-request-status-${request.id}`}>
                          {formatBuyRequestStatus(request.status, locale)}
                        </span>
                      </td>
                      <td data-label={t('myBuyRequests.colActions')}>
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
        </div>
      ) : null}
    </div>
  );
}
