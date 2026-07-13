# Reusable Hooks Design

**Date:** 2026-07-13
**Branch:** kyle
**Scope:** 5 generic React hooks extracted from repeated patterns across 15+ pages

---

## Problem

Pages in this codebase duplicate the same logic repeatedly:

| Pattern | Pages affected |
|---|---|
| Draft/applied filter state | 6 pages (Proposals, Contracts, Tenants, Tickets, Billing, AuditLog) |
| `useQuery` + `useMutation` + invalidate + toast | 15/15 pages |
| Detail sheet open/close state | 8 pages |
| Form dialog state + reset | 14 pages |
| Permission role checks | 7 pages |

The existing `useSpacesFilters.ts` proves the pattern works — this design extends it consistently across all pages.

---

## Decision

**Approach: Generic utility hooks (composable)**

Each hook has one responsibility. Pages import and compose as needed. This matches the existing `useSpacesFilters` pattern and avoids over-coupling entity logic to hook logic.

Rejected alternatives:
- Per-entity hooks (`useProposals()`) — hard to reuse, duplicates logic per entity
- Feature-grouped hooks (`useListPage()`) — too much responsibility per hook, hard to customize

---

## File Structure

```
apps/frontend/src/hooks/
├── useFilters.ts          # URL-based draft/applied filter state
├── useCRUD.ts             # useQuery + useMutation + invalidate + toast
├── useDetailSheet.ts      # Selected item for detail sheet/panel
├── useFormDialog.ts       # Dialog open + form state + reset
├── usePermission.ts       # Role-based permission flags
└── useSpacesFilters.ts    # Existing — keep as-is
```

---

## Hook Specifications

### 1. `useFilters<T extends Record<string, string>>`

**Purpose:** URL-synchronized draft/applied filter state with two-phase commit.

**Signature:**
```typescript
function useFilters<T extends Record<string, string>>(emptyFilters: T): {
  draft: T;
  setDraft: (key: keyof T, value: string) => void;
  applied: T;
  apply: () => void;
  clear: () => void;
  isDirty: boolean;
  hasApplied: boolean;
}
```

**Behavior:**
- `draft` — current user input, not yet sent to API
- `applied` — committed filter state, passed to `queryFn`
- Both states initialized from URL search params on mount
- `apply()` copies draft → applied, writes all keys to URL params
- `clear()` resets both to `emptyFilters`, removes all keys from URL
- `isDirty` — true when draft differs from applied (enables Search button highlight)
- `hasApplied` — true when any applied value is non-empty (enables Clear button)

**URL strategy:** Each filter key maps to a URL param with the same name. Empty string = param removed.

**Replaces:** manual `useState` + `applyFilters` + `clearFilters` in ProposalsPage, ContractsPage, TenantsPage, TicketsPage, BillingPage, AuditLogPage.

---

### 2. `useCRUD<TData, TCreate, TUpdate>`

**Purpose:** Bundle `useQuery` + create/update/delete mutations with automatic cache invalidation and toast feedback.

**Signature:**
```typescript
function useCRUD<TData, TCreate = unknown, TUpdate = unknown>(options: {
  queryKey: unknown[];
  queryFn: () => Promise<TData>;
  createFn?: (data: TCreate) => Promise<unknown>;
  updateFn?: (payload: { id: string; data: TUpdate }) => Promise<unknown>;
  deleteFn?: (id: string) => Promise<unknown>;
  entityLabel: string;
}): {
  data: TData | undefined;
  isLoading: boolean;
  create: UseMutationResult<unknown, unknown, TCreate>;
  update: UseMutationResult<unknown, unknown, { id: string; data: TUpdate }>;
  remove: UseMutationResult<unknown, unknown, string>;
}
```

**Behavior:**
- `queryFn` result cached under `queryKey`
- Each mutation on success: invalidates `queryKey[0]` (entity root), shows success toast
- Each mutation on error: shows destructive toast with `error?.response?.data?.message ?? 'Error'`
- `createFn`, `updateFn`, `deleteFn` are optional — omit what the entity doesn't need
- Toast messages: `"{entityLabel} created"`, `"{entityLabel} updated"`, `"{entityLabel} deleted"`

**Replaces:** repeated `useMutation` blocks with identical `onSuccess`/`onError` in every page.

---

### 3. `useDetailSheet<T>`

**Purpose:** Track which item is selected for display in a side sheet/panel.

**Signature:**
```typescript
function useDetailSheet<T>(): {
  selected: T | null;
  isOpen: boolean;
  open: (item: T) => void;
  close: () => void;
}
```

**Behavior:**
- `selected` starts as `null`
- `open(item)` sets selected → sheet mounts/shows
- `close()` sets selected → `null`
- `isOpen` = `selected !== null` (convenience for `<Sheet open={isOpen}>`)

**Replaces:** `useState<Proposal | null>(null)` + `setSelectedProposal(null)` in 8+ pages.

---

### 4. `useFormDialog<T extends Record<string, unknown>>`

**Purpose:** Manage dialog visibility + form state with automatic reset on close.

**Signature:**
```typescript
function useFormDialog<T extends Record<string, unknown>>(defaultForm: T): {
  isOpen: boolean;
  openDialog: (prefill?: Partial<T>) => void;
  closeDialog: () => void;
  form: T;
  setField: (key: keyof T) => (value: string) => void;
  setForm: Dispatch<SetStateAction<T>>;
  reset: () => void;
}
```

**Behavior:**
- `openDialog()` sets `isOpen = true`; optional `prefill` merges into form (for edit dialogs)
- `closeDialog()` sets `isOpen = false` AND calls `reset()`
- `setField('key')` returns an `(value: string) => void` compatible with Input/Select `onChange`
- `reset()` restores form to `defaultForm`
- `setForm` exposed for bulk updates (e.g., loading existing entity into edit dialog)

**Edit dialog pattern:**
```typescript
const dialog = useFormDialog({ title: '', status: '' });
// Open with prefill for edit:
dialog.openDialog({ title: existing.title, status: existing.status });
```

**Replaces:** `[showDialog, setShowDialog]` + `[form, setForm]` + `set = (k) => (e) => ...` pattern in 14 pages.

---

### 5. `usePermission`

**Purpose:** Read from auth store and expose pre-computed role flags.

**Signature:**
```typescript
function usePermission(): {
  user: User | null;
  role: UserRole | undefined;
  isAdmin: boolean;
  isManager: boolean;
  isStaff: boolean;    // any non-tenant role
  isTenant: boolean;
  hasRole: (roles: UserRole[]) => boolean;
}
```

**Behavior:**
- Reads `user` from `useAuthStore()`
- `isStaff` = role is not `'TENANT'` (matches existing `user?.role !== 'TENANT'` checks)
- `isAdmin` = role is `'ADMIN'`
- `isManager` = role is `'MANAGER'`
- `isTenant` = role is `'TENANT'`
- `hasRole(roles)` = `!!role && roles.includes(role)`

**Replaces:** `const { user } = useAuthStore(); const isStaff = user?.role !== 'TENANT'` inline in 7 pages.

---

## Data Flow Example (ProposalsPage)

```
useFilters({ search: '', status: '', category: '' })
  └── applied  ──→  useCRUD({ queryKey: ['proposals', applied], queryFn: () => api.list(applied) })
                        └── data, isLoading, create, update, remove

useDetailSheet<Proposal>()
  └── selected, open, close, isOpen  ──→  <ProposalSheet>

useFormDialog({ title: '', spaceId: '', ... })
  └── isOpen, openDialog, closeDialog, form, setField  ──→  <CreateProposalDialog>

usePermission()
  └── isStaff, isAdmin  ──→  conditional render of action buttons
```

---

## Error Handling

- Mutation errors surface via toast (destructive variant) — no additional try/catch in pages
- Query errors: rely on React Query's default error boundary behavior
- `useFilters` URL parsing: invalid/missing params fall back to `emptyFilters` values

---

## Testing

Each hook tested independently with `renderHook` from `@testing-library/react`:
- `useFilters` — test apply, clear, isDirty, URL sync
- `useCRUD` — mock `queryFn`/mutation fns, verify toast calls and cache invalidation
- `useDetailSheet` — open/close state transitions
- `useFormDialog` — setField, reset on close, prefill on open
- `usePermission` — each role flag for each role value

---

## Migration Strategy

Hooks are additive — no existing page is broken. Migration is page-by-page:
1. Add new hook file
2. Refactor one page as reference implementation
3. Remaining pages migrated opportunistically

`useSpacesFilters` remains unchanged — it is already the reference for `useFilters` internals.
