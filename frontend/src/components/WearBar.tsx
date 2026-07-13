import {
  formatWearFloatDisplay,
  formatWearPercent,
  parseWearFloat,
  WEAR_TIERS,
} from '../utils/wear-bar';
import { FloatSpectrum } from './FloatSpectrum';

type WearBarProps = {
  floatValue: number | string;
};

/** Full wear readout with tier labels — sell/checkout contexts. */
export function WearBar({ floatValue }: WearBarProps) {
  const numeric = parseWearFloat(floatValue);
  if (numeric === null) {
    return null;
  }

  return (
    <div className="wear-bar" data-testid="wear-bar">
      <div className="wear-bar-tiers" aria-hidden="true">
        {WEAR_TIERS.map((tier) => (
          <span key={tier.key} className="wear-bar-tier">
            {tier.label}
          </span>
        ))}
      </div>

      <div className="wear-bar-spectrum-wrap">
        <FloatSpectrum floatValue={numeric} variant="track" />
      </div>

      <p className="wear-bar-value" data-testid="wear-bar-value">
        {formatWearFloatDisplay(numeric)} ({formatWearPercent(numeric)})
      </p>
    </div>
  );
}
