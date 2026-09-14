/**
 * CR-CRM-CATEGORY-MASTER-001 — the CRM category selector.
 *
 * The bug this replaces: the edit dialog's "Ngành hàng" select was driven by a
 * hard-coded `CATEGORY_OPTS` map of codes (FB, FASHION, ...) while leads store
 * Category master names (F&B, Fashion, ...). No stored value matched an option,
 * so the field rendered blank for every lead and saving could overwrite a real
 * category with a code.
 *
 * Covers CRM-CAT-003, 009, 010, 020, 021, 022.
 */
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockGetOptions = vi.fn();
vi.mock('@/api', () => ({
  categoriesApi: { getOptions: (...args: any[]) => mockGetOptions(...args) },
}));

import {
  CategorySelect,
  LEGACY_CATEGORY_VALUE,
  categoryIdForCreate,
  categoryIdForUpdate,
  initialCategoryValue,
} from './CategorySelect';

// Deliberately in the flat, cross-level sortOrder the API actually returns:
// children are NOT adjacent to their parents here.
const MASTER = [
  { id: 'cat-apparel', code: 'FASHION_APPAREL', name: 'Apparel', parentId: 'cat-fashion' },
  { id: 'cat-coffee', code: 'FNB_COFFEE', name: 'Coffee & Tea', parentId: 'cat-fnb' },
  { id: 'cat-fnb', code: 'FNB', name: 'F&B', parentId: null },
  { id: 'cat-fashion', code: 'FASHION', name: 'Fashion', parentId: null },
];

function Wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetOptions.mockResolvedValue(MASTER);
});

describe('CategorySelect', () => {
  // CRM-CAT-020 / CRM-CAT-022
  it('CRM-CAT-020/022 lists the Category master, not a hard-coded list', async () => {
    render(<CategorySelect value="" onChange={vi.fn()} />, { wrapper: Wrapper });

    await waitFor(() => expect(mockGetOptions).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button'));

    expect(await screen.findByText('F&B')).toBeInTheDocument();
    expect(screen.getByText('Fashion')).toBeInTheDocument();
    // The retired hard-coded vocabulary must not appear anywhere.
    expect(screen.queryByText(/🍜/)).not.toBeInTheDocument();
    expect(screen.queryByText('FB')).not.toBeInTheDocument();
  });

  // CRM-CAT-003 — a lead already linked to the master shows its real name.
  it('CRM-CAT-003 shows the linked category for an existing record', async () => {
    render(<CategorySelect value="cat-fashion" onChange={vi.fn()} />, { wrapper: Wrapper });

    await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Fashion'));
  });

  // CRM-CAT-009
  it('CRM-CAT-009 keeps an unmapped legacy value visible', async () => {
    render(
      <CategorySelect
        value={LEGACY_CATEGORY_VALUE}
        onChange={vi.fn()}
        legacyText="Health & Beauty"
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveTextContent('Health & Beauty (Chưa ánh xạ)'),
    );
  });

  it('surfaces a category that has since been deactivated', async () => {
    render(
      <CategorySelect
        value="cat-retired"
        onChange={vi.fn()}
        currentCategory={{ id: 'cat-retired', name: 'Ngành cũ', isActive: false }}
      />,
      { wrapper: Wrapper },
    );

    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveTextContent('Ngành cũ (ngừng sử dụng)'),
    );
  });

  it('reports a chosen master category by id, never by label', async () => {
    const onChange = vi.fn();
    render(<CategorySelect value="" onChange={onChange} />, { wrapper: Wrapper });

    await waitFor(() => expect(mockGetOptions).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button'));
    await userEvent.click(await screen.findByText('F&B'));

    expect(onChange).toHaveBeenCalledWith('cat-fnb');
  });
});

describe('category hierarchy', () => {
  // The flat list the API returns is ordered by sortOrder across every level,
  // so "Apparel" and "Coffee & Tea" used to render detached from their parents
  // with nothing on screen saying what they belong to.
  it('lays the list out parent-first, depth-first', async () => {
    render(<CategorySelect value="" onChange={vi.fn()} />, { wrapper: Wrapper });

    await waitFor(() => expect(mockGetOptions).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button'));

    const rows = await screen.findAllByRole('option');
    // Skip the "no selection" row.
    const labels = rows.slice(1).map((r) => r.textContent ?? '');
    const order = ['F&B', 'Coffee & Tea', 'Fashion', 'Apparel'];
    expect(labels.map((l) => order.find((o) => l.startsWith(o)))).toEqual(order);
  });

  it('indents a child below its parent', async () => {
    render(<CategorySelect value="" onChange={vi.fn()} />, { wrapper: Wrapper });

    await waitFor(() => expect(mockGetOptions).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button'));

    const parent = (await screen.findByText('F&B')).closest('[role="option"]') as HTMLElement;
    const child = (await screen.findByText('Coffee & Tea')).closest('[role="option"]') as HTMLElement;
    expect(parent.style.paddingLeft).toBe('');
    expect(child.style.paddingLeft).toBe('28px');
  });

  it('names the parent so context survives a search that hides it', async () => {
    render(<CategorySelect value="" onChange={vi.fn()} />, { wrapper: Wrapper });

    await waitFor(() => expect(mockGetOptions).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button'));
    await userEvent.type(screen.getByPlaceholderText('Tìm ngành hàng...'), 'Coffee');

    expect(await screen.findByText('Coffee & Tea')).toBeInTheDocument();
    expect(screen.getByText('F&B · FNB_COFFEE')).toBeInTheDocument();
    expect(screen.queryByText('Apparel')).not.toBeInTheDocument();
  });

  it('keeps a category whose parent is inactive visible as a root', async () => {
    mockGetOptions.mockResolvedValue([
      { id: 'cat-orphan', code: 'ORPHAN', name: 'Mồ côi', parentId: 'cat-gone' },
    ]);
    render(<CategorySelect value="" onChange={vi.fn()} />, { wrapper: Wrapper });

    await waitFor(() => expect(mockGetOptions).toHaveBeenCalled());
    await userEvent.click(screen.getByRole('button'));

    expect(await screen.findByText('Mồ côi')).toBeInTheDocument();
  });
});

describe('payload translation', () => {
  // CRM-CAT-010 — the core no-silent-data-loss rule.
  it('CRM-CAT-010 omits categoryId while the record is on unmapped legacy text', () => {
    expect(categoryIdForUpdate(LEGACY_CATEGORY_VALUE)).toBeUndefined();
  });

  it('sends an id when a master category is chosen', () => {
    expect(categoryIdForUpdate('cat-fnb')).toBe('cat-fnb');
  });

  it('sends null only for an explicit clear', () => {
    expect(categoryIdForUpdate('')).toBeNull();
  });

  it('never sends the legacy sentinel on create', () => {
    expect(categoryIdForCreate(LEGACY_CATEGORY_VALUE)).toBeUndefined();
    expect(categoryIdForCreate('')).toBeUndefined();
    expect(categoryIdForCreate('cat-fnb')).toBe('cat-fnb');
  });

  it('derives the initial selector value from the record', () => {
    expect(initialCategoryValue({ categoryId: 'cat-fnb', category: 'F&B' })).toBe('cat-fnb');
    expect(initialCategoryValue({ categoryId: null, category: 'Health & Beauty' })).toBe(
      LEGACY_CATEGORY_VALUE,
    );
    expect(initialCategoryValue({})).toBe('');
  });
});

describe('CRM-CAT-021 — retired hard-coded sources', () => {
  it('CATEGORY_OPTS is no longer exported from the CRM barrel', async () => {
    const mod: Record<string, unknown> = await import('./index');
    expect(mod).not.toHaveProperty('CATEGORY_OPTS');
    expect(mod).toHaveProperty('CategorySelect');
  });

  it('lead-constants no longer defines a category list', async () => {
    const mod: Record<string, unknown> = await import('./lead-constants');
    expect(mod).not.toHaveProperty('CATEGORY_OPTS');
  });
});
