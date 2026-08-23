import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  isFallbackInspectLink,
  isUsableInspectLink,
  resolveInspectLinkState,
} from './inspect-link.ts';

describe('isUsableInspectLink', () => {
  it('rejects unresolved CS2 propid placeholders', () => {
    assert.equal(
      isUsableInspectLink(
        'steam://run/730//+csgo_econ_action_preview%20%propid:6%',
      ),
      false,
    );
  });

  it('accepts resolved masked inspect links', () => {
    assert.equal(
      isUsableInspectLink(
        'steam://run/730//+csgo_econ_action_preview%20ADBD584A390016ACB5B48D3BA485AE9',
      ),
      true,
    );
  });

  it('accepts classic S/A/D inspect links', () => {
    assert.equal(
      isUsableInspectLink(
        'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S76561198000000000A50889527765D0',
      ),
      true,
    );
  });
});

describe('isFallbackInspectLink', () => {
  it('detects classic S/A/D0 payloads', () => {
    assert.equal(
      isFallbackInspectLink(
        'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S76561198000000000A50889527765D0',
      ),
      true,
    );
  });

  it('does not flag CS2 certificate payloads', () => {
    assert.equal(
      isFallbackInspectLink(
        'steam://run/730//+csgo_econ_action_preview%20ADBD584A390016ACB5B48D3BA485AE9',
      ),
      false,
    );
  });
});

describe('resolveInspectLinkState', () => {
  it('returns none for empty links', () => {
    assert.deepEqual(resolveInspectLinkState(null), { kind: 'none' });
  });

  it('returns unavailable for broken templates', () => {
    assert.deepEqual(
      resolveInspectLinkState(
        'steam://run/730//+csgo_econ_action_preview%20%propid:6%',
      ),
      { kind: 'unavailable', reason: 'broken' },
    );
  });

  it('returns limited for fallback links', () => {
    const href =
      'steam://rungame/730/76561202255233023/+csgo_econ_action_preview%20S76561198000000000A50889527765D0';
    assert.deepEqual(resolveInspectLinkState(href), { kind: 'limited', href });
  });

  it('returns reliable for certificate links', () => {
    const href =
      'steam://run/730//+csgo_econ_action_preview%20ADBD584A390016ACB5B48D3BA485AE9';
    assert.deepEqual(resolveInspectLinkState(href), { kind: 'reliable', href });
  });
});
