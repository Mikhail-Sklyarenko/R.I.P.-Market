import {
  formatWearFloatDisplay,
  formatWearPercent,
  getWearPointerPercent,
  parseWearFloat,
  WEAR_TIERS,
} from '../utils/wear-bar';

type WearBarProps = {
  floatValue: number | string;
};

export function WearBar({ floatValue }: WearBarProps) {
  const numeric = parseWearFloat(floatValue);
  if (numeric === null) {
    return null;
  }

  const pointerLeft = getWearPointerPercent(numeric);

  return (
    <div className="wear-bar" data-testid="wear-bar">
      <div className="wear-bar-tiers" aria-hidden="true">
        {WEAR_TIERS.map((tier) => (
          <span key={tier.key} className="wear-bar-tier">
            {tier.label}
          </span>
        ))}
      </div>

      <div className="wear-bar-track">
        <div className="wear-bar-gradient" />
        <span
          className="wear-bar-pointer"
          style={{ left: `${pointerLeft}%` }}
          aria-hidden="true"
        />
      </div>

      <p className="wear-bar-value" data-testid="wear-bar-value">
        {formatWearFloatDisplay(numeric)} ({formatWearPercent(numeric)})
      </p>
    </div>
  );
}
