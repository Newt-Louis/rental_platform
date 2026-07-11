import React, { useState } from 'react';
import { Search, SlidersHorizontal, X, CheckSquare } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSpacesFilters } from '@/hooks/useSpacesFilters';
import { useSpacesStore } from '@/store/spaces.store';
import {
  STATUS_CONFIG, SPACE_TYPE_OPTIONS, TIER_OPTIONS, LEASE_TERM_OPTIONS,
} from './spaces.constants';

export function SpacesFilters({ categoryNames }: { categoryNames: string[] }) {
  const [showFilters, setShowFilters] = useState(false);

  const {
    search, setSearch,
    statusFilter, setStatusFilter,
    floorFilter,
    minArea, setMinArea,
    maxArea, setMaxArea,
    minRent, setMinRent,
    maxRent, setMaxRent,
    categoryFilter, setCategoryFilter,
    spaceTypeFilter, setSpaceTypeFilter,
    tierFilter, setTierFilter,
    leaseTermFilter, setLeaseTermFilter,
    hasAdvancedFilters,
    clearFilters,
  } = useSpacesFilters();

  const { selectionMode, setSelectionMode } = useSpacesStore();

  return (
    <div className="space-y-3 mb-4">
      <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Tìm mã, tên mặt bằng..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder="Tất cả trạng thái" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Tất cả</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key, cfg]) => (
              <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant={selectionMode ? 'default' : 'outline'}
          size="sm"
          onClick={() => setSelectionMode(!selectionMode)}
          className="gap-1.5"
        >
          <CheckSquare size={14} />
          <span className="hidden sm:inline">{selectionMode ? 'Thoát' : 'Chọn nhiều'}</span>
        </Button>
        <Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1.5"
        >
          <SlidersHorizontal size={14} />
          Bộ lọc nâng cao
          {hasAdvancedFilters && <span className="w-2 h-2 bg-gray-500 rounded-full" />}
        </Button>
        {(statusFilter || floorFilter || search || hasAdvancedFilters) && (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            <X size={14} className="mr-1" /> Xóa bộ lọc
          </Button>
        )}
      </div>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Diện tích min (m²)</label>
              <Input
                type="number"
                placeholder="0"
                value={minArea}
                onChange={(e) => setMinArea(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Diện tích max (m²)</label>
              <Input
                type="number"
                placeholder="1000"
                value={maxArea}
                onChange={(e) => setMaxArea(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Giá thuê min (₫/m²)</label>
              <Input
                type="number"
                placeholder="0"
                value={minRent}
                onChange={(e) => setMinRent(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Giá thuê max (₫/m²)</label>
              <Input
                type="number"
                placeholder="1000000"
                value={maxRent}
                onChange={(e) => setMaxRent(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Ngành hàng</label>
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả ngành hàng" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tất cả</SelectItem>
                  {categoryNames.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* GAP #4 */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Loại sảnh</label>
              <Select value={spaceTypeFilter} onValueChange={setSpaceTypeFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả loại" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tất cả</SelectItem>
                  {SPACE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* GAP #6 */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Tier</label>
              <Select value={tierFilter} onValueChange={setTierFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả tier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tất cả</SelectItem>
                  {TIER_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* GAP #3 */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">Hình thức thuê</label>
              <Select value={leaseTermFilter} onValueChange={setLeaseTermFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Tất cả" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Tất cả</SelectItem>
                  {LEASE_TERM_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
