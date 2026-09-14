import { useLocale } from '../i18n';
import { getOrderSteps } from '../utils/order-flow';

type OrderStepperProps = {
  status: string;
  hadSettlementHold?: boolean;
};

export function OrderStepper({ status, hadSettlementHold = false }: OrderStepperProps) {
  const { locale } = useLocale();
  const steps = getOrderSteps(status, locale, hadSettlementHold);

  return (
    <ol className="order-stepper" data-testid="order-stepper">
      {steps.map((step, index) => (
        <li
          key={step.key}
          className={`order-step order-step-${step.state}`}
          data-testid={`order-step-${step.key}`}
        >
          <span className="order-step-marker" aria-hidden="true">
            {step.state === 'done' ? '✓' : index + 1}
          </span>
          <span className="order-step-label">{step.label}</span>
        </li>
      ))}
    </ol>
  );
}
