# Users Mall Access Column Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show which Mall(s) each user has access to as a new column in the Admin Users table (`admin?section=users`).

**Architecture:** Backend includes the `mallAccess` relation (mall id/name + role) in the existing `GET /users` response. Frontend maps each user's role + `mallAccess` array into a display state (`global` / `not-applicable` / `unassigned` / `malls`) via a small pure helper function, then renders it as badges in a new table column.

**Tech Stack:** NestJS + Prisma (backend), React + TanStack Query + Vitest/Testing Library (frontend), Jest (backend tests).

## Global Constraints

- No new filter dropdown, no DTO/query-param changes to `GET /users` — this plan is display-only (per spec's "Ngoài phạm vi").
- Do not change `UserDialog`'s existing mall-access editing UI.
- Follow existing badge styling conventions already used in `AdminPage.tsx` (Tailwind utility classes, `lucide-react` icons, `Badge` component).

---

### Task 1: Backend — include `mallAccess` in `GET /users` response

**Files:**
- Modify: `apps/backend/src/modules/users/users.service.ts:40-52` (the `select` object inside `findAll`)
- Test: `apps/backend/src/modules/users/users.service.spec.ts`

**Interfaces:**
- Produces: `UsersService.findAll()` result rows now include `mallAccess: { role: Role; mall: { id: string; name: string } }[]` (only `isActive: true` grants).

- [ ] **Step 1: Write the failing test**

Add this test inside the existing `describe('UsersService admin safety and listing', ...)` block in `apps/backend/src/modules/users/users.service.spec.ts`, right after the `'applies server-side role, status and search filters'` test (after line 35):

```ts
  it('includes active mall access with mall name for each listed user', async () => {
    prisma.user.findMany.mockResolvedValue([]);
    prisma.user.count.mockResolvedValue(0);

    await service.findAll({ page: 1, limit: 20 });

    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      select: expect.objectContaining({
        mallAccess: {
          where: { isActive: true },
          select: { role: true, mall: { select: { id: true, name: true } } },
        },
      }),
    }));
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/backend`): `npx jest users.service.spec.ts -t "includes active mall access"`
Expected: FAIL — `select` does not contain a `mallAccess` key.

- [ ] **Step 3: Write minimal implementation**

In `apps/backend/src/modules/users/users.service.ts`, update the `select` block inside `findAll` (currently lines 40-52):

```ts
        select: {
          id: true,
          email: true,
          fullName: true,
          role: true,
          phone: true,
          avatar: true,
          department: true,
          tenantId: true,
          isActive: true,
          createdAt: true,
          updatedAt: true,
          mallAccess: {
            where: { isActive: true },
            select: { role: true, mall: { select: { id: true, name: true } } },
          },
        },
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `apps/backend`): `npx jest users.service.spec.ts`
Expected: PASS — all tests in the file, including the new one.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/modules/users/users.service.ts apps/backend/src/modules/users/users.service.spec.ts
git commit -m "feat(users): include mall access in user list response"
```

---

### Task 2: Frontend — `User` type gains `mallAccess`

**Files:**
- Modify: `apps/frontend/src/types/index.ts:15-25`

**Interfaces:**
- Produces: `User.mallAccess?: { role: string; mall: { id: string; name: string } }[]` — consumed by Task 3's helper and Task 4's table cell.

- [ ] **Step 1: Update the `User` interface**

In `apps/frontend/src/types/index.ts`, change:

```ts
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone?: string;
  department?: string;
  avatar?: string;
  isActive: boolean;
  tenantId?: string | null;
}
```

to:

```ts
export interface User {
  id: string;
  email: string;
  fullName: string;
  role: Role;
  phone?: string;
  department?: string;
  avatar?: string;
  isActive: boolean;
  tenantId?: string | null;
  mallAccess?: { role: string; mall: { id: string; name: string } }[];
}
```

- [ ] **Step 2: Verify the frontend still type-checks**

Run (from `apps/frontend`): `npx tsc --noEmit`
Expected: no new type errors (this is a purely additive optional field).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/types/index.ts
git commit -m "feat(users): add mallAccess to User type"
```

---

### Task 3: Frontend — pure `getMallAccessDisplay` helper (TDD)

**Files:**
- Create: `apps/frontend/src/pages/admin/mallAccessDisplay.ts`
- Test: `apps/frontend/src/pages/admin/mallAccessDisplay.test.ts`

**Interfaces:**
- Consumes: `User` from `@/types` (Task 2), specifically `role` and `mallAccess`.
- Produces: `MallAccessDisplay` union type and `getMallAccessDisplay(user)` function, consumed by Task 4's table cell rendering.

```ts
export type MallAccessDisplay =
  | { kind: 'global' }
  | { kind: 'not-applicable' }
  | { kind: 'unassigned' }
  | { kind: 'malls'; malls: { id: string; name: string }[] };
```

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/pages/admin/mallAccessDisplay.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { getMallAccessDisplay } from './mallAccessDisplay';

describe('getMallAccessDisplay', () => {
  it('returns global for ADMIN regardless of mallAccess', () => {
    expect(getMallAccessDisplay({ role: 'ADMIN', mallAccess: [] })).toEqual({ kind: 'global' });
  });

  it('returns global for CEO regardless of mallAccess', () => {
    expect(getMallAccessDisplay({ role: 'CEO' })).toEqual({ kind: 'global' });
  });

  it('returns not-applicable for TENANT', () => {
    expect(getMallAccessDisplay({ role: 'TENANT', mallAccess: [] })).toEqual({ kind: 'not-applicable' });
  });

  it('returns unassigned for a mall-scoped role with no mall access', () => {
    expect(getMallAccessDisplay({ role: 'LEASING_EXECUTIVE', mallAccess: [] })).toEqual({ kind: 'unassigned' });
  });

  it('returns unassigned for a mall-scoped role when mallAccess is undefined', () => {
    expect(getMallAccessDisplay({ role: 'MALL_DIRECTOR' })).toEqual({ kind: 'unassigned' });
  });

  it('returns the mall list for a mall-scoped role with grants', () => {
    const mallAccess = [
      { role: 'LEASING_EXECUTIVE', mall: { id: 'mall-1', name: 'THISO Mall Sala' } },
      { role: 'LEASING_EXECUTIVE', mall: { id: 'mall-2', name: 'THISO Mall Vivo' } },
    ];
    expect(getMallAccessDisplay({ role: 'LEASING_EXECUTIVE', mallAccess })).toEqual({
      kind: 'malls',
      malls: [
        { id: 'mall-1', name: 'THISO Mall Sala' },
        { id: 'mall-2', name: 'THISO Mall Vivo' },
      ],
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `apps/frontend`): `npx vitest run src/pages/admin/mallAccessDisplay.test.ts`
Expected: FAIL — cannot resolve module `./mallAccessDisplay` (file does not exist yet).

- [ ] **Step 3: Write minimal implementation**

Create `apps/frontend/src/pages/admin/mallAccessDisplay.ts`:

```ts
import type { Role, User } from '@/types';

const GLOBAL_ACCESS_ROLES: Role[] = ['ADMIN', 'CEO'];

export type MallAccessDisplay =
  | { kind: 'global' }
  | { kind: 'not-applicable' }
  | { kind: 'unassigned' }
  | { kind: 'malls'; malls: { id: string; name: string }[] };

export function getMallAccessDisplay(
  user: Pick<User, 'role' | 'mallAccess'>,
): MallAccessDisplay {
  if (GLOBAL_ACCESS_ROLES.includes(user.role)) return { kind: 'global' };
  if (user.role === 'TENANT') return { kind: 'not-applicable' };

  const malls = (user.mallAccess ?? []).map((access) => access.mall);
  if (malls.length === 0) return { kind: 'unassigned' };
  return { kind: 'malls', malls };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `apps/frontend`): `npx vitest run src/pages/admin/mallAccessDisplay.test.ts`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/admin/mallAccessDisplay.ts apps/frontend/src/pages/admin/mallAccessDisplay.test.ts
git commit -m "feat(users): add getMallAccessDisplay helper"
```

---

### Task 4: Frontend — render the "Quyền truy cập Mall" column in `UsersTab`

**Files:**
- Modify: `apps/frontend/src/pages/admin/AdminPage.tsx`

**Interfaces:**
- Consumes: `getMallAccessDisplay` and `MallAccessDisplay` from `./mallAccessDisplay` (Task 3); `User.mallAccess` (Task 2).

- [ ] **Step 1: Import the helper**

In `apps/frontend/src/pages/admin/AdminPage.tsx`, add this import near the other local imports (after line 24, `import { MallAccessTab } from './MallAccessTab';`):

```ts
import { getMallAccessDisplay } from './mallAccessDisplay';
```

- [ ] **Step 2: Add a small presentational cell component**

Add this component right before `function UsersTab() {` (currently line 344), i.e. directly after the `MALL_ACCESS_ROLES` constant (line 342):

```tsx
function MallAccessCell({ user }: { user: User }) {
  const display = getMallAccessDisplay(user);

  if (display.kind === 'global') {
    return <Badge className="bg-purple-100 text-purple-700 border-0 text-xs">Toàn hệ thống</Badge>;
  }
  if (display.kind === 'not-applicable') {
    return <span className="text-gray-300 text-xs">—</span>;
  }
  if (display.kind === 'unassigned') {
    return <span className="text-gray-400 text-xs">Chưa gán</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {display.malls.map((m) => (
        <span key={m.id} className="flex items-center gap-1 px-2 py-0.5 rounded-md border border-blue-100 bg-blue-50 text-blue-700 text-xs">
          <Building2 size={10} />{m.name}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Add the table header cell**

In the `<thead>` of `UsersTab` (currently lines 439-447), insert a new `<th>` between "Vai trò" and "Trạng thái":

```tsx
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Họ tên</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Email</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Phòng ban</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Vai trò</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Quyền truy cập Mall</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">Trạng thái</th>
                <th className="px-4 py-3 w-36" />
              </tr>
```

- [ ] **Step 4: Add the table body cell**

In the row rendering inside `<tbody>` (currently lines 450-487), insert a new `<td>` between the Vai trò cell and the Trạng thái cell:

```tsx
                    <td className="px-4 py-3"><Badge className={`${roleInfo.color} border-0 text-xs`}>{roleInfo.label}</Badge></td>
                    <td className="px-4 py-3"><MallAccessCell user={u} /></td>
                    <td className="px-4 py-3">
```

- [ ] **Step 5: Type-check**

Run (from `apps/frontend`): `npx tsc --noEmit`
Expected: no type errors.

- [ ] **Step 6: Manual verification in the browser**

Start the app per the project's usual dev workflow, log in as an ADMIN, and open `admin?section=users`. Confirm:
- An ADMIN and a CEO row show a purple "Toàn hệ thống" badge.
- A TENANT row shows "—".
- A `MALL_ACCESS_ROLES` user (e.g. `LEASING_EXECUTIVE`) with no mall grants shows "Chưa gán".
- A `MALL_ACCESS_ROLES` user with one or more `UserMallAccess` grants shows one badge per mall with the mall name.
- Existing columns (Họ tên, Email, Phòng ban, Vai trò, Trạng thái) and row actions (edit/reset password/lock/delete) are unaffected.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/admin/AdminPage.tsx
git commit -m "feat(users): show mall access column in Users table"
```

---

## Self-Review Notes

- **Spec coverage:** Backend `select` change → Task 1. `User` type → Task 2. Display logic (global/not-applicable/unassigned/malls per role) → Task 3. Column placement (between Vai trò and Trạng thái) and badge rendering → Task 4. Out-of-scope items (no new filter, no DTO change, no `UserDialog` change) are respected — no task touches `ListUsersDto`, the controller, or `UserDialog`.
- **Type consistency:** `mallAccess` shape (`{ role: string; mall: { id: string; name: string } }[]`) is identical across the backend `select` (Task 1), the `User` type (Task 2), the helper's input (Task 3), and `MallAccessCell`'s consumption via `getMallAccessDisplay(user)` (Task 4).
- **No placeholders:** every step includes literal, complete code and exact commands with expected results.
