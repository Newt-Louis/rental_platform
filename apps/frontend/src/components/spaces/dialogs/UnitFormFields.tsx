import React from 'react';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SPACE_TYPE_OPTIONS, TIER_OPTIONS, LEASE_TERM_OPTIONS } from '@/pages/spaces/spaces.constants';

export interface UnitFormFieldsProps {
  register: any;
  watch: any;
  setValue: any;
  errors: any;
  floors: any[];
  zones: any[];
  categoryNames: string[];
}

export function UnitFormFields({
  register, watch, setValue, errors, floors, zones, categoryNames,
}: UnitFormFieldsProps) {
  return (
    <div className="space-y-4">
      {/* Code + Name */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Mã mặt bằng *</label>
          <Input
            {...register('code', { required: true })}
            placeholder="GF-A01"
            className={errors.code ? 'border-red-400' : ''}
          />
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
          <Select value={watch('category') || 'NONE'} onValueChange={(v) => setValue('category', v === 'NONE' ? '' : v, { shouldDirty: true })}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn ngành hàng..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">— Không chọn —</SelectItem>
              {categoryNames.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <input type="hidden" {...register('category')} />
        </div>
      </div>

      {/* Areas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Diện tích GFA (m²) *</label>
          <Input
            {...register('areaGFA', { required: true })}
            value={watch('areaGFA')}
            onChange={(e) => setValue('areaGFA', e.target.value, { shouldDirty: true, shouldValidate: true })}
            type="number" step="0.01" placeholder="120"
            className={errors.areaGFA ? 'border-red-400' : ''}
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Diện tích NLA (m²)</label>
          <Input
            {...register('areaNLA')}
            value={watch('areaNLA')}
            onChange={(e) => setValue('areaNLA', e.target.value, { shouldDirty: true })}
            type="number" step="0.01" placeholder="100"
            className={errors.areaNLA ? 'border-red-400' : ''}
          />
        </div>
      </div>

      {/* Rents */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Giá thuê cơ bản (₫/m²)</label>
          <Input
            {...register('baseRentPerSqm')}
            value={watch('baseRentPerSqm')}
            onChange={(e) => setValue('baseRentPerSqm', e.target.value, { shouldDirty: true })}
            type="number" placeholder="450000"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-gray-700 mb-1 block">Phí CAM (₫/m²)</label>
          <Input
            {...register('camPerSqm')}
            value={watch('camPerSqm')}
            onChange={(e) => setValue('camPerSqm', e.target.value, { shouldDirty: true })}
            type="number" placeholder="80000"
          />
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
          <label className="text-sm font-medium text-gray-700 mb-1 block">Hình thức thuê</label>
          <Select value={watch('leaseTermType') || 'NONE'} onValueChange={(v) => setValue('leaseTermType', v === 'NONE' ? '' : v, { shouldDirty: true })}>
            <SelectTrigger><SelectValue placeholder="Chọn..." /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NONE">— Không chọn —</SelectItem>
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
                {...register('minFlexArea')}
                value={watch('minFlexArea')}
                onChange={(e) => setValue('minFlexArea', e.target.value, { shouldDirty: true })}
                type="number" step="0.1" placeholder="50"
              />
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block">Diện tích tối đa (m²)</label>
              <Input
                {...register('maxFlexArea')}
                value={watch('maxFlexArea')}
                onChange={(e) => setValue('maxFlexArea', e.target.value, { shouldDirty: true })}
                type="number" step="0.1" placeholder="200"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
