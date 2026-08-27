export interface UnitFormValues {
  code: string;
  name: string;
  category: string;
  floorId: string;
  zoneId: string;
  areaGFA: string;
  areaNLA: string;
  baseRentPerSqm: string;
  camPerSqm: string;
  spaceType: string;
  leaseTermType: string;
  tier: string;
  isFlexibleArea: boolean;
  minFlexArea: string;
  maxFlexArea: string;
}

export const UNIT_FORM_DEFAULT_VALUES: UnitFormValues = {
  code: '', name: '', category: '', floorId: '', zoneId: '',
  areaGFA: '', areaNLA: '', baseRentPerSqm: '', camPerSqm: '',
  spaceType: '', leaseTermType: 'LONG', tier: '', isFlexibleArea: false,
  minFlexArea: '', maxFlexArea: '',
};

export function seedUnitFormValues(unit: any, defaultFloorId?: string): UnitFormValues {
  return {
    code: unit?.code ?? '',
    name: unit?.name ?? '',
    category: unit?.category ?? '',
    floorId: unit?.floorId ?? defaultFloorId ?? '',
    zoneId: unit?.zoneId ?? '',
    areaGFA: unit?.areaGFA?.toString() ?? '',
    areaNLA: unit?.areaNLA?.toString() ?? '',
    baseRentPerSqm: unit?.baseRentPerSqm?.toString() ?? '',
    camPerSqm: unit?.camPerSqm?.toString() ?? '',
    spaceType: unit?.spaceType ?? '',
    leaseTermType: unit?.leaseTermType ?? 'LONG',
    tier: unit?.tier ?? '',
    isFlexibleArea: unit?.isFlexibleArea ?? false,
    minFlexArea: unit?.minFlexArea?.toString() ?? '',
    maxFlexArea: unit?.maxFlexArea?.toString() ?? '',
  };
}

export function parseUnitNumber(value: unknown): number | null {
  if (value === '' || value == null) return null;
  if (typeof value === 'number') return value;

  let normalized = String(value).trim().replace(/\s+/g, '').replace(/₫|vnd/gi, '');
  if (!normalized) return null;

  // Accept common Vietnamese thousands formats: 450.000 or 450,000.
  if (/^[+-]?\d{1,3}([.,]\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/[.,]/g, '');
  } else if (normalized.includes('.') && normalized.includes(',')) {
    // For values such as 1.200,5 or 1,200.5, the last separator is decimal.
    const decimalSeparator = normalized.lastIndexOf(',') > normalized.lastIndexOf('.') ? ',' : '.';
    const thousandsSeparator = decimalSeparator === ',' ? '.' : ',';
    normalized = normalized.replace(new RegExp(`\\${thousandsSeparator}`, 'g'), '');
    if (decimalSeparator === ',') normalized = normalized.replace(',', '.');
  } else {
    normalized = normalized.replace(',', '.');
  }

  return Number(normalized);
}

export function buildUnitFormPayload(data: Record<string, any>, mallId: string, isEdit = false) {
  const optional = (value: unknown) => {
    const normalized = typeof value === 'string' ? value.trim() : value;
    return normalized ? normalized : (isEdit ? null : undefined);
  };
  const optionalNumber = (value: unknown) => parseUnitNumber(value) ?? (isEdit ? null : undefined);
  return {
    ...(!isEdit ? { mallId } : {}),
    code: data.code.trim(),
    areaGFA: parseUnitNumber(data.areaGFA) ?? 0,
    areaNLA: parseUnitNumber(data.areaNLA) ?? 0,
    baseRentPerSqm: parseUnitNumber(data.baseRentPerSqm) ?? 0,
    camPerSqm: parseUnitNumber(data.camPerSqm) ?? 0,
    floorId: optional(data.floorId),
    zoneId: optional(data.zoneId),
    name: optional(data.name),
    category: optional(data.category),
    spaceType: optional(data.spaceType),
    leaseTermType: optional(data.leaseTermType),
    tier: optional(data.tier),
    minFlexArea: optionalNumber(data.minFlexArea),
    maxFlexArea: optionalNumber(data.maxFlexArea),
    isFlexibleArea: !!data.isFlexibleArea,
  };
}

export function validateUnitFormValues(data: Record<string, any>, mallId: string): string | null {
  if (!mallId) return 'Vui lòng chọn trung tâm thương mại trước khi lưu mặt bằng.';
  if (!String(data.code ?? '').trim()) return 'Vui lòng nhập mã mặt bằng.';
  if (!['LONG', 'SHORT'].includes(data.leaseTermType)) {
    return 'Vui lòng chọn khu cho thuê dài hạn hoặc khu cho thuê ngắn hạn.';
  }

  const requiredArea = parseUnitNumber(data.areaGFA);
  if (requiredArea == null || !Number.isFinite(requiredArea) || requiredArea <= 0) {
    return 'Diện tích GFA phải là số lớn hơn 0.';
  }

  const numericFields: Array<[string, unknown]> = [
    ['Diện tích NLA', data.areaNLA],
    ['Giá thuê cơ bản', data.baseRentPerSqm],
    ['Phí CAM', data.camPerSqm],
    ['Diện tích linh động tối thiểu', data.minFlexArea],
    ['Diện tích linh động tối đa', data.maxFlexArea],
  ];
  for (const [label, value] of numericFields) {
    if (value === '' || value == null) continue;
    const number = parseUnitNumber(value);
    if (number == null) continue;
    if (!Number.isFinite(number)) return `${label} không hợp lệ. Chỉ nhập số, không nhập ký hiệu tiền tệ.`;
    if (number < 0) return `${label} không được là số âm.`;
  }

  if (data.isFlexibleArea && data.minFlexArea !== '' && data.maxFlexArea !== '') {
    if ((parseUnitNumber(data.minFlexArea) ?? 0) > (parseUnitNumber(data.maxFlexArea) ?? 0)) {
      return 'Diện tích linh động tối thiểu không được lớn hơn diện tích tối đa.';
    }
  }

  return null;
}

export function getUnitMutationError(error: any, action: 'create' | 'update'): string {
  const response = error?.response;
  const data = response?.data;
  const actionLabel = action === 'create' ? 'tạo' : 'cập nhật';

  if (!response) {
    return error?.message === 'UNIT_FORM_VALIDATION'
      ? error.formMessage
      : 'Không thể kết nối đến máy chủ. Vui lòng kiểm tra mạng và thử lại.';
  }
  if (response.status === 403) {
    return `Bạn không có quyền ${actionLabel} mặt bằng. Vui lòng liên hệ Quản trị viên, Giám đốc trung tâm hoặc Quản lý cho thuê.`;
  }
  if (response.status >= 500) {
    const requestSuffix = data?.requestId ? ` Mã hỗ trợ: ${data.requestId}.` : '';
    return `Không thể ${actionLabel} mặt bằng do lỗi hệ thống.${requestSuffix}`;
  }

  const details = Array.isArray(data?.errors)
    ? data.errors.filter((item: unknown) => typeof item === 'string' && item.trim())
    : [];
  const message = Array.isArray(data?.message)
    ? data.message.filter((item: unknown) => typeof item === 'string' && item.trim())
    : typeof data?.message === 'string' && data.message !== 'Validation failed'
      ? [data.message]
      : [];
  const specificMessages = Array.from(new Set([...details, ...message]));
  if (specificMessages.length > 0) return specificMessages.join(' ');

  return `Không thể ${actionLabel} mặt bằng. Vui lòng kiểm tra lại thông tin đã nhập.`;
}
