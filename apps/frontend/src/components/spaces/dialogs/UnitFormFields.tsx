import React, { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SPACE_TYPE_OPTIONS, TIER_OPTIONS, LEASE_TERM_OPTIONS } from '@/pages/spaces/spaces.constants';
import { flattenCategoryHierarchy, type CategoryOption } from '@/lib/categoryHierarchy';

export interface UnitFormFieldsProps {
  register: any;
  watch: any;
  setValue: any;
  errors: any;
  floors: any[];
  zones: any[];
  categoryOptions: CategoryOption[];
}

export function UnitFormFields({
  register, watch, setValue, errors, floors, zones, categoryOptions,
}: UnitFormFieldsProps) {
  const categoriesHierarchical = useMemo(() => flattenCategoryHierarchy(categoryOptions), [categoryOptions]);
  return (
    <div className="space-y-4">
      {/* Code + Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Mã mặt bằng *</label>
          <Input
            {...register('code', {
              required: 'Vui lòng nhập mã mặt bằng.',
              validate: (value: string) => !!value?.trim() || 'Mã mặt bằng không được chỉ chứa khoảng trắng.',
            })}
            placeholder="GF-A01"
            className={errors.code ? 'border-red-400' : ''}
          />
          {errors.code?.message && <p className="mt-1 text-xs text-red-600">{String(errors.code.message)}</p>}
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Tên (tuỳ chọn)</label>
          <Input {...register('name')} placeholder="Unit A01..." />
        </div>
      </div>

      {/* Floor + Zone + Category */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Tầng</label>
          <Select value={watch('floorId') || 'NONE'} onValueChange={(v) => { setValue('floorId', v === 'NONE' ? '' : v, { shouldDirty: true }); setValue('zoneId', '', { shouldDirty: true }); }}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn tầng..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">— Không chọn —</SelectItem>
              {floors.map((f: any) => (
                <SelectItem key={f.id} value={f.id}>{f.name} ({f.level})</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('floorId')} />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Khu vực (Zone)</label>
          <Select value={watch('zoneId') || 'NONE'} onValueChange={(v) => setValue('zoneId', v === 'NONE' ? '' : v, { shouldDirty: true })}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn zone..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">— Không chọn —</SelectItem>
              {zones.map((z: any) => (
                <SelectItem key={z.id} value={z.id}>{z.name}{z.code ? ` (${z.code})` : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('zoneId')} />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Ngành hàng</label>
          <Select value={watch('categoryId') || 'NONE'} onValueChange={(v) => setValue('categoryId', v === 'NONE' ? '' : v, { shouldDirty: true })}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn ngành hàng..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">— Không chọn —</SelectItem>
              {categoriesHierarchical.map((c) => (
                <SelectItem key={c.id} value={c.id} className={c.depth > 0 ? 'pl-6 text-gray-600' : undefined}>
                  {c.depth > 0 && '↳ '}{c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('categoryId')} />
        </div>
      </div>

      {/* Areas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Diện tích GFA (m²) *</label>
          <Input
            {...register('areaGFA', {
              required: 'Vui lòng nhập diện tích GFA.',
              min: { value: 0.01, message: 'Diện tích GFA phải lớn hơn 0.' },
            })}
            value={watch('areaGFA')}
            onChange={(e) => setValue('areaGFA', e.target.value, { shouldDirty: true, shouldValidate: true })}
            type="number" step="0.01" placeholder="120"
            className={errors.areaGFA ? 'border-red-400' : ''}
          />
          {errors.areaGFA?.message && <p className="mt-1 text-xs text-red-600">{String(errors.areaGFA.message)}</p>}
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Diện tích NLA (m²)</label>
          <Input
            {...register('areaNLA', { min: { value: 0, message: 'Diện tích NLA không được âm.' } })}
            value={watch('areaNLA')}
            onChange={(e) => setValue('areaNLA', e.target.value, { shouldDirty: true })}
            type="number" step="0.01" placeholder="100"
            className={errors.areaNLA ? 'border-red-400' : ''}
          />
          {errors.areaNLA?.message && <p className="mt-1 text-xs text-red-600">{String(errors.areaNLA.message)}</p>}
        </div>
      </div>

      {/* Rents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Giá thuê cơ bản (VND/m²)</label>
          <Input
            {...register('baseRentPerSqm', { min: { value: 0, message: 'Giá thuê không được âm.' } })}
            value={watch('baseRentPerSqm')}
            onChange={(e) => setValue('baseRentPerSqm', e.target.value, { shouldDirty: true })}
            type="text" inputMode="decimal" placeholder="450000 hoặc 450.000"
          />
          {errors.baseRentPerSqm?.message && <p className="mt-1 text-xs text-red-600">{String(errors.baseRentPerSqm.message)}</p>}
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Phí CAM (VND/m²)</label>
          <Input
            {...register('camPerSqm', { min: { value: 0, message: 'Phí CAM không được âm.' } })}
            value={watch('camPerSqm')}
            onChange={(e) => setValue('camPerSqm', e.target.value, { shouldDirty: true })}
            type="text" inputMode="decimal" placeholder="80000 hoặc 80.000"
          />
          {errors.camPerSqm?.message && <p className="mt-1 text-xs text-red-600">{String(errors.camPerSqm.message)}</p>}
        </div>
      </div>

      {/* Space type / Tier / Lease term */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Loại sảnh</label>
          <Select value={watch('spaceType') || 'NONE'} onValueChange={(v) => setValue('spaceType', v === 'NONE' ? '' : v, { shouldDirty: true })}>
            <SelectTrigger><SelectValue placeholder="Chọn loại..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">— Không chọn —</SelectItem>
              {SPACE_TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('spaceType')} />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Tier</label>
          <Select value={watch('tier') || 'NONE'} onValueChange={(v) => setValue('tier', v === 'NONE' ? '' : v, { shouldDirty: true })}>
            <SelectTrigger><SelectValue placeholder="Chọn tier..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">— Không chọn —</SelectItem>
              {TIER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('tier')} />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Khu cho thuê *</label>
          <Select value={watch('leaseTermType') || 'LONG'} onValueChange={(v) => setValue('leaseTermType', v, { shouldDirty: true })}>
            <SelectTrigger><SelectValue placeholder="Chọn khu..." /></SelectTrigger>
            <SelectContent>
              {LEASE_TERM_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('leaseTermType')} />
        </div>
      </div>

      {/* Flexible area */}
      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            {...register('isFlexibleArea')}
            className="w-4 h-4 rounded"
          />
          <span className="text-sm font-medium text-gray-700">Sảnh linh động (cho thuê theo m² không cố định)</span>
        </label>
        {watch('isFlexibleArea') && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2 max-w-md">
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Diện tích tối thiểu (m²)</label>
              <Input
                {...register('minFlexArea', { min: { value: 0, message: 'Diện tích tối thiểu không được âm.' } })}
                value={watch('minFlexArea')}
                onChange={(e) => setValue('minFlexArea', e.target.value, { shouldDirty: true })}
                type="number" step="0.1" placeholder="50"
              />
              {errors.minFlexArea?.message && <p className="mt-1 text-xs text-red-600">{String(errors.minFlexArea.message)}</p>}
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Diện tích tối đa (m²)</label>
              <Input
                {...register('maxFlexArea', { min: { value: 0, message: 'Diện tích tối đa không được âm.' } })}
                value={watch('maxFlexArea')}
                onChange={(e) => setValue('maxFlexArea', e.target.value, { shouldDirty: true })}
                type="number" step="0.1" placeholder="200"
              />
              {errors.maxFlexArea?.message && <p className="mt-1 text-xs text-red-600">{String(errors.maxFlexArea.message)}</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
