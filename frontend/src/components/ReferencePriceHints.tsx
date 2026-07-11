import { MoneyDisplay } from './MoneyDisplay';

type ReferencePriceHintsProps = {
  buffPriceMinor?: number | null;
  csfloatPriceMinor?: number | null;
  testIdPrefix: string;
};

export function ReferencePriceHints({
  buffPriceMinor,
  csfloatPriceMinor,
  testIdPrefix,
}: ReferencePriceHintsProps) {
  if (!buffPriceMinor && !csfloatPriceMinor) {
    return null;
  }

  return (
    <div className="reference-price-hints" data-testid={`${testIdPrefix}-reference-prices`}>
      <p className="reference-price-hints-title muted small">
        Справочные цены (не цена сделки)
      </p>
      <div className="reference-price-hints-grid">
        {buffPriceMinor ? (
          <div className="reference-price-hint">
            <span className="reference-price-label">Buff</span>
            <span className="reference-price-value" data-testid={`${testIdPrefix}-buff-price`}>
              <MoneyDisplay minor={buffPriceMinor} />
            </span>
          </div>
        ) : null}
        {csfloatPriceMinor ? (
          <div className="reference-price-hint">
            <span className="reference-price-label">CSFloat</span>
            <span
              className="reference-price-value"
              data-testid={`${testIdPrefix}-csfloat-price`}
            >
              <MoneyDisplay minor={csfloatPriceMinor} />
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
