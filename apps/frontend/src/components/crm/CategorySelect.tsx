import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { categoriesApi } from '@/api';
import { SearchableSelect, type SearchableSelectOption } from '@/components/ui/searchable-select';

/**
 * CR-CRM-CATEGORY-MASTER-001 — the single CRM category selector.
 *
 * Category master (`Category.id`) is the only identity. Before this component
 * the CRM had three incompatible hard-coded lists — `CATEGORY_OPTS` (codes like
 * `FB`), `LEAD_CATEGORIES` (Vietnamese labels) and the create dialog's own copy
 * of the API names — so a lead created from one list rendered blank in the
 * dialog driven by another. Every CRM category field now consumes this.
 */

export interface CategoryOption {
  id: string;
  code: string;
  name: string;
  parentId?: string | null;
}

/**
 * Sentinel for "this record carries legacy free text that has not been mapped
 * to the Category master yet". It is never sent to the API: the caller must
 * translate it into an omitted `categoryId` so the value is left UNCHANGED
 * rather than silently overwritten (CR §5 / §15).
 */
export const LEGACY_CATEGORY_VALUE = '__legacy__';

/** Shared query layer — one cache entry for every category selector. */
export function useCategoryOptions(enabled = true) {
  return useQuery<CategoryOption[]>({
    queryKey: ['category-options'],
    queryFn: categoriesApi.getOptions,
    staleTime: 300_000,
    enabled,
  });
}

interface CategorySelectProps {
  /** Category.id, LEGACY_CATEGORY_VALUE, or '' for no selection. */
  value: string;
  onChange: (value: string) => void;
  /** Legacy free text on the record, surfaced when it has no categoryId. */
  legacyText?: string | null;
  /**
   * The record's own Category relation. Injected into the list so a category
   * that has since been deactivated still renders its real name instead of
   * falling back to the placeholder.
   */
  currentCategory?: { id: string; name: string; isActive?: boolean } | null;
  enabled?: boolean;
  disabled?: boolean;
  placeholder?: string;
  clearLabel?: string;
  className?: string;
  id?: string;
}

export function CategorySelect({
  value,
  onChange,
  legacyText,
  currentCategory,
  enabled = true,
  disabled,
  placeholder = 'Chọn ngành hàng...',
  clearLabel = '— Chưa xác định —',
  className,
  id,
}: CategorySelectProps) {
  const { data, isLoading, isError } = useCategoryOptions(enabled);

  const options: SearchableSelectOption[] = useMemo(() => {
    // The Category master is a tree (Admin > Ngành hàng shows it as one), but
    // /categories/options returns it flat, ordered by sortOrder across ALL
    // levels. Rendered as-is a child such as "Coffee & Tea" lands far from
    // "F&B" and the user cannot tell what it belongs to. Rebuild the hierarchy
    // here and lay it out depth-first, the same order the admin tree uses.
    const flat = data ?? [];
    const knownIds = new Set(flat.map((c) => c.id));
    const childrenOf = new Map<string | null, CategoryOption[]>();
    for (const c of flat) {
      // A child whose parent is inactive is not returned by the API, so it
      // would otherwise vanish into a dangling branch. Treat it as a root
      // rather than dropping a selectable category.
      const key = c.parentId && knownIds.has(c.parentId) ? c.parentId : null;
      const bucket = childrenOf.get(key);
      if (bucket) bucket.push(c);
      else childrenOf.set(key, [c]);
    }

    const master: SearchableSelectOption[] = [];
    const visited = new Set<string>();
    const walk = (parentId: string | null, depth: number, path: string[]) => {
      for (const c of childrenOf.get(parentId) ?? []) {
        if (visited.has(c.id)) continue; // defensive: never loop on bad data
        visited.add(c.id);
        master.push({
          value: c.id,
          label: c.name,
          // The parent path keeps the context visible once a search filters
          // the parent row out of the list.
          hint: path.length > 0 ? `${path.join(' › ')} · ${c.code}` : c.code,
          depth,
        });
        walk(c.id, depth + 1, [...path, c.name]);
      }
    };
    walk(null, 0, []);

    // An inactive category still linked to this record is not in the active
    // options list — add it back so the field shows the truth.
    if (currentCategory && !master.some((o) => o.value === currentCategory.id)) {
      master.unshift({
        value: currentCategory.id,
        label:
          currentCategory.isActive === false
            ? `${currentCategory.name} (ngừng sử dụng)`
            : currentCategory.name,
        hint: '',
      });
    }

    // Legacy text is shown, never auto-replaced. Picking it back is a no-op
    // that leaves the stored value exactly as it is.
    if (legacyText && legacyText.trim()) {
      master.unshift({
        value: LEGACY_CATEGORY_VALUE,
        label: `${legacyText.trim()} (Chưa ánh xạ)`,
        hint: 'Giá trị cũ — chọn một ngành hàng chuẩn để chuẩn hoá',
      });
    }

    return master;
  }, [data, legacyText, currentCategory]);

  return (
    <SearchableSelect
      id={id}
      className={className}
      value={value}
      options={options}
      onChange={(v) => onChange(v)}
      placeholder={placeholder}
      searchPlaceholder="Tìm ngành hàng..."
      emptyText={
        isError
          ? 'Không tải được danh mục ngành hàng'
          : 'Chưa khai báo ngành hàng nào trong Danh mục'
      }
      loading={isLoading}
      disabled={disabled}
      clearLabel={clearLabel}
    />
  );
}

/**
 * Translate the selector's value into the `categoryId` field of a PATCH/PUT
 * payload. Kept next to the component so every caller applies the same
 * semantics: omitted = unchanged, null = explicit clear, id = change.
 */
export function categoryIdForUpdate(value: string): string | null | undefined {
  if (value === LEGACY_CATEGORY_VALUE) return undefined;
  return value ? value : null;
}

/** Same translation for a create payload, where "unchanged" has no meaning. */
export function categoryIdForCreate(value: string): string | undefined {
  if (!value || value === LEGACY_CATEGORY_VALUE) return undefined;
  return value;
}

/** Initial selector value for a record that may still be on legacy text. */
export function initialCategoryValue(record: {
  categoryId?: string | null;
  category?: string | null;
}): string {
  if (record.categoryId) return record.categoryId;
  if (record.category && record.category.trim()) return LEGACY_CATEGORY_VALUE;
  return '';
}
