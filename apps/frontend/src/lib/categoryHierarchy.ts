export interface CategoryOption {
  id: string;
  code?: string;
  name: string;
  parentId?: string | null;
}

export interface CategoryOptionWithDepth extends CategoryOption {
  depth: number;
}

/**
 * Orders a flat category list (as returned by GET /categories/options) into
 * parent-then-children order, tagging each entry with its nesting depth, so a
 * flat <select>/<SelectItem> list can render a subcategory immediately after
 * (and visually indented under) its parent instead of an undifferentiated
 * alphabetical mix of parents and children.
 */
export function flattenCategoryHierarchy(categories: CategoryOption[]): CategoryOptionWithDepth[] {
  const byParent = new Map<string, CategoryOption[]>();
  for (const c of categories) {
    const key = c.parentId ?? '';
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(c);
  }

  const result: CategoryOptionWithDepth[] = [];
  const visited = new Set<string>();
  const visit = (parentKey: string, depth: number) => {
    for (const c of byParent.get(parentKey) ?? []) {
      if (visited.has(c.id)) continue; // guards against a malformed/cyclic parentId
      visited.add(c.id);
      result.push({ ...c, depth });
      visit(c.id, depth + 1);
    }
  };
  visit('', 0);

  // Any category whose parentId points at something not in this list (e.g.
  // filtered out as inactive) would otherwise be silently dropped -- append
  // it at depth 0 rather than hiding it.
  for (const c of categories) {
    if (!visited.has(c.id)) {
      visited.add(c.id);
      result.push({ ...c, depth: 0 });
    }
  }

  return result;
}

/** "— " prefix repeated per depth level, for plain-text contexts (native <option> labels). */
export function categoryIndentPrefix(depth: number): string {
  return depth > 0 ? `${'—'.repeat(depth)} ` : '';
}
