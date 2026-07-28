import { describe, expect, it } from 'vitest';
import { buildUnitFormPayload } from './unitFormHelpers';

const form = {
  code: ' A-01 ',
  name: '',
  category: '',
  floorId: '',
  zoneId: '',
  areaGFA: '120',
  areaNLA: '',
  baseRentPerSqm: '',
  camPerSqm: '',
  spaceType: '',
  leaseTermType: '',
  tier: '',
  minFlexArea: '',
  maxFlexArea: '',
  isFlexibleArea: false,
  status: 'BOOKING',
};

describe('buildUnitFormPayload', () => {
  it('creates a clean payload without allowing a supplied lifecycle status', () => {
    expect(buildUnitFormPayload(form, 'mall-1')).toEqual(expect.objectContaining({
      mallId: 'mall-1',
      code: 'A-01',
      areaGFA: 120,
      areaNLA: 0,
      baseRentPerSqm: 0,
      camPerSqm: 0,
    }));
    expect(buildUnitFormPayload(form, 'mall-1')).not.toHaveProperty('status');
  });

  it('does not move a unit to another mall and sends null when optional edit fields are cleared', () => {
    const payload = buildUnitFormPayload(form, 'wrong-mall', true);
    expect(payload).not.toHaveProperty('mallId');
    expect(payload).not.toHaveProperty('status');
    expect(payload.floorId).toBeNull();
    expect(payload.zoneId).toBeNull();
    expect(payload.category).toBeNull();
  });
});
