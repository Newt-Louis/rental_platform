import { useEffect, useRef, useState } from 'react';

/** jsdom and older browsers do not always expose crypto.randomUUID. */
function newKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * PAY-003 — one idempotency key per payment INTENT.
 *
 * A payment intent begins when the user opens the payment dialog for an
 * invoice, and ends when that dialog closes. Every HTTP attempt belonging to
 * that intent — a double-click, a react-query retry, a network replay — must
 * carry the SAME key so the backend collapses them into one Payment. Starting a
 * new intent must produce a NEW key, otherwise the backend rejects the second
 * genuine payment (`existing.invoiceId !== invoiceId` → 409).
 *
 * WHY A HOOK AND NOT `useState(() => randomUUID())` — both payment dialogs are
 * rendered unconditionally by their parent and merely return `null` (or set
 * `open={false}`) when idle. They therefore never unmount, so a plain
 * `useState` initialiser runs ONCE PER PAGE LOAD, not once per intent: the key
 * was silently reused across invoices. That was PAY-001.
 *
 * Regenerates when:
 *   - the dialog opens (a fresh intent, even for the same invoice), or
 *   - the invoice changes while the dialog is open.
 *
 * Does NOT regenerate on re-render, on retry, or while a request is in flight.
 *
 * @param intentId identity of the thing being paid — normally `invoice?.id`
 * @param isOpen   whether the payment dialog is currently open
 */
export function usePaymentIntentKey(
  intentId: string | null | undefined,
  isOpen: boolean,
): string {
  const [key, setKey] = useState<string>(newKey);
  /** The intent the current key belongs to; null while the dialog is closed. */
  const activeIntent = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      // Closing ends the intent, so the next open starts a new one.
      activeIntent.current = null;
      return;
    }
    const intent = intentId ?? '';
    if (activeIntent.current !== intent) {
      activeIntent.current = intent;
      setKey(newKey());
    }
  }, [intentId, isOpen]);

  return key;
}
