import { DealFlowSteps } from './DealFlowSteps';

type DealFlowInfoProps = {
  title?: string;
};

export function DealFlowInfo({ title }: DealFlowInfoProps) {
  return <DealFlowSteps title={title} />;
}
