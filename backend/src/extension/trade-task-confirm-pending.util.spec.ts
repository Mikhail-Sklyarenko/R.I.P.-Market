import {
  extractTradeTaskConfirmPending,
  extractTradeTaskConfirmPendingSince,
  historicallyNeededSteamGuard,
} from './trade-task-confirm-pending.util';

describe('trade-task-confirm-pending.util', () => {
  const guardTask = {
    executionPhase: 'OFFER_SENT' as string | null,
    lastErrorCode: null as string | null,
    statusEvents: [
      {
        phase: 'OFFER_SENT',
        payload: { confirmPending: true, offerId: '123' },
        createdAt: new Date('2026-08-26T12:00:30.000Z'),
      },
      {
        phase: 'CONFIRM_PENDING',
        payload: {},
        createdAt: new Date('2026-08-26T12:00:00.000Z'),
      },
    ],
  };

  it('detects historical Guard need from CONFIRM_PENDING phase', () => {
    expect(
      historicallyNeededSteamGuard({
        executionPhase: 'CONFIRM_PENDING',
        lastErrorCode: null,
        statusEvents: [],
      }),
    ).toBe(true);
  });

  it('keeps confirmPending true until Steam leaves needs_confirmation', () => {
    expect(extractTradeTaskConfirmPending(guardTask, null)).toBe(true);
    expect(
      extractTradeTaskConfirmPending(guardTask, {
        offerStatus: 'needs_confirmation',
      }),
    ).toBe(true);
  });

  it('clears confirmPending when Steam reports Active (pending)', () => {
    expect(
      extractTradeTaskConfirmPending(guardTask, { offerStatus: 'pending' }),
    ).toBe(false);
  });

  it('clears confirmPending on terminal offer states', () => {
    expect(
      extractTradeTaskConfirmPending(guardTask, { offerStatus: 'accepted' }),
    ).toBe(false);
    expect(
      extractTradeTaskConfirmPending(guardTask, { offerStatus: 'declined' }),
    ).toBe(false);
  });

  it('returns false when Guard was never needed', () => {
    expect(
      extractTradeTaskConfirmPending(
        {
          executionPhase: 'OFFER_SENT',
          lastErrorCode: null,
          statusEvents: [
            { phase: 'OFFER_SENT', payload: { confirmPending: false } },
          ],
        },
        null,
      ),
    ).toBe(false);
  });

  it('picks earliest Guard timestamp for the wait timer', () => {
    expect(extractTradeTaskConfirmPendingSince(guardTask.statusEvents)).toBe(
      '2026-08-26T12:00:00.000Z',
    );
  });
});
