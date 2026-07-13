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
