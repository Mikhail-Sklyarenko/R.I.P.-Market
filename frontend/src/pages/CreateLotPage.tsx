import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  checkInventoryAsset,
  createLot,
  getPricingPreview,
} from '../api/sell';
import type { InventoryAsset, PricingPreview } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { ErrorAlert } from '../components/ErrorAlert';
import { FormField } from '../components/FormField';
import { ItemPreview } from '../components/ItemPreview';
import { LoadingState } from '../components/LoadingState';
import { MoneyDisplay } from '../components/MoneyDisplay';
import { PageHeader } from '../components/PageHeader';
import { SellerSaleInfo } from '../components/SellerSaleInfo';
import { parseUsdToMinor } from '../utils/format';
import { canListAsset } from '../utils/seller-flow';

export function CreateLotPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const assetId = searchParams.get('assetId');

  const [asset, setAsset] = useState<InventoryAsset | null>(null);
  const [priceInput, setPriceInput] = useState('10.00');
  const [preview, setPreview] = useState<PricingPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const priceMinor = useMemo(() => parseUsdToMinor(priceInput), [priceInput]);
  const listable = useMemo(() => (asset ? canListAsset(asset) : false), [asset]);

  useEffect(() => {
    if (!token || !assetId) {
      return;
    }
    setLoading(true);
    checkInventoryAsset(token, assetId)
      .then(setAsset)
      .catch((err: unknown) => setError(err))
      .finally(() => setLoading(false));
  }, [token, assetId]);

  useEffect(() => {
    if (!priceMinor) {
      setPreview(null);
      setFieldError('Enter a valid price greater than zero.');
      return;
    }
    setFieldError(null);
    getPricingPreview(priceMinor)
      .then(setPreview)
      .catch((err: unknown) => setError(err));
  }, [priceMinor]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token || !assetId || !priceMinor) {
      setFieldError('Enter a valid price greater than zero.');
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const freshAsset = await checkInventoryAsset(token, assetId);
      setAsset(freshAsset);
      if (!canListAsset(freshAsset)) {
        setError(new Error('This item cannot be listed right now'));
        return;
      }
      await createLot(token, assetId, priceMinor);
      navigate('/sell/my-lots');
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!assetId) {
    return (
      <div className="page">
        <EmptyStateMissingAsset />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title="Установка цены"
        subtitle="Укажите цену и проверьте комиссию перед публикацией."
        actions={
          <Link to="/sell/inventory" className="button secondary">
            Назад
          </Link>
        }
      />

      {loading ? <LoadingState message="Загрузка предмета…" /> : null}

      {asset ? (
        <form className="card form-card" onSubmit={(event) => void handleSubmit(event)}>
          <ItemPreview
            item={asset}
            title={asset.itemDefinition.marketHashName}
            size="md"
          />

          {!listable ? (
            <p className="field-error" data-testid="asset-not-listable">
              This item cannot be listed right now (not tradable or trade-locked).
            </p>
          ) : null}

          <p className="muted small" data-testid="price-hint">
            Подсказка: в staging популярный тестовый диапазон — $500–$2,000. Комиссия
            маркетплейса фиксирована: 5%.
          </p>

          <FormField label="Price (USD)" htmlFor="price-input">
            <input
              id="price-input"
              type="text"
              inputMode="decimal"
              value={priceInput}
              onChange={(event) => setPriceInput(event.target.value)}
              data-testid="price-input"
            />
          </FormField>

          {fieldError ? <p className="field-error">{fieldError}</p> : null}

          {preview ? (
            <div className="pricing-preview" data-testid="pricing-preview">
              <div>
                <span>List price</span>
                <MoneyDisplay minor={preview.priceMinor} strong />
              </div>
              <div>
                <span>Commission (5%)</span>
                <MoneyDisplay minor={preview.commissionMinor} strong />
              </div>
              <div>
                <span>You receive</span>
                <MoneyDisplay minor={preview.sellerReceiveMinor} strong />
              </div>
            </div>
          ) : null}

          <ErrorAlert error={error} />

          <button
            type="submit"
            className="button primary"
            disabled={submitting || !priceMinor || !!fieldError || !listable}
            data-testid="submit-listing"
          >
            {submitting ? 'Publishing…' : 'Publish listing'}
          </button>
        </form>
      ) : null}

      <SellerSaleInfo />
    </div>
  );
}

function EmptyStateMissingAsset() {
  return (
    <div className="card empty-state">
      <h3 className="empty-state-title">Предмет не выбран</h3>
      <p className="empty-state-message">
        Вернитесь в инвентарь и выберите предмет для продажи.
      </p>
      <Link to="/sell/inventory" className="button primary">
        К инвентарю
      </Link>
    </div>
  );
}
