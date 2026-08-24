import { describe, expect, it } from 'vitest';
import {
  invoiceTypeTranslationKey,
  roleTranslationKey,
  sapStatusTranslationKey,
  serviceContractTypeTranslationKey,
} from './erpEnumPresentation';

describe('ERP enum presentation', () => {
  it('maps authoritative values to existing locale namespaces', () => {
    expect(roleTranslationKey('LEASING_MANAGER')).toBe('admin:users.roles.LEASING_MANAGER');
    expect(sapStatusTranslationKey('MISMATCH')).toBe('sap:statuses.MISMATCH');
    expect(invoiceTypeTranslationKey('REVENUE_SHARE')).toBe('reports:revenueReceivables.invoiceTypes.REVENUE_SHARE');
    expect(serviceContractTypeTranslationKey('MAINTENANCE')).toBe('serviceContracts:types.MAINTENANCE');
  });

  it('uses a neutral localized fallback instead of exposing an unknown enum', () => {
    expect(roleTranslationKey('FUTURE_ROLE')).toBe('common:unknownValue');
    expect(sapStatusTranslationKey('NEW_STATUS')).toBe('common:unknownValue');
    expect(invoiceTypeTranslationKey(undefined)).toBe('common:unknownValue');
    expect(serviceContractTypeTranslationKey('NEW_TYPE')).toBe('common:unknownValue');
  });
});
