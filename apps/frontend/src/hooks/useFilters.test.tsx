import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { useFilters } from './useFilters';
import type { ReactNode } from 'react';

const EMPTY = { search: '', status: '', category: '' };

const wrapper = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    {children}
  </MemoryRouter>
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
