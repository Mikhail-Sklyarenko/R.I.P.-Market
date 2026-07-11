import type { KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Lot } from '../api/types';
import { ItemPreview } from './ItemPreview';
import { LoadingState } from './LoadingState';
import { MoneyDisplay } from './MoneyDisplay';
import { formatFloatValue, formatPaintSeed } from '../utils/item-image';
import { resolveLotDisplayItem } from '../utils/lot-display';

type SimilarLotsProps = {
  lots: Lot[];
  loading?: boolean;
  prominent?: boolean;
};

export function SimilarLots({ lots, loading = false, prominent = false }: SimilarLotsProps) {
  const navigate = useNavigate();

  if (!loading && lots.length === 0) {
    return null;
  }

  function openLot(lotId: string) {
    navigate(`/lots/${lotId}`);
  }

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>, lotId: string) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openLot(lotId);
    }
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
            const displayItem = resolveLotDisplayItem(lot);
            const floatText = formatFloatValue(displayItem.floatValue);
            const patternText = formatPaintSeed(displayItem.paintSeed);

            return (
              <article
                key={lot.id}
                className="card similar-lot-card similar-lot-card-clickable"
                data-testid={`similar-lot-${lot.id}`}
                onClick={() => openLot(lot.id)}
                onKeyDown={(event) => handleCardKeyDown(event, lot.id)}
                role="link"
                tabIndex={0}
                aria-label={`Открыть лот ${displayItem.itemDefinition.marketHashName}`}
              >
                <ItemPreview
                  item={displayItem}
                  title={displayItem.itemDefinition.marketHashName}
                  size="sm"
                  showAttrs={false}
                />
                {floatText ? (
                  <p className="muted small similar-lot-float" data-testid="similar-lot-float">
                    Float: {floatText}
                  </p>
                ) : null}
                {patternText ? (
                  <p className="muted small similar-lot-pattern">Паттерн: {patternText}</p>
                ) : null}
                <p className="similar-lot-price">
                  <MoneyDisplay minor={lot.priceMinor} strong />
                </p>
                <span className="similar-lot-open-hint">Открыть лот →</span>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
