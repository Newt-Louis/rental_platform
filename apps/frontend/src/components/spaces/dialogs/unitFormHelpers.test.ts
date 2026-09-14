import { describe, expect, it } from 'vitest';
import {
  buildUnitFormPayload,
  getUnitMutationError,
  parseUnitNumber,
  validateUnitFormValues,
} from './unitFormHelpers';

const form = {
  code: ' A-01 ',
  name: '',
  categoryId: '',
  floorId: '',
  zoneId: '',
  areaGFA: '120',
  areaNLA: '',
  baseRentPerSqm: '',
  camPerSqm: '',
  spaceType: '',
  leaseTermType: 'LONG',
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
    expect(payload.categoryId).toBeNull();
  });

  it('returns a clear validation message before sending an invalid form', () => {
    expect(validateUnitFormValues({ ...form, leaseTermType: '' }, 'mall-1'))
      .toBe('Vui lòng chọn khu cho thuê dài hạn hoặc khu cho thuê ngắn hạn.');
    expect(validateUnitFormValues({ ...form, areaGFA: '0' }, 'mall-1'))
      .toBe('Diện tích GFA phải là số lớn hơn 0.');
    expect(validateUnitFormValues({ ...form, isFlexibleArea: true, minFlexArea: '100', maxFlexArea: '50' }, 'mall-1'))
      .toBe('Diện tích linh động tối thiểu không được lớn hơn diện tích tối đa.');
  });

  it('accepts common Vietnamese number and currency formats', () => {
    expect(parseUnitNumber('450.000')).toBe(450000);
    expect(parseUnitNumber('450,000')).toBe(450000);
    expect(parseUnitNumber('1.200,5')).toBe(1200.5);
    expect(buildUnitFormPayload({ ...form, baseRentPerSqm: '450.000', camPerSqm: '80,000' }, 'mall-1'))
      .toEqual(expect.objectContaining({ baseRentPerSqm: 450000, camPerSqm: 80000 }));
  });

  it('shows backend validation details and translates permission failures', () => {
    expect(getUnitMutationError({
      response: { status: 400, data: { message: 'Validation failed', errors: ['Vui lòng nhập mã mặt bằng'] } },
    }, 'create')).toBe('Vui lòng nhập mã mặt bằng');

    expect(getUnitMutationError({ response: { status: 403, data: {} } }, 'update'))
      .toContain('Bạn không có quyền cập nhật mặt bằng');

    expect(getUnitMutationError({
      response: { status: 500, data: { message: 'Raw database error', requestId: 'req-123' } },
    }, 'create')).toBe('Không thể tạo mặt bằng do lỗi hệ thống. Mã hỗ trợ: req-123.');
  });
});
