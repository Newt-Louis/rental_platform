# Lead Assignee Auto-fill & Lock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the "Tạo Lead/Khách hàng" dialog, the "Phụ trách" (assignee) field auto-fills with the creating account, and is locked to self for `LEASING_EXECUTIVE` accounts.

**Architecture:** Pure frontend change in `UnifiedAddDialog` (`apps/frontend/src/pages/crm/CrmPage.tsx`). Read the logged-in user from `useAuthStore`, default `assignedToId` state to `user.id`, and conditionally render a locked static display instead of the `<select>` when `user.role === 'LEASING_EXECUTIVE'`. No backend/API changes.

**Tech Stack:** React, TypeScript, Zustand (`useAuthStore`), react-i18next, Vitest + Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-21-lead-assignee-autofill-design.md`.
- Applies to both Lead mode and Customer mode of `UnifiedAddDialog` (shared "Phụ trách" field) — per spec's "Mục tiêu" section.
- Does NOT touch `LeadEditDialog` (`apps/frontend/src/components/crm/LeadEditDialog.tsx`) — out of scope per spec.
- Does NOT change `createLead`/`createCustomer` API payload shape — only the default value and editability of `assignedToId`.
- Locked-role check uses the literal string `'LEASING_EXECUTIVE'` (matches existing codebase convention in `apps/frontend/src/lib/permissions.ts` — no shared `Role` enum imported on the frontend).

---

### Task 1: Auto-fill and lock the "Phụ trách" field in `UnifiedAddDialog`

**Files:**
- Modify: `apps/frontend/src/pages/crm/CrmPage.tsx:197` (function signature — add `export`), `:216` (assignee state init), `:387-393` (field render)
- Modify: `apps/frontend/src/locales/vi/crm.json:512` (insert new key after `fieldAssigneeNone`)
- Modify: `apps/frontend/src/locales/en/crm.json:512` (insert new key after `fieldAssigneeNone`)
- Test: `apps/frontend/src/pages/crm/UnifiedAddDialog.test.tsx` (new)

**Interfaces:**
- Consumes: `useAuthStore` from `@/store/auth.store` (already used elsewhere in the codebase; hook returns `{ user: User | null, ... }`, `User.id: string`, `User.fullName: string`, `User.role: string`, per `apps/frontend/src/types/index.ts:15-26`).
- Produces: `UnifiedAddDialog` becomes a named export of `CrmPage.tsx` (in addition to the existing default export `CrmPage`), importable as `import { UnifiedAddDialog } from '@/pages/crm/CrmPage'`. Its props stay unchanged: `{ open: boolean; onClose: () => void }`.

- [ ] **Step 1: Write the failing test file**

Create `apps/frontend/src/pages/crm/UnifiedAddDialog.test.tsx`:

```tsx
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UnifiedAddDialog } from './CrmPage';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockCreateLead = vi.fn();
const mockCreateCustomer = vi.fn();
const mockListUsers = vi.fn();
const mockGetOptions = vi.fn();
const mockToast = vi.fn();

const SELF_USER = { id: 'user-le-1', fullName: 'Trần Executive', role: 'LEASING_EXECUTIVE' };
const OTHER_USER = { id: 'user-2', fullName: 'Lê Manager', role: 'LEASING_MANAGER' };

let mockAuthUser: any = SELF_USER;

vi.mock('@/api', () => ({
  crmApi: { createLead: (...args: any[]) => mockCreateLead(...args) },
  customersApi: { createCustomer: (...args: any[]) => mockCreateCustomer(...args) },
  usersApi: { listUsers: (...args: any[]) => mockListUsers(...args) },
  categoriesApi: { getOptions: (...args: any[]) => mockGetOptions(...args) },
}));

vi.mock('@/components/ui/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/store/auth.store', () => ({
  useAuthStore: () => ({ user: mockAuthUser }),
}));

vi.mock('@/store/mall.store', () => ({
  useMallStore: () => ({ selectedMallId: 'mall-1' }),
}));

vi.mock('@tanstack/react-query', async (importActual) => {
  const actual = await importActual<typeof import('@tanstack/react-query')>();
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: vi.fn() }),
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mockListUsers.mockResolvedValue({ data: [SELF_USER, OTHER_USER] });
  mockGetOptions.mockResolvedValue([]);
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderDialog() {
  const onClose = vi.fn();
  render(<UnifiedAddDialog open={true} onClose={onClose} />, { wrapper: Wrapper });
  return { onClose };
}

// UnifiedAddDialog uses react-i18next's t() for all labels/placeholders, and no
// i18next instance is initialized in the test environment (consistent with the
// rest of this codebase's tests — see LeadEditDialog.test.tsx), so t() falls
// back to returning the raw key. Locate text-type inputs by DOM order/role
// instead of by translated placeholder text: in Lead mode the first two
// textboxes are always [brandName, contactName].
function getBrandAndContactInputs() {
  const textboxes = screen.getAllByRole('textbox');
  return { brandInput: textboxes[0], contactInput: textboxes[1] };
}

// ── Tests: LEASING_EXECUTIVE (locked) ───────────────────────────────────────────

describe('UnifiedAddDialog — assignee field, LEASING_EXECUTIVE', () => {
  beforeEach(() => {
    mockAuthUser = SELF_USER;
  });

  it('hides the assignee dropdown and shows own name as static text', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByText(SELF_USER.fullName)).toBeInTheDocument();
    });
    // The other user must never appear as a selectable option
    expect(screen.queryByRole('option', { name: OTHER_USER.fullName })).not.toBeInTheDocument();
  });

  it('submits createLead with assignedToId = own id, without letting it be changed', async () => {
    mockCreateLead.mockResolvedValue({ id: 'lead-new' });
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => screen.getByText(SELF_USER.fullName));
    const { brandInput, contactInput } = getBrandAndContactInputs();
    await user.type(brandInput, 'Highlands');
    await user.type(contactInput, 'Nguyen Van A');

    await user.click(screen.getByRole('button', { name: /addToPipeline|Thêm vào Pipeline/ }));

    await waitFor(() => {
      expect(mockCreateLead).toHaveBeenCalledWith(
        expect.objectContaining({ assignedToId: SELF_USER.id }),
      );
    });
  });
});

// ── Tests: other roles (editable, defaulted to self) ────────────────────────────

describe('UnifiedAddDialog — assignee field, non-Leasing-Executive role', () => {
  beforeEach(() => {
    mockAuthUser = OTHER_USER;
  });

  it('shows the assignee dropdown pre-selected to self', async () => {
    renderDialog();
    await waitFor(() => {
      expect(screen.getByRole('option', { name: OTHER_USER.fullName })).toBeInTheDocument();
    });
    const select = screen.getByRole('option', { name: OTHER_USER.fullName }).closest('select');
    expect(select).toHaveValue(OTHER_USER.id);
  });

  it('allows picking a different user', async () => {
    const user = userEvent.setup();
    renderDialog();

    await waitFor(() => screen.getByRole('option', { name: SELF_USER.fullName }));
    const select = screen.getByRole('option', { name: SELF_USER.fullName }).closest('select')!;
    await user.selectOptions(select, SELF_USER.id);

    expect(select).toHaveValue(SELF_USER.id);
  });
});
```

- [ ] **Step 2: Run the test suite to verify it fails**

Run: `cd apps/frontend && npx vitest run src/pages/crm/UnifiedAddDialog.test.tsx`
Expected: FAIL — `UnifiedAddDialog` is not an exported member of `./CrmPage` (Step 1's import fails), and even once import is fixed, the "own name as static text" and "pre-selected to self" assertions fail because the current code always inits `assignedToId` to `''` and always renders the `<select>`.

- [ ] **Step 3: Export `UnifiedAddDialog` and default the assignee to self**

In `apps/frontend/src/pages/crm/CrmPage.tsx`, change the function declaration at line 197:

```ts
function UnifiedAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
```
to:
```ts
export function UnifiedAddDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
```

`CrmPage.tsx` already imports `useAuthStore` at line 20 (`import { useAuthStore } from '@/store/auth.store';`, used elsewhere in the file by the main `CrmPage` component) — no new import needed.

Inside `UnifiedAddDialog`, right after the `const { selectedMallId } = useMallStore();` line (currently line 201), add:

```ts
const { user } = useAuthStore();
const isSelfOnlyAssignee = user?.role === 'LEASING_EXECUTIVE';
```

Change the `assignedToId` state init (currently line 216):

```ts
const [assignedToId, setAssignedToId] = useState('');
```
to:
```ts
const [assignedToId, setAssignedToId] = useState(user?.id ?? '');
```

- [ ] **Step 4: Render the locked static display for `LEASING_EXECUTIVE`**

Replace the assignee field block (currently lines 387-393):

```tsx
            <div>
              <Label className="text-xs">{t('addDialog.fieldAssignee')}</Label>
              <select className="w-full border rounded-md h-9 px-2 text-sm mt-1" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
                <option value="">{t('addDialog.fieldAssigneeNone')}</option>
                {users.map((u: any) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
              </select>
            </div>
```

with:

```tsx
            <div>
              <Label className="text-xs">{t('addDialog.fieldAssignee')}</Label>
              {isSelfOnlyAssignee ? (
                <div className="mt-1 h-9 flex items-center px-3 text-sm rounded-md border border-gray-200 bg-gray-50 text-gray-600">
                  {user?.fullName}
                  <span className="ml-1 text-gray-400">({t('addDialog.fieldAssigneeSelfHint')})</span>
                </div>
              ) : (
                <select className="w-full border rounded-md h-9 px-2 text-sm mt-1" value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)}>
                  <option value="">{t('addDialog.fieldAssigneeNone')}</option>
                  {users.map((u: any) => <option key={u.id} value={u.id}>{u.fullName}</option>)}
                </select>
              )}
            </div>
```

- [ ] **Step 5: Add the new i18n key**

In `apps/frontend/src/locales/vi/crm.json`, right after line 512 (`"fieldAssigneeNone": "— Chưa phân công —",`), add:

```json
    "fieldAssigneeSelfHint": "bạn",
```

In `apps/frontend/src/locales/en/crm.json`, right after line 512 (`"fieldAssigneeNone": "— Unassigned —",`), add:

```json
    "fieldAssigneeSelfHint": "you",
```

(Keep valid JSON — comma placement follows the existing key before it, since more keys follow in both files.)

- [ ] **Step 6: Run the test suite to verify it passes**

Run: `cd apps/frontend && npx vitest run src/pages/crm/UnifiedAddDialog.test.tsx`
Expected: PASS — all 4 tests green.

- [ ] **Step 7: Run the full frontend test suite to check for regressions**

Run: `cd apps/frontend && npx vitest run`
Expected: PASS — no existing test broken by the `export` keyword addition or the JSON key insertions (JSON files must remain valid; a syntax error here would break every test that loads `crm.json` through i18n, though none currently do per the codebase's uninitialized-i18n-in-tests pattern — this run is the safety net).

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/crm/CrmPage.tsx apps/frontend/src/pages/crm/UnifiedAddDialog.test.tsx apps/frontend/src/locales/vi/crm.json apps/frontend/src/locales/en/crm.json
git commit -m "feat(crm): auto-fill and lock lead assignee field for Leasing Executive"
```

---

## Manual verification (post-implementation)

Per spec's "Kiểm thử" section, after the automated tests pass, manually verify in the browser:
- Log in as a `LEASING_EXECUTIVE` account → open "Tạo Lead" and "Đăng ký Khách hàng" modes of the Add dialog → confirm the assignee field shows static text with own name, no dropdown.
- Log in as a different role (e.g. `LEASING_MANAGER`) → confirm the dropdown appears, pre-selected to self, and another user can be picked.
- Submit both cases and confirm the created Lead/Customer has the expected `assignedToId`.
