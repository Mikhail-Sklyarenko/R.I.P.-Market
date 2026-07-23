import { useLocale } from '../i18n';
import { getDealFlowSteps, type DealFlowStepItem } from '../utils/order-flow';

type DealFlowStepsProps = {
  title?: string;
  compact?: boolean;
  steps?: readonly DealFlowStepItem[];
};

export function DealFlowSteps({ title, compact = false, steps }: DealFlowStepsProps) {
  const { locale, t } = useLocale();
  const resolvedTitle = title ?? t('dealFlow.title');
  const resolvedSteps = steps ?? getDealFlowSteps(locale);
  const content = (
    <>
      {!compact ? <h3 className="deal-flow-steps-title">{resolvedTitle}</h3> : null}
      <ol className={`deal-flow-steps-list${compact ? ' deal-flow-steps-list-compact' : ''}`}>
        {resolvedSteps.map((step, index) => (
          <li
            key={step.key}
            className="deal-flow-step"
            data-testid={`deal-flow-step-${step.key}`}
          >
            <span className="deal-flow-step-marker" aria-hidden="true">
              {index + 1}
            </span>
            <div className="deal-flow-step-copy">
              <span className="deal-flow-step-title">{step.title}</span>
              <p className="muted small deal-flow-step-description">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );

  if (compact) {
    return (
      <details className="checkout-deal-flow" data-testid="deal-flow-steps">
        <summary className="checkout-deal-flow-summary">{resolvedTitle}</summary>
        <div className="checkout-deal-flow-body">{content}</div>
      </details>
    );
  }

  return (
    <div className="card deal-flow-steps" data-testid="deal-flow-steps">
      {content}
    </div>
  );
}
