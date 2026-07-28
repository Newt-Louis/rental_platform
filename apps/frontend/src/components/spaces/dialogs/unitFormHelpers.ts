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
  spaceType: '', leaseTermType: '', tier: '', isFlexibleArea: false,
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
    leaseTermType: unit?.leaseTermType ?? '',
    tier: unit?.tier ?? '',
    isFlexibleArea: unit?.isFlexibleArea ?? false,
    minFlexArea: unit?.minFlexArea?.toString() ?? '',
    maxFlexArea: unit?.maxFlexArea?.toString() ?? '',
  };
}

export function buildUnitFormPayload(data: Record<string, any>, mallId: string, isEdit = false) {
  const optional = (value: unknown) => value ? value : (isEdit ? null : undefined);
  const optionalNumber = (value: unknown) => value !== '' && value != null
    ? Number(value)
    : (isEdit ? null : undefined);
  return {
    ...(!isEdit ? { mallId } : {}),
    code: data.code.trim(),
    areaGFA: Number(data.areaGFA),
    areaNLA: data.areaNLA ? Number(data.areaNLA) : 0,
    baseRentPerSqm: data.baseRentPerSqm ? Number(data.baseRentPerSqm) : 0,
    camPerSqm: data.camPerSqm ? Number(data.camPerSqm) : 0,
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
