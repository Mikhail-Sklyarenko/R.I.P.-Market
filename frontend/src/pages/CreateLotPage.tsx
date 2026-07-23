import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  checkInventoryAsset,
  createLot,
  getPricingPreview,
} from '../api/sell';
import type { InventoryAsset, PricingPreview } from '../api/types';
import { useAuth } from '../auth/AuthContext';
import { useLocale } from '../i18n';
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
  const { t } = useLocale();
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
      navigate('/deals?tab=listings');
    } catch (err) {
      setError(err);
    } finally {
      setSubmitting(false);
    }
  }

  if (!assetId) {
    return (
      <div className="page">
        <EmptyStateMissingAsset t={t} />
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        title={t('createLot.title')}
        subtitle={t('createLot.subtitle')}
        actions={
          <Link to="/sell/inventory" className="button secondary">
            {t('createLot.back')}
          </Link>
        }
      />

      {loading ? <LoadingState message={t('createLot.loading')} /> : null}

      {asset ? (
        <form className="card form-card" onSubmit={(event) => void handleSubmit(event)}>
          <ItemPreview
            item={asset}
            title={asset.itemDefinition.marketHashName}
            size="md"
          />

          {!listable ? (
            <p className="field-error" data-testid="asset-not-listable">
              {t('createLot.notListable')}
            </p>
          ) : null}

          <p className="muted small" data-testid="price-hint">
            {t('createLot.priceHint')}
          </p>

          <FormField label={t('createLot.priceLabel')} htmlFor="price-input">
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
                <span>{t('createLot.listPrice')}</span>
                <MoneyDisplay minor={preview.priceMinor} strong />
              </div>
              <div>
                <span>{t('createLot.commission')}</span>
                <MoneyDisplay minor={preview.commissionMinor} strong />
              </div>
              <div>
                <span>{t('createLot.youReceive')}</span>
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
            {submitting ? t('createLot.publishing') : t('createLot.publish')}
          </button>
        </form>
      ) : null}

      <SellerSaleInfo />
    </div>
  );
}

function EmptyStateMissingAsset({ t }: { t: (key: string) => string }) {
  return (
    <div className="card empty-state">
      <h3 className="empty-state-title">{t('createLot.emptyTitle')}</h3>
      <p className="empty-state-message">{t('createLot.emptyMessage')}</p>
      <Link to="/sell/inventory" className="button primary">
        {t('createLot.toInventory')}
      </Link>
    </div>
  );
}
