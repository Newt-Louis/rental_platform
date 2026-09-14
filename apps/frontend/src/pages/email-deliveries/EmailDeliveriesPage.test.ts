import { describe, expect, it } from 'vitest';
import source from './EmailDeliveriesPage.tsx?raw';
import apiSource from '../../api/email-deliveries.ts?raw';

describe('Email Delivery operational safety', () => {
  it('renders stored HTML in a fully sandboxed iframe', () => {
    expect(source).toContain('sandbox=""');
    expect(source).not.toMatch(/allow-scripts|allow-same-origin|allow-top-navigation/);
  });

  it('uses backend capabilities rather than event-name inference for actions', () => {
    expect(source).toContain('delivery.capabilities?.canRetry');
    expect(source).toContain('delivery.capabilities?.canResend');
    expect(source).not.toMatch(/eventType.*canRetry|eventType.*canResend/);
  });

  it('requires explicit confirmation before a successful resend', () => {
    expect(source).toContain('window.confirm');
    expect(source).toContain("action.mutate('resend')");
  });

  it('reuses one idempotency identity while an action is in flight', () => {
    expect(source).toContain('operationId.current ??= crypto.randomUUID()');
    expect(apiSource).toContain("'Idempotency-Key': operationId");
  });
});
