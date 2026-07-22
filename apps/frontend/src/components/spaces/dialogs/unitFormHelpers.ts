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

export function buildUnitFormPayload(data: Record<string, any>, mallId: string) {
  return {
    ...data,
    mallId,
    areaGFA: Number(data.areaGFA),
    areaNLA: data.areaNLA ? Number(data.areaNLA) : undefined,
    baseRentPerSqm: data.baseRentPerSqm ? Number(data.baseRentPerSqm) : undefined,
    camPerSqm: data.camPerSqm ? Number(data.camPerSqm) : undefined,
    floorId: data.floorId || undefined,
    zoneId: data.zoneId || undefined,
    name: data.name || undefined,
    category: data.category || undefined,
    spaceType: data.spaceType || undefined,
    leaseTermType: data.leaseTermType || undefined,
    tier: data.tier || undefined,
    minFlexArea: data.minFlexArea ? Number(data.minFlexArea) : undefined,
    maxFlexArea: data.maxFlexArea ? Number(data.maxFlexArea) : undefined,
    isFlexibleArea: !!data.isFlexibleArea,
  };
}
