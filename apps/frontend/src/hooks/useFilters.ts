import { useState, useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * URL-synchronized two-state filter hook.
 * - `draft` — local state for in-progress user input (not yet applied)
 * - `applied` — committed state, always derived from URL search params
 * `emptyFilters` shape must remain stable across renders (keys read once on mount).
 */
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
  // keys is stable (useRef frozen at mount) — intentionally excluded from deps
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
        const val = draft[key];
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

  const isDirty = keys.some(key => draft[key] !== applied[key]);
  const hasApplied = keys.some(key => !!applied[key]);

  return { draft, setDraft, applied, apply, clear, isDirty, hasApplied };
}
