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
