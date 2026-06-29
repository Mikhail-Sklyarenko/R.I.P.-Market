import { DEAL_FLOW_STEPS } from '../utils/order-flow';

type DealFlowInfoProps = {
  title?: string;
};

export function DealFlowInfo({ title = 'Как пройдёт сделка' }: DealFlowInfoProps) {
  return (
    <div className="card deal-flow-info" data-testid="deal-flow-info">
      <h3>{title}</h3>
      <ol className="deal-flow-list">
        {DEAL_FLOW_STEPS.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </div>
  );
}
