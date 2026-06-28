import { apiRequest } from './client';
import type { SettlementEligibility } from './types';

export function getSettlementEligibility(token: string) {
  return apiRequest<SettlementEligibility>('/settlement/my-eligibility', { token });
}
