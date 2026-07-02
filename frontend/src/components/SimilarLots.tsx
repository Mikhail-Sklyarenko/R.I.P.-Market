import { Link } from 'react-router-dom';
import type { Lot } from '../api/types';
import { ItemPreview } from './ItemPreview';
import { LoadingState } from './LoadingState';
import { MoneyDisplay } from './MoneyDisplay';
import { formatFloatValue } from '../utils/item-image';

type SimilarLotsProps = {
  lots: Lot[];
  loading?: boolean;
  prominent?: boolean;
};

export function SimilarLots({ lots, loading = false, prominent = false }: SimilarLotsProps) {
  if (!loading && lots.length === 0) {
    return null;
  }

  return (
    <section
      className={`similar-lots${prominent ? ' similar-lots-prominent' : ''}`}
      data-testid="similar-lots"
    >
      <h3 className="similar-lots-title">Похожие предложения</h3>

      {loading ? <LoadingState message="Загрузка похожих лотов…" /> : null}

      {!loading ? (
        <div className="similar-lots-grid">
          {lots.map((lot) => {
            const floatText = formatFloatValue(lot.inventoryAsset.floatValue);

            return (
              <article
                key={lot.id}
                className="card similar-lot-card"
                data-testid={`similar-lot-${lot.id}`}
              >
                <ItemPreview
                  item={lot.inventoryAsset}
                  title={lot.inventoryAsset.itemDefinition.marketHashName}
                  size="sm"
                  showAttrs={false}
                />
                {floatText ? (
                  <p className="muted small similar-lot-float" data-testid="similar-lot-float">
                    Float: {floatText}
                  </p>
                ) : null}
                <p className="similar-lot-price">
                  <MoneyDisplay minor={lot.priceMinor} strong />
                </p>
                <Link className="button secondary sm" to={`/lots/${lot.id}`}>
                  Открыть
                </Link>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
