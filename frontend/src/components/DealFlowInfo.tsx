import { DealFlowSteps } from './DealFlowSteps';

type DealFlowInfoProps = {
  title?: string;
};

export function DealFlowInfo({ title = 'Как пройдёт сделка' }: DealFlowInfoProps) {
  return <DealFlowSteps title={title} />;
}
