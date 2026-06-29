import { getOrderSteps } from '../utils/order-flow';

type OrderStepperProps = {
  status: string;
};

export function OrderStepper({ status }: OrderStepperProps) {
  const steps = getOrderSteps(status);

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
