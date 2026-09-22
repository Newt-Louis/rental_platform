import { useEffect, useState } from 'react';

/**
 * Whether the reader has asked the operating system for less motion.
 *
 * Used to drop transitions rather than to drop information: a unit that would
 * animate into its raised state simply arrives there.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    // Absent in jsdom and in older browsers; there the answer is "no preference".
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);

  return reduced;
}
