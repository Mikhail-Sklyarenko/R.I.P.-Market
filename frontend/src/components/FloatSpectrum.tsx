import {
  formatWearFloatDisplay,
  getWearPointerPercent,
  parseWearFloat,
} from '../utils/wear-bar';

type FloatSpectrumProps = {
  floatValue: number | string;
  /** Compact row for item params; track-only for embedding in WearBar. */
  variant?: 'inline' | 'track';
};

export function FloatSpectrum({
  floatValue,
  variant = 'inline',
}: FloatSpectrumProps) {
  const numeric = parseWearFloat(floatValue);
  if (numeric === null) {
    return null;
  }

  const pointerLeft = getWearPointerPercent(numeric);
  const valueText = formatWearFloatDisplay(numeric);

  return (
    <div
      className={`float-spectrum float-spectrum-${variant}`}
      data-testid="float-spectrum"
    >
      <div className="float-spectrum-track" aria-hidden="true">
        <div className="float-spectrum-gradient" />
        <span
          className="float-spectrum-marker"
          style={{ left: `${pointerLeft}%` }}
        />
      </div>
      {variant === 'inline' ? (
        <span className="float-spectrum-value" data-testid="float-spectrum-value">
          {valueText}
        </span>
      ) : null}
    </div>
  );
}
