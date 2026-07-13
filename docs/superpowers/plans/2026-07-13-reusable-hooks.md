# Reusable Hooks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create 5 generic, composable React hooks (`useFilters`, `useCRUD`, `useDetailSheet`, `useFormDialog`, `usePermission`) that eliminate repeated patterns across 15+ pages.

**Architecture:** Each hook has a single responsibility and is URL-aware where relevant (`useFilters` syncs filter state to URL params). Hooks are composed freely in pages — no entity-specific coupling. Migration is page-by-page after the hooks are created.

**Tech Stack:** React 18, TypeScript 5.5, TanStack Query v5, React Router v6, Zustand 4, Vitest, @testing-library/react

## Global Constraints

- All hook files live in `apps/frontend/src/hooks/`
- All imports use `@/` alias (maps to `apps/frontend/src/`)
- `Role` type imported from `@/types` — 9 values: `'ADMIN' | 'LEASING_EXECUTIVE' | 'LEASING_MANAGER' | 'MALL_DIRECTOR' | 'FINANCE' | 'LEGAL' | 'OPERATION' | 'TENANT' | 'CEO'`
- `useAuthStore` imported from `@/store/auth.store`
- `useToast` imported from `@/components/ui/use-toast`
- Tests run from `apps/frontend/` directory: `npm run test`
- TypeScript strict mode on — no `any` except `error?.response?.data?.message`
- Do not modify `useSpacesFilters.ts` — it stays unchanged

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `apps/frontend/vitest.config.ts` | Create | Vitest config with jsdom + `@` alias |
| `apps/frontend/src/test/setup.ts` | Create | `@testing-library/jest-dom` setup |
| `apps/frontend/src/hooks/useDetailSheet.ts` | Create | Selected item state for sheets/panels |
| `apps/frontend/src/hooks/useFormDialog.ts` | Create | Dialog open/close + form state + reset |
| `apps/frontend/src/hooks/usePermission.ts` | Create | Role flags from auth store |
| `apps/frontend/src/hooks/useFilters.ts` | Create | URL-synced draft/applied filter state |
| `apps/frontend/src/hooks/useCRUD.ts` | Create | useQuery + mutations + invalidate + toast |
| `apps/frontend/package.json` | Modify | Add test script + vitest devDependencies |

---

## Task 1: Setup Vitest test infrastructure

**Files:**
- Create: `apps/frontend/vitest.config.ts`
- Create: `apps/frontend/src/test/setup.ts`
- Modify: `apps/frontend/package.json`

**Interfaces:**
- Produces: `npm run test` command in `apps/frontend/`

- [ ] **Step 1: Install test dependencies**

Run from `apps/frontend/`:
```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom @testing-library/user-event jsdom
```

Expected: packages installed, no peer dep errors.

- [ ] **Step 2: Add test script to package.json**

In `apps/frontend/package.json`, add `"test": "vitest run"` and `"test:watch": "vitest"` to the `"scripts"` block:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 3: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
});
```

- [ ] **Step 4: Create test setup file**

```typescript
// apps/frontend/src/test/setup.ts
import '@testing-library/jest-dom';
```

- [ ] **Step 5: Verify setup with a trivial test**

Create `apps/frontend/src/test/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('vitest setup', () => {
  it('works', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `npm run test`

Expected output:
```
✓ src/test/smoke.test.ts (1)
Test Files  1 passed (1)
Tests  1 passed (1)
```

- [ ] **Step 6: Delete the smoke test**

```bash
# Delete apps/frontend/src/test/smoke.test.ts
```

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/vitest.config.ts apps/frontend/src/test/setup.ts apps/frontend/package.json apps/frontend/package-lock.json
git commit -m "chore(frontend): add vitest + @testing-library/react test infrastructure"
```

---

## Task 2: `useDetailSheet<T>`

**Files:**
- Create: `apps/frontend/src/hooks/useDetailSheet.ts`
- Test: `apps/frontend/src/hooks/useDetailSheet.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  function useDetailSheet<T>(): {
    selected: T | null;
    isOpen: boolean;
    open: (item: T) => void;
    close: () => void;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/useDetailSheet.test.ts`:
```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useDetailSheet } from './useDetailSheet';

describe('useDetailSheet', () => {
  it('starts closed with null selected', () => {
    const { result } = renderHook(() => useDetailSheet<{ id: string }>());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.selected).toBeNull();
  });

  it('open() sets selected and isOpen', () => {
    const { result } = renderHook(() => useDetailSheet<{ id: string }>());
    act(() => result.current.open({ id: '1' }));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.selected).toEqual({ id: '1' });
  });

  it('close() sets selected to null and isOpen to false', () => {
    const { result } = renderHook(() => useDetailSheet<{ id: string }>());
    act(() => result.current.open({ id: '1' }));
    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.selected).toBeNull();
  });

  it('open() replaces previously selected item', () => {
    const { result } = renderHook(() => useDetailSheet<{ id: string }>());
    act(() => result.current.open({ id: '1' }));
    act(() => result.current.open({ id: '2' }));
    expect(result.current.selected).toEqual({ id: '2' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- useDetailSheet
```

Expected: FAIL — `Cannot find module './useDetailSheet'`

- [ ] **Step 3: Implement useDetailSheet**

Create `apps/frontend/src/hooks/useDetailSheet.ts`:
```typescript
import { useState } from 'react';

export function useDetailSheet<T>() {
  const [selected, setSelected] = useState<T | null>(null);

  return {
    selected,
    isOpen: selected !== null,
    open: (item: T) => setSelected(item),
    close: () => setSelected(null),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- useDetailSheet
```

Expected:
```
✓ src/hooks/useDetailSheet.test.ts (4)
Tests  4 passed (4)
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useDetailSheet.ts apps/frontend/src/hooks/useDetailSheet.test.ts
git commit -m "feat(hooks): add useDetailSheet for selected-item sheet state"
```

---

## Task 3: `useFormDialog<T>`

**Files:**
- Create: `apps/frontend/src/hooks/useFormDialog.ts`
- Test: `apps/frontend/src/hooks/useFormDialog.test.ts`

**Interfaces:**
- Produces:
  ```typescript
  function useFormDialog<T extends Record<string, unknown>>(defaultForm: T): {
    isOpen: boolean;
    openDialog: (prefill?: Partial<T>) => void;
    closeDialog: () => void;
    form: T;
    setForm: Dispatch<SetStateAction<T>>;
    setField: (key: keyof T) => (value: string) => void;
    reset: () => void;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/useFormDialog.test.ts`:
```typescript
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useFormDialog } from './useFormDialog';

const DEFAULT_FORM = { title: '', status: '', notes: '' };

describe('useFormDialog', () => {
  it('starts closed with default form', () => {
    const { result } = renderHook(() => useFormDialog(DEFAULT_FORM));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.form).toEqual(DEFAULT_FORM);
  });

  it('openDialog() opens dialog', () => {
    const { result } = renderHook(() => useFormDialog(DEFAULT_FORM));
    act(() => result.current.openDialog());
    expect(result.current.isOpen).toBe(true);
  });

  it('openDialog(prefill) merges prefill into form', () => {
    const { result } = renderHook(() => useFormDialog(DEFAULT_FORM));
    act(() => result.current.openDialog({ title: 'Hello', status: 'ACTIVE' }));
    expect(result.current.form.title).toBe('Hello');
    expect(result.current.form.status).toBe('ACTIVE');
    expect(result.current.form.notes).toBe('');
  });

  it('setField(key)(value) updates that field', () => {
    const { result } = renderHook(() => useFormDialog(DEFAULT_FORM));
    act(() => result.current.setField('title')('New Title'));
    expect(result.current.form.title).toBe('New Title');
    expect(result.current.form.status).toBe('');
  });

  it('closeDialog() closes and resets form to default', () => {
    const { result } = renderHook(() => useFormDialog(DEFAULT_FORM));
    act(() => result.current.openDialog({ title: 'Changed' }));
    act(() => result.current.closeDialog());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.form).toEqual(DEFAULT_FORM);
  });

  it('reset() restores form to default without closing', () => {
    const { result } = renderHook(() => useFormDialog(DEFAULT_FORM));
    act(() => result.current.openDialog({ title: 'Changed' }));
    act(() => result.current.reset());
    expect(result.current.isOpen).toBe(true);
    expect(result.current.form).toEqual(DEFAULT_FORM);
  });

  it('setForm allows bulk update', () => {
    const { result } = renderHook(() => useFormDialog(DEFAULT_FORM));
    act(() => result.current.setForm({ title: 'X', status: 'Y', notes: 'Z' }));
    expect(result.current.form).toEqual({ title: 'X', status: 'Y', notes: 'Z' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- useFormDialog
```

Expected: FAIL — `Cannot find module './useFormDialog'`

- [ ] **Step 3: Implement useFormDialog**

Create `apps/frontend/src/hooks/useFormDialog.ts`:
```typescript
import { useState, useCallback, Dispatch, SetStateAction } from 'react';

export function useFormDialog<T extends Record<string, unknown>>(defaultForm: T) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<T>({ ...defaultForm });

  const reset = useCallback(() => {
    setForm({ ...defaultForm });
  }, [defaultForm]);

  const openDialog = useCallback((prefill?: Partial<T>) => {
    if (prefill) setForm(prev => ({ ...prev, ...prefill }));
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    reset();
  }, [reset]);

  const setField = useCallback(
    (key: keyof T) => (value: string) =>
      setForm(prev => ({ ...prev, [key]: value })),
    []
  );

  return {
    isOpen,
    openDialog,
    closeDialog,
    form,
    setForm: setForm as Dispatch<SetStateAction<T>>,
    setField,
    reset,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- useFormDialog
```

Expected:
```
✓ src/hooks/useFormDialog.test.ts (7)
Tests  7 passed (7)
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useFormDialog.ts apps/frontend/src/hooks/useFormDialog.test.ts
git commit -m "feat(hooks): add useFormDialog for dialog open/form/reset state"
```

---

## Task 4: `usePermission`

**Files:**
- Create: `apps/frontend/src/hooks/usePermission.ts`
- Test: `apps/frontend/src/hooks/usePermission.test.ts`

**Interfaces:**
- Consumes: `useAuthStore` from `@/store/auth.store`, `Role` from `@/types`
- Produces:
  ```typescript
  function usePermission(): {
    user: User | null;
    role: Role | undefined;
    isAdmin: boolean;
    isManager: boolean;
    isStaff: boolean;
    isTenant: boolean;
    hasRole: (roles: Role[]) => boolean;
  }
  ```

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/usePermission.test.ts`:
```typescript
import { renderHook } from '@testing-library/react';
import { afterEach, describe, it, expect } from 'vitest';
import { usePermission } from './usePermission';
import { useAuthStore } from '@/store/auth.store';
import type { User } from '@/types';

const makeUser = (role: User['role']): User => ({
  id: '1',
  email: 'test@test.com',
  fullName: 'Test',
  role,
  isActive: true,
});

describe('usePermission', () => {
  afterEach(() => useAuthStore.setState({ user: null }));

  it('returns null user when not authenticated', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.user).toBeNull();
    expect(result.current.role).toBeUndefined();
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isStaff).toBe(false);
    expect(result.current.isTenant).toBe(false);
  });

  it('isTenant true for TENANT role', () => {
    useAuthStore.setState({ user: makeUser('TENANT') });
    const { result } = renderHook(() => usePermission());
    expect(result.current.isTenant).toBe(true);
    expect(result.current.isStaff).toBe(false);
    expect(result.current.isAdmin).toBe(false);
  });

  it('isAdmin true for ADMIN role', () => {
    useAuthStore.setState({ user: makeUser('ADMIN') });
    const { result } = renderHook(() => usePermission());
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isStaff).toBe(true);
    expect(result.current.isTenant).toBe(false);
  });

  it('isManager true for LEASING_MANAGER role', () => {
    useAuthStore.setState({ user: makeUser('LEASING_MANAGER') });
    const { result } = renderHook(() => usePermission());
    expect(result.current.isManager).toBe(true);
    expect(result.current.isStaff).toBe(true);
  });

  it('isStaff true for all non-TENANT roles', () => {
    const nonTenantRoles: User['role'][] = [
      'ADMIN', 'LEASING_EXECUTIVE', 'LEASING_MANAGER',
      'MALL_DIRECTOR', 'FINANCE', 'LEGAL', 'OPERATION', 'CEO',
    ];
    nonTenantRoles.forEach(role => {
      useAuthStore.setState({ user: makeUser(role) });
      const { result } = renderHook(() => usePermission());
      expect(result.current.isStaff).toBe(true);
    });
  });

  it('hasRole returns true when role matches', () => {
    useAuthStore.setState({ user: makeUser('FINANCE') });
    const { result } = renderHook(() => usePermission());
    expect(result.current.hasRole(['FINANCE', 'ADMIN'])).toBe(true);
    expect(result.current.hasRole(['TENANT', 'ADMIN'])).toBe(false);
  });

  it('hasRole returns false when no user', () => {
    const { result } = renderHook(() => usePermission());
    expect(result.current.hasRole(['ADMIN'])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- usePermission
```

Expected: FAIL — `Cannot find module './usePermission'`

- [ ] **Step 3: Implement usePermission**

Create `apps/frontend/src/hooks/usePermission.ts`:
```typescript
import { useAuthStore } from '@/store/auth.store';
import type { Role } from '@/types';

export function usePermission() {
  const user = useAuthStore(s => s.user);
  const role = user?.role;

  return {
    user,
    role,
    isAdmin: role === 'ADMIN',
    isManager: role === 'LEASING_MANAGER',
    isStaff: !!role && role !== 'TENANT',
    isTenant: role === 'TENANT',
    hasRole: (roles: Role[]) => !!role && roles.includes(role),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- usePermission
```

Expected:
```
✓ src/hooks/usePermission.test.ts (7)
Tests  7 passed (7)
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/usePermission.ts apps/frontend/src/hooks/usePermission.test.ts
git commit -m "feat(hooks): add usePermission for role-based flag checks"
```

---

## Task 5: `useFilters<T>`

**Files:**
- Create: `apps/frontend/src/hooks/useFilters.ts`
- Test: `apps/frontend/src/hooks/useFilters.test.tsx`

**Interfaces:**
- Consumes: `useSearchParams` from `react-router-dom`
- Produces:
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

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/useFilters.test.tsx`:
```tsx
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { useFilters } from './useFilters';
import type { ReactNode } from 'react';

const EMPTY = { search: '', status: '', category: '' };

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
);

describe('useFilters', () => {
  it('starts with empty draft and applied', () => {
    const { result } = renderHook(() => useFilters(EMPTY), { wrapper });
    expect(result.current.draft).toEqual(EMPTY);
    expect(result.current.applied).toEqual(EMPTY);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasApplied).toBe(false);
  });

  it('setDraft updates draft but not applied', () => {
    const { result } = renderHook(() => useFilters(EMPTY), { wrapper });
    act(() => result.current.setDraft('search', 'hello'));
    expect(result.current.draft.search).toBe('hello');
    expect(result.current.applied.search).toBe('');
    expect(result.current.isDirty).toBe(true);
  });

  it('apply() commits draft to applied (URL)', () => {
    const { result } = renderHook(() => useFilters(EMPTY), { wrapper });
    act(() => result.current.setDraft('search', 'hello'));
    act(() => result.current.apply());
    expect(result.current.applied.search).toBe('hello');
    expect(result.current.isDirty).toBe(false);
  });

  it('hasApplied is true after apply with non-empty value', () => {
    const { result } = renderHook(() => useFilters(EMPTY), { wrapper });
    act(() => result.current.setDraft('status', 'ACTIVE'));
    act(() => result.current.apply());
    expect(result.current.hasApplied).toBe(true);
  });

  it('clear() resets both draft and applied', () => {
    const { result } = renderHook(() => useFilters(EMPTY), { wrapper });
    act(() => result.current.setDraft('search', 'hello'));
    act(() => result.current.apply());
    act(() => result.current.clear());
    expect(result.current.draft).toEqual(EMPTY);
    expect(result.current.applied).toEqual(EMPTY);
    expect(result.current.isDirty).toBe(false);
    expect(result.current.hasApplied).toBe(false);
  });

  it('setDraft with empty string is valid', () => {
    const { result } = renderHook(() => useFilters(EMPTY), { wrapper });
    act(() => result.current.setDraft('search', 'hello'));
    act(() => result.current.setDraft('search', ''));
    expect(result.current.draft.search).toBe('');
    expect(result.current.isDirty).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- useFilters
```

Expected: FAIL — `Cannot find module './useFilters'`

- [ ] **Step 3: Implement useFilters**

Create `apps/frontend/src/hooks/useFilters.ts`:
```typescript
import { useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

export function useFilters<T extends Record<string, string>>(emptyFilters: T) {
  // Stable key list — doesn't change between renders
  const keysRef = useRef(Object.keys(emptyFilters) as (keyof T & string)[]);
  const keys = keysRef.current;

  const [searchParams, setSearchParams] = useSearchParams();

  // applied always derived from current URL params
  const applied = useMemo<T>(() => {
    return keys.reduce((acc, key) => {
      acc[key] = (searchParams.get(key) ?? '') as T[typeof key];
      return acc;
    }, {} as T);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // draft is local state, initialized from URL on mount
  const [draft, setDraftState] = useState<T>(() =>
    keys.reduce((acc, key) => {
      acc[key] = (searchParams.get(key) ?? '') as T[typeof key];
      return acc;
    }, {} as T)
  );

  const setDraft = useCallback((key: keyof T, value: string) => {
    setDraftState(prev => ({ ...prev, [key]: value }));
  }, []);

  const apply = useCallback(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      keys.forEach(key => {
        const val = draft[key as string];
        if (val) next.set(key, val);
        else next.delete(key);
      });
      return next;
    }, { replace: true });
  }, [draft, keys, setSearchParams]);

  const clear = useCallback(() => {
    setDraftState({ ...emptyFilters });
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      keys.forEach(key => next.delete(key));
      return next;
    }, { replace: true });
  }, [emptyFilters, keys, setSearchParams]);

  const isDirty = keys.some(key => draft[key as string] !== applied[key as string]);
  const hasApplied = keys.some(key => !!applied[key as string]);

  return { draft, setDraft, applied, apply, clear, isDirty, hasApplied };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- useFilters
```

Expected:
```
✓ src/hooks/useFilters.test.tsx (6)
Tests  6 passed (6)
```

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/hooks/useFilters.ts apps/frontend/src/hooks/useFilters.test.tsx
git commit -m "feat(hooks): add useFilters with URL-synced draft/applied filter state"
```

---

## Task 6: `useCRUD`

**Files:**
- Create: `apps/frontend/src/hooks/useCRUD.ts`
- Test: `apps/frontend/src/hooks/useCRUD.test.tsx`

**Interfaces:**
- Consumes: `useQuery`, `useMutation`, `useQueryClient` from `@tanstack/react-query`; `useToast` from `@/components/ui/use-toast`
- Produces:
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

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/hooks/useCRUD.test.tsx`:
```tsx
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { ReactNode } from 'react';
import { useCRUD } from './useCRUD';

const mockToast = vi.fn();
vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

const makeWrapper = () => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
};

describe('useCRUD', () => {
  beforeEach(() => mockToast.mockClear());

  it('fetches data via queryFn', async () => {
    const queryFn = vi.fn().mockResolvedValue([{ id: '1', name: 'Item' }]);
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toEqual([{ id: '1', name: 'Item' }]);
  });

  it('create.mutateAsync calls createFn and shows success toast', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const createFn = vi.fn().mockResolvedValue({ id: '2' });
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, createFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => result.current.create.mutateAsync({ name: 'New' } as unknown));
    expect(createFn).toHaveBeenCalledWith({ name: 'New' });
    expect(mockToast).toHaveBeenCalledWith({ title: 'Mục đã được tạo' });
  });

  it('update.mutateAsync calls updateFn and shows success toast', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const updateFn = vi.fn().mockResolvedValue({});
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, updateFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () =>
      result.current.update.mutateAsync({ id: '1', data: { name: 'Updated' } as unknown })
    );
    expect(updateFn).toHaveBeenCalledWith({ id: '1', data: { name: 'Updated' } });
    expect(mockToast).toHaveBeenCalledWith({ title: 'Mục đã được cập nhật' });
  });

  it('remove.mutateAsync calls deleteFn and shows success toast', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const deleteFn = vi.fn().mockResolvedValue(undefined);
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, deleteFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => result.current.remove.mutateAsync('1'));
    expect(deleteFn).toHaveBeenCalledWith('1');
    expect(mockToast).toHaveBeenCalledWith({ title: 'Mục đã được xóa' });
  });

  it('shows destructive toast on createFn error', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const createFn = vi.fn().mockRejectedValue({
      response: { data: { message: 'Tên bị trùng' } },
    });
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, createFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      try { await result.current.create.mutateAsync({} as unknown); } catch { /* expected */ }
    });
    expect(mockToast).toHaveBeenCalledWith({ title: 'Tên bị trùng', variant: 'destructive' });
  });

  it('falls back to generic error message when response has no message', async () => {
    const queryFn = vi.fn().mockResolvedValue([]);
    const createFn = vi.fn().mockRejectedValue(new Error('Network error'));
    const { result } = renderHook(
      () => useCRUD({ queryKey: ['items'], queryFn, createFn, entityLabel: 'Mục' }),
      { wrapper: makeWrapper() }
    );
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    await act(async () => {
      try { await result.current.create.mutateAsync({} as unknown); } catch { /* expected */ }
    });
    expect(mockToast).toHaveBeenCalledWith({ title: 'Đã xảy ra lỗi', variant: 'destructive' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- useCRUD
```

Expected: FAIL — `Cannot find module './useCRUD'`

- [ ] **Step 3: Implement useCRUD**

Create `apps/frontend/src/hooks/useCRUD.ts`:
```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/components/ui/use-toast';

interface UseCRUDOptions<TData, TCreate, TUpdate> {
  queryKey: unknown[];
  queryFn: () => Promise<TData>;
  createFn?: (data: TCreate) => Promise<unknown>;
  updateFn?: (payload: { id: string; data: TUpdate }) => Promise<unknown>;
  deleteFn?: (id: string) => Promise<unknown>;
  entityLabel: string;
}

export function useCRUD<TData, TCreate = unknown, TUpdate = unknown>(
  options: UseCRUDOptions<TData, TCreate, TUpdate>
) {
  const { queryKey, queryFn, createFn, updateFn, deleteFn, entityLabel } = options;
  const qc = useQueryClient();
  const { toast } = useToast();

  const invalidate = () => qc.invalidateQueries({ queryKey: [queryKey[0]] });

  const onError = (e: unknown) => {
    const msg = (e as { response?: { data?: { message?: string } } })
      ?.response?.data?.message ?? 'Đã xảy ra lỗi';
    toast({ title: msg, variant: 'destructive' });
  };

  const { data, isLoading } = useQuery({ queryKey, queryFn });

  const create = useMutation<unknown, unknown, TCreate>({
    mutationFn: (data: TCreate) => createFn ? createFn(data) : Promise.resolve(),
    onSuccess: () => { invalidate(); toast({ title: `${entityLabel} đã được tạo` }); },
    onError,
  });

  const update = useMutation<unknown, unknown, { id: string; data: TUpdate }>({
    mutationFn: (payload) => updateFn ? updateFn(payload) : Promise.resolve(),
    onSuccess: () => { invalidate(); toast({ title: `${entityLabel} đã được cập nhật` }); },
    onError,
  });

  const remove = useMutation<unknown, unknown, string>({
    mutationFn: (id: string) => deleteFn ? deleteFn(id) : Promise.resolve(),
    onSuccess: () => { invalidate(); toast({ title: `${entityLabel} đã được xóa` }); },
    onError,
  });

  return { data, isLoading, create, update, remove };
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm run test -- useCRUD
```

Expected:
```
✓ src/hooks/useCRUD.test.tsx (6)
Tests  6 passed (6)
```

- [ ] **Step 5: Run full test suite**

```bash
npm run test
```

Expected: all hook tests pass (25+ tests total across 5 suites).

- [ ] **Step 6: Verify TypeScript compiles cleanly**

```bash
npm run build
```

Expected: no TypeScript errors, build succeeds.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/hooks/useCRUD.ts apps/frontend/src/hooks/useCRUD.test.tsx
git commit -m "feat(hooks): add useCRUD with query, mutations, invalidation, and toast"
```

---

## Self-Review Checklist

- [x] **Spec coverage:** All 5 hooks from spec implemented — `useFilters`, `useCRUD`, `useDetailSheet`, `useFormDialog`, `usePermission`
- [x] **URL sync:** `useFilters` uses `useSearchParams` — consistent with `useSpacesFilters`
- [x] **Type consistency:** `Role` from `@/types`, not `AppRole` from `@/lib/permissions` (they are identical unions, but `@/types` is what `useAuthStore` exposes via `User.role`)
- [x] **No placeholders:** All steps have complete code
- [x] **TDD order:** Test written → run to fail → implement → run to pass for each hook
- [x] **Migration not included:** Per spec, migration is page-by-page and opportunistic — out of scope for this plan
