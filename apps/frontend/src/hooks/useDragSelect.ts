import { useRef, useEffect, useState, RefObject } from 'react';

export const DRAG_SELECT_CLASS = 'selecto-unit';

interface UseDragSelectOptions {
  /** Called with the new selected IDs (replaces current selection) */
  onSelect: (ids: string[]) => void;
  /** Called when clicking outside selectable items */
  onClear: () => void;
  /** data-* attribute on each item wrapper that holds the ID. Default: 'data-selecto-id' */
  idAttribute?: string;
  /** Allow starting rubber-band drag from inside a selectable item. Default: false (good for grids). Set true for tables where rows fill the full width. */
  selectFromInside?: boolean;
}

interface UseDragSelectReturn {
  /** Attach to the grid/list container div */
  gridRef: RefObject<HTMLDivElement>;
  /** Attach to the <Selecto> component */
  selectoRef: RefObject<any>;
  /** Spread onto <Selecto> component */
  selectoProps: {
    selectableTargets: string[];
    selectByClick: boolean;
    selectFromInside: boolean;
    continueSelect: boolean;
    hitRate: number;
    onSelectStart: () => void;
    onSelect: (e: any) => void;
  };
  /** True while any [role="dialog"] is present in the DOM — unmount <Selecto> when this is true */
  dialogOpen: boolean;
}

export function useDragSelect({
  onSelect,
  onClear,
  idAttribute = 'data-selecto-id',
  selectFromInside = false,
}: UseDragSelectOptions): UseDragSelectReturn {
  const gridRef = useRef<HTMLDivElement>(null);
  const selectoRef = useRef<any>(null);

  // Use refs for callbacks to avoid stale closures without needing deps
  const onSelectRef = useRef(onSelect);
  const onClearRef = useRef(onClear);
  onSelectRef.current = onSelect;
  onClearRef.current = onClear;

  // Track whether any Radix UI dialog is open.
  // We unmount <Selecto> entirely when a dialog is open because gesto (Selecto's
  // drag engine) captures pointerdown at the document level before dragCondition
  // is checked, stealing focus from inputs/selects inside dialogs.
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    const check = () => setDialogOpen(!!document.querySelector('[role="dialog"]'));
    const observer = new MutationObserver(check);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.closest(`.${DRAG_SELECT_CLASS}`) ||
        target.closest('[role="dialog"]') ||
        target.closest('[data-radix-popper-content-wrapper]') ||
        target.closest('[data-bulk-bar]')
      ) return;
      onClearRef.current();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

  const selectoProps = {
    selectableTargets: [`.${DRAG_SELECT_CLASS}`],
    selectByClick: false,
    selectFromInside,
    continueSelect: false,
    hitRate: 0,
    onSelectStart: () => {
      selectoRef.current?.setSelectedTargets([]);
    },
    onSelect: (e: any) => {
      const ids = (e.selected as Element[])
        .map((el) => el.getAttribute(idAttribute))
        .filter(Boolean) as string[];
      onSelectRef.current(ids);
    },
  };

  return { gridRef, selectoRef, selectoProps, dialogOpen };
}
