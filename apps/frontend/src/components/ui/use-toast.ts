import { useEffect, useState } from 'react';

export type ToastVariant = 'default' | 'destructive' | 'success';

export interface Toast {
  id: string;
  title?: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

type ToastInput = Omit<Toast, 'id'>;

type Listener = (toasts: Toast[]) => void;

class ToastStore {
  private toasts: Toast[] = [];
  private listeners: Listener[] = [];

  subscribe(listener: Listener) {
    this.listeners.push(listener);
    listener([...this.toasts]);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  notify() {
    this.listeners.forEach((l) => l([...this.toasts]));
  }

  add(input: ToastInput): string {
    const id = Math.random().toString(36).slice(2, 9);
    const t: Toast = { id, duration: 4000, variant: 'default', ...input };
    this.toasts = [...this.toasts, t];
    this.notify();
    setTimeout(() => this.dismiss(id), t.duration);
    return id;
  }

  dismiss(id: string) {
    this.toasts = this.toasts.filter((t) => t.id !== id);
    this.notify();
  }

  getAll() {
    return [...this.toasts];
  }
}

export const toastStore = new ToastStore();

export function toast(input: ToastInput): string {
  return toastStore.add(input);
}

export function dismissToast(id: string) {
  toastStore.dismiss(id);
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>(() => toastStore.getAll());

  useEffect(() => {
    const unsubscribe = toastStore.subscribe(setToasts);
    return unsubscribe;
  }, []);

  return { toasts, toast, dismiss: (id: string) => toastStore.dismiss(id) };
}
