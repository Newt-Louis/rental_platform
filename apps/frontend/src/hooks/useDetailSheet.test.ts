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
