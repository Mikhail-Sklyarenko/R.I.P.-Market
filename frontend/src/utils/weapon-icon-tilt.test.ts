import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getWeaponIconTiltClass, resolveWeaponIconTilt } from './weapon-icon-tilt.ts';

describe('weapon icon tilt', () => {
  it('tilts knife category icons', () => {
    assert.equal(resolveWeaponIconTilt({ icon: 'knife' }), 'knife');
    assert.equal(getWeaponIconTiltClass({ icon: 'knife' }), 'weapon-icon-tilt-knife');
  });

  it('keeps gloves upright', () => {
    assert.equal(resolveWeaponIconTilt({ icon: 'gloves' }), 'none');
    assert.equal(
      resolveWeaponIconTilt({ slug: 'sport-gloves', fallbackIcon: 'gloves' }),
      'none',
    );
  });

  it('tilts model icons by slug or fallback category', () => {
    assert.equal(resolveWeaponIconTilt({ slug: 'karambit' }), 'knife');
    assert.equal(resolveWeaponIconTilt({ slug: 'ak-47', fallbackIcon: 'rifle' }), 'rifle');
    assert.equal(getWeaponIconTiltClass({ slug: 'awp', fallbackIcon: 'sniper' }), 'weapon-icon-tilt-sniper');
  });
});
