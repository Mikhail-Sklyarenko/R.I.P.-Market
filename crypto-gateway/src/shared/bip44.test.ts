import { describe, expect, it } from 'vitest';
import {
  deriveTronAddressFromMnemonic,
  isValidTronAddress,
} from './bip44.js';
import { parseSun, sunToUsdMinor, usdMinorToSun } from './sun.js';
import {
  canTransitionPayment,
  nextPaymentStatus,
} from './payment-state.js';

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

describe('bip44', () => {
  it('derives deterministic tron addresses', () => {
    const a0 = deriveTronAddressFromMnemonic(TEST_MNEMONIC, 0);
    const a1 = deriveTronAddressFromMnemonic(TEST_MNEMONIC, 1);
    expect(a0).toBe(deriveTronAddressFromMnemonic(TEST_MNEMONIC, 0));
    expect(a0).not.toBe(a1);
    expect(isValidTronAddress(a0)).toBe(true);
  });
});

describe('sun conversion', () => {
  it('converts 1 USDT to 100 USD minor', () => {
    expect(sunToUsdMinor(1_000_000n)).toBe(100n);
    expect(usdMinorToSun(100n)).toBe(1_000_000n);
  });

  it('parses sun strings', () => {
    expect(parseSun('1000000')).toBe(1_000_000n);
  });
});

describe('payment state machine', () => {
  it('advances detected to held after confirmations', () => {
    expect(canTransitionPayment('detected', 'held')).toBe(true);
    expect(nextPaymentStatus('detected', 19, 19)).toBe('held');
    expect(nextPaymentStatus('detected', 5, 19)).toBeNull();
  });

  it('credits from held', () => {
    expect(nextPaymentStatus('held', 20, 19)).toBe('credited');
  });
});
