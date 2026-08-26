import { describe, expect, it } from 'vitest';
import { accountStatusTranslationKey, adminRoleTranslationKey } from './adminPresentation';

describe('Admin presentation mappings', () => {
  it('maps authoritative role enums to localized presentation keys', () => {
    expect(adminRoleTranslationKey('LEASING_MANAGER')).toBe('users.roles.LEASING_MANAGER');
    expect(adminRoleTranslationKey('OPERATION')).toBe('users.roles.OPERATION');
  });

  it('preserves an unknown future role instead of inventing its meaning', () => {
    expect(adminRoleTranslationKey('FUTURE_ROLE')).toBe('FUTURE_ROLE');
  });

  it('maps account state without changing the authoritative boolean', () => {
    expect(accountStatusTranslationKey(true)).toBe('users.statusActive');
    expect(accountStatusTranslationKey(false)).toBe('users.statusLocked');
  });
});
