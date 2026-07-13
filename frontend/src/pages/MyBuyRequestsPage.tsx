import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { cancelBuyRequest, listMyBuyRequests } from '../api/marketplace';
import type { BuyRequest } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { EmptyState } from '../components/EmptyState';
import { ErrorAlert } from '../components/ErrorAlert';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';

type MyBuyRequestsPageProps = {
  embedded?: boolean;
};

function formatBuyRequestStatus(status: BuyRequest['status']): string {
  switch (status) {
    case 'OPEN':
      return 'Активна';
    case 'FULFILLED':
      return 'Выполнена';
    case 'CANCELED':
      return 'Отменена';
    case 'EXPIRED':
      return 'Истекла';
    default:
      return status;
  }
}

export function MyBuyRequestsPage({ embedded = false }: MyBuyRequestsPageProps) {
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
      {loading ? <LoadingState message="Загрузка заявок…" /> : null}
      <ErrorAlert error={error} />
      <ErrorAlert error={actionError} />

      {!loading && requests.length === 0 ? (
        <EmptyState
          title="Заявок пока нет"
          message="Откройте предмет без предложений в каталоге и оставьте заявку на покупку."
          action={
            <Link to="/catalog" className="button secondary">
              Перейти в каталог
            </Link>
          }
        />
      ) : null}

      {!loading && requests.length > 0 ? (
        <div className="card buy-requests-list" data-testid="buy-requests-list">
          <table className="data-table">
            <thead>
              <tr>
                <th>Предмет</th>
                <th>Макс. цена</th>
                <th>Статус</th>
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
                        <span className="muted">Без лимита</span>
                      )}
                    </td>
                    <td>
                      <span data-testid={`buy-request-status-${request.id}`}>
                        {formatBuyRequestStatus(request.status)}
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
                          Отменить
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
