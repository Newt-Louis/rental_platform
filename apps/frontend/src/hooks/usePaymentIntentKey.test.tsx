import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { usePaymentIntentKey } from './usePaymentIntentKey';

/**
 * PAY-001 / PAY-03 — one idempotency key per payment INTENT.
 *
 * The defect this guards: both payment dialogs are rendered unconditionally by
 * their parent (they merely return `null`, or take an `open` prop), so they
 * never unmount. A plain `useState(() => randomUUID())` therefore produced ONE
 * key per page load — reused across invoices — rather than one per intent.
 */
describe('usePaymentIntentKey', () => {
  it('T1: returns a key as soon as an intent opens', () => {
    const { result } = renderHook(() => usePaymentIntentKey('inv-1', true));
    expect(result.current).toBeTruthy();
    expect(typeof result.current).toBe('string');
  });

  it('T2/T3: stays stable across re-renders — a retry reuses the same key', () => {
    const { result, rerender } = renderHook(
      ({ id, open }) => usePaymentIntentKey(id, open),
      { initialProps: { id: 'inv-1', open: true } },
    );
    const first = result.current;

    // Re-render repeatedly, as a submit / retry / in-flight state change would.
    rerender({ id: 'inv-1', open: true });
    rerender({ id: 'inv-1', open: true });
    rerender({ id: 'inv-1', open: true });

    expect(result.current).toBe(first);
  });

  it('T4: closing and reopening for the SAME invoice starts a new intent', () => {
    const { result, rerender } = renderHook(
      ({ id, open }) => usePaymentIntentKey(id, open),
      { initialProps: { id: 'inv-1', open: true } },
    );
    const first = result.current;

    rerender({ id: 'inv-1', open: false });
    rerender({ id: 'inv-1', open: true });

    // A second genuine payment against the same invoice must not reuse the key
    // of the first — the backend would reject it as a payload conflict.
    expect(result.current).not.toBe(first);
  });

  it('T5: changing invoice while open starts a new intent', () => {
    const { result, rerender } = renderHook(
      ({ id, open }) => usePaymentIntentKey(id, open),
      { initialProps: { id: 'inv-1', open: true } },
    );
    const first = result.current;

    rerender({ id: 'inv-2', open: true });

    expect(result.current).not.toBe(first);
  });

  it('does not regenerate while closed', () => {
    const { result, rerender } = renderHook(
      ({ id, open }) => usePaymentIntentKey(id, open),
      { initialProps: { id: 'inv-1', open: false } },
    );
    const idle = result.current;
    rerender({ id: 'inv-2', open: false });
    rerender({ id: 'inv-3', open: false });
    expect(result.current).toBe(idle);
  });

  it('produces distinct keys across a sequence of intents', () => {
    const seen = new Set<string>();
    const { result, rerender } = renderHook(
      ({ id, open }) => usePaymentIntentKey(id, open),
      { initialProps: { id: 'inv-1', open: true } },
    );

    for (const id of ['inv-1', 'inv-2', 'inv-3', 'inv-1']) {
      act(() => { rerender({ id, open: false }); });
      act(() => { rerender({ id, open: true }); });
      seen.add(result.current);
    }

    expect(seen.size).toBe(4);
  });
});
