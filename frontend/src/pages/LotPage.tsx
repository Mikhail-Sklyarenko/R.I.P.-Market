import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { getLot } from '../api/marketplace';
import { useAuth } from '../auth/AuthContext';
import { DealFlowInfo } from '../components/DealFlowInfo';
import { ErrorAlert } from '../components/ErrorAlert';
import { ItemPreview } from '../components/ItemPreview';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { PageHeader } from '../components/PageHeader';

export function LotPage() {
  const { id } = useParams();
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const [lot, setLot] = useState<Awaited<ReturnType<typeof getLot>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const isOwnLot = Boolean(lot && user && lot.sellerId === user.id);
  const isSellerRole = user?.role === 'SELLER';
  const isUnavailable = lot?.status !== 'ACTIVE';
  const canProceed =
    lot?.status === 'ACTIVE' && !isOwnLot && !isSellerRole;

  useEffect(() => {
    if (!id) {
      return;
    }
    setLoading(true);
    getLot(id)
      .then(setLot)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [id]);

  function handleProceedToCheckout() {
    if (!id) {
      return;
    }
    if (!token) {
      navigate(`/login?returnUrl=${encodeURIComponent(`/lots/${id}/checkout`)}`);
      return;
    }
    navigate(`/lots/${id}/checkout`);
  }

  if (!id) {
    return null;
  }

  return (
    <div className="page">
      <PageHeader
        title="Лот"
        subtitle={
          <Link to="/catalog" className="muted">
            Назад в каталог
          </Link>
        }
      />

      {loading ? <LoadingState message="Загрузка лота…" /> : null}

      {lot ? (
        <>
          <div className="card form-card">
            <ItemPreview
              item={lot.inventoryAsset}
              title={lot.inventoryAsset.itemDefinition.marketHashName}
              size="lg"
            />

            <div className="pricing-preview">
              <div>
                <span>Цена</span>
                <MoneyDisplay minor={lot.priceMinor} strong />
              </div>
              <div>
                <span>Комиссия</span>
                <MoneyDisplay minor={lot.commissionMinor} strong />
              </div>
              <div>
                <span>Продавец получит</span>
                <MoneyDisplay minor={lot.sellerReceiveMinor} strong />
              </div>
            </div>

            <ErrorAlert error={error} />

            {isUnavailable ? (
              <p className="muted" data-testid="lot-unavailable-message">
                Лот недоступен для покупки ({lot.status}).
              </p>
            ) : null}

            {isOwnLot ? (
              <p className="muted" data-testid="own-lot-message">
                Вы не можете купить свой лот.
              </p>
            ) : null}

            {isSellerRole ? (
              <p className="muted" data-testid="seller-cannot-buy-message">
                Войдите как покупатель, чтобы оформить покупку.
              </p>
            ) : (
              <button
                type="button"
                className="button primary"
                disabled={!canProceed}
                data-testid="buy-lot-button"
                onClick={handleProceedToCheckout}
              >
                {!token ? 'Войти для покупки' : 'Перейти к покупке'}
              </button>
            )}
          </div>

          <DealFlowInfo />
        </>
      ) : null}
    </div>
  );
}
