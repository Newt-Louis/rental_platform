import { useState, useCallback, Dispatch, SetStateAction } from 'react';

export function useFormDialog<T extends Record<string, unknown>>(defaultForm: T) {
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<T>({ ...defaultForm });

  const reset = useCallback(() => {
    setForm({ ...defaultForm });
  }, [defaultForm]);

  const openDialog = useCallback((prefill?: Partial<T>) => {
    if (prefill) setForm(prev => ({ ...prev, ...prefill }));
    setIsOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsOpen(false);
    reset();
  }, [reset]);

  const setField = useCallback(
    (key: keyof T) => (value: string) =>
      setForm(prev => ({ ...prev, [key]: value })),
    []
  );

  return {
    isOpen,
    openDialog,
    closeDialog,
    form,
    setForm: setForm as Dispatch<SetStateAction<T>>,
    setField,
    reset,
  };
}
