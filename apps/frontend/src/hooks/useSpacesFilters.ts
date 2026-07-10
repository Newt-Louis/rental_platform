import { useSearchParams } from 'react-router-dom';

const FILTER_KEYS = ['search', 'status', 'floor', 'minArea', 'maxArea', 'minRent', 'maxRent', 'category', 'spaceType', 'tier', 'leaseTerm'] as const;

function set1(setSearchParams: ReturnType<typeof useSearchParams>[1], key: string, value: string) {
  setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    if (value) next.set(key, value);
    else next.delete(key);
    return next;
  }, { replace: true });
}

export function useSpacesFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const search          = searchParams.get('search')     ?? '';
  const statusFilter    = searchParams.get('status')     ?? '';
  const floorFilter     = searchParams.get('floor')      ?? '';
  const minArea         = searchParams.get('minArea')    ?? '';
  const maxArea         = searchParams.get('maxArea')    ?? '';
  const minRent         = searchParams.get('minRent')    ?? '';
  const maxRent         = searchParams.get('maxRent')    ?? '';
  const categoryFilter  = searchParams.get('category')   ?? '';
  const spaceTypeFilter = searchParams.get('spaceType')  ?? '';
  const tierFilter      = searchParams.get('tier')       ?? '';
  const leaseTermFilter = searchParams.get('leaseTerm')  ?? '';

  const hasAdvancedFilters = !!(minArea || maxArea || minRent || maxRent || categoryFilter || spaceTypeFilter || tierFilter || leaseTermFilter);

  const clearFilters = () => setSearchParams((prev) => {
    const next = new URLSearchParams(prev);
    FILTER_KEYS.forEach((k) => next.delete(k));
    return next;
  }, { replace: true });

  return {
    search,          setSearch:          (v: string) => set1(setSearchParams, 'search',     v),
    statusFilter,    setStatusFilter:    (v: string) => set1(setSearchParams, 'status',     v),
    floorFilter,     setFloorFilter:     (v: string) => set1(setSearchParams, 'floor',      v),
    minArea,         setMinArea:         (v: string) => set1(setSearchParams, 'minArea',    v),
    maxArea,         setMaxArea:         (v: string) => set1(setSearchParams, 'maxArea',    v),
    minRent,         setMinRent:         (v: string) => set1(setSearchParams, 'minRent',    v),
    maxRent,         setMaxRent:         (v: string) => set1(setSearchParams, 'maxRent',    v),
    categoryFilter,  setCategoryFilter:  (v: string) => set1(setSearchParams, 'category',  v),
    spaceTypeFilter, setSpaceTypeFilter: (v: string) => set1(setSearchParams, 'spaceType', v),
    tierFilter,      setTierFilter:      (v: string) => set1(setSearchParams, 'tier',       v),
    leaseTermFilter, setLeaseTermFilter: (v: string) => set1(setSearchParams, 'leaseTerm', v),
    hasAdvancedFilters,
    clearFilters,
  };
}
