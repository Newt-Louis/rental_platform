import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, SlidersHorizontal, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useSpacesFilters } from '@/hooks/useSpacesFilters';
import { ERPToolbar } from '@/components/erp/ERPToolbar';
import { STATUS_CONFIG, SPACE_TYPE_OPTIONS, TIER_OPTIONS } from './spaces.constants';
import { getUnitStatusLabel } from './spacesPresentation';

export function SpacesFilters({ categoryNames }: { categoryNames: string[] }) {
  const { t } = useTranslation('spaces');
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
    hasAdvancedFilters,
    clearFilters,
  } = useSpacesFilters();

  return (
    <div className="space-y-2 mb-3">
      <ERPToolbar className="gap-2 rounded-md px-2.5 py-2">
        <div className="relative w-full sm:flex-1 sm:max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder={t('filters.searchPlaceholder')}
            aria-label={t('filters.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statusFilter || 'ALL'} onValueChange={(value) => setStatusFilter(value === 'ALL' ? '' : value)}>
          <SelectTrigger className="w-full sm:w-44">
            <SelectValue placeholder={t('filters.allStatus')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('filters.all')}</SelectItem>
            {Object.entries(STATUS_CONFIG).map(([key]) => (
              <SelectItem key={key} value={key}>{getUnitStatusLabel(t, key)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
<Button
          variant={showFilters ? 'default' : 'outline'}
          size="sm"
          onClick={() => setShowFilters(!showFilters)}
          className="gap-1.5"
        >
          <SlidersHorizontal size={14} />
          {t('filters.advanced')}
          {hasAdvancedFilters && <span className="w-2 h-2 bg-gray-500 rounded-full" />}
        </Button>
        {(statusFilter || floorFilter || search || hasAdvancedFilters) && (
          <Button variant="outline" size="sm" onClick={clearFilters}>
            <X size={14} className="mr-1" /> {t('filters.clearAll')}
          </Button>
        )}
      </ERPToolbar>

      {/* Advanced Filters Panel */}
      {showFilters && (
        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{t('filters.minAreaLabel')}</label>
              <Input
                type="number"
                placeholder="0"
                value={minArea}
                onChange={(e) => setMinArea(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{t('filters.maxAreaLabel')}</label>
              <Input
                type="number"
                placeholder="1000"
                value={maxArea}
                onChange={(e) => setMaxArea(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{t('filters.minRentLabel')}</label>
              <Input
                type="number"
                placeholder="0"
                value={minRent}
                onChange={(e) => setMinRent(e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{t('filters.maxRentLabel')}</label>
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
              <label className="text-xs font-medium text-gray-500 mb-1 block">{t('filters.categoryLabel')}</label>
              <Select value={categoryFilter || 'ALL'} onValueChange={(value) => setCategoryFilter(value === 'ALL' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('filters.allCategories')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('filters.all')}</SelectItem>
                  {categoryNames.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* GAP #4 */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{t('filters.spaceTypeLabel')}</label>
              <Select value={spaceTypeFilter || 'ALL'} onValueChange={(value) => setSpaceTypeFilter(value === 'ALL' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('filters.allTypes')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('filters.all')}</SelectItem>
                  {SPACE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* GAP #6 */}
            <div>
              <label className="text-xs font-medium text-gray-500 mb-1 block">{t('filters.tierLabel')}</label>
              <Select value={tierFilter || 'ALL'} onValueChange={(value) => setTierFilter(value === 'ALL' ? '' : value)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('filters.allTiers')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t('filters.all')}</SelectItem>
                  {TIER_OPTIONS.map((o) => (
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
