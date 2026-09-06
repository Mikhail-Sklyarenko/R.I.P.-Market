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

  it('keeps confirmPending only while Steam still needs_confirmation', () => {
    expect(
      extractTradeTaskConfirmPending(guardTask, {
        offerStatus: 'needs_confirmation',
      }),
    ).toBe(true);
  });

  it('clears sticky Guard after OFFER_SENT when poll is blind', () => {
    // Product: after send, unknown/null poll must not freeze UI on Guard
    // (Steam may already show Trade Accepted while API is lagging).
    expect(extractTradeTaskConfirmPending(guardTask, null)).toBe(false);
    expect(
      extractTradeTaskConfirmPending(guardTask, { offerStatus: 'unknown' }),
    ).toBe(false);
  });

  it('keeps Guard while task phase is still CONFIRM_PENDING and poll is blind', () => {
    expect(
      extractTradeTaskConfirmPending(
        {
          executionPhase: 'CONFIRM_PENDING',
          lastErrorCode: 'CONFIRM_PENDING',
          statusEvents: [{ phase: 'CONFIRM_PENDING', payload: {} }],
        },
        null,
      ),
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
