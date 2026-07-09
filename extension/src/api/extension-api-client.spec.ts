import { describe, expect, it } from 'vitest';
import { jsonSafePayload } from './extension-api-client.js';

describe('jsonSafePayload', () => {
  it('removes undefined fields before signing', () => {
    expect(
      jsonSafePayload({
        taskId: 't1',
        phase: 'ACKED',
        reasonCode: undefined,
        offerId: undefined,
      }),
    ).toEqual({
      taskId: 't1',
      phase: 'ACKED',
    });
  });
});
